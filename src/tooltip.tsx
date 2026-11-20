import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** Long enough that sweeping the pointer across a bar does not flash every tip. */
const DELAY_MS = 350;
const EDGE = 8;

/** The command key as the platform names it. */
export const MOD_KEY =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';

/**
 * A styled tip for an icon button: the name, an optional one-line explanation and the
 * shortcut as key caps. Shows on hover after a short delay and at once on keyboard focus;
 * it never takes the pointer, and it shifts sideways to stay inside the viewport.
 *
 * `children` renders the trigger and receives the id to put in `aria-describedby`.
 */
export function Tooltip(props: {
  readonly label: string;
  readonly detail?: string;
  readonly shortcut?: readonly string[];
  readonly placement: 'above' | 'below';
  readonly children: (describedBy: string | undefined) => ReactElement;
}): ReactNode {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const timer = useRef<number | null>(null);
  const bubble = useRef<HTMLSpanElement | null>(null);

  const clear = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const show = (delay: number): void => {
    clear();
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = (): void => {
    clear();
    setOpen(false);
    setShift(0);
  };
  useEffect(() => clear, []);

  useLayoutEffect(() => {
    if (!open || bubble.current === null) return;
    const rect = bubble.current.getBoundingClientRect();
    if (rect.width === 0) return;
    if (rect.right > window.innerWidth - EDGE) setShift(window.innerWidth - EDGE - rect.right);
    else if (rect.left < EDGE) setShift(EDGE - rect.left);
  }, [open]);

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onPointerEnter={() => show(DELAY_MS)}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(event) => {
        if (focusVisible(event.target)) show(0);
      }}
      onBlur={hide}
    >
      {props.children(open ? id : undefined)}
      {open ? (
        <span
          ref={bubble}
          id={id}
          role="tooltip"
          style={{
            position: 'absolute',
            left: '50%',
            [props.placement === 'above' ? 'bottom' : 'top']: 'calc(100% + 8px)',
            transform: `translateX(calc(-50% + ${shift}px))`,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            width: 'max-content',
            maxWidth: 260,
            padding: '6px 9px',
            borderRadius: 7,
            background: '#0E0E0E',
            border: '1px solid rgba(255,255,255,0.14)',
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            color: '#FFFFFF',
            font: `500 12px/1.35 ${FONT}`,
            letterSpacing: 'normal',
            textAlign: 'left',
            textTransform: 'none',
            whiteSpace: 'normal',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 600 }}>{props.label}</span>
            {props.shortcut === undefined || props.shortcut.length === 0 ? null : (
              <span style={{ display: 'inline-flex', gap: 3, marginLeft: 'auto' }}>
                {props.shortcut.map((key) => (
                  <kbd
                    key={key}
                    style={{
                      font: `600 11px/16px ${FONT}`,
                      minWidth: 16,
                      padding: '0 4px',
                      textAlign: 'center',
                      borderRadius: 4,
                      background: 'rgba(255,255,255,0.14)',
                      color: '#FFFFFF',
                    }}
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            )}
          </span>
          {props.detail === undefined ? null : <span style={{ color: '#B9B5AE' }}>{props.detail}</span>}
        </span>
      ) : null}
    </span>
  );
}

/** Keyboard focus, not the focus a click leaves behind. */
function focusVisible(target: EventTarget): boolean {
  try {
    return target instanceof HTMLElement && target.matches(':focus-visible');
  } catch {
    return false;
  }
}
