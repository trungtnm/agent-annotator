/**
 * The marks drawn on a screenshot, in image pixels, and how they are painted, found and
 * moved. Every mark is kept as data and the whole image is repainted from the untouched
 * capture on each change, so undo is restoring a list and pixelation always samples the
 * original pixels.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type Tool = 'arrow' | 'rect' | 'highlight' | 'pen' | 'text' | 'pixelate' | 'ruler';

/** Thin, medium, thick: scales the stroke, the arrowhead and the text together. */
export type Weight = 1 | 2 | 3;
const WEIGHT_FACTOR: Readonly<Record<Weight, number>> = { 1: 0.6, 2: 1, 3: 1.7 };

interface Style {
  readonly color: string;
  readonly weight: Weight;
}

export type Mark = Style &
  (
    | { readonly tool: 'arrow' | 'rect' | 'highlight' | 'pixelate' | 'ruler'; readonly from: Point; readonly to: Point }
    | { readonly tool: 'pen'; readonly points: readonly Point[] }
    /**
     * A callout: a filled, rounded box CENTRED on `at` (so it grows both ways as it is
     * typed), with an optional tail whose tip is `tail` — one mark for "this, here".
     */
    | { readonly tool: 'text'; readonly at: Point; readonly text: string; readonly tail?: Point }
  );

export const COLORS = ['#E5484D', '#F5A524', '#30A46C', '#0091FF', '#8E4EC6', '#1F1E1D'] as const;

const FONT_FAMILY = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const LINE_HEIGHT = 1.25;

/** Stroke width that reads the same on a laptop capture and on a 4K one. */
export function strokeWidth(imageWidth: number, weight: Weight = 2): number {
  return Math.max(2, Math.round((imageWidth / 400) * WEIGHT_FACTOR[weight]));
}

export function fontSize(imageWidth: number, weight: Weight = 2): number {
  return Math.max(14, Math.round((imageWidth / 48) * WEIGHT_FACTOR[weight]));
}

export function textFont(imageWidth: number, weight: Weight): string {
  return `600 ${fontSize(imageWidth, weight)}px ${FONT_FAMILY}`;
}

/** Head length and half-width for a stroke width, shrunk on an arrow too short for them. */
function headSize(from: Point, to: Point, width: number): { length: number; half: number } {
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  const length = Math.min(width * 6, span * 0.5);
  return { length, half: length * 0.52 };
}

/** The two barbs of an arrowhead pointing at `to`, sized from the stroke width. */
export function arrowHead(from: Point, to: Point, width: number): readonly [Point, Point] {
  const { length, half } = headSize(from, to, width);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const base = { x: to.x - length * Math.cos(angle), y: to.y - length * Math.sin(angle) };
  const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
  return [
    { x: base.x + normal.x * half, y: base.y + normal.y * half },
    { x: base.x - normal.x * half, y: base.y - normal.y * half },
  ];
}

/**
 * The whole arrow as ONE filled outline: a shaft that tapers from a thin tail to the head,
 * then a sharp head whose tip is exactly `to`. Filled, not stroked, so no line cap pokes
 * past the tip.
 */
export function arrowOutline(from: Point, to: Point, width: number): Point[] {
  const { length, half } = headSize(from, to, width);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const along = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal = { x: -along.y, y: along.x };
  const base = { x: to.x - along.x * length, y: to.y - along.y * length };
  const at = (point: Point, offset: number): Point => ({ x: point.x + normal.x * offset, y: point.y + normal.y * offset });
  const tail = width * 0.35;
  const neck = width * 0.85;
  return [at(from, tail), at(base, neck), at(base, half), to, at(base, -half), at(base, -neck), at(from, -tail)];
}

/** How a callout is laid out, in image pixels. */
export interface CalloutLayout {
  readonly box: Bounds;
  readonly size: number;
  readonly padX: number;
  readonly padY: number;
  readonly lineHeight: number;
  readonly lines: readonly string[];
  readonly radius: number;
}

export function calloutLayout(mark: { readonly at: Point; readonly text: string; readonly weight: Weight }, imageWidth: number, measure: Measure): CalloutLayout {
  const size = fontSize(imageWidth, mark.weight);
  const lines = mark.text.split('\n');
  const font = textFont(imageWidth, mark.weight);
  const padX = size * 0.5;
  const padY = size * 0.3;
  const lineHeight = size * LINE_HEIGHT;
  // An empty box still shows where the text will go.
  const textWidth = Math.max(size * 1.5, ...lines.map((line) => measure(line, font)));
  const width = textWidth + 2 * padX;
  const height = lines.length * lineHeight + 2 * padY;
  return {
    box: { x: mark.at.x - width / 2, y: mark.at.y - height / 2, width, height },
    size,
    padX,
    padY,
    lineHeight,
    lines,
    radius: size * 0.22,
  };
}

/**
 * Where a callout's tail leaves its box: two points on the side facing the tip, `null`
 * when the tip is inside the box. The base sits just inside the edge so box and tail
 * fill as one shape.
 */
export function tailBase(layout: CalloutLayout, tip: Point): readonly [Point, Point] | null {
  const { box, size, radius } = layout;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = tip.x - cx;
  const dy = tip.y - cy;
  if (Math.abs(dx) <= box.width / 2 && Math.abs(dy) <= box.height / 2) return null;
  const inset = 1;
  // Which side the line from the centre crosses first.
  if (Math.abs(dy) * (box.width / 2) >= Math.abs(dx) * (box.height / 2)) {
    const half = Math.min(size * 0.32, (box.width - 2 * radius) / 3);
    const y = dy > 0 ? box.y + box.height - inset : box.y + inset;
    const reach = dy === 0 ? 0 : (box.height / 2 / Math.abs(dy)) * dx;
    const x = Math.min(Math.max(cx + reach, box.x + radius + half), box.x + box.width - radius - half);
    return [{ x: x - half, y }, { x: x + half, y }];
  }
  const half = Math.min(size * 0.32, (box.height - 2 * radius) / 3);
  const x = dx > 0 ? box.x + box.width - inset : box.x + inset;
  const reach = dx === 0 ? 0 : (box.width / 2 / Math.abs(dx)) * dy;
  const y = Math.min(Math.max(cy + reach, box.y + radius + half), box.y + box.height - radius - half);
  return [{ x, y: y - half }, { x, y: y + half }];
}

/** Dark text on a light fill, white on anything else. */
export function textColorOn(fill: string): string {
  const hex = /^#?([0-9a-f]{6})$/i.exec(fill)?.[1];
  if (hex === undefined) return '#FFFFFF';
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
  const luminance = 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  return luminance > 0.6 ? '#1F1E1D' : '#FFFFFF';
}

export function normalized(from: Point, to: Point): Bounds {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  };
}

/** Too small to be meant: a click with a drawing tool draws nothing. */
export function isTrivial(mark: Mark): boolean {
  if (mark.tool === 'text') return mark.text.trim() === '';
  if (mark.tool === 'pen') return mark.points.length < 2;
  const box = normalized(mark.from, mark.to);
  return box.width < 4 && box.height < 4;
}

/** Measures a line of text; without a 2D context (tests), an average glyph width. */
export type Measure = (text: string, font: string) => number;

export function canvasMeasure(context: CanvasRenderingContext2D | null): Measure {
  return (text, font) => {
    if (context === null) return text.length * Number.parseFloat(font.split(' ')[1] ?? '16') * 0.56;
    context.save();
    context.font = font;
    const width = context.measureText(text).width;
    context.restore();
    return width;
  };
}

/** The box a mark covers, in image pixels, stroke included. */
export function markBounds(mark: Mark, imageWidth: number, measure: Measure): Bounds {
  const pad = strokeWidth(imageWidth, mark.weight) / 2;
  switch (mark.tool) {
    case 'text':
      return calloutLayout(mark, imageWidth, measure).box;
    case 'pen': {
      const xs = mark.points.map((point) => point.x);
      const ys = mark.points.map((point) => point.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x: x - pad, y: y - pad, width: Math.max(...xs) - x + 2 * pad, height: Math.max(...ys) - y + 2 * pad };
    }
    case 'arrow': {
      const points = arrowOutline(mark.from, mark.to, strokeWidth(imageWidth, mark.weight));
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x: x - pad, y: y - pad, width: Math.max(...xs) - x + 2 * pad, height: Math.max(...ys) - y + 2 * pad };
    }
    default: {
      const box = normalized(mark.from, mark.to);
      return { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad };
    }
  }
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function inside(point: Point, box: Bounds, slack: number): boolean {
  return (
    point.x >= box.x - slack &&
    point.x <= box.x + box.width + slack &&
    point.y >= box.y - slack &&
    point.y <= box.y + box.height + slack
  );
}

/**
 * The topmost mark under `point`, or `null`. Lines are hit near their stroke, shapes and
 * text anywhere inside: easy to grab, since nothing else lives on the canvas.
 */
export function hitTest(marks: readonly Mark[], point: Point, imageWidth: number, measure: Measure, slack: number): number | null {
  for (let index = marks.length - 1; index >= 0; index--) {
    const mark = marks[index];
    if (mark === undefined) continue;
    const tolerance = slack + strokeWidth(imageWidth, mark.weight);
    if ((mark.tool === 'arrow' || mark.tool === 'ruler') && distanceToSegment(point, mark.from, mark.to) <= tolerance) return index;
    if (mark.tool === 'pen') {
      for (let at = 1; at < mark.points.length; at++) {
        const a = mark.points[at - 1];
        const b = mark.points[at];
        if (a !== undefined && b !== undefined && distanceToSegment(point, a, b) <= tolerance) return index;
      }
    }
    if (mark.tool === 'text' && mark.tail !== undefined) {
      const layout = calloutLayout(mark, imageWidth, measure);
      const base = tailBase(layout, mark.tail);
      if (base !== null) {
        const mid = { x: (base[0].x + base[1].x) / 2, y: (base[0].y + base[1].y) / 2 };
        if (distanceToSegment(point, mid, mark.tail) <= tolerance) return index;
      }
    }
    if (mark.tool !== 'arrow' && mark.tool !== 'ruler' && mark.tool !== 'pen' && inside(point, markBounds(mark, imageWidth, measure), slack)) return index;
  }
  return null;
}

/**
 * Moves a mark as dragging it does. A callout moves its BOX: the tail stays on what it
 * points at, which is the reason it was drawn.
 */
export function translate(mark: Mark, dx: number, dy: number): Mark {
  const move = (point: Point): Point => ({ x: point.x + dx, y: point.y + dy });
  switch (mark.tool) {
    case 'text':
      return { ...mark, at: move(mark.at) };
    case 'pen':
      return { ...mark, points: mark.points.map(move) };
    default:
      return { ...mark, from: move(mark.from), to: move(mark.to) };
  }
}

export function union(a: Bounds, b: Bounds): Bounds {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

export function expand(box: Bounds, by: number): Bounds {
  return { x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by };
}

/**
 * What Copy and Save produce: the image (or its crop), grown to hold every mark that lies
 * outside it, with a margin so nothing touches the edge. Marks inside leave it unchanged.
 */
export function outputFrame(image: Bounds, marks: readonly Mark[], imageWidth: number, measure: Measure): Bounds {
  let frame = image;
  const margin = Math.max(16, Math.round(Math.max(image.width, image.height) / 50));
  for (const mark of marks) {
    const box = expand(markBounds(mark, imageWidth, measure), margin);
    const outside = box.x < image.x || box.y < image.y || box.x + box.width > image.x + image.width || box.y + box.height > image.y + image.height;
    if (outside) frame = union(frame, box);
  }
  return {
    x: Math.floor(frame.x),
    y: Math.floor(frame.y),
    width: Math.ceil(frame.x + frame.width) - Math.floor(frame.x),
    height: Math.ceil(frame.y + frame.height) - Math.floor(frame.y),
  };
}

/**
 * The colour around the capture's edge, for the background added when marks reach past it:
 * a page screenshot almost always has one, and the extension then reads as more page. The
 * MOST COMMON colour on the outermost rows and columns, not their average — a dark tab or
 * a sidebar touching one edge would drag an average to grey.
 */
export function edgeColor(image: HTMLCanvasElement): string {
  try {
    const context = image.getContext('2d', { willReadFrequently: true });
    if (context === null || image.width === 0 || image.height === 0) return '#FFFFFF';
    const strips = [
      context.getImageData(0, 0, image.width, 1),
      context.getImageData(0, image.height - 1, image.width, 1),
      context.getImageData(0, 0, 1, image.height),
      context.getImageData(image.width - 1, 0, 1, image.height),
    ];
    // Near-identical shades (anti-aliasing, JPEG-ish noise) count as one colour.
    const tally = new Map<number, { count: number; red: number; green: number; blue: number }>();
    for (const { data } of strips) {
      for (let at = 0; at < data.length; at += 4) {
        const red = data[at] ?? 0;
        const green = data[at + 1] ?? 0;
        const blue = data[at + 2] ?? 0;
        const key = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
        const entry = tally.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
        entry.count++;
        entry.red += red;
        entry.green += green;
        entry.blue += blue;
        tally.set(key, entry);
      }
    }
    let best: { count: number; red: number; green: number; blue: number } | undefined;
    for (const entry of tally.values()) if (best === undefined || entry.count > best.count) best = entry;
    if (best === undefined) return '#FFFFFF';
    const { count } = best;
    const hex = (sum: number): string => Math.round(sum / count).toString(16).padStart(2, '0');
    return `#${hex(best.red)}${hex(best.green)}${hex(best.blue)}`;
  } catch {
    return '#FFFFFF';
  }
}

export interface PaintOptions {
  /** Index of the mark to outline as selected. */
  readonly selected?: number | null;
  /** Colour of the selection outline. */
  readonly accent?: string;
  /** The region the canvas covers, in image pixels; the image area when absent. */
  readonly view?: Bounds;
  /** The part of the capture shown (the crop); the whole capture when absent. */
  readonly image?: Bounds;
  /** The output frame: filled with `background` wherever the image does not reach. */
  readonly frame?: Bounds;
  readonly background?: string;
  /** Fills the canvas outside the frame, which marks the frame as the picture's edge. */
  readonly backdrop?: string;
  /** Device pixels per CSS pixel at capture: rulers measure in the page's own pixels. */
  readonly pixelRatio?: number;
  /** A crop being dragged out, shown with everything outside it dimmed. */
  readonly cropPreview?: Bounds | null;
}

/**
 * Paints the capture and the marks. Coordinates are always the FULL image's: a crop only
 * moves the canvas window over it, so marks never need rewriting and a crop can be undone.
 */
export function paint(canvas: HTMLCanvasElement, base: HTMLCanvasElement, marks: readonly Mark[], options: PaintOptions = {}): void {
  const context = canvas.getContext('2d');
  if (context === null) return;
  const imageWidth = base.width;
  const image = options.image ?? { x: 0, y: 0, width: base.width, height: base.height };
  const frame = options.frame ?? image;
  const view = options.view ?? frame;
  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.translate(-view.x, -view.y);
  if (options.backdrop !== undefined) {
    context.fillStyle = options.backdrop;
    context.fillRect(view.x, view.y, view.width, view.height);
  }
  context.save();
  if (options.backdrop !== undefined) {
    // The picture's edge, lifted off the board.
    context.shadowColor = 'rgba(0, 0, 0, 0.5)';
    context.shadowBlur = Math.max(12, imageWidth / 80);
    context.shadowOffsetY = Math.max(4, imageWidth / 300);
  }
  context.fillStyle = options.background ?? '#FFFFFF';
  context.fillRect(frame.x, frame.y, frame.width, frame.height);
  context.restore();
  context.drawImage(base, image.x, image.y, image.width, image.height, image.x, image.y, image.width, image.height);
  for (const mark of marks) {
    context.save();
    const width = strokeWidth(imageWidth, mark.weight);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = width;
    context.strokeStyle = mark.color;
    context.fillStyle = mark.color;
    drawMark(context, base, mark, width, imageWidth, options.pixelRatio ?? 1);
    context.restore();
  }
  const chosen = options.selected === null || options.selected === undefined ? undefined : marks[options.selected];
  if (chosen !== undefined) {
    const accent = options.accent ?? '#0091FF';
    drawSelection(context, markBounds(chosen, imageWidth, canvasMeasure(context)), imageWidth, accent);
    if (chosen.tool === 'text' && chosen.tail !== undefined) drawHandle(context, chosen.tail, tailHandleRadius(imageWidth), accent);
  }
  if (options.cropPreview !== undefined && options.cropPreview !== null) drawCropPreview(context, image, options.cropPreview, imageWidth, options.pixelRatio ?? 1);
  context.restore();
}

function drawCropPreview(context: CanvasRenderingContext2D, view: Bounds, crop: Bounds, imageWidth: number, ratio: number): void {
  context.save();
  context.beginPath();
  context.rect(view.x, view.y, view.width, view.height);
  context.rect(crop.x, crop.y, crop.width, crop.height);
  context.fillStyle = 'rgba(0, 0, 0, 0.55)';
  context.fill('evenodd');
  const line = Math.max(1.5, imageWidth / 900);
  context.lineWidth = line;
  context.strokeStyle = '#FFFFFF';
  context.setLineDash([line * 5, line * 4]);
  context.strokeRect(crop.x, crop.y, crop.width, crop.height);
  context.setLineDash([]);
  pill(context, `${Math.round(crop.width / ratio)} × ${Math.round(crop.height / ratio)}`, { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 }, fontSize(imageWidth, 1), 'rgba(0,0,0,0.75)', '#FFFFFF');
  context.restore();
}

/** A rounded label centred on `at`. */
function pill(context: CanvasRenderingContext2D, label: string, at: Point, size: number, fill: string, ink: string): void {
  context.save();
  context.font = `600 ${size}px ${FONT_FAMILY}`;
  const width = context.measureText(label).width + size;
  const height = size * 1.5;
  context.beginPath();
  context.roundRect(at.x - width / 2, at.y - height / 2, width, height, height / 2);
  context.fillStyle = fill;
  context.fill();
  context.fillStyle = ink;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, at.x, at.y + size * 0.05);
  context.restore();
}

/** `240 px`, or `250 px · 240 × 70` when the ruler is not straight; in the page's pixels. */
export function rulerLabel(from: Point, to: Point, ratio: number): string {
  const dx = Math.round(Math.abs(to.x - from.x) / ratio);
  const dy = Math.round(Math.abs(to.y - from.y) / ratio);
  const length = Math.round(Math.hypot(to.x - from.x, to.y - from.y) / ratio);
  return dx === 0 || dy === 0 ? `${length} px` : `${length} px · ${dx} × ${dy}`;
}

/** The grip on a selected callout's tail tip, in image pixels. */
export function tailHandleRadius(imageWidth: number): number {
  return Math.max(5, imageWidth / 220);
}

function drawHandle(context: CanvasRenderingContext2D, at: Point, radius: number, accent: string): void {
  context.save();
  context.beginPath();
  context.arc(at.x, at.y, radius, 0, Math.PI * 2);
  context.fillStyle = '#FFFFFF';
  context.fill();
  context.lineWidth = Math.max(1.5, radius / 3);
  context.strokeStyle = accent;
  context.stroke();
  context.restore();
}

function drawSelection(context: CanvasRenderingContext2D, box: Bounds, imageWidth: number, accent: string): void {
  const line = Math.max(1.5, imageWidth / 1000);
  const gap = line * 4;
  const x = box.x - gap;
  const y = box.y - gap;
  const width = box.width + 2 * gap;
  const height = box.height + 2 * gap;
  context.save();
  context.lineWidth = line;
  context.strokeStyle = accent;
  context.setLineDash([line * 4, line * 3]);
  context.strokeRect(x, y, width, height);
  context.setLineDash([]);
  context.fillStyle = '#FFFFFF';
  const handle = line * 5;
  for (const [hx, hy] of [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height],
  ] as const) {
    context.fillRect(hx - handle / 2, hy - handle / 2, handle, handle);
    context.strokeRect(hx - handle / 2, hy - handle / 2, handle, handle);
  }
  context.restore();
}

function drawMark(
  context: CanvasRenderingContext2D,
  base: CanvasImageSource,
  mark: Mark,
  width: number,
  imageWidth: number,
  pixelRatio: number,
): void {
  switch (mark.tool) {
    case 'ruler': {
      const line = Math.max(1.5, width * 0.45);
      const angle = Math.atan2(mark.to.y - mark.from.y, mark.to.x - mark.from.x);
      const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
      const tick = line * 6;
      context.lineWidth = line;
      context.lineCap = 'butt';
      context.beginPath();
      context.moveTo(mark.from.x, mark.from.y);
      context.lineTo(mark.to.x, mark.to.y);
      for (const end of [mark.from, mark.to]) {
        context.moveTo(end.x + normal.x * tick, end.y + normal.y * tick);
        context.lineTo(end.x - normal.x * tick, end.y - normal.y * tick);
      }
      context.stroke();
      const size = fontSize(imageWidth, 1);
      // The label sits beside the middle of the line, on its upper side.
      const side = normal.y > 0 ? -1 : 1;
      const mid = { x: (mark.from.x + mark.to.x) / 2 + normal.x * side * size * 1.3, y: (mark.from.y + mark.to.y) / 2 + normal.y * side * size * 1.3 };
      pill(context, rulerLabel(mark.from, mark.to, pixelRatio), mid, size, mark.color, textColorOn(mark.color));
      return;
    }
    case 'arrow': {
      const [first, ...rest] = arrowOutline(mark.from, mark.to, width);
      if (first === undefined) return;
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (const point of rest) context.lineTo(point.x, point.y);
      context.closePath();
      context.shadowColor = 'rgba(0, 0, 0, 0.25)';
      context.shadowBlur = width * 1.2;
      context.shadowOffsetY = width * 0.3;
      context.fill();
      return;
    }
    case 'rect': {
      const box = normalized(mark.from, mark.to);
      context.beginPath();
      context.roundRect(box.x, box.y, box.width, box.height, width * 1.5);
      context.stroke();
      return;
    }
    case 'highlight': {
      const box = normalized(mark.from, mark.to);
      context.globalAlpha = 0.3;
      context.fillRect(box.x, box.y, box.width, box.height);
      return;
    }
    case 'pixelate': {
      const box = normalized(mark.from, mark.to);
      if (box.width < 1 || box.height < 1) return;
      // Shrink the ORIGINAL pixels to a few blocks, then blow them back up unsmoothed.
      const block = Math.max(8, Math.round(imageWidth / 120) * (mark.weight === 3 ? 2 : 1));
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(box.width / block));
      small.height = Math.max(1, Math.round(box.height / block));
      small.getContext('2d')?.drawImage(base, box.x, box.y, box.width, box.height, 0, 0, small.width, small.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(small, 0, 0, small.width, small.height, box.x, box.y, box.width, box.height);
      return;
    }
    case 'pen': {
      const [first, ...rest] = mark.points;
      if (first === undefined) return;
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (const point of rest) context.lineTo(point.x, point.y);
      context.stroke();
      return;
    }
    case 'text': {
      const layout = calloutLayout(mark, imageWidth, canvasMeasure(context));
      const { box, size, padY, lineHeight, lines, radius } = layout;
      context.beginPath();
      context.roundRect(box.x, box.y, box.width, box.height, radius);
      const base = mark.tail === undefined ? null : tailBase(layout, mark.tail);
      if (base !== null && mark.tail !== undefined) {
        // Wound the same way as roundRect (clockwise on screen), so where the two overlap
        // the fill adds up instead of cancelling into a seam.
        const tip = mark.tail;
        const [a, c] = base;
        const turn = a.x * tip.y - tip.x * a.y + tip.x * c.y - c.x * tip.y + c.x * a.y - a.x * c.y;
        const [first, last] = turn >= 0 ? [a, c] : [c, a];
        context.moveTo(first.x, first.y);
        context.lineTo(tip.x, tip.y);
        context.lineTo(last.x, last.y);
        context.closePath();
      }
      context.shadowColor = 'rgba(0, 0, 0, 0.28)';
      context.shadowBlur = size * 0.5;
      context.shadowOffsetY = size * 0.12;
      context.fill('nonzero');
      context.shadowColor = 'transparent';
      context.fillStyle = textColorOn(mark.color);
      context.font = textFont(imageWidth, mark.weight);
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      lines.forEach((line, index) => {
        context.fillText(line, box.x + box.width / 2, box.y + padY + index * lineHeight + lineHeight / 2);
      });
      return;
    }
  }
}
