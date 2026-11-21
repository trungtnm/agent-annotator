import { afterEach, describe, expect, it } from 'vitest';

import { clampDock, DEFAULT_DOCK, opensBelow, panelAnchor, readDock, writeDock } from './toolbar-dock';

const viewport = { width: 1000, height: 800 };
const toolbar = { width: 400, height: 44 };

afterEach(() => window.localStorage.clear());

describe('toolbar dock', () => {
  it('remembers the place, and falls back to the default on bad data', () => {
    expect(readDock()).toEqual(DEFAULT_DOCK);
    writeDock({ right: 120.4, bottom: 300.6 });
    expect(readDock()).toEqual({ right: 120, bottom: 301 });
    window.localStorage.setItem('agent-annotator:toolbar-dock', '{"right":"x"}');
    expect(readDock()).toEqual(DEFAULT_DOCK);
    writeDock(null);
    expect(readDock()).toEqual(DEFAULT_DOCK);
  });

  it('keeps the whole toolbar inside the viewport', () => {
    expect(clampDock({ right: -50, bottom: 2000 }, toolbar, viewport)).toEqual({ right: 8, bottom: 748 });
    expect(clampDock({ right: 900, bottom: 100 }, toolbar, viewport)).toEqual({ right: 592, bottom: 100 });
  });

  it('opens panels above the toolbar, or below it in the top half, kept on screen', () => {
    expect(opensBelow({ right: 16, bottom: 16 }, toolbar, viewport)).toBe(false);
    expect(panelAnchor({ right: 16, bottom: 16 }, toolbar, viewport, 340)).toEqual({ right: 16, bottom: 72 });
    expect(panelAnchor({ right: 800, bottom: 700 }, toolbar, viewport, 340)).toEqual({ right: 652, top: 112 });
  });
});
