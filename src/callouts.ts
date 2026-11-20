import type { Box } from './overlay-parts';

/**
 * Where each comment's card goes when comments are shown in full: above its element when
 * there is room, else below, never off screen, and pushed down past any card already placed
 * so no two cover each other. Pure geometry, in viewport pixels.
 */

export interface CalloutTarget {
  readonly number: number;
  readonly comment: string;
  readonly box: Box;
  /** The comment is on a dragged area, drawn dashed as it was marked. */
  readonly area?: boolean;
}

export interface PlacedCallout extends CalloutTarget {
  readonly card: Box;
}

export const CARD_WIDTH = 260;
const LINE_HEIGHT = 18;
const PADDING = 16;
const GAP = 6;
const MARGIN = 4;
/** A card shows at most this many lines; the rest of the comment is cut with an ellipsis. */
export const CARD_LINES = 4;
/** Average glyph width at 13px, enough to guess how many lines a comment wraps to. */
const CHARS_PER_LINE = 36;

export function cardHeight(comment: string): number {
  const lines = comment
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / CHARS_PER_LINE)), 0);
  return PADDING + LINE_HEIGHT * Math.min(CARD_LINES, Math.max(1, lines));
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

export function layoutCallouts(
  targets: readonly CalloutTarget[],
  viewport: { readonly width: number; readonly height: number },
): PlacedCallout[] {
  const placed: PlacedCallout[] = [];
  const width = Math.min(CARD_WIDTH, viewport.width - 2 * MARGIN);
  // Top to bottom, so a card pushed down moves away from the cards already placed.
  const ordered = [...targets].sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
  for (const target of ordered) {
    const height = cardHeight(target.comment);
    const above = target.box.top - height - GAP;
    let top = above >= MARGIN ? above : target.box.top + target.box.height + GAP;
    const left = Math.min(Math.max(MARGIN, target.box.left), viewport.width - width - MARGIN);
    let card: Box = { top, left, width, height };
    for (let moved = true; moved; ) {
      moved = false;
      for (const other of placed) {
        if (overlaps(card, other.card)) {
          top = other.card.top + other.card.height + GAP;
          card = { top, left, width, height };
          moved = true;
        }
      }
    }
    placed.push({ ...target, card: { ...card, top: Math.min(card.top, viewport.height - height - MARGIN) } });
  }
  return placed.sort((a, b) => a.number - b.number);
}
