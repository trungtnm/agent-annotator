import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import { CARD_LINES, type PlacedCallout } from './callouts';
import { Icon, type IconName } from './icons';
import { MOD_KEY, Tooltip } from './tooltip';
import type { Dock } from './toolbar-dock';

/**
 * The overlay's presentational pieces. Inline styles only: a strict CSP allows style
 * attributes but not an unnonced <style> element, and Tailwind's preflight would restyle
 * a bare <button> otherwise. Every piece sets its own font so the host page's cannot leak in.
 */

export const ACCENT = '#D97757';
export const INK = '#1F1E1D';
export const MUTED = '#6B6862';
export const LINE = '#E5E2DC';
export const Z = 2147483000;

export const FONT: CSSProperties = {
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSize: 13,
  lineHeight: 1.45,
  color: INK,
  letterSpacing: 'normal',
  textTransform: 'none',
};

export const BUTTON: CSSProperties = {
  ...FONT,
  appearance: 'none',
  border: `1px solid ${LINE}`,
  background: '#FFFFFF',
  borderRadius: 6,
  padding: '5px 10px',
  cursor: 'pointer',
  fontWeight: 500,
};

export const PRIMARY: CSSProperties = { ...BUTTON, background: ACCENT, borderColor: ACCENT, color: '#FFFFFF' };

export interface Box {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export function boxOf(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

export function Highlight(props: { readonly box: Box; readonly label: string; readonly strong: boolean }): ReactNode {
  const { box } = props;
  const labelAbove = box.top > 24;
  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: box.top,
          left: box.left,
          width: box.width,
          height: box.height,
          border: `2px solid ${ACCENT}`,
          background: props.strong ? 'rgba(217, 119, 87, 0.18)' : 'rgba(217, 119, 87, 0.08)',
          borderRadius: 3,
          pointerEvents: 'none',
          zIndex: Z,
          boxSizing: 'border-box',
        }}
      />
      <div
        style={{
          ...FONT,
          position: 'fixed',
          top: labelAbove ? box.top - 22 : box.top + box.height + 2,
          left: Math.max(0, box.left),
          background: ACCENT,
          color: '#FFFFFF',
          fontSize: 11,
          fontWeight: 600,
          padding: '2px 6px',
          borderRadius: 3,
          pointerEvents: 'none',
          zIndex: Z,
          whiteSpace: 'nowrap',
        }}
      >
        {props.label}
      </div>
    </>
  );
}

export function AreaBox(props: { readonly box: Box }): ReactNode {
  return (
    <div
      style={{
        position: 'fixed',
        top: props.box.top,
        left: props.box.left,
        width: props.box.width,
        height: props.box.height,
        border: `2px dashed ${ACCENT}`,
        background: 'rgba(217, 119, 87, 0.08)',
        pointerEvents: 'none',
        zIndex: Z,
        boxSizing: 'border-box',
      }}
    />
  );
}

export function Pin(props: { readonly box: Box; readonly number: number; readonly onClick: () => void }): ReactNode {
  const top = Math.min(Math.max(props.box.top - 10, 4), window.innerHeight - 26);
  const left = Math.min(Math.max(props.box.left - 10, 4), window.innerWidth - 26);
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={`Comment ${props.number}`}
      style={{
        ...FONT,
        position: 'fixed',
        top,
        left,
        width: 22,
        height: 22,
        borderRadius: '50% 50% 50% 4px',
        border: '2px solid #FFFFFF',
        background: ACCENT,
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: 700,
        padding: 0,
        cursor: 'pointer',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        zIndex: Z + 1,
      }}
    >
      {props.number}
    </button>
  );
}

export function Hint(props: { readonly onDismiss: () => void }): ReactNode {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        ...FONT,
        position: 'fixed',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        background: INK,
        color: '#FFFFFF',
        fontSize: 12,
        padding: '6px 12px',
        borderRadius: 999,
        zIndex: Z + 2,
        maxWidth: 'calc(100vw - 32px)',
        textAlign: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      <span style={{ ...FONT, fontSize: 12, color: '#FFFFFF' }}>
        Comment mode. Click: comment on an element · Select text: comment on a passage · ⌘/Ctrl+click: pick several ·
        Shift+drag: mark an area · Alt+click: interact normally · Esc: exit
      </span>
      <Tooltip label="Hide this hint" detail="The ? button in the toolbar brings it back." placement="below">
        {(describedBy) => (
          <button
            type="button"
            onClick={props.onDismiss}
            aria-label="Hide hint"
            aria-describedby={describedBy}
            style={{ ...FONT, appearance: 'none', background: 'none', border: 0, padding: '0 2px', color: '#FFFFFF', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </button>
        )}
      </Tooltip>
    </div>
  );
}

export function Editor(props: {
  readonly anchor: Box | null;
  readonly title: string;
  readonly comment: string;
  readonly editing: boolean;
  readonly onChange: (comment: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly onDelete: () => void;
}): ReactNode {
  const width = 320;
  const height = 170;
  const { anchor } = props;
  let top = window.innerHeight - height - 80;
  let left = window.innerWidth - width - 16;
  if (anchor !== null) {
    const below = anchor.top + anchor.height + 8;
    top = below + height < window.innerHeight ? below : Math.max(8, anchor.top - height - 8);
    left = Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8);
  }
  const canSave = props.comment.trim().length > 0;
  return (
    <div
      role="dialog"
      aria-label="Comment on element"
      style={{
        ...FONT,
        position: 'fixed',
        top,
        left,
        width,
        background: '#FFFFFF',
        border: `1px solid ${LINE}`,
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        padding: 10,
        zIndex: Z + 3,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ ...FONT, fontSize: 11, color: MUTED, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {props.title}
      </div>
      <textarea
        // The editor exists only after a deliberate click, so taking focus is expected.
        autoFocus
        value={props.comment}
        placeholder="What should change here?"
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') props.onCancel();
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSave) props.onSave();
        }}
        style={{
          ...FONT,
          width: '100%',
          height: 84,
          resize: 'vertical',
          border: `1px solid ${LINE}`,
          borderRadius: 6,
          padding: 8,
          boxSizing: 'border-box',
          outline: 'none',
          background: '#FFFFFF',
        }}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}>
        {props.editing ? (
          <button type="button" onClick={props.onDelete} style={{ ...BUTTON, marginRight: 'auto', color: '#B42318' }}>
            Delete
          </button>
        ) : null}
        <button type="button" onClick={props.onCancel} style={BUTTON}>
          Cancel
        </button>
        <button type="button" onClick={props.onSave} disabled={!canSave} style={{ ...PRIMARY, opacity: canSave ? 1 : 0.5 }}>
          Save (⌘↵)
        </button>
      </div>
    </div>
  );
}

export interface ListEntry {
  readonly id: string;
  readonly number: number;
  readonly comment: string;
  readonly where: string;
  readonly onThisPage: boolean;
}

export function Panel(props: {
  readonly entries: readonly ListEntry[];
  readonly includeData: boolean;
  /** Whether new comments are screened for personal data, for the checkbox's label. */
  readonly redactionOn: boolean;
  readonly onIncludeData: (value: boolean) => void;
  readonly onEdit: (id: string) => void;
  readonly onClear: () => void;
  readonly onClose: () => void;
  /** Where it opens, beside the toolbar. */
  readonly anchor: CSSProperties;
}): ReactNode {
  return (
    <div
      aria-label="Comment list"
      style={{
        ...FONT,
        position: 'fixed',
        ...props.anchor,
        width: 340,
        maxHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#FFFFFF',
        border: `1px solid ${LINE}`,
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        zIndex: Z + 2,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderBottom: `1px solid ${LINE}` }}>
        <strong style={{ ...FONT, fontWeight: 600 }}>Comments ({props.entries.length})</strong>
        <button type="button" onClick={props.onClose} aria-label="Hide list" style={{ ...BUTTON, marginLeft: 'auto', padding: '2px 8px' }}>
          Hide
        </button>
      </div>
      <ol style={{ ...FONT, listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', flex: 1 }}>
        {props.entries.map((entry) => (
          <li key={entry.id} style={{ borderBottom: `1px solid ${LINE}` }}>
            <button
              type="button"
              onClick={() => props.onEdit(entry.id)}
              style={{ ...FONT, display: 'flex', gap: 8, width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '8px 10px', cursor: 'pointer' }}
            >
              <span style={{ ...FONT, color: ACCENT, fontWeight: 700, minWidth: 16 }}>{entry.number}</span>
              <span style={{ ...FONT, flex: 1, minWidth: 0 }}>
                <span style={{ ...FONT, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.comment}
                </span>
                <span style={{ ...FONT, display: 'block', fontSize: 11, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.where}
                  {entry.onThisPage ? '' : ' · other page'}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ ...FONT, display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: MUTED, cursor: 'pointer', flex: 1 }}>
          <input type="checkbox" checked={props.includeData} onChange={(event) => props.onIncludeData(event.target.checked)} />
          Include props/state ({props.redactionOn ? 'personal data redacted' : 'redaction off'})
        </label>
        <button type="button" onClick={props.onClear} style={{ ...BUTTON, color: '#B42318' }}>
          Clear all
        </button>
      </div>
    </div>
  );
}

/** Each comment drawn in full beside its element: what the page shows in a screenshot. */
export function Callouts(props: {
  readonly callouts: readonly PlacedCallout[];
  readonly onEdit: ((number: number) => void) | null;
}): ReactNode {
  return (
    <>
      {props.callouts.map((callout) => (
        <div key={callout.number}>
          <div
            style={{
              position: 'fixed',
              top: callout.box.top,
              left: callout.box.left,
              width: callout.box.width,
              height: callout.box.height,
              border: `2px ${callout.area === true ? 'dashed' : 'solid'} ${ACCENT}`,
              background: callout.area === true ? 'rgba(217, 119, 87, 0.08)' : 'transparent',
              borderRadius: 3,
              pointerEvents: 'none',
              zIndex: Z,
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            aria-label={`Comment ${callout.number}: ${callout.comment}`}
            onClick={props.onEdit === null ? undefined : () => props.onEdit?.(callout.number)}
            style={{
              ...FONT,
              position: 'fixed',
              top: callout.card.top,
              left: callout.card.left,
              width: callout.card.width,
              maxHeight: callout.card.height,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              textAlign: 'left',
              padding: '7px 10px',
              background: '#FFFFFF',
              border: `1.5px solid ${ACCENT}`,
              borderRadius: 8,
              boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
              cursor: props.onEdit === null ? 'default' : 'pointer',
              zIndex: Z + 1,
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                ...FONT,
                flex: 'none',
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                background: ACCENT,
                color: '#FFFFFF',
                fontSize: 11,
                fontWeight: 700,
                lineHeight: '18px',
                textAlign: 'center',
              }}
            >
              {callout.number}
            </span>
            <span
              style={{
                ...FONT,
                lineHeight: '18px',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: CARD_LINES,
                overflow: 'hidden',
              }}
            >
              {callout.comment}
            </span>
          </button>
        </div>
      ))}
    </>
  );
}

export interface Notice {
  readonly title: string;
  readonly detail?: string;
  readonly tone?: 'success' | 'error';
}

export function Toast(props: { readonly notice: Notice; readonly onDismiss: () => void }): ReactNode {
  const error = props.notice.tone === 'error';
  return (
    <div
      role="status"
      aria-live="polite"
      onClick={props.onDismiss}
      style={{
        ...FONT,
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        width: 'max-content',
        maxWidth: 'min(420px, calc(100vw - 32px))',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        padding: '10px 14px',
        background: INK,
        color: '#FFFFFF',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        // Above the screenshot editor, which reports through it.
        zIndex: Z + 6,
        cursor: 'pointer',
      }}
    >
      <span style={{ ...FONT, color: error ? '#FF8A80' : '#7EE2A8', fontWeight: 700 }}>{error ? '!' : '✓'}</span>
      <span style={{ ...FONT, color: '#FFFFFF' }}>
        <strong style={{ ...FONT, display: 'block', color: '#FFFFFF', fontWeight: 600 }}>{props.notice.title}</strong>
        {props.notice.detail === undefined ? null : (
          <span style={{ ...FONT, display: 'block', color: '#D6D3CE', fontSize: 12 }}>{props.notice.detail}</span>
        )}
      </span>
    </div>
  );
}

/** What a copied prompt is about. */
export type PromptSource = 'comments' | 'console';

export interface ToolbarProps {
  readonly active: boolean;
  readonly paused: boolean;
  readonly count: number;
  readonly panelOpen: boolean;
  readonly showComments: boolean;
  readonly capturing: boolean;
  /** Folded down to one button, out of the page's way. */
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  /** Whether personal-data redaction is on: the settings button warns when it is off. */
  readonly redactionOn: boolean;
  readonly settingsOpen: boolean;
  readonly onToggleSettings: () => void;
  /** Present while comment mode is on and its hint has been hidden: shows it again. */
  readonly onShowHint: (() => void) | null;
  readonly onToggleActive: () => void;
  readonly onTogglePaused: () => void;
  readonly onToggleComments: () => void;
  readonly onScreenshot: () => void;
  readonly onTogglePanel: () => void;
  /** Copies the comments, or the console's warnings and errors, as a prompt. */
  readonly onCopy: (what: PromptSource) => void;
  /** Console warnings and errors recorded so far, and how many of them are errors. */
  readonly consoleCount: number;
  readonly consoleErrors: number;
  readonly consoleOpen: boolean;
  readonly onToggleConsole: () => void;
  /** Where the toolbar sits, already kept inside the viewport. */
  readonly dock: Dock;
  /** Its tips open below it when it sits in the top half. */
  readonly placement: 'above' | 'below';
  /** Measures the toolbar, to keep it and its panels inside the viewport. */
  readonly frame: (node: HTMLDivElement | null) => void;
  /** While dragging: the place under the pointer. */
  readonly onDockMove: (dock: Dock) => void;
  /** The drag ended (or an arrow key moved it): remember the place. */
  readonly onDockDrop: () => void;
  readonly onDockReset: () => void;
}

/** Every control of the tool in one bar, bottom right, grouped by what it acts on. */
export function Toolbar({ frame, ...props }: ToolbarProps): ReactNode {
  const none = props.count === 0;
  const nothingToCopy = none && props.consoleCount === 0;
  const [copyMenu, setCopyMenu] = useState(false);
  const drag = useDockDrag(props.dock, props.onDockMove, props.onDockDrop);
  if (props.collapsed) return <CollapsedToolbar {...props} frame={frame} />;
  return (
    <div
      ref={frame}
      role="toolbar"
      aria-label="Dev annotator"
      style={{
        ...FONT,
        position: 'fixed',
        right: props.dock.right,
        bottom: props.dock.bottom,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 4,
        background: INK,
        borderRadius: 12,
        boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
        zIndex: Z + 2,
      }}
    >
      <Tooltip label="Move toolbar" detail="Drag it anywhere, or use the arrow keys. Double-click to put it back." placement={props.placement}>
        {(describedBy) => (
          <button
            type="button"
            aria-label="Move toolbar"
            aria-describedby={describedBy}
            onPointerDown={drag.onPointerDown}
            onDoubleClick={props.onDockReset}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 64 : 16;
              const delta: Readonly<Record<string, readonly [number, number]>> = {
                ArrowLeft: [step, 0],
                ArrowRight: [-step, 0],
                ArrowUp: [0, step],
                ArrowDown: [0, -step],
              };
              const move = delta[event.key];
              if (move === undefined) return;
              event.preventDefault();
              props.onDockMove({ right: props.dock.right + move[0], bottom: props.dock.bottom + move[1] });
              props.onDockDrop();
            }}
            style={{ ...barButton(false, false, false), minWidth: 20, width: 20, cursor: 'grab', touchAction: 'none', opacity: 0.6 }}
          >
            <Icon name="grip" size={16} />
          </button>
        )}
      </Tooltip>
      <ToolButton
        icon="comment"
        label={props.active ? 'Turn off comment mode' : 'Turn on comment mode'}
        hint="Click an element, select text, ⌘/Ctrl+click several or Shift+drag an area to comment on it."
        shortcut={props.active ? 'Esc' : 'Alt+Shift+C'}
        pressed={props.active}
        accent
        onClick={props.onToggleActive}
        placement={props.placement}
      />
      <ToolButton
        icon={props.paused ? 'play' : 'pause'}
        label={props.paused ? 'Resume animations' : 'Pause animations'}
        hint={props.paused ? 'Resume animations and videos' : 'Pause animations and videos to comment on the current frame'}
        pressed={props.paused}
        onClick={props.onTogglePaused}
        placement={props.placement}
      />
      <ToolButton
        icon="eye"
        label={props.showComments ? 'Show comments as numbers' : 'Show comments in full'}
        hint={props.showComments ? 'Collapse comments back to numbered pins' : 'Show every comment beside its element'}
        pressed={props.showComments}
        disabled={none}
        onClick={props.onToggleComments}
        placement={props.placement}
      />
      <ToolButton
        icon="camera"
        label="Screenshot"
        hint="Capture this tab with every comment shown, then mark it up"
        disabled={props.capturing}
        onClick={props.onScreenshot}
        placement={props.placement}
      />
      <ToolButton
        icon={props.redactionOn ? 'shield' : 'shieldOff'}
        label="Redaction settings"
        hint={
          props.redactionOn
            ? 'Personal data is redacted from the prompt. Choose countries or add your own patterns.'
            : 'Redaction is OFF: new comments carry personal data as the page shows it.'
        }
        pressed={props.settingsOpen}
        onClick={props.onToggleSettings}
        placement={props.placement}
      />
      <Tooltip
        label={props.consoleOpen ? 'Hide console problems' : 'Console problems'}
        detail={
          props.consoleCount === 0
            ? 'No warnings or errors logged yet.'
            : `${props.consoleErrors} error${props.consoleErrors === 1 ? '' : 's'}, ${props.consoleCount - props.consoleErrors} warning${props.consoleCount - props.consoleErrors === 1 ? '' : 's'} from the browser console. Pick some and copy them as a prompt.`
        }
        placement={props.placement}
      >
        {(describedBy) => (
          <button
            type="button"
            onClick={props.onToggleConsole}
            aria-pressed={props.consoleOpen}
            aria-label={`Console problems (${props.consoleCount})`}
            aria-describedby={describedBy}
            style={{ ...barButton(props.consoleOpen, false, false), gap: 4, padding: props.consoleCount === 0 ? 0 : '0 8px' }}
          >
            <Icon name="terminal" />
            {props.consoleCount === 0 ? null : (
              <span
                style={{
                  ...FONT,
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                  borderRadius: 9,
                  background: props.consoleErrors > 0 ? '#D92D20' : '#DC6803',
                  color: '#FFFFFF',
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: '18px',
                  textAlign: 'center',
                  boxSizing: 'border-box',
                }}
              >
                {props.consoleCount}
              </span>
            )}
          </button>
        )}
      </Tooltip>
      <Divider />
      <Tooltip
        label={props.panelOpen && !none ? 'Hide comment list' : 'Comment list'}
        detail={none ? 'No comments yet.' : 'Every comment, on this page and others; click one to edit it.'}
        placement={props.placement}
      >
        {(describedBy) => (
          <button
            type="button"
            onClick={props.onTogglePanel}
            disabled={none}
            aria-pressed={props.panelOpen && !none}
            aria-label={`Comment list (${props.count})`}
            aria-describedby={describedBy}
            style={{ ...barButton(props.panelOpen && !none, false, none), gap: 6, padding: '0 10px' }}
          >
            <Icon name="list" />
            <span style={{ ...FONT, color: 'inherit', fontWeight: 600 }}>{props.count}</span>
          </button>
        )}
      </Tooltip>
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <Tooltip
          label="Copy prompt"
          detail={
            nothingToCopy
              ? 'Add a comment first, or wait for a console warning or error.'
              : none
                ? 'The console\'s warnings and errors as one Markdown prompt for your coding agent.'
                : props.consoleCount === 0
                  ? 'Every comment as one Markdown prompt for your coding agent.'
                  : 'Choose: every comment, or the console\'s warnings and errors, as one Markdown prompt.'
          }
          placement={props.placement}
        >
          {(describedBy) => (
            <button
              type="button"
              onClick={() => {
                // Only one kind to copy: no question to ask.
                if (props.consoleCount === 0) props.onCopy('comments');
                else if (none) props.onCopy('console');
                else setCopyMenu(!copyMenu);
              }}
              disabled={nothingToCopy}
              aria-haspopup={!none && props.consoleCount > 0 ? 'menu' : undefined}
              aria-expanded={!none && props.consoleCount > 0 ? copyMenu : undefined}
              aria-describedby={describedBy}
              style={{
                ...barButton(false, false, nothingToCopy),
                gap: 6,
                padding: '0 12px',
                background: nothingToCopy ? 'transparent' : ACCENT,
                color: '#FFFFFF',
              }}
            >
              <Icon name="copy" size={16} />
              <span style={{ ...FONT, color: 'inherit', fontWeight: 600 }}>Copy prompt</span>
            </button>
          )}
        </Tooltip>
        {copyMenu && !none && props.consoleCount > 0 ? (
          <CopyMenu
            comments={props.count}
            console={props.consoleCount}
            placement={props.placement}
            onPick={(what) => {
              setCopyMenu(false);
              props.onCopy(what);
            }}
            onClose={() => setCopyMenu(false)}
          />
        ) : null}
      </span>
      {props.onShowHint === null ? null : (
        <>
          <Divider />
          <ToolButton icon="help" label="Show hint" hint="Show the comment-mode shortcuts" placement={props.placement} onClick={props.onShowHint} />
        </>
      )}
      <Divider />
      <ToolButton
        icon="collapse"
        label="Collapse toolbar"
        hint="Fold the toolbar into one button. Alt+Shift+C still works."
        placement={props.placement}
        onClick={props.onToggleCollapsed}
      />
    </div>
  );
}

/**
 * The toolbar folded away: one round button that opens it again, still showing how many
 * comments there are and, with an accent ring, that comment mode is on.
 */
function CollapsedToolbar({ frame, ...props }: ToolbarProps): ReactNode {
  const drag = useDockDrag(props.dock, props.onDockMove, props.onDockDrop);
  const detail = [
    props.count === 0 ? 'No comments yet.' : `${props.count} comment${props.count === 1 ? '' : 's'}.`,
    props.active ? 'Comment mode is on.' : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      ref={frame}
      role="toolbar"
      aria-label="Dev annotator"
      style={{ position: 'fixed', right: props.dock.right, bottom: props.dock.bottom, zIndex: Z + 2 }}
    >
      <Tooltip label="Expand toolbar" detail={`${detail} Drag to move it.`.trim()} placement={props.placement}>
        {(describedBy) => (
          <button
            type="button"
            onPointerDown={drag.onPointerDown}
            onClickCapture={drag.onClickCapture}
            onClick={props.onToggleCollapsed}
            aria-label="Expand toolbar"
            aria-describedby={describedBy}
            style={{
              ...barButton(false, false, false),
              position: 'relative',
              width: 44,
              height: 44,
              borderRadius: 22,
              background: INK,
              boxShadow: props.active ? `0 0 0 2px ${ACCENT}, 0 6px 20px rgba(0,0,0,0.28)` : '0 6px 20px rgba(0,0,0,0.28)',
            }}
          >
            <Icon name="comment" />
            {props.count === 0 ? null : (
              <span
                aria-hidden="true"
                style={{
                  ...FONT,
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                  borderRadius: 9,
                  background: ACCENT,
                  color: '#FFFFFF',
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: '18px',
                  textAlign: 'center',
                  boxSizing: 'border-box',
                }}
              >
                {props.count}
              </span>
            )}
          </button>
        )}
      </Tooltip>
    </div>
  );
}

/** The choice behind Copy prompt when there are both comments and console entries. */
function CopyMenu(props: {
  readonly comments: number;
  readonly console: number;
  readonly placement: 'above' | 'below';
  readonly onPick: (what: PromptSource) => void;
  readonly onClose: () => void;
}): ReactNode {
  const item: CSSProperties = {
    ...FONT,
    appearance: 'none',
    display: 'flex',
    gap: 12,
    justifyContent: 'space-between',
    width: '100%',
    padding: '7px 10px',
    border: 0,
    borderRadius: 6,
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
  const menu = useRef<HTMLDivElement | null>(null);
  const { onClose } = props;
  // A press anywhere else closes it; the Copy prompt button, beside it, toggles it itself.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const holder = menu.current?.parentElement;
      if (event.target instanceof Node && holder?.contains(event.target)) return;
      onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [onClose]);
  return (
    <div
      ref={menu}
      role="menu"
      aria-label="Copy prompt"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          props.onClose();
        }
      }}
      style={{
        ...FONT,
        position: 'absolute',
        right: 0,
        ...(props.placement === 'above' ? { bottom: 'calc(100% + 10px)' } : { top: 'calc(100% + 10px)' }),
        minWidth: 190,
        padding: 4,
        background: '#FFFFFF',
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        zIndex: Z + 3,
      }}
    >
      <button type="button" role="menuitem" autoFocus onClick={() => props.onPick('comments')} style={item}>
        <span style={{ ...FONT, fontWeight: 600 }}>Comments</span>
        <span style={{ ...FONT, color: MUTED }}>{props.comments}</span>
      </button>
      <button type="button" role="menuitem" onClick={() => props.onPick('console')} style={item}>
        <span style={{ ...FONT, fontWeight: 600 }}>Console</span>
        <span style={{ ...FONT, color: MUTED }}>{props.console}</span>
      </button>
    </div>
  );
}

/** Pointer travel under this is a click, not a drag. */
const DRAG_THRESHOLD = 4;

interface DockDrag {
  readonly onPointerDown: (event: ReactPointerEvent) => void;
  /** Swallows the click that ends a drag, so it does not also press the button. */
  readonly onClickCapture: (event: ReactMouseEvent) => void;
}

/** Moves the toolbar with the pointer; the place is remembered when the button is let go. */
function useDockDrag(dock: Dock, onDockMove: (dock: Dock) => void, onDockDrop: () => void): DockDrag {
  const moved = useRef(false);
  return {
    onClickCapture: (event) => {
      if (!moved.current) return;
      moved.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      // No text selection while the toolbar is dragged across the page.
      event.preventDefault();
      const start = { x: event.clientX, y: event.clientY };
      moved.current = false;
      const onMove = (move: PointerEvent): void => {
        const dx = move.clientX - start.x;
        const dy = move.clientY - start.y;
        if (!moved.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        moved.current = true;
        onDockMove({ right: dock.right - dx, bottom: dock.bottom - dy });
      };
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (moved.current) onDockDrop();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
  };
}

function Divider(): ReactNode {
  return <span aria-hidden="true" style={{ width: 1, height: 20, margin: '0 4px', background: 'rgba(255,255,255,0.18)' }} />;
}

function barButton(pressed: boolean, accent: boolean, disabled: boolean): CSSProperties {
  return {
    ...FONT,
    appearance: 'none',
    height: 36,
    minWidth: 36,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    border: 0,
    borderRadius: 8,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    color: '#FFFFFF',
    background: pressed ? (accent ? ACCENT : 'rgba(255,255,255,0.18)') : 'transparent',
  };
}

function ToolButton(props: {
  readonly icon: IconName;
  readonly label: string;
  readonly hint?: string;
  readonly shortcut?: string;
  readonly pressed?: boolean;
  readonly accent?: boolean;
  readonly disabled?: boolean;
  readonly placement: 'above' | 'below';
  readonly onClick: () => void;
}): ReactNode {
  return (
    <Tooltip
      label={props.label}
      {...(props.hint === undefined ? {} : { detail: props.hint })}
      {...(props.shortcut === undefined ? {} : { shortcut: keyCaps(props.shortcut) })}
      placement={props.placement}
    >
      {(describedBy) => (
        <button
          type="button"
          onClick={props.onClick}
          disabled={props.disabled}
          aria-label={props.label}
          aria-describedby={describedBy}
          {...(props.pressed === undefined ? {} : { 'aria-pressed': props.pressed })}
          {...(props.shortcut === undefined ? {} : { 'aria-keyshortcuts': props.shortcut === 'Esc' ? 'Escape' : props.shortcut })}
          style={barButton(props.pressed === true, props.accent === true, props.disabled === true)}
        >
          <Icon name={props.icon} />
        </button>
      )}
    </Tooltip>
  );
}

/** `Alt+Shift+C` → ⌥ ⇧ C on a Mac, Alt Shift C elsewhere. */
function keyCaps(shortcut: string): string[] {
  const mac = MOD_KEY === '⌘';
  const names: Readonly<Record<string, string>> = mac ? { Alt: '⌥', Shift: '⇧', Ctrl: '⌃', Meta: '⌘' } : {};
  return shortcut.split('+').map((key) => names[key] ?? key);
}
