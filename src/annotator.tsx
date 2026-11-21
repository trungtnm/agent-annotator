'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { captureElement, hoverLabel, type ElementCapture } from './capture';
import { layoutCallouts, type CalloutTarget } from './callouts';
import { AreaBox, boxOf, Callouts, Editor, Highlight, Hint, Panel, Pin, Toast, Toolbar, type ListEntry, type Notice } from './overlay-parts';
import { RedactionPanel } from './redaction-panel';
import { elementsInArea, OWN_SELECTOR, pauseMotion, type Rect } from './page-tools';
import { buildPrompt, type Annotation, type AnnotationKind } from './prompt';
import { truncate } from './serialize';
import { createRedactor, readRedaction, resolveRedaction, writeRedaction, type RedactionOptions, type RedactionSettings } from './redaction';
import { readFlag, writeFlag } from './flags';
import { CaptureCancelled, captureTab, shotFileName, type ScreenCapture } from './screenshot';
import { ScreenshotEditor } from './screenshot-editor';
import { createNextResolver, type FrameResolver } from './stack';

export interface DevAnnotatorProps {
  /** Names the app in the prompt and keys the saved comments (`web`, `admin`). */
  readonly appName: string;
  /** The app's directory from the repo root, so source paths in the prompt open as-is. */
  readonly appDir?: string;
  /**
   * Personal-data redaction for this app: on or off, which countries' phone and ID
   * formats to screen, and extra patterns. Each browser can change it from the toolbar's
   * redaction settings; these are the defaults it starts from and resets to.
   */
  readonly redaction?: RedactionOptions;
  /** Overrides how stack frames are mapped to source; tests pass one, apps never do. */
  readonly resolveFrames?: FrameResolver;
  /** Overrides how the tab is captured; tests pass one, apps never do. */
  readonly captureScreen?: ScreenCapture;
}

interface Item {
  readonly annotation: Annotation;
  /** The elements commented on, while they are still in the document. */
  readonly elements: readonly Element[];
}

interface Selection {
  readonly kind: AnnotationKind;
  readonly elements: readonly Element[];
  readonly label: string;
  readonly selectedText?: string;
  readonly area?: Rect;
  readonly areaInContainer?: Rect;
}

interface Draft extends Selection {
  readonly captures: Promise<readonly ElementCapture[]>;
  readonly comment: string;
  /** Whether the captures were screened for personal data. */
  readonly redacted: boolean;
  /** Set when an existing comment is being edited. */
  readonly editingId: string | null;
}

/**
 * Events the page must not receive while a click means "comment on this". Propagation
 * stops; the default does NOT, so dragging still selects text. `click` is the one whose
 * default is prevented (a link must not navigate), in its own handler.
 */
const ISOLATED = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick'] as const;
/** How often pins follow layout changes that fire no scroll or resize event. */
const REFLOW_MS = 400;
/** A drag shorter than this, either way, is a click. */
const MIN_AREA = 8;
/** Shared by every app on the machine: someone who has learnt the shortcuts has learnt them everywhere. */
const HINT_HIDDEN_KEY = 'agent-annotator:hint-hidden';
const SHOW_COMMENTS_KEY = 'agent-annotator:show-comments';
const COLLAPSED_KEY = 'agent-annotator:toolbar-collapsed';
/** How long a notice stays up. */
const NOTICE_MS = 5000;

const KIND_LABEL: Readonly<Record<AnnotationKind, (count: number) => string>> = {
  element: () => '',
  text: () => 'text',
  group: (count) => `${count} element`,
  area: () => 'area',
};

/**
 * Development-only overlay: a floating button switches on "comment mode". In it, a click
 * pins a comment to an element, a text selection to a passage, Cmd/Ctrl+click gathers
 * several elements under one comment and Shift+drag marks an area — and the page sees
 * none of it. "Copy prompt" puts every comment, with what the tool learned about its
 * elements, on the clipboard as one Markdown prompt for a coding agent.
 *
 * Comments survive client-side navigation (this component lives in the root layout) and
 * a full reload (sessionStorage), so one request can span several pages.
 */
export function DevAnnotator(props: DevAnnotatorProps): ReactNode {
  const { appName, appDir } = props;
  const storageKey = `agent-annotator:${appName}`;
  const redactionKey = `agent-annotator:redaction:${appName}`;
  const redactionDefaults = resolveRedaction(props.redaction);
  const [savedRedaction, setSavedRedaction] = useState<RedactionSettings | null>(() => readRedaction(redactionKey));
  const redaction = savedRedaction ?? redactionDefaults;
  const redactionJson = JSON.stringify(redaction);
  // Rebuilt only when a setting changes, not on every render of an inline `redaction` prop.
  const redactor = useMemo(() => createRedactor(JSON.parse(redactionJson) as RedactionSettings), [redactionJson]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resolveFrames] = useState<FrameResolver>(() => props.resolveFrames ?? createNextResolver());
  const [active, setActive] = useState(false);
  const [items, setItems] = useState<readonly Item[]>(() => restore(storageKey));
  const [includeData, setIncludeData] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [paused, setPaused] = useState(false);
  const [hintHidden, setHintHidden] = useState(() => readFlag(HINT_HIDDEN_KEY));
  const [hover, setHover] = useState<{ readonly element: Element; readonly label: string } | null>(null);
  const [group, setGroup] = useState<readonly Element[]>([]);
  const [dragBox, setDragBox] = useState<Rect | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showComments, setShowComments] = useState(() => readFlag(SHOW_COMMENTS_KEY));
  const [collapsed, setCollapsed] = useState(() => readFlag(COLLAPSED_KEY));
  /** Between the capture permission and the grab: only the comments are on screen. */
  const [capturing, setCapturing] = useState(false);
  const [shot, setShot] = useState<{ readonly image: HTMLCanvasElement; readonly fileName: string } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [, setFrame] = useState(0);

  useEffect(() => {
    persist(
      storageKey,
      items.map((item) => item.annotation),
    );
  }, [items, storageKey]);

  // Event listeners read live state through refs, so typing does not re-subscribe them.
  const draftRef = useRef<Draft | null>(null);
  const groupRef = useRef<readonly Element[]>([]);
  const shotOpenRef = useRef(false);
  useEffect(() => {
    draftRef.current = draft;
    groupRef.current = group;
    shotOpenRef.current = shot !== null || capturing;
  });

  const startDraft = useCallback(
    (selection: Selection) => {
      // Never throw away words already typed for something else.
      if (draftRef.current !== null && draftRef.current.comment.trim() !== '') return;
      const several = selection.elements.length > 1;
      const captures = Promise.all(
        selection.elements.map((element) =>
          captureElement(element, resolveFrames, { dataComponents: several ? 1 : 2, redactor }),
        ),
      );
      const screened =
        selection.selectedText === undefined ? {} : { selectedText: truncate(redactor.text(selection.selectedText), 500) };
      setDraft({ ...selection, ...screened, captures, comment: '', redacted: redactor.enabled, editingId: null });
    },
    [resolveFrames, redactor],
  );

  // Comment mode. Listeners sit on window in the CAPTURE phase, ahead of React's root
  // listeners. Alt held down lets an interaction through: open a menu, then comment in it.
  useEffect(() => {
    if (!active) return undefined;
    let dragStart: { readonly x: number; readonly y: number } | null = null;
    // The click that ends a text selection or an area drag is not also an element click.
    let swallowNextClick = false;

    const ignored = (event: Event): boolean =>
      (event as MouseEvent).altKey || (event.target instanceof Element && event.target.closest(OWN_SELECTOR) !== null);
    const isolate = (event: Event): void => {
      if (ignored(event)) return;
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const onMouseDown = (event: MouseEvent): void => {
      if (ignored(event)) return;
      isolate(event);
      if (event.shiftKey) {
        event.preventDefault(); // no text selection while dragging an area
        dragStart = { x: event.clientX, y: event.clientY };
        setDragBox({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
      }
    };
    const onMouseUp = (event: MouseEvent): void => {
      if (ignored(event)) return;
      isolate(event);
      if (dragStart !== null) {
        const area = rectBetween(dragStart, { x: event.clientX, y: event.clientY });
        dragStart = null;
        setDragBox(null);
        if (area.width >= MIN_AREA && area.height >= MIN_AREA) {
          swallowNextClick = true;
          const { container, inside } = elementsInArea(document, area);
          const origin = container.getBoundingClientRect();
          startDraft({
            kind: 'area',
            elements: [container, ...inside],
            label: `Area ${area.width}×${area.height}`,
            area,
            areaInContainer: { ...area, x: area.x - origin.left, y: area.y - origin.top },
          });
        }
        return;
      }
      const text = selectedText();
      if (text !== null) {
        swallowNextClick = true;
        startDraft({ kind: 'text', elements: [text.element], label: `Text · ${hoverLabel(text.element)}`, selectedText: text.text });
      }
    };
    const onClick = (event: MouseEvent): void => {
      if (ignored(event) || !(event.target instanceof Element)) return;
      event.preventDefault();
      isolate(event);
      if (swallowNextClick) {
        swallowNextClick = false;
        return;
      }
      const element = pickTarget(event.target);
      if (event.metaKey || event.ctrlKey) {
        setGroup((current) =>
          current.includes(element) ? current.filter((kept) => kept !== element) : [...current, element],
        );
        return;
      }
      startDraft({ kind: 'element', elements: [element], label: hoverLabel(element) });
    };
    // Releasing Cmd/Ctrl closes the group and opens one editor for all of it.
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key !== 'Meta' && event.key !== 'Control') return;
      const elements = groupRef.current;
      if (elements.length === 0) return;
      setGroup([]);
      const [only] = elements;
      if (elements.length === 1 && only !== undefined) {
        startDraft({ kind: 'element', elements: [only], label: hoverLabel(only) });
      } else {
        startDraft({ kind: 'group', elements, label: `${elements.length} element` });
      }
    };
    const onMove = (event: PointerEvent): void => {
      if (dragStart !== null) {
        setDragBox(rectBetween(dragStart, { x: event.clientX, y: event.clientY }));
        return;
      }
      if (!(event.target instanceof Element) || event.target.closest(OWN_SELECTOR) !== null) {
        setHover(null);
        return;
      }
      const element = pickTarget(event.target);
      setHover((current) => (current?.element === element ? current : { element, label: hoverLabel(element) }));
    };

    for (const type of ISOLATED) {
      if (type !== 'mousedown' && type !== 'mouseup') window.addEventListener(type, isolate, true);
    }
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('keyup', onKeyUp, true);
    const root = document.documentElement;
    const previousCursor = root.style.cursor;
    root.style.cursor = 'crosshair';
    return () => {
      for (const type of ISOLATED) window.removeEventListener(type, isolate, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('keyup', onKeyUp, true);
      root.style.cursor = previousCursor;
      setHover(null);
      setGroup([]);
      setDragBox(null);
    };
  }, [active, startDraft]);

  // Alt+Shift+C toggles comment mode anywhere. Esc closes the editor, then drops a group
  // in progress, then leaves the mode. `code`, not `key`: on macOS Alt turns C into "Ç".
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // The screenshot editor owns the keyboard while it is open.
      if (shotOpenRef.current) return;
      if (event.altKey && event.shiftKey && event.code === 'KeyC') {
        event.preventDefault();
        setActive((value) => !value);
      } else if (event.key === 'Escape') {
        if (draftRef.current !== null) setDraft(null);
        else if (groupRef.current.length > 0) setGroup([]);
        else setActive(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => (paused ? pauseMotion(document) : undefined), [paused]);

  useEffect(() => {
    if (notice === null) return undefined;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Keep highlights and pins on their elements through scrolling, resizing and layout
  // changes. Only while there is something on screen to keep in place.
  const tracking = active || draft !== null || items.length > 0;
  useEffect(() => {
    if (!tracking) return undefined;
    const bump = (): void => setFrame((frame) => frame + 1);
    window.addEventListener('scroll', bump, true);
    window.addEventListener('resize', bump);
    const timer = window.setInterval(bump, REFLOW_MS);
    return () => {
      window.removeEventListener('scroll', bump, true);
      window.removeEventListener('resize', bump);
      window.clearInterval(timer);
    };
  }, [tracking]);

  const saveDraft = async (): Promise<void> => {
    if (draft === null || draft.comment.trim() === '') return;
    const { comment, editingId } = draft;
    setDraft(null);
    window.getSelection()?.removeAllRanges();
    if (editingId !== null) {
      setItems((current) =>
        current.map((item) =>
          item.annotation.id === editingId ? { ...item, annotation: { ...item.annotation, comment } } : item,
        ),
      );
      return;
    }
    const targets = await draft.captures;
    const annotation: Annotation = {
      id: newId(),
      kind: draft.kind,
      comment,
      createdAt: new Date().toISOString(),
      targets,
      ...(draft.selectedText === undefined ? {} : { selectedText: draft.selectedText }),
      ...(draft.area === undefined ? {} : { area: draft.area }),
      ...(draft.areaInContainer === undefined ? {} : { areaInContainer: draft.areaInContainer }),
      ...(draft.redacted ? {} : { redacted: false }),
    };
    setItems((current) => [...current, { annotation, elements: draft.elements }]);
    setPanelOpen(true);
  };

  const editItem = (id: string): void => {
    const item = items.find((candidate) => candidate.annotation.id === id);
    if (item === undefined) return;
    const { annotation } = item;
    const first = annotation.targets[0];
    const element = liveElement(item);
    const area = element === null ? null : liveArea(item, element);
    setDraft({
      kind: annotation.kind,
      ...(area === null ? {} : { area }),
      elements: element === null ? [] : [element],
      label: first?.components[0]?.name ?? first?.element.tag ?? annotation.kind,
      ...(annotation.selectedText === undefined ? {} : { selectedText: annotation.selectedText }),
      captures: Promise.resolve(annotation.targets),
      comment: annotation.comment,
      redacted: annotation.redacted !== false,
      editingId: id,
    });
  };

  const copyPrompt = async (): Promise<void> => {
    const prompt = buildPrompt(
      items.map((item) => item.annotation),
      { appName, appDir, includeData, now: new Date() },
    );
    await writeClipboard(prompt);
    const count = items.length;
    setNotice({
      title: 'Prompt copied — ready for your coding agent',
      detail: `Paste it into Claude Code, Codex or Cursor. It gives the file, line and component behind ${count === 1 ? 'your comment' : `each of your ${count} comments`}.`,
    });
  };

  const takeScreenshot = async (): Promise<void> => {
    setDraft(null);
    setPanelOpen(false);
    setNotice(null);
    try {
      const image = await (props.captureScreen ?? captureTab)(async () => {
        setCapturing(true);
        // Two frames for React to commit and the browser to paint, then a beat for the
        // "sharing this tab" bar, which can resize the viewport, to settle.
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        await new Promise<void>((resolve) => window.setTimeout(resolve, 300));
      });
      setShot({ image, fileName: shotFileName(appName, window.location.pathname, new Date()) });
    } catch (error) {
      setNotice(
        error instanceof CaptureCancelled
          ? { title: 'Screenshot cancelled', detail: 'Choose "This tab" and Allow when the browser asks.', tone: 'error' }
          : { title: 'Could not take the screenshot', detail: error instanceof Error ? error.message : String(error), tone: 'error' },
      );
    } finally {
      setCapturing(false);
    }
  };

  const toggleComments = (): void => {
    setShowComments(!showComments);
    writeFlag(SHOW_COMMENTS_KEY, !showComments);
  };

  const entries: ListEntry[] = items.map((item, index) => {
    const { annotation } = item;
    const first = annotation.targets[0];
    const kind = KIND_LABEL[annotation.kind](annotation.targets.length);
    const component = first?.components[0]?.name;
    const what = kind || `${component ? `${component} · ` : ''}${first?.element.tag ?? ''}`;
    return {
      id: annotation.id,
      number: index + 1,
      comment: annotation.comment,
      where: `${first?.page.pathname ?? ''} · ${what}`,
      onThisPage: liveElement(item) !== null,
    };
  });

  const hideHint = (hidden: boolean): void => {
    setHintHidden(hidden);
    writeFlag(HINT_HIDDEN_KEY, hidden);
  };

  const draftElement = draft?.elements[0];
  const draftBox = draftElement?.isConnected ? boxOf(draftElement) : null;
  const onScreen = items.flatMap((item, index): CalloutTarget[] => {
    const element = liveElement(item);
    if (element === null) return [];
    const area = liveArea(item, element);
    return [
      area === null
        ? { number: index + 1, comment: item.annotation.comment, box: boxOf(element) }
        : { number: index + 1, comment: item.annotation.comment, box: areaBox(area), area: true },
    ];
  });
  const callouts =
    showComments || capturing ? layoutCallouts(onScreen, { width: window.innerWidth, height: window.innerHeight }) : null;
  const editNumber = (number: number): void => {
    const item = items[number - 1];
    if (item !== undefined) editItem(item.annotation.id);
  };

  // While capturing, the page shows the comments and nothing else of the tool.
  const overlay = capturing ? (
    <div data-dev-annotator="">
      <Callouts callouts={callouts ?? []} onEdit={null} />
    </div>
  ) : (
    <div data-dev-annotator="">
      {active && !hintHidden ? <Hint onDismiss={() => hideHint(true)} /> : null}
      {active && hover !== null && hover.element !== draftElement && dragBox === null ? (
        <Highlight box={boxOf(hover.element)} label={hover.label} strong={false} />
      ) : null}
      {group.map((element, index) => (
        <Highlight key={index} box={boxOf(element)} label={`#${index + 1}`} strong />
      ))}
      {dragBox !== null ? <AreaBox box={{ top: dragBox.y, left: dragBox.x, width: dragBox.width, height: dragBox.height }} /> : null}
      {draft?.area !== undefined ? (
        <AreaBox box={{ top: draft.area.y, left: draft.area.x, width: draft.area.width, height: draft.area.height }} />
      ) : null}
      {draft !== null && draft.kind !== 'area'
        ? draft.elements
            .filter((element) => element.isConnected)
            .map((element, index) => (
              <Highlight key={index} box={boxOf(element)} label={index === 0 ? draft.label : `#${index + 1}`} strong />
            ))
        : null}
      {callouts !== null ? (
        <Callouts callouts={callouts} onEdit={editNumber} />
      ) : (
        onScreen.map((target) => (
          <Pin key={target.number} box={target.box} number={target.number} onClick={() => editNumber(target.number)} />
        ))
      )}
      {draft !== null ? (
        <Editor
          anchor={draft.area === undefined ? draftBox : areaBox(draft.area)}
          title={draft.editingId === null ? draft.label : `Edit comment · ${draft.label}`}
          comment={draft.comment}
          editing={draft.editingId !== null}
          onChange={(comment) => setDraft((current) => (current === null ? null : { ...current, comment }))}
          onSave={() => void saveDraft()}
          onCancel={() => setDraft(null)}
          onDelete={() => {
            const id = draft.editingId;
            setDraft(null);
            setItems((current) => current.filter((item) => item.annotation.id !== id));
          }}
        />
      ) : null}
      {settingsOpen && !collapsed ? (
        <RedactionPanel
          settings={redaction}
          customised={savedRedaction !== null}
          onChange={(next) => {
            setSavedRedaction(next);
            writeRedaction(redactionKey, next);
          }}
          onReset={() => {
            setSavedRedaction(null);
            writeRedaction(redactionKey, null);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {panelOpen && !settingsOpen && !collapsed && items.length > 0 ? (
        <Panel
          entries={entries}
          includeData={includeData}
          redactionOn={redaction.enabled}
          onIncludeData={setIncludeData}
          onEdit={editItem}
          onClear={() => {
            setDraft(null);
            setItems([]);
          }}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
      <Toolbar
        active={active}
        paused={paused}
        count={items.length}
        panelOpen={panelOpen}
        showComments={showComments}
        capturing={capturing}
        collapsed={collapsed}
        redactionOn={redaction.enabled}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen(!settingsOpen)}
        onToggleCollapsed={() => {
          setCollapsed(!collapsed);
          writeFlag(COLLAPSED_KEY, !collapsed);
        }}
        onShowHint={active && hintHidden ? () => hideHint(false) : null}
        onToggleActive={() => setActive((value) => !value)}
        onTogglePaused={() => setPaused((value) => !value)}
        onToggleComments={toggleComments}
        onScreenshot={() => void takeScreenshot()}
        onTogglePanel={() => setPanelOpen((value) => !value)}
        onCopy={() => void copyPrompt()}
      />
      {notice !== null ? <Toast notice={notice} onDismiss={() => setNotice(null)} /> : null}
      {shot !== null ? (
        <ScreenshotEditor image={shot.image} fileName={shot.fileName} onClose={() => setShot(null)} onNotice={setNotice} />
      ) : null}
    </div>
  );
  return createPortal(overlay, document.body);
}

/** Inside an inline SVG icon, the icon is the thing being pointed at, not one of its paths. */
function pickTarget(target: Element): Element {
  if (target instanceof SVGElement && !(target instanceof SVGSVGElement)) return target.closest('svg') ?? target;
  return target;
}

function rectBetween(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

function areaBox(area: Rect): { top: number; left: number; width: number; height: number } {
  return { top: area.y, left: area.x, width: area.width, height: area.height };
}

/** The page's current text selection and the element holding it; `null` if none. Screened by `startDraft`. */
function selectedText(): { readonly element: Element; readonly text: string } | null {
  const selection = window.getSelection();
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null;
  const text = selection.toString().replace(/\s+/g, ' ').trim();
  if (text === '') return null;
  const node = selection.getRangeAt(0).commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  if (element === null || element.closest(OWN_SELECTOR) !== null) return null;
  return { element, text };
}

/** Where a dragged area is now, in viewport pixels: it rides on its container. */
function liveArea(item: Item, container: Element): Rect | null {
  const offset = item.annotation.areaInContainer;
  if (item.annotation.kind !== 'area' || offset === undefined) return null;
  const origin = container.getBoundingClientRect();
  return { x: origin.left + offset.x, y: origin.top + offset.y, width: offset.width, height: offset.height };
}

/**
 * The first commented element if it is on screen now: the one clicked while it stays
 * mounted, else — after a reload or a navigation back — the selector's match on the same path.
 */
function liveElement(item: Item): Element | null {
  const [element] = item.elements;
  if (element?.isConnected) return element;
  const first = item.annotation.targets[0];
  if (first === undefined || window.location.pathname !== first.page.pathname) return null;
  try {
    return document.querySelector(first.element.selector);
  } catch {
    return null;
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * sessionStorage can be absent or throw (private mode, blocked storage); comments then
 * live in memory. Entries of an older shape are dropped rather than half-read.
 */
function restore(key: string): Item[] {
  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as Annotation[])
      .filter((annotation) => Array.isArray(annotation?.targets) && annotation.targets.length > 0)
      .map((annotation) => ({ annotation, elements: [] }));
  } catch {
    return [];
  }
}

function persist(key: string, annotations: readonly Annotation[]): void {
  try {
    if (annotations.length === 0) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(annotations));
  } catch {
    // Memory only; nothing to report.
  }
}

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Not a secure context, or permission refused: fall back to the selection API.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('data-dev-annotator', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}
