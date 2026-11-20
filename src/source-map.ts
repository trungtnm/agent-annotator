/**
 * Maps a bundled position back to the source through the chunk's own source map, in the
 * browser. Needed under Turbopack: its dev server traces a client frame only from a
 * `file://` chunk path, and a browser stack holds `http://…/_next/static/chunks/x.js`, so
 * `/__nextjs_original-stack-frames` rejects every client frame. Turbopack serves each
 * chunk's map beside it (`x.js.map`) as an index map — `sections`, each a plain v3 map at an
 * offset — so the lookup is a fetch and a VLQ walk, no dependency.
 */

import type { RawFrame, SourceLocation } from './stack';

interface PlainMap {
  readonly sources: readonly string[];
  readonly mappings: string;
}

interface Section {
  readonly offset: { readonly line: number; readonly column: number };
  readonly map: PlainMap;
}

type SourceMapJson = PlainMap | { readonly sections: readonly Section[] };

/** A position in the original file: 0-based line and column, as source maps store them. */
interface Original {
  readonly source: string;
  readonly line: number;
  readonly column: number;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DIGIT = new Map([...BASE64].map((char, index) => [char, index]));

function decodeVlq(segment: string): number[] {
  const values: number[] = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = DIGIT.get(char);
    if (digit === undefined) return values;
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
      continue;
    }
    values.push(value & 1 ? -(value >> 1) : value >> 1);
    value = 0;
    shift = 0;
  }
  return values;
}

/** The mapping at or left of `column` on generated `line` (both 0-based). */
function lookupPlain(map: PlainMap, line: number, column: number): Original | null {
  // Source index, line and column carry over from line to line; the generated column does not.
  let source = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  const lines = map.mappings.split(';');
  for (let current = 0; current <= line && current < lines.length; current++) {
    let generated = 0;
    let best: Original | null = null;
    for (const segment of (lines[current] ?? '').split(',')) {
      if (segment === '') continue;
      const fields = decodeVlq(segment);
      generated += fields[0] ?? 0;
      if (fields.length < 4) continue;
      source += fields[1] ?? 0;
      sourceLine += fields[2] ?? 0;
      sourceColumn += fields[3] ?? 0;
      const name = map.sources[source];
      if (current === line && generated <= column && name !== undefined) {
        best = { source: name, line: sourceLine, column: sourceColumn };
      }
    }
    if (current === line) return best;
  }
  return null;
}

export function originalPosition(map: SourceMapJson, line1: number, column1: number): Original | null {
  const line = line1 - 1;
  const column = column1 - 1;
  if (!('sections' in map)) return lookupPlain(map, line, column);
  let hit: Section | undefined;
  for (const section of map.sections) {
    const { offset } = section;
    if (offset.line < line || (offset.line === line && offset.column <= column)) hit = section;
    else break;
  }
  if (hit === undefined) return null;
  const inLine = line - hit.offset.line;
  return lookupPlain(hit.map, inLine, inLine === 0 ? column - hit.offset.column : column);
}

/** `file:///repo/apps/x/src/a.tsx` → `/repo/apps/x/src/a.tsx`; Turbopack internals → null. */
function sourcePath(source: string): string | null {
  if (source.startsWith('file://')) return decodeURIComponent(source.slice('file://'.length));
  if (/^turbopack:\/\/\/\[turbopack\]/.test(source)) return null;
  return source;
}

const TIMEOUT_MS = 3000;

/**
 * Resolves http(s) chunk frames through `<chunk>.map`; anything else, or any failure, is
 * `null` so the caller keeps its own fallback. Each map is fetched once.
 */
export function createSourceMapLookup(
  fetchImpl: typeof fetch,
): (frame: RawFrame) => Promise<SourceLocation | null> {
  const maps = new Map<string, Promise<SourceMapJson | null>>();
  const load = (url: string): Promise<SourceMapJson | null> => {
    let pending = maps.get(url);
    if (pending === undefined) {
      pending = fetchMap(fetchImpl, `${url}.map`);
      maps.set(url, pending);
    }
    return pending;
  };

  return async (frame) => {
    // Any script served over http(s) by the dev server: its map sits beside it as `<url>.map`.
    if (!/^https?:\/\/[^?#]+\.(?:m?js|cjs)(?:[?#].*)?$/.test(frame.file)) return null;
    const map = await load(frame.file.replace(/[?#].*$/, ''));
    if (map === null) return null;
    const original = originalPosition(map, frame.line1, frame.column1);
    const file = original === null ? null : sourcePath(original.source);
    if (original === null || file === null) return null;
    return {
      file,
      line: original.line + 1,
      column: original.column + 1,
      mapped: true,
      ...(/(?:^|\/)node_modules\//.test(file) ? { ignored: true } : {}),
    };
  };
}

async function fetchMap(fetchImpl: typeof fetch, url: string): Promise<SourceMapJson | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return null;
    if ('sections' in body && Array.isArray(body.sections)) return body as SourceMapJson;
    if ('mappings' in body && 'sources' in body) return body as SourceMapJson;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
