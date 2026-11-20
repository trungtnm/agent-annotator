/** The overlay's own DOM, which is never a thing to comment on. */
export const OWN_SELECTOR = '[data-dev-annotator]';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Elements picked by one area selection; more says nothing an agent can act on. */
const MAX_AREA_ELEMENTS = 8;

function contains(outer: Rect, inner: DOMRect): boolean {
  return (
    inner.left >= outer.x &&
    inner.top >= outer.y &&
    inner.right <= outer.x + outer.width &&
    inner.bottom <= outer.y + outer.height
  );
}

function holds(rect: DOMRect, area: Rect): boolean {
  return rect.left <= area.x && rect.top <= area.y && rect.right >= area.x + area.width && rect.bottom >= area.y + area.height;
}

/**
 * Whether an element is page content worth naming: not the overlay's own, not decoration
 * hidden from assistive tech, not a shape inside an SVG (the <svg> stands for its parts).
 */
function isContent(element: Element): boolean {
  if (element.closest(OWN_SELECTOR) !== null) return false;
  if (element.closest('[aria-hidden="true"]') !== null) return false;
  return !(element instanceof SVGElement) || element instanceof SVGSVGElement;
}

function commonAncestor(elements: readonly Element[]): Element | null {
  const [first, ...rest] = elements;
  let node: Element | null = first ?? null;
  while (node !== null && !rest.every((element) => node?.contains(element))) node = node.parentElement;
  return node;
}

/** `start`, or its nearest ancestor, that covers the whole area; `body` at worst. */
function coveringAncestor(start: Element | null, area: Rect, body: Element): Element {
  let node = start;
  while (node !== null && node !== body && !holds(node.getBoundingClientRect(), area)) node = node.parentElement;
  return node ?? body;
}

/**
 * What a dragged area covers, in viewport coordinates: the OUTERMOST content elements lying
 * wholly inside it, in document order, and the container of the area. The container is
 * where the content lives — the nearest common ancestor of what is inside, widened until
 * it covers the area — never merely the smallest box around it: a background pattern or
 * an overlay laid across the section covers the area too, and is not what was pointed at.
 * An empty area takes the content element under its centre instead.
 */
export function elementsInArea(doc: Document, area: Rect): { container: Element; inside: Element[] } {
  const inside: Element[] = [];
  for (const element of Array.from(doc.body.querySelectorAll('*'))) {
    if (!isContent(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (contains(area, rect) && !inside.some((kept) => kept.contains(element))) inside.push(element);
  }

  let start: Element | null;
  if (inside.length > 0) {
    const common = commonAncestor(inside);
    start = inside.length === 1 ? (common?.parentElement ?? null) : common;
  } else {
    const centre = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
    const under = typeof doc.elementsFromPoint === 'function' ? doc.elementsFromPoint(centre.x, centre.y) : [];
    start = under.find(isContent) ?? null;
  }
  return { container: coveringAncestor(start, area, doc.body), inside: inside.slice(0, MAX_AREA_ELEMENTS) };
}

/**
 * Freezes what is moving, so a toast, a spinner or a transition can be commented on in
 * the state it shows for a second. Returns the resume function, which restarts only what
 * this call paused.
 */
export function pauseMotion(doc: Document): () => void {
  const animations =
    typeof doc.getAnimations === 'function'
      ? doc.getAnimations().filter((animation) => animation.playState === 'running')
      : [];
  const videos = Array.from(doc.querySelectorAll('video')).filter((video) => !video.paused);
  for (const animation of animations) animation.pause();
  for (const video of videos) video.pause();
  return () => {
    for (const animation of animations) animation.play();
    for (const video of videos) void video.play().catch(() => undefined);
  };
}
