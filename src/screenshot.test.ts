import { describe, expect, it } from 'vitest';

import {
  arrowHead,
  arrowOutline,
  calloutLayout,
  hitTest,
  isTrivial,
  outputFrame,
  rulerLabel,
  strokeWidth,
  tailBase,
  textColorOn,
  type Mark,
  type Measure,
} from './screenshot-draw';
import { shotFileName } from './screenshot';

describe('screenshot helpers', () => {
  it('names the file after the app, the page and the minute', () => {
    const now = new Date(2026, 10, 20, 9, 5);
    expect(shotFileName('backoffice', '/loans/7', now)).toBe('backoffice-loans-7-2026-11-20-0905.png');
    expect(shotFileName('debtor-portal', '/', now)).toBe('debtor-portal-home-2026-11-20-0905.png');
  });

  it('points the arrowhead back along the shaft', () => {
    const [left, right] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 4);
    expect(left.x).toBeLessThan(100);
    expect(right.x).toBeLessThan(100);
    expect(Math.sign(left.y)).toBe(-Math.sign(right.y));
  });

  it('drops a click that drew nothing, and scales strokes with the image', () => {
    expect(isTrivial({ tool: 'rect', from: { x: 5, y: 5 }, to: { x: 6, y: 7 }, color: '#000', weight: 2 })).toBe(true);
    expect(isTrivial({ tool: 'arrow', from: { x: 5, y: 5 }, to: { x: 60, y: 5 }, color: '#000', weight: 2 })).toBe(false);
    expect(isTrivial({ tool: 'text', at: { x: 0, y: 0 }, text: '  ', color: '#000', weight: 2 })).toBe(true);
    expect(strokeWidth(3840)).toBeGreaterThan(strokeWidth(1280));
  });

  it('ends a filled arrow exactly at its tip, with nothing past it', () => {
    const outline = arrowOutline({ x: 0, y: 0 }, { x: 200, y: 0 }, 6);
    expect(outline).toContainEqual({ x: 200, y: 0 });
    expect(Math.max(...outline.map((point) => point.x))).toBe(200);
  });
});

/** 10 image pixels per character, whatever the font. */
const measure: Measure = (text) => text.length * 10;

describe('callouts', () => {
  const mark: Mark = { tool: 'text', at: { x: 500, y: 300 }, text: 'Hello', color: '#E5484D', weight: 2, tail: { x: 300, y: 500 } };

  it('centres the box on its anchor, so it grows both ways', () => {
    const { box } = calloutLayout(mark, 1600, measure);
    expect(box.x + box.width / 2).toBeCloseTo(500);
    expect(box.y + box.height / 2).toBeCloseTo(300);
    const longer = calloutLayout({ ...mark, text: 'Hello there' }, 1600, measure).box;
    expect(longer.x).toBeLessThan(box.x);
    expect(longer.x + longer.width).toBeGreaterThan(box.x + box.width);
  });

  it('roots the tail on the side facing the tip, and drops it when the tip is inside the box', () => {
    const layout = calloutLayout(mark, 1600, measure);
    const below = tailBase(layout, { x: 500, y: 600 });
    expect(below?.every((point) => Math.abs(point.y - (layout.box.y + layout.box.height)) <= 1)).toBe(true);
    const left = tailBase(layout, { x: 100, y: 300 });
    expect(left?.every((point) => Math.abs(point.x - layout.box.x) <= 1)).toBe(true);
    expect(tailBase(layout, { x: 500, y: 300 })).toBeNull();
  });

  it('can be grabbed by its tail as well as its box', () => {
    expect(hitTest([mark], { x: 330, y: 470 }, 1600, measure, 4)).toBe(0);
    expect(hitTest([mark], { x: 900, y: 900 }, 1600, measure, 4)).toBeNull();
  });

  it('writes white on dark fills and ink on light ones', () => {
    expect(textColorOn('#1F1E1D')).toBe('#FFFFFF');
    expect(textColorOn('#E5484D')).toBe('#FFFFFF');
    expect(textColorOn('#F5E9A0')).toBe('#1F1E1D');
  });
});

describe('ruler', () => {
  it('measures in the page’s pixels, and gives both sides of a slanted one', () => {
    expect(rulerLabel({ x: 0, y: 10 }, { x: 480, y: 10 }, 2)).toBe('240 px');
    expect(rulerLabel({ x: 0, y: 0 }, { x: 300, y: 400 }, 2)).toBe('250 px · 150 × 200');
  });
});

describe('output frame', () => {
  const image = { x: 0, y: 0, width: 1000, height: 600 };
  const box = (x1: number, y1: number, x2: number, y2: number): Mark => ({ tool: 'rect', from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, color: '#000', weight: 2 });

  it('is the image while every mark lies inside it', () => {
    expect(outputFrame(image, [box(100, 100, 300, 200)], 1000, measure)).toEqual(image);
  });

  it('grows to hold a mark past the edge, with a margin, on that side only', () => {
    const frame = outputFrame(image, [box(900, 100, 1200, 200)], 1000, measure);
    expect(frame.x).toBe(0);
    expect(frame.y).toBe(0);
    expect(frame.height).toBe(600);
    expect(frame.width).toBeGreaterThan(1200);
    const left = outputFrame(image, [box(-150, -40, 50, 50)], 1000, measure);
    expect(left.x).toBeLessThan(-150);
    expect(left.y).toBeLessThan(-40);
    expect(left.x + left.width).toBe(1000);
  });
});
