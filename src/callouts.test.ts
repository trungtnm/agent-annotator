import { describe, expect, it } from 'vitest';

import { CARD_WIDTH, cardHeight, layoutCallouts } from './callouts';

const viewport = { width: 1200, height: 800 };
const box = (left: number, top: number) => ({ left, top, width: 100, height: 30 });

describe('layoutCallouts', () => {
  it('puts a card above its element when there is room, below it when there is not', () => {
    const [high, low] = layoutCallouts(
      [
        { number: 1, comment: 'near the top', box: box(50, 10) },
        { number: 2, comment: 'lower down', box: box(600, 400) },
      ],
      viewport,
    );
    expect(high?.card.top).toBe(10 + 30 + 6);
    expect(low?.card.top).toBe(400 - cardHeight('lower down') - 6);
  });

  it('never lets two cards cover each other, and keeps them on screen', () => {
    const placed = layoutCallouts(
      [1, 2, 3].map((number) => ({ number, comment: 'same row '.repeat(number * 3), box: box(1180, 300 + number) })),
      viewport,
    );
    for (const a of placed) {
      expect(a.card.left + a.card.width).toBeLessThanOrEqual(viewport.width);
      for (const b of placed) {
        if (a === b) continue;
        const apart = a.card.top + a.card.height <= b.card.top || b.card.top + b.card.height <= a.card.top;
        expect(apart).toBe(true);
      }
    }
    expect(placed.map((callout) => callout.number)).toEqual([1, 2, 3]);
    expect(placed[0]?.card.width).toBe(CARD_WIDTH);
  });

  it('grows a card with the comment, up to its line limit', () => {
    expect(cardHeight('short')).toBeLessThan(cardHeight('a long comment '.repeat(5)));
    expect(cardHeight('x\n'.repeat(20))).toBe(cardHeight('x\n'.repeat(10)));
  });
});
