import type { ReactNode } from 'react';

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const RED = '#E5484D';
/** One loop of the demo: press on the target, drag, release, the callout shows, repeat. */
const LOOP = '3.2s';
const KEY_TIMES = '0;0.12;0.55;0.85;1';

/**
 * The coach mark that teaches the callout drag. People who know "click, then type" never
 * read a tooltip, so this shows where they are already looking — under the Callout button
 * the moment the tool is picked — and SHOWS the gesture in a looping picture before saying
 * it. After a plain click it turns into a nudge. It goes for good once a callout is dragged
 * or "Got it" is pressed.
 *
 * The picture is SVG animated with SMIL, not CSS: a strict CSP (no unnonced <style>) must not break it.
 */
export function CalloutTip(props: {
  readonly left: number;
  readonly top: number;
  /** The person just clicked instead of dragging. */
  readonly nudge: boolean;
  readonly onDismiss: () => void;
}): ReactNode {
  return (
    <div
      role="note"
      aria-label="Callout tip"
      style={{
        position: 'absolute',
        left: props.left,
        top: props.top,
        width: 264,
        padding: 12,
        borderRadius: 10,
        background: '#0E0E0E',
        border: '1px solid rgba(255,255,255,0.16)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        color: '#FFFFFF',
        font: `500 12px/1.4 ${FONT}`,
        zIndex: 2,
      }}
    >
      {/* The notch pointing up at the Callout button. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -6,
          left: 18,
          width: 10,
          height: 10,
          background: '#0E0E0E',
          borderLeft: '1px solid rgba(255,255,255,0.16)',
          borderTop: '1px solid rgba(255,255,255,0.16)',
          transform: 'rotate(45deg)',
        }}
      />
      <Demo />
      <strong style={{ display: 'block', marginTop: 10, font: `600 13px/1.35 ${FONT}`, color: '#FFFFFF' }}>
        {props.nudge ? 'Tip: drag instead of clicking' : 'Drag to point at something'}
      </strong>
      <span style={{ display: 'block', marginTop: 4, color: '#C9C5BE' }}>
        {props.nudge
          ? 'Press on what you mean and drag to where the text goes: the box gets a tail pointing there.'
          : 'Press on what you mean, drag to where the text goes, then type. A plain click makes a box without a tail.'}
      </span>
      <button
        type="button"
        onClick={props.onDismiss}
        style={{
          appearance: 'none',
          marginTop: 10,
          padding: '5px 12px',
          border: 0,
          borderRadius: 6,
          background: 'rgba(255,255,255,0.14)',
          color: '#FFFFFF',
          font: `600 12px/1.2 ${FONT}`,
          cursor: 'pointer',
        }}
      >
        Got it
      </button>
    </div>
  );
}

function Demo(): ReactNode {
  const x = '52;52;172;172;52';
  const y = '70;70;27;27;70';
  return (
    <svg width="240" height="96" viewBox="0 0 240 96" aria-hidden="true" style={{ display: 'block', borderRadius: 6, background: '#F6F3EE' }}>
      {/* The thing being pointed at. */}
      <rect x="16" y="56" width="74" height="28" rx="4" fill="#E6E0D6" />
      <rect x="24" y="64" width="40" height="5" rx="2" fill="#B9B2A6" />
      <rect x="24" y="73" width="56" height="4" rx="2" fill="#CFC8BC" />
      {/* The tail follows the pointer from the press. */}
      <line x1="52" y1="70" x2="52" y2="70" stroke={RED} strokeWidth="3" strokeLinecap="round">
        <animate attributeName="x2" values={x} keyTimes={KEY_TIMES} dur={LOOP} repeatCount="indefinite" />
        <animate attributeName="y2" values={y} keyTimes={KEY_TIMES} dur={LOOP} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;1;1;0" keyTimes={KEY_TIMES} dur={LOOP} calcMode="discrete" repeatCount="indefinite" />
      </line>
      {/* The callout, on release. */}
      <g opacity="0">
        <rect x="128" y="13" width="92" height="28" rx="5" fill={RED} />
        <text x="174" y="31.5" textAnchor="middle" fill="#FFFFFF" style={{ font: `600 12px ${FONT}` }}>
          Too tight
        </text>
        <animate attributeName="opacity" values="0;0;1;0;0" keyTimes={KEY_TIMES} dur={LOOP} calcMode="discrete" repeatCount="indefinite" />
      </g>
      {/* The press ring, then the pointer. */}
      <circle cx="52" cy="70" r="0" fill="none" stroke="#1F1E1D" strokeWidth="1.5">
        <animate attributeName="r" values="0;11;0;0;0" keyTimes={KEY_TIMES} dur={LOOP} repeatCount="indefinite" />
      </circle>
      <g>
        <path d="M0 0 L0 15 L4 11 L7 18 L10 17 L7 10 L12 10 Z" fill="#FFFFFF" stroke="#1F1E1D" strokeWidth="1.2" strokeLinejoin="round" />
        <animateTransform attributeName="transform" type="translate" values="52 70;52 70;172 27;172 27;52 70" keyTimes={KEY_TIMES} dur={LOOP} repeatCount="indefinite" />
      </g>
    </svg>
  );
}
