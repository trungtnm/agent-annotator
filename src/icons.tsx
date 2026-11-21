import type { ReactNode } from 'react';

/** Stroke icons on a 24-unit grid, inline so the overlay ships no asset and needs no CSP entry. */
const PATHS = {
  comment: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', 'M12 7v6M9 10h6'],
  pause: ['M8 5v14M16 5v14'],
  play: ['M7 4l13 8-13 8z'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  camera: ['M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z', 'M12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z'],
  list: ['M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01'],
  copy: ['M10 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
  help: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01'],
  arrow: ['M5 19L19 5', 'M10 5h9v9'],
  rect: ['M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'],
  highlight: ['M9 11l-6 6v3h9l3-3', 'M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'],
  pen: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  text: ['M4 7V4h16v3', 'M9 20h6', 'M12 4v16'],
  pixelate: ['M3 3h6v6H3z', 'M15 3h6v6h-6z', 'M9 9h6v6H9z', 'M3 15h6v6H3z', 'M15 15h6v6h-6z'],
  undo: ['M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
  close: ['M18 6L6 18', 'M6 6l12 12'],
  select: ['M4 3l7 17 2.5-7.5L21 10z'],
  redo: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  zoomIn: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-4-4', 'M11 8v6M8 11h6'],
  zoomOut: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-4-4', 'M8 11h6'],
  fit: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  eraser: ['M7 21h10', 'M5 15l9-9 5 5-9 9H8z'],
  crop: ['M6 2v14a2 2 0 0 0 2 2h14', 'M18 22V8a2 2 0 0 0-2-2H2'],
  cropOff: ['M6 2v14a2 2 0 0 0 2 2h14', 'M18 22V8a2 2 0 0 0-2-2H2', 'M3 3l18 18'],
  collapse: ['M9 6l6 6-6 6'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
  shieldOff: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M3 3l18 18'],
  ruler: ['M3 17L17 3l4 4L7 21z', 'M7 13l2 2', 'M10 10l2 2', 'M13 7l2 2'],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon(props: { readonly name: IconName; readonly size?: number }): ReactNode {
  const size = props.size ?? 18;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block', flex: 'none' }}
    >
      {PATHS[props.name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
