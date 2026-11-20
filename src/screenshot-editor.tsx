import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { CalloutTip } from './callout-tip';
import { readFlag, writeFlag } from './flags';
import { Icon, type IconName } from './icons';
import { ACCENT, FONT, INK, Z, type Notice } from './overlay-parts';
import {
  calloutLayout,
  canvasMeasure,
  COLORS,
  edgeColor,
  expand,
  outputFrame,
  union,
  hitTest,
  isTrivial,
  paint,
  tailHandleRadius,
  textColorOn,
  translate,
  normalized,
  type Bounds,
  type Mark,
  type Measure,
  type Point,
  type Tool,
  type Weight,
} from './screenshot-draw';
import { copyImage, saveImage } from './screenshot';
import { MOD_KEY, Tooltip } from './tooltip';

type EditorTool = Tool | 'select' | 'crop';

const TOOLS: ReadonlyArray<{
  readonly tool: EditorTool;
  readonly icon: IconName;
  readonly label: string;
  readonly key: string;
  readonly detail: string;
}> = [
  { tool: 'select', icon: 'select', label: 'Select & move', key: 'V', detail: 'Click a mark to select it, drag to move it, Delete to remove it. Double-click text to edit it.' },
  { tool: 'arrow', icon: 'arrow', label: 'Arrow', key: 'A', detail: 'Hold Shift to snap to 45°.' },
  { tool: 'rect', icon: 'rect', label: 'Rectangle', key: 'R', detail: 'Hold Shift for a square.' },
  { tool: 'highlight', icon: 'highlight', label: 'Highlight', key: 'H', detail: 'A translucent marker over an area.' },
  { tool: 'pen', icon: 'pen', label: 'Pen', key: 'P', detail: 'Draw freehand.' },
  {
    tool: 'text',
    icon: 'text',
    label: 'Callout',
    key: 'T',
    detail: 'Drag from what you point at to where the text goes: one box with a tail. A click gives a box without one. Enter places it, Shift+Enter adds a line.',
  },
  { tool: 'ruler', icon: 'ruler', label: 'Ruler', key: 'M', detail: 'Measure in the page’s own pixels. Hold Shift to keep it straight.' },
  { tool: 'crop', icon: 'crop', label: 'Crop', key: 'C', detail: 'Drag the part to keep. Undo, or Reset crop, brings the rest back.' },
  { tool: 'pixelate', icon: 'pixelate', label: 'Pixelate', key: 'B', detail: 'Hide personal data before the image leaves this machine.' },
];

const WEIGHTS: ReadonlyArray<{ readonly weight: Weight; readonly label: string; readonly dot: number }> = [
  { weight: 1, label: 'Thin', dot: 4 },
  { weight: 2, label: 'Medium', dot: 7 },
  { weight: 3, label: 'Thick', dot: 10 },
];

/** Zoom stops, as a fraction of the page's own size (100% = as it looked in the tab). */
const ZOOM_STOPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8] as const;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
/** Room around the image inside the scroll area, in CSS pixels. */
const PAD = 24;
/** How near, in CSS pixels, a click must land to pick a mark. */
const PICK_SLACK = 6;
const NO_MARKS: readonly Mark[] = [];
/** Set once the callout drag is learned: the tip under the Callout button stops showing. */
const CALLOUT_TIP_KEY = 'agent-annotator:callout-tip-done';

/** What undo steps through: the marks, and the crop (`null` = the whole capture). */
interface Doc {
  readonly marks: readonly Mark[];
  readonly crop: Bounds | null;
}
const EMPTY_DOC: Doc = { marks: NO_MARKS, crop: null };

let measureContext: CanvasRenderingContext2D | null | undefined;
/** Text measuring on a context of its own, so rendering never reads the visible canvas. */
function textMeasure(): Measure {
  if (measureContext === undefined) {
    measureContext = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  return canvasMeasure(measureContext ?? null);
}

interface History {
  readonly past: readonly Doc[];
  readonly present: Doc;
  readonly future: readonly Doc[];
}

interface TextDraft {
  /** The centre of the callout box, in image pixels. */
  readonly at: Point;
  /** What the callout points at, if it has a tail. */
  readonly tail?: Point;
  readonly value: string;
  readonly color: string;
  readonly weight: Weight;
  /** The text mark being edited; `null` for new text. */
  readonly editing: number | null;
}

interface CropDraft {
  readonly from: Point;
  readonly to: Point;
}

interface Drag {
  /** `tail` drags only a callout's tail tip; `move` drags the mark (a callout's box). */
  readonly mode: 'move' | 'tail';
  readonly index: number;
  readonly origin: Point;
  readonly original: Mark;
  readonly moved: Mark;
}

/**
 * Marks up a screenshot, Shottr-style: arrows, boxes, highlights, freehand, text, and
 * pixelation to hide what must not leave the machine; every mark can be selected, moved,
 * recoloured, restyled or deleted afterwards. Zoom with the bar, ⌘± or ⌘+scroll; hold Space
 * and drag to pan. Copy puts the PNG on the clipboard, Save downloads it. Only the Close
 * button closes, and it asks first when there are marks not yet copied or saved.
 */
export function ScreenshotEditor(props: {
  readonly image: HTMLCanvasElement;
  readonly fileName: string;
  readonly onClose: () => void;
  readonly onNotice: (notice: Notice) => void;
}): ReactNode {
  const { image, fileName, onClose, onNotice } = props;
  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const customColorRef = useRef<HTMLInputElement | null>(null);

  const [history, setHistory] = useState<History>({ past: [], present: EMPTY_DOC, future: [] });
  const marks = history.present.marks;
  const crop = history.present.crop;
  const view: Bounds = crop ?? { x: 0, y: 0, width: image.width, height: image.height };
  const [saved, setSaved] = useState<Doc>(EMPTY_DOC);
  const [cropDraft, setCropDraftState] = useState<CropDraft | null>(null);
  const [tool, setTool] = useState<EditorTool>('arrow');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [weight, setWeight] = useState<Weight>(2);
  const [selectedRaw, setSelected] = useState<number | null>(null);
  const selected = selectedRaw !== null && selectedRaw < marks.length ? selectedRaw : null;
  const [drawing, setDrawingState] = useState<Mark | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  // A gesture lives in refs as well as state. Pointer events can arrive faster than React
  // renders, and a handler reading state would then see the gesture as it was a frame ago —
  // a quick drag would end as a click. Handlers read the refs; rendering reads the state.
  const drawingRef = useRef<Mark | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const cropRef = useRef<CropDraft | null>(null);
  const setDrawing = (next: Mark | null): void => {
    drawingRef.current = next;
    setDrawingState(next);
  };
  const setDrag = (next: Drag | null): void => {
    dragRef.current = next;
    setDragState(next);
  };
  const setCropDraft = (next: CropDraft | null): void => {
    cropRef.current = next;
    setCropDraftState(next);
  };
  const [text, setText] = useState<TextDraft | null>(null);
  const [hovering, setHovering] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [tipDone, setTipDone] = useState(() => readFlag(CALLOUT_TIP_KEY));
  const [tipNudge, setTipNudge] = useState(false);
  const [tipAt, setTipAt] = useState<{ left: number; top: number } | null>(null);
  const learnCallout = (): void => {
    setTipDone(true);
    writeFlag(CALLOUT_TIP_KEY, true);
  };
  const showTip = tool === 'text' && !tipDone;
  // The tip hangs under the Callout button, wherever the bar has wrapped it to.
  useLayoutEffect(() => {
    if (!showTip) return;
    const dialog = dialogRef.current;
    const button = dialog?.querySelector('[aria-label="Callout"]');
    if (dialog === null || dialog === undefined || button === null || button === undefined) return;
    const box = button.getBoundingClientRect();
    const frame = dialog.getBoundingClientRect();
    setTipAt({ left: Math.max(8, box.left - frame.left + box.width / 2 - 23), top: box.bottom - frame.top + 10 });
  }, [showTip]);

  // Zoom: `null` follows the window ("fit"); a number is CSS pixels per image pixel.
  const [zoom, setZoom] = useState<number | null>(null);
  // The scroll area's size, for "fit" and for a board that fills it.
  const [areaSize, setAreaSize] = useState<{ readonly width: number; readonly height: number }>({ width: 0, height: 0 });
  /** What Copy and Save will produce, from the marks already placed. */
  const frame = outputFrame(view, marks, image.width, textMeasure());
  const fitScale =
    areaSize.width > 2 * PAD && areaSize.height > 2 * PAD
      ? // Never blow a capture up past the size it had on the page.
        Math.min((areaSize.width - 2 * PAD) / frame.width, (areaSize.height - 2 * PAD) / frame.height, 1 / ratio)
      : 1 / ratio;
  const scale = zoom ?? fitScale;
  /**
   * The board: the whole canvas, in image pixels. It fills the scroll area, centred on the
   * frame, so marks can go anywhere around the picture; it grows past the area only when
   * the frame does. Sized from placed marks only, so it never shifts under a drag.
   */
  const board = boardAround(expand(frame, 12 / scale), view, areaSize, scale);
  /** The colour the frame is filled with where the capture does not reach. */
  const [background] = useState(() => edgeColor(image));
  const anchorRef = useRef<{ image: Point; client: Point } | null>(null);

  const dirty = history.present !== saved && (marks.length > 0 || crop !== null);

  // ---- history ----------------------------------------------------------------------
  const commitDoc = (change: (doc: Doc) => Doc): void =>
    setHistory((current) => ({ past: [...current.past, current.present], present: change(current.present), future: [] }));
  const commit = (next: readonly Mark[]): void => commitDoc((doc) => ({ ...doc, marks: next }));
  const commitCrop = (next: Bounds | null): void => {
    commitDoc((doc) => ({ ...doc, crop: next }));
    setZoom(null);
  };
  const undo = (): void =>
    setHistory((current) =>
      current.past.length === 0
        ? current
        : { past: current.past.slice(0, -1), present: current.past[current.past.length - 1] ?? EMPTY_DOC, future: [current.present, ...current.future] },
    );
  const redo = (): void =>
    setHistory((current) =>
      current.future.length === 0
        ? current
        : { past: [...current.past, current.present], present: current.future[0] ?? EMPTY_DOC, future: current.future.slice(1) },
    );
  const replaceAt = (index: number, mark: Mark | null): void =>
    commit(mark === null ? marks.filter((_, at) => at !== index) : marks.map((kept, at) => (at === index ? mark : kept)));

  // ---- painting -----------------------------------------------------------------------
  let visible = drag === null ? marks : marks.map((mark, at) => (at === drag.index ? drag.moved : mark));
  // Text being typed is painted live on the canvas; the input over it only carries the caret.
  if (text !== null) {
    const live: Mark = {
      tool: 'text',
      at: text.at,
      text: text.value,
      color: text.color,
      weight: text.weight,
      ...(text.tail === undefined ? {} : { tail: text.tail }),
    };
    visible = text.editing === null ? [...visible, live] : visible.map((mark, at) => (at === text.editing ? live : mark));
  }
  if (drawing !== null) visible = [...visible, drawing];
  const outline = text === null && drawing === null ? selected : null;
  // The frame follows the marks live, so a mark drawn past the edge shows the picture grow.
  const liveFrame = outputFrame(view, visible, image.width, textMeasure());
  const paintBase = { view: board, image: view, frame: liveFrame, background, backdrop: '#0E0E0E', pixelRatio: ratio };
  const cropBox = cropDraft === null ? null : clampTo(normalized(cropDraft.from, cropDraft.to), view);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas !== null) paint(canvas, image, visible, { ...paintBase, selected: outline, accent: '#0091FF', cropPreview: cropBox });
  });

  // ---- zoom -----------------------------------------------------------------------------
  useEffect(() => {
    const area = areaRef.current;
    if (area === null) return undefined;
    const measure = (): void => setAreaSize({ width: area.clientWidth, height: area.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  // Keep the image point that was under the cursor (or the centre) under it after zooming.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    anchorRef.current = null;
    const canvas = canvasRef.current;
    const area = areaRef.current;
    if (anchor === null || canvas === null || area === null) return;
    const rect = canvas.getBoundingClientRect();
    area.scrollLeft += rect.left + (anchor.image.x - board.x) * scale - anchor.client.x;
    area.scrollTop += rect.top + (anchor.image.y - board.y) * scale - anchor.client.y;
  }, [scale, board.x, board.y]);

  const zoomTo = (nextScale: number | null, client?: Point): void => {
    const canvas = canvasRef.current;
    const area = areaRef.current;
    if (canvas !== null && area !== null) {
      const rect = canvas.getBoundingClientRect();
      const box = area.getBoundingClientRect();
      const at = client ?? { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      if (scale > 0) anchorRef.current = { image: { x: board.x + (at.x - rect.left) / scale, y: board.y + (at.y - rect.top) / scale }, client: at };
    }
    setZoom(nextScale === null ? null : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale * ratio)) / ratio);
  };
  const percent = scale * ratio;
  const zoomStep = (direction: 1 | -1): void => {
    const next =
      direction === 1
        ? ZOOM_STOPS.find((stop) => stop > percent * 1.01)
        : [...ZOOM_STOPS].reverse().find((stop) => stop < percent * 0.99);
    if (next !== undefined) zoomTo(next / ratio);
  };

  // ⌘/Ctrl + wheel (and trackpad pinch, which arrives as one) zooms at the cursor; a plain
  // wheel scrolls. Registered by hand: React's wheel listener is passive and cannot cancel.
  const wheelRef = useRef<(event: WheelEvent) => void>(() => undefined);
  const onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomTo(scale * Math.exp(-event.deltaY * 0.01), { x: event.clientX, y: event.clientY });
  };
  useEffect(() => {
    const area = areaRef.current;
    if (area === null) return undefined;
    const onWheel = (event: WheelEvent): void => wheelRef.current(event);
    area.addEventListener('wheel', onWheel, { passive: false });
    return () => area.removeEventListener('wheel', onWheel);
  }, []);

  // ---- pointer ----------------------------------------------------------------------------
  const measureText = textMeasure;
  const pick = (point: Point, only?: Mark['tool']): number | null => {
    const index = hitTest(marks, point, image.width, measureText(), PICK_SLACK / scale);
    return index !== null && (only === undefined || marks[index]?.tool === only) ? index : null;
  };
  const imagePoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect === undefined || scale <= 0) return { x: 0, y: 0 };
    return { x: board.x + (event.clientX - rect.left) / scale, y: board.y + (event.clientY - rect.top) / scale };
  };

  const commitText = (): void => {
    if (text === null) return;
    const value = text.value.replace(/\s+$/, '');
    if (text.editing !== null) {
      const original = marks[text.editing];
      if (original?.tool === 'text') replaceAt(text.editing, value.trim() === '' ? null : { ...original, text: value });
    } else if (value.trim() !== '') {
      commit([
        ...marks,
        { tool: 'text', at: text.at, text: value, color: text.color, weight: text.weight, ...(text.tail === undefined ? {} : { tail: text.tail }) },
      ]);
    }
    setText(null);
  };
  const editText = (index: number): void => {
    const mark = marks[index];
    if (mark?.tool !== 'text') return;
    setSelected(null);
    setText({ at: mark.at, value: mark.text, color: mark.color, weight: mark.weight, editing: index, ...(mark.tail === undefined ? {} : { tail: mark.tail }) });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (event.button === 1 || (event.button === 0 && spaceHeld)) {
      const area = areaRef.current;
      if (area === null) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = { x: event.clientX, y: event.clientY, left: area.scrollLeft, top: area.scrollTop };
      setPanning(true);
      return;
    }
    if (event.button !== 0) return;
    const point = imagePoint(event);
    if (tool === 'select') {
      // The tail tip of the selected callout is a grip of its own.
      const current = selected === null ? undefined : marks[selected];
      if (selected !== null && current?.tool === 'text' && current.tail !== undefined) {
        const grip = tailHandleRadius(image.width) + PICK_SLACK / scale;
        if (Math.hypot(point.x - current.tail.x, point.y - current.tail.y) <= grip) {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag({ mode: 'tail', index: selected, origin: point, original: current, moved: current });
          return;
        }
      }
      const index = pick(point);
      select(index);
      const mark = index === null ? undefined : marks[index];
      if (index !== null && mark !== undefined) {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ mode: 'move', index, origin: point, original: mark, moved: mark });
      }
      return;
    }
    if (tool === 'crop') {
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelected(null);
      setCropDraft({ from: point, to: point });
      return;
    }
    if (tool === 'text') {
      commitText();
      const existing = pick(point, 'text');
      if (existing !== null) {
        editText(existing);
        return;
      }
      // Pressed on what the callout points at; the box follows the pointer until release.
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelected(null);
      setDrawing({ tool: 'text', at: point, text: '', tail: point, color, weight });
      return;
    }
    setSelected(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawing(tool === 'pen' ? { tool, points: [point], color, weight } : { tool, from: point, to: point, color, weight });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const pan = panRef.current;
    if (pan !== null) {
      const area = areaRef.current;
      if (area !== null) {
        area.scrollLeft = pan.left - (event.clientX - pan.x);
        area.scrollTop = pan.top - (event.clientY - pan.y);
      }
      return;
    }
    const point = imagePoint(event);
    const cropDraft = cropRef.current;
    const drag = dragRef.current;
    const drawing = drawingRef.current;
    if (cropDraft !== null) {
      setCropDraft({ ...cropDraft, to: point });
      return;
    }
    if (drag !== null) {
      let dx = point.x - drag.origin.x;
      let dy = point.y - drag.origin.y;
      // Shift keeps the move on one axis.
      if (event.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      setDrag({
        ...drag,
        moved:
          drag.mode === 'tail' && drag.original.tool === 'text'
            ? { ...drag.original, tail: point }
            : translate(drag.original, dx, dy),
      });
      return;
    }
    if (drawing !== null) {
      setDrawing(
        drawing.tool === 'pen'
          ? { ...drawing, points: [...drawing.points, point] }
          : drawing.tool === 'text'
            ? { ...drawing, at: point }
            : { ...drawing, to: event.shiftKey ? straighten(drawing.from, point, drawing.tool) : point },
      );
      return;
    }
    if (tool === 'select') setHovering(pick(point) !== null);
  };

  const onPointerUp = (): void => {
    if (panRef.current !== null) {
      panRef.current = null;
      setPanning(false);
      return;
    }
    const cropDraft = cropRef.current;
    const drag = dragRef.current;
    const drawing = drawingRef.current;
    if (cropDraft !== null) {
      // Applied on release, like Shottr; undo or Reset crop gives the rest back.
      const cropBox = clampTo(normalized(cropDraft.from, cropDraft.to), view);
      if (cropBox.width * scale >= 8 && cropBox.height * scale >= 8) {
        commitCrop({ x: Math.round(cropBox.x), y: Math.round(cropBox.y), width: Math.round(cropBox.width), height: Math.round(cropBox.height) });
      }
      setCropDraft(null);
      return;
    }
    if (drag !== null) {
      if (drag.moved !== drag.original) replaceAt(drag.index, drag.moved);
      setDrag(null);
      return;
    }
    if (drawing !== null) {
      if (drawing.tool === 'text') {
        // A click is a plain label; a drag is a callout pointing where it started.
        const tip = drawing.tail ?? drawing.at;
        const dragged = Math.hypot(drawing.at.x - tip.x, drawing.at.y - tip.y) * scale >= 12;
        if (dragged) learnCallout();
        else if (!tipDone) setTipNudge(true);
        setText({ at: drawing.at, value: '', color: drawing.color, weight: drawing.weight, editing: null, ...(dragged ? { tail: tip } : {}) });
      } else if (!isTrivial(drawing)) {
        commit([...marks, drawing]);
      }
      setDrawing(null);
    }
  };

  // ---- style changes apply to the selected mark too -----------------------------------------
  const pickColor = (next: string): void => {
    setColor(next);
    const mark = selected === null ? undefined : marks[selected];
    if (selected !== null && mark !== undefined && mark.color !== next) replaceAt(selected, { ...mark, color: next });
  };
  const pickWeight = (next: Weight): void => {
    setWeight(next);
    const mark = selected === null ? undefined : marks[selected];
    if (selected !== null && mark !== undefined && mark.weight !== next) replaceAt(selected, { ...mark, weight: next });
  };
  const chooseTool = (next: EditorTool): void => {
    commitText();
    setTool(next);
    if (next !== 'select') setSelected(null);
  };
  // Selecting a mark shows its style in the bar.
  const select = (index: number | null): void => {
    setSelected(index);
    const mark = index === null ? undefined : marks[index];
    if (mark !== undefined) {
      setColor(mark.color);
      setWeight(mark.weight);
    }
  };

  // The native colour picker reports its final pick through `change`; `input` (React's
  // onChange) fires while it is open, which only previews the colour.
  const pickColorRef = useRef(pickColor);
  useEffect(() => {
    const input = customColorRef.current;
    if (input === null) return undefined;
    const onChange = (): void => pickColorRef.current(input.value);
    input.addEventListener('change', onChange);
    return () => input.removeEventListener('change', onChange);
  }, []);

  // ---- output ---------------------------------------------------------------------------------
  const run = async (action: 'copy' | 'save'): Promise<void> => {
    commitText();
    // Rendered apart from the board: only the frame, no selection, no backdrop.
    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = frame.height;
    paint(canvas, image, marks, { view: frame, image: view, frame, background, pixelRatio: ratio });
    try {
      if (action === 'copy') {
        await copyImage(canvas);
        onNotice({ title: 'Screenshot copied', detail: 'Paste it into your coding agent, a ticket or a chat.' });
      } else {
        await saveImage(canvas, fileName);
        onNotice({ title: 'Screenshot saved', detail: fileName });
      }
      setSaved(history.present);
    } catch (error) {
      onNotice({
        title: action === 'copy' ? 'Could not copy the screenshot' : 'Could not save the screenshot',
        detail: error instanceof Error ? error.message : String(error),
        tone: 'error',
      });
    }
  };

  const requestClose = (): void => {
    if (dirty && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };
  useEffect(() => {
    if (!confirmClose) return undefined;
    const timer = window.setTimeout(() => setConfirmClose(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmClose]);

  // ---- keyboard ---------------------------------------------------------------------------------
  // The listener is registered once and calls the latest render's handlers.
  const keyRef = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const onKey = (event: KeyboardEvent): boolean => {
    const command = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (event.key === 'Escape') {
      // Esc backs out of what is in progress; it never closes the editor.
      if (cropRef.current !== null) setCropDraft(null);
      else if (drawingRef.current !== null) setDrawing(null);
      else if (dragRef.current !== null) setDrag(null);
      else select(null);
      return true;
    }
    if (command) {
      if (key === 'z') (event.shiftKey ? redo : undo)();
      else if (key === 'y') redo();
      else if (key === 'c') void run('copy');
      else if (key === 's') void run('save');
      else if (key === '=' || key === '+') zoomStep(1);
      else if (key === '-') zoomStep(-1);
      else if (key === '0') zoomTo(null);
      else if (key === '1') zoomTo(1 / ratio);
      else return false;
      return true;
    }
    if (event.altKey) return false;
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected !== null) {
      replaceAt(selected, null);
      setSelected(null);
      return true;
    }
    const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    const mark = selected === null ? undefined : marks[selected];
    if (nudge !== undefined && selected !== null && mark !== undefined) {
      const step = (event.shiftKey ? 10 : 1) / scale;
      replaceAt(selected, translate(mark, (nudge[0] ?? 0) * step, (nudge[1] ?? 0) * step));
      return true;
    }
    const weightKey = WEIGHTS.find((entry) => String(entry.weight) === event.key);
    if (weightKey !== undefined) {
      pickWeight(weightKey.weight);
      return true;
    }
    const toolKey = TOOLS.find((entry) => entry.key === event.key.toUpperCase());
    if (toolKey !== undefined) {
      chooseTool(toolKey.tool);
      return true;
    }
    return false;
  };
  // Listeners registered once call the latest render's handlers through these refs.
  useLayoutEffect(() => {
    keyRef.current = onKey;
    wheelRef.current = onWheel;
    pickColorRef.current = pickColor;
  });
  useEffect(() => {
    const typing = (target: EventTarget | null): boolean =>
      target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== 'color');
    const onKeyDown = (event: KeyboardEvent): void => {
      if (typing(event.target)) return;
      if (event.key === ' ') {
        event.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (keyRef.current(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === ' ') setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, []);

  // ---- render -------------------------------------------------------------------------------------
  const cursor = panning
    ? 'grabbing'
    : spaceHeld
      ? 'grab'
      : tool === 'select'
        ? drag !== null
          ? 'grabbing'
          : hovering
            ? 'move'
            : 'default'
        : 'crosshair';
  const custom = !(COLORS as readonly string[]).includes(color.toUpperCase());
  const textLayout = text === null ? null : calloutLayout({ at: text.at, text: text.value, weight: text.weight }, image.width, measureText());

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot editor"
      style={{ ...FONT, position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#0E0E0E', zIndex: Z + 5 }}
    >
      <div
        role="toolbar"
        aria-label="Markup tools"
        style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '8px 12px', background: INK, borderBottom: '1px solid rgba(255,255,255,0.12)', flexWrap: 'wrap', rowGap: 6 }}
      >
        {TOOLS.map((entry) => (
          <BarButton
            key={entry.tool}
            icon={entry.icon}
            label={entry.label}
            detail={entry.detail}
            shortcut={[entry.key]}
            pressed={tool === entry.tool}
            onClick={() => chooseTool(entry.tool)}
          />
        ))}
        <Divider />
        {COLORS.map((swatch) => (
          <Tooltip key={swatch} label={COLOR_NAMES[swatch] ?? swatch} placement="below">
            {(describedBy) => (
              <button
                type="button"
                onClick={() => pickColor(swatch)}
                aria-label={`Colour ${COLOR_NAMES[swatch] ?? swatch}`}
                aria-describedby={describedBy}
                aria-pressed={color.toUpperCase() === swatch}
                style={swatchStyle(swatch, color.toUpperCase() === swatch)}
              />
            )}
          </Tooltip>
        ))}
        <Tooltip label="Custom colour" detail="Pick any colour." placement="below">
          {(describedBy) => (
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <span
                aria-hidden="true"
                style={{
                  ...swatchStyle(custom ? color : '#FFFFFF', custom),
                  background: custom
                    ? `radial-gradient(circle, ${color} 0 45%, transparent 47%), conic-gradient(#E5484D, #F5A524, #30A46C, #0091FF, #8E4EC6, #E5484D)`
                    : 'conic-gradient(#E5484D, #F5A524, #30A46C, #0091FF, #8E4EC6, #E5484D)',
                }}
              />
              <input
                ref={customColorRef}
                type="color"
                aria-label="Custom colour"
                aria-describedby={describedBy}
                value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#000000'}
                onChange={(event) => setColor(event.target.value)}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', padding: 0, border: 0 }}
              />
            </span>
          )}
        </Tooltip>
        <Divider />
        {WEIGHTS.map((entry) => (
          <Tooltip key={entry.weight} label={`${entry.label} stroke`} shortcut={[String(entry.weight)]} placement="below">
            {(describedBy) => (
              <button
                type="button"
                onClick={() => pickWeight(entry.weight)}
                aria-label={`${entry.label} stroke`}
                aria-describedby={describedBy}
                aria-pressed={weight === entry.weight}
                style={{ ...iconButton(weight === entry.weight), width: 30, minWidth: 30 }}
              >
                <span aria-hidden="true" style={{ width: entry.dot, height: entry.dot, borderRadius: entry.dot, background: '#FFFFFF' }} />
              </button>
            )}
          </Tooltip>
        ))}
        <Divider />
        <BarButton icon="undo" label="Undo" shortcut={[MOD_KEY, 'Z']} disabled={history.past.length === 0} onClick={undo} />
        <BarButton icon="redo" label="Redo" shortcut={[MOD_KEY, '⇧', 'Z']} disabled={history.future.length === 0} onClick={redo} />
        <BarButton
          icon="eraser"
          label="Delete selected"
          detail="Select a mark with V first."
          shortcut={['⌫']}
          disabled={selected === null}
          onClick={() => {
            if (selected === null) return;
            replaceAt(selected, null);
            setSelected(null);
          }}
        />
        <BarButton icon="trash" label="Clear all marks" disabled={marks.length === 0} onClick={() => commit(NO_MARKS)} />
        <BarButton
          icon="cropOff"
          label="Reset crop"
          detail={crop === null ? 'The image is not cropped.' : 'Show the whole capture again.'}
          disabled={crop === null}
          onClick={() => commitCrop(null)}
        />
        <span style={{ flex: 1, minWidth: 8 }} />
        <BarButton icon="zoomOut" label="Zoom out" shortcut={[MOD_KEY, '−']} disabled={percent <= MIN_ZOOM * 1.01} onClick={() => zoomStep(-1)} />
        <Tooltip label={zoom === null ? 'Actual size' : 'Fit to window'} shortcut={zoom === null ? [MOD_KEY, '1'] : [MOD_KEY, '0']} placement="below">
          {(describedBy) => (
            <button
              type="button"
              onClick={() => zoomTo(zoom === null ? 1 / ratio : null)}
              aria-label={`Zoom ${Math.round(percent * 100)}%`}
              aria-describedby={describedBy}
              style={{ ...iconButton(false), minWidth: 54, padding: '0 6px', fontVariantNumeric: 'tabular-nums' }}
            >
              <span style={{ ...FONT, color: 'inherit', fontWeight: 600, fontSize: 12 }}>{Math.round(percent * 100)}%</span>
            </button>
          )}
        </Tooltip>
        <BarButton icon="zoomIn" label="Zoom in" shortcut={[MOD_KEY, '+']} disabled={percent >= MAX_ZOOM * 0.99} onClick={() => zoomStep(1)} />
        <BarButton icon="fit" label="Fit to window" shortcut={[MOD_KEY, '0']} pressed={zoom === null} onClick={() => zoomTo(null)} />
        <Divider />
        <BarButton icon="copy" label="Copy image" shortcut={[MOD_KEY, 'C']} text="Copy" primary onClick={() => void run('copy')} />
        <BarButton icon="download" label="Save as PNG" detail={fileName} shortcut={[MOD_KEY, 'S']} text="Save" onClick={() => void run('save')} />
        <BarButton
          icon="close"
          label={confirmClose ? 'Discard marks and close' : 'Close'}
          detail={confirmClose ? 'Click again to close without copying or saving.' : dirty ? 'Your marks are not copied or saved yet.' : undefined}
          text={confirmClose ? 'Discard?' : undefined}
          danger={confirmClose}
          onClick={requestClose}
        />
      </div>
      {showTip && tipAt !== null ? <CalloutTip left={tipAt.left} top={tipAt.top} nudge={tipNudge} onDismiss={learnCallout} /> : null}
      <div ref={areaRef} style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div style={{ display: 'flex', minWidth: '100%', minHeight: '100%', width: 'max-content', height: 'max-content' }}>
          <div style={{ position: 'relative', margin: 'auto', width: board.width * scale, height: board.height * scale, flex: 'none' }}>
            <canvas
              ref={canvasRef}
              width={board.width}
              height={board.height}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={() => setHovering(false)}
              onDoubleClick={(event) => {
                const index = pick(imagePoint(event), 'text');
                if (index !== null) editText(index);
              }}
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                cursor,
                touchAction: 'none',
              }}
            />
            {text === null || textLayout === null ? null : (
              <textarea
                aria-label="Callout text"
                // Opened by a deliberate click or drag with the callout tool, or a double-click.
                autoFocus
                spellCheck={false}
                rows={textLayout.lines.length}
                value={text.value}
                onChange={(event) => setText({ ...text, value: event.target.value })}
                onBlur={commitText}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Escape') setText(null);
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    commitText();
                  }
                }}
                style={{
                  position: 'absolute',
                  left: (textLayout.box.x - board.x) * scale,
                  top: (textLayout.box.y - board.y) * scale,
                  width: textLayout.box.width * scale,
                  height: textLayout.box.height * scale,
                  margin: 0,
                  padding: `${textLayout.padY * scale}px ${textLayout.padX * scale}px`,
                  boxSizing: 'border-box',
                  border: 0,
                  borderRadius: textLayout.radius * scale,
                  outline: '1.5px dashed rgba(255,255,255,0.85)',
                  outlineOffset: 3,
                  resize: 'none',
                  overflow: 'hidden',
                  whiteSpace: 'pre',
                  textAlign: 'center',
                  background: 'transparent',
                  // The canvas paints the text; this only shows the caret and the selection.
                  color: 'transparent',
                  caretColor: textColorOn(text.color),
                  font: `600 ${textLayout.size * scale}px/${textLayout.lineHeight * scale}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
                }}
              />
            )}
          </div>
        </div>
      </div>
      <div
        aria-hidden="true"
        style={{ ...FONT, padding: '6px 12px', fontSize: 12, color: '#9C978F', background: INK, borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}
      >
        {tool === 'select'
          ? 'Drag a mark to move it (Shift keeps one axis) · drag a callout’s round grip to re-aim its tail · arrow keys nudge · ⌫ deletes · double-click text to edit'
          : tool === 'text'
            ? 'Drag from what you point at to where the text goes · click for a box without a tail · Enter places it, Shift+Enter adds a line'
            : `Hold Space and drag to pan · ${MOD_KEY} + scroll to zoom · V to select and move marks · Esc cancels`}
      </div>
    </div>
  );
}

const COLOR_NAMES: Readonly<Record<string, string>> = {
  '#E5484D': 'Red',
  '#F5A524': 'Amber',
  '#30A46C': 'Green',
  '#0091FF': 'Blue',
  '#8E4EC6': 'Purple',
  '#1F1E1D': 'Black',
};

function swatchStyle(fill: string, active: boolean): CSSProperties {
  return {
    appearance: 'none',
    display: 'block',
    width: 22,
    height: 22,
    margin: '0 3px',
    padding: 0,
    borderRadius: 11,
    background: fill,
    border: active ? '2px solid #FFFFFF' : '2px solid rgba(255,255,255,0.25)',
    boxShadow: active ? `0 0 0 2px ${fill === '#FFFFFF' ? ACCENT : fill}` : 'none',
    cursor: 'pointer',
    boxSizing: 'border-box',
  };
}

function iconButton(pressed: boolean): CSSProperties {
  return {
    ...FONT,
    appearance: 'none',
    height: 34,
    minWidth: 34,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 0,
    border: 0,
    borderRadius: 8,
    cursor: 'pointer',
    color: '#FFFFFF',
    background: pressed ? 'rgba(255,255,255,0.2)' : 'transparent',
  };
}

function Divider(): ReactNode {
  return <span aria-hidden="true" style={{ width: 1, height: 20, margin: '0 6px', background: 'rgba(255,255,255,0.18)' }} />;
}

function BarButton(props: {
  readonly icon: IconName;
  readonly label: string;
  readonly detail?: string | undefined;
  readonly shortcut?: readonly string[];
  readonly text?: string | undefined;
  readonly pressed?: boolean;
  readonly primary?: boolean;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}): ReactNode {
  return (
    <Tooltip label={props.label} {...(props.detail === undefined ? {} : { detail: props.detail })} {...(props.shortcut === undefined ? {} : { shortcut: props.shortcut })} placement="below">
      {(describedBy) => (
        <button
          type="button"
          onClick={props.onClick}
          disabled={props.disabled}
          aria-label={props.label}
          aria-describedby={describedBy}
          {...(props.pressed === undefined ? {} : { 'aria-pressed': props.pressed })}
          style={{
            ...iconButton(props.pressed === true),
            padding: props.text === undefined ? 0 : '0 12px',
            cursor: props.disabled ? 'default' : 'pointer',
            opacity: props.disabled ? 0.35 : 1,
            background: props.danger ? '#B42318' : props.primary ? ACCENT : props.pressed ? 'rgba(255,255,255,0.2)' : 'transparent',
          }}
        >
          <Icon name={props.icon} />
          {props.text === undefined ? null : <span style={{ ...FONT, color: 'inherit', fontWeight: 600 }}>{props.text}</span>}
        </button>
      )}
    </Tooltip>
  );
}

/** Shift held: arrows snap to 45°, boxes become squares. */
function straighten(from: Point, to: Point, tool: Tool): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (tool === 'arrow' || tool === 'ruler') {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    return { x: from.x + length * Math.cos(angle), y: from.y + length * Math.sin(angle) };
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: from.x + Math.sign(dx || 1) * side, y: from.y + Math.sign(dy || 1) * side };
}

/** `box` cut down to what lies inside `within`. */
function clampTo(box: Bounds, within: Bounds): Bounds {
  const x = Math.max(box.x, within.x);
  const y = Math.max(box.y, within.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(box.x + box.width, within.x + within.width) - x),
    height: Math.max(0, Math.min(box.y + box.height, within.y + within.height) - y),
  };
}

/**
 * At least the scroll area's size (minus a pixel of slack against scrollbars), centred on
 * the IMAGE so the picture stays put while marks are added around it, and never smaller
 * than `content`; whole image pixels.
 */
function boardAround(content: Bounds, image: Bounds, area: { readonly width: number; readonly height: number }, scale: number): Bounds {
  const width = Math.max(0, area.width - 2) / scale;
  const height = Math.max(0, area.height - 2) / scale;
  const centre = { x: image.x + image.width / 2, y: image.y + image.height / 2 };
  const box = union(content, { x: centre.x - width / 2, y: centre.y - height / 2, width, height });
  const x = Math.floor(box.x);
  const y = Math.floor(box.y);
  // Floor the far edge too when the area set the size, so the canvas never overflows it.
  const right = box.width > content.width + 1 ? Math.floor(box.x + box.width) : Math.ceil(box.x + box.width);
  const bottom = box.height > content.height + 1 ? Math.floor(box.y + box.height) : Math.ceil(box.y + box.height);
  return { x, y, width: right - x, height: bottom - y };
}
