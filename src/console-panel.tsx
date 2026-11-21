import type { CSSProperties, ReactNode } from 'react';

import type { ConsoleEntry } from './console-capture';
import { BUTTON, FONT, LINE, MUTED, Z } from './overlay-parts';

const ERROR = '#B42318';
const WARNING = '#B54708';

/**
 * The console's warnings and errors, oldest first, laid out like the comment list. What is
 * listed is what **Copy prompt → Console** copies; remove an entry to leave it out.
 */
export function ConsolePanel(props: {
  readonly entries: readonly ConsoleEntry[];
  readonly onRemove: (id: string) => void;
  readonly onClear: () => void;
  readonly onClose: () => void;
  /** Where it opens, beside the toolbar. */
  readonly anchor: CSSProperties;
}): ReactNode {
  return (
    <div
      aria-label="Console problems"
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
        <strong style={{ ...FONT, fontWeight: 600 }}>Console ({props.entries.length})</strong>
        <button type="button" onClick={props.onClose} aria-label="Hide console" style={{ ...BUTTON, marginLeft: 'auto', padding: '2px 8px' }}>
          Hide
        </button>
      </div>
      {props.entries.length === 0 ? (
        <p style={{ ...FONT, margin: 0, padding: '14px 10px', color: MUTED }}>
          No warnings or errors logged yet. They are recorded as they happen, on every page.
        </p>
      ) : (
        <ol style={{ ...FONT, listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', flex: 1 }}>
          {props.entries.map((entry) => (
            <li key={entry.id} style={{ ...FONT, display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderBottom: `1px solid ${LINE}` }}>
              <span style={{ ...FONT, flex: 1, minWidth: 0 }}>
                <span
                  title={entry.message}
                  style={{ ...FONT, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  <span style={{ ...FONT, color: entry.level === 'error' ? ERROR : WARNING, fontWeight: 700 }}>
                    {entry.level === 'error' ? 'Error' : 'Warning'}
                  </span>{' '}
                  {firstLine(entry.message)}
                </span>
                <span style={{ ...FONT, display: 'block', fontSize: 11, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.pathname} · {entry.source}
                  {entry.count > 1 ? ` · ×${entry.count}` : ''}
                </span>
              </span>
              <button
                type="button"
                onClick={() => props.onRemove(entry.id)}
                aria-label={`Remove: ${firstLine(entry.message)}`}
                title="Leave this one out of the prompt"
                style={{ ...BUTTON, border: 0, padding: '0 4px', color: MUTED, lineHeight: 1.2 }}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      <div style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ ...FONT, flex: 1, fontSize: 12, color: MUTED }}>Copy with Copy prompt → Console.</span>
        <button
          type="button"
          onClick={props.onClear}
          disabled={props.entries.length === 0}
          style={{ ...BUTTON, color: ERROR, opacity: props.entries.length === 0 ? 0.5 : 1 }}
        >
          Clear all
        </button>
      </div>
    </div>
  );
}

function firstLine(message: string): string {
  return message.trim().split('\n')[0] ?? '';
}
