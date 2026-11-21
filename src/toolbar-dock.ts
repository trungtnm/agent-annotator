import type { CSSProperties } from 'react';

/**
 * Where the toolbar sits: its distance from the viewport's right and bottom edges. Kept
 * from those edges, not the top-left, so the default place (bottom right) stays put when
 * the window is resized. Remembered per browser, for every app on the machine, like the
 * tool's other preferences.
 */
export interface Dock {
  readonly right: number;
  readonly bottom: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export const DEFAULT_DOCK: Dock = { right: 16, bottom: 16 };
const DOCK_KEY = 'agent-annotator:toolbar-dock';
/** The toolbar never goes closer to an edge than this. */
const MARGIN = 8;
/** Between the toolbar and a panel opened from it. */
const GAP = 12;

export function readDock(): Dock {
  try {
    const raw = window.localStorage.getItem(DOCK_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Number.isFinite((parsed as Dock).right) &&
      Number.isFinite((parsed as Dock).bottom)
    ) {
      return { right: (parsed as Dock).right, bottom: (parsed as Dock).bottom };
    }
  } catch {
    // Unreadable or blocked storage: the default place.
  }
  return DEFAULT_DOCK;
}

/** `null` forgets the place, back to the default. */
export function writeDock(dock: Dock | null): void {
  try {
    if (dock === null) window.localStorage.removeItem(DOCK_KEY);
    else window.localStorage.setItem(DOCK_KEY, JSON.stringify({ right: Math.round(dock.right), bottom: Math.round(dock.bottom) }));
  } catch {
    // Lasts until reload; nothing to report.
  }
}

/** The dock moved so the whole toolbar is inside the viewport. */
export function clampDock(dock: Dock, toolbar: Size, viewport: Size): Dock {
  const clamp = (value: number, max: number): number => Math.min(Math.max(value, MARGIN), Math.max(MARGIN, max));
  return {
    right: clamp(dock.right, viewport.width - toolbar.width - MARGIN),
    bottom: clamp(dock.bottom, viewport.height - toolbar.height - MARGIN),
  };
}

/** Whether the toolbar sits in the top half: its panels and tips then open below it. */
export function opensBelow(dock: Dock, toolbar: Size, viewport: Size): boolean {
  return dock.bottom + toolbar.height / 2 > viewport.height / 2;
}

/**
 * Where a panel opened from the toolbar goes: above it (below, in the top half), its
 * right edge on the toolbar's, moved in when that would push a `width`-wide panel off the
 * left edge.
 */
export function panelAnchor(dock: Dock, toolbar: Size, viewport: Size, width: number): CSSProperties {
  const right = Math.max(MARGIN, Math.min(dock.right, viewport.width - width - MARGIN));
  return opensBelow(dock, toolbar, viewport)
    ? { right, top: viewport.height - dock.bottom + GAP }
    : { right, bottom: dock.bottom + toolbar.height + GAP };
}
