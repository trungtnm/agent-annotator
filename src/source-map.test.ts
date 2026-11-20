import { describe, expect, it, vi } from 'vitest';

import { createSourceMapLookup, originalPosition } from './source-map';
import { createNextResolver, type RawFrame } from './stack';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(values: readonly number[]): string {
  return values
    .map((value) => {
      let rest = value < 0 ? (-value << 1) | 1 : value << 1;
      let out = '';
      do {
        let digit = rest & 31;
        rest >>>= 5;
        if (rest > 0) digit |= 32;
        out += BASE64[digit];
      } while (rest > 0);
      return out;
    })
    .join('');
}

/**
 * The shape Turbopack serves beside a chunk: an index map whose second section starts at
 * generated line 100 and maps `lookup-form.tsx`. Generated line 102 (0-based 2 in the
 * section) has two segments: column 0 → source line 40, column 20 → source line 42 col 7.
 */
const CHUNK_MAP = {
  version: 3,
  sections: [
    { offset: { line: 0, column: 0 }, map: { version: 3, sources: ['turbopack:///[turbopack]/runtime.ts'], mappings: vlq([0, 0, 0, 0]) } },
    {
      offset: { line: 100, column: 0 },
      map: {
        version: 3,
        sources: ['file:///repo/apps/debtor-portal/src/components/lookup-form.tsx'],
        mappings: ['', '', `${vlq([0, 0, 39, 0])},${vlq([20, 0, 2, 7])}`].join(';'),
      },
    },
  ],
};

const CHUNK = 'http://localhost:5175/_next/static/chunks/apps_debtor-portal_src_a1._.js';
const frame: RawFrame = { file: CHUNK, line1: 103, column1: 25, methodName: 'LookupForm' };

describe('source map lookup', () => {
  it('finds the section, then the segment at or left of the column', () => {
    expect(originalPosition(CHUNK_MAP, 103, 25)).toEqual({
      source: 'file:///repo/apps/debtor-portal/src/components/lookup-form.tsx',
      line: 41,
      column: 7,
    });
    expect(originalPosition(CHUNK_MAP, 103, 5)?.line).toBe(39);
  });

  it('fetches the map beside the chunk once and returns the absolute source path', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe(`${CHUNK}.map`);
      return Response.json(CHUNK_MAP);
    });
    const lookup = createSourceMapLookup(fetchImpl as typeof fetch);
    expect(await lookup(frame)).toEqual({
      file: '/repo/apps/debtor-portal/src/components/lookup-form.tsx',
      line: 42,
      column: 8,
      mapped: true,
    });
    await lookup({ ...frame, line1: 103, column1: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('leaves Turbopack internals and non-chunk URLs alone', async () => {
    const fetchImpl = vi.fn(async () => Response.json(CHUNK_MAP));
    const lookup = createSourceMapLookup(fetchImpl as typeof fetch);
    expect(await lookup({ ...frame, line1: 1, column1: 1 })).toBeNull();
    expect(await lookup({ ...frame, file: 'webpack-internal:///./src/x.tsx' })).toBeNull();
  });
});

describe('Next frame resolver under Turbopack', () => {
  it('falls back to the chunk source map when the endpoint rejects the browser URL', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('.map')
        ? Response.json(CHUNK_MAP)
        : Response.json([{ status: 'rejected', reason: "Unknown url scheme 'http'" }]),
    );
    expect(await createNextResolver(fetchImpl as typeof fetch)([frame])).toEqual([
      { file: '/repo/apps/debtor-portal/src/components/lookup-form.tsx', line: 42, column: 8, mapped: true },
    ]);
  });
});
