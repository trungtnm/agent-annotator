/**
 * Where in the source an element's JSX is written.
 *
 * React 19 dropped `fiber._debugSource` (the file:line a Babel plugin used to stamp on
 * every element). What it keeps, in development, is `fiber._debugStack`: an Error created
 * when the element was created, so its stack names the render function — and the line —
 * that wrote the JSX. Those frames point at bundled code (`webpack-internal:///…`), so
 * they are sent to the dev server's own `/__nextjs_original-stack-frames`, the endpoint
 * Next's error overlay uses to map frames back through the source maps. Under Turbopack
 * that endpoint rejects browser chunk URLs, so those frames go through the chunk's own
 * source map instead (`source-map.ts`).
 *
 * That endpoint is Next internals, not an API. Everything here degrades instead of
 * failing: no answer means the frame's own file and bundled line, flagged as such.
 */

import { createSourceMapLookup } from './source-map';

export interface RawFrame {
  readonly file: string;
  readonly line1: number;
  readonly column1: number;
  readonly methodName: string;
}

export interface SourceLocation {
  /**
   * Relative to the app's directory when Next mapped it (webpack), absolute when the chunk's
   * source map did (Turbopack), else the bundled URL or path.
   */
  readonly file: string;
  readonly line: number;
  readonly column: number | null;
  /** True when the line is the ORIGINAL source line, false when it is the bundled one. */
  readonly mapped: boolean;
  /** Next flagged the frame as framework or library code: not where an edit belongs. */
  readonly ignored?: boolean;
}

const CHROME_FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
const FIREFOX_FRAME = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/;

export function parseStack(stack: string): RawFrame[] {
  const frames: RawFrame[] = [];
  for (const line of stack.split('\n')) {
    const match = CHROME_FRAME.exec(line) ?? FIREFOX_FRAME.exec(line);
    if (match === null) continue;
    const [, methodName, file, line1, column1] = match;
    if (file === undefined || line1 === undefined || column1 === undefined) continue;
    frames.push({ file, line1: Number(line1), column1: Number(column1), methodName: methodName ?? '' });
  }
  return frames;
}

/** React's own frames, and the JSX factory it calls through, sit above the call site. */
const REACT_FRAME =
  /(?:^|[/\\])(?:react|react-dom|scheduler)(?:[/\\]|@)|react-jsx-(?:dev-)?runtime|react\.development|react-dom[^/\\]*\.development|next[/\\]dist[/\\]compiled[/\\]react/;
const REACT_METHOD = /^(?:exports\.)?(?:jsxDEV|jsxs?|createElement|react-stack-top-frame)$|^Object\.(?:jsxDEV|jsxs?)$/;

/**
 * The frame that wrote the JSX: the first one below React's own. `null` when the stack
 * holds nothing else, which is the case in a production build.
 */
export function callSiteFrame(stack: string): RawFrame | null {
  for (const frame of parseStack(stack)) {
    if (REACT_METHOD.test(frame.methodName) || REACT_FRAME.test(frame.file)) continue;
    return frame;
  }
  return null;
}

/** `webpack-internal:///(app-pages-browser)/./src/x.tsx` → `src/x.tsx`. */
export function bundledPath(file: string): string {
  const internal = /^webpack-internal:\/\/\/(?:\([^)]*\)\/)?(?:\.\/)?(.*)$/.exec(file);
  if (internal?.[1]) return internal[1];
  if (file.startsWith('file://')) return decodeURIComponent(file.slice('file://'.length));
  return file;
}

function unmapped(frame: RawFrame): SourceLocation {
  return { file: bundledPath(frame.file), line: frame.line1, column: frame.column1, mapped: false };
}

interface OriginalFrameResponse {
  readonly status?: string;
  readonly value?: {
    readonly originalStackFrame?: {
      readonly file?: string | null;
      readonly line1?: number | null;
      readonly column1?: number | null;
      readonly ignored?: boolean;
    } | null;
  } | null;
}

export type FrameResolver = (frames: readonly RawFrame[]) => Promise<SourceLocation[]>;

const NEXT_ENDPOINT = '/__nextjs_original-stack-frames';
const TIMEOUT_MS = 3000;

/**
 * Maps frames through Next's dev server in ONE request. Always resolves, one location per
 * frame, in order: a frame Next could not map, or any failure of the request, falls back
 * to the frame as bundled.
 */
export function createNextResolver(fetchImpl: typeof fetch = (...args) => fetch(...args)): FrameResolver {
  const cache = new Map<string, SourceLocation>();
  const keyOf = (frame: RawFrame): string => `${frame.file}:${frame.line1}:${frame.column1}`;
  const viaSourceMap = createSourceMapLookup(fetchImpl);
  // Outside Next (Vite, CRA) the endpoint answers 404. Asked once: every request after
  // would log another "Failed to load resource" in the page's console.
  let nextEndpoint = true;

  return async (frames) => {
    const pending = frames.filter((frame) => !cache.has(keyOf(frame)));
    if (pending.length > 0) {
      const fromNext = nextEndpoint
        ? await requestOriginalFrames(fetchImpl, pending, () => {
            nextEndpoint = false;
          })
        : pending.map(() => null);
      // Turbopack's endpoint cannot map a browser chunk URL; its `.map` beside the chunk can.
      const mapped = await Promise.all(
        pending.map(async (frame, index) => fromNext[index] ?? (await viaSourceMap(frame))),
      );
      pending.forEach((frame, index) => cache.set(keyOf(frame), mapped[index] ?? unmapped(frame)));
    }
    return frames.map((frame) => cache.get(keyOf(frame)) ?? unmapped(frame));
  };
}

async function requestOriginalFrames(
  fetchImpl: typeof fetch,
  frames: readonly RawFrame[],
  onMissing: () => void,
): Promise<Array<SourceLocation | null>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(NEXT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        frames: frames.map((frame) => ({ ...frame, arguments: [] })),
        isServer: false,
        isEdgeServer: false,
        isAppDirectory: true,
      }),
      signal: controller.signal,
    });
    if (response.status === 404) onMissing();
    if (!response.ok) return frames.map(() => null);
    const body: unknown = await response.json();
    if (!Array.isArray(body)) return frames.map(() => null);
    return frames.map((_, index) => toLocation(body[index] as OriginalFrameResponse | undefined));
  } catch {
    return frames.map(() => null);
  } finally {
    clearTimeout(timer);
  }
}

function toLocation(entry: OriginalFrameResponse | undefined): SourceLocation | null {
  const original = entry?.status === 'fulfilled' ? entry.value?.originalStackFrame : null;
  if (!original?.file || typeof original.line1 !== 'number') return null;
  // Next answers a frame it could NOT map with the input echoed back; a bundled URL is
  // not an original location.
  if (/^(?:webpack-internal|https?):/.test(original.file)) return null;
  return {
    file: original.file,
    line: original.line1,
    column: original.column1 ?? null,
    mapped: true,
    ...(original.ignored === true || /(?:^|\/)node_modules\//.test(original.file) ? { ignored: true } : {}),
  };
}
