import { describe, expect, it, vi } from 'vitest';

import { bundledPath, callSiteFrame, createNextResolver, parseStack, type RawFrame } from './stack';

/** The shape of a React 19 `_debugStack` in `next dev` (webpack), trimmed. */
const DEBUG_STACK = [
  'Error: react-stack-top-frame',
  '    at exports.jsxDEV (webpack-internal:///(app-pages-browser)/../../node_modules/.pnpm/next@15.5.27/node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js:346:13)',
  '    at SaveBar (webpack-internal:///(app-pages-browser)/./src/components/save-bar.tsx:42:95)',
  '    at LoanPage (webpack-internal:///(app-pages-browser)/./src/app/(shell)/loans/page.tsx:12:7)',
].join('\n');

describe('call site', () => {
  it('skips React and the JSX factory, landing on the render that wrote the element', () => {
    expect(callSiteFrame(DEBUG_STACK)).toEqual({
      file: 'webpack-internal:///(app-pages-browser)/./src/components/save-bar.tsx',
      line1: 42,
      column1: 95,
      methodName: 'SaveBar',
    });
  });

  it('reads Firefox frames too', () => {
    expect(parseStack('SaveBar@http://localhost:5174/_next/static/chunks/app.js:10:3')).toEqual([
      { file: 'http://localhost:5174/_next/static/chunks/app.js', line1: 10, column1: 3, methodName: 'SaveBar' },
    ]);
  });

  it('turns a webpack-internal URL into the app-relative path', () => {
    expect(bundledPath('webpack-internal:///(app-pages-browser)/./src/x.tsx')).toBe('src/x.tsx');
    expect(bundledPath('file:///repo/src/x.tsx')).toBe('/repo/src/x.tsx');
  });
});

describe('Next frame resolver', () => {
  const frame: RawFrame = { file: 'webpack-internal:///(app-pages-browser)/./src/x.tsx', line1: 40, column1: 9, methodName: 'X' };
  const other: RawFrame = { ...frame, line1: 99 };

  it('maps every frame in one request and caches the answer', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { frames: RawFrame[]; isAppDirectory: boolean };
      expect(body.isAppDirectory).toBe(true);
      return Response.json(
        body.frames.map((f) => ({ status: 'fulfilled', value: { originalStackFrame: { file: 'src/x.tsx', line1: f.line1 - 30, column1: 5 } } })),
      );
    });
    const resolve = createNextResolver(fetchImpl as typeof fetch);
    expect(await resolve([frame, other])).toEqual([
      { file: 'src/x.tsx', line: 10, column: 5, mapped: true },
      { file: 'src/x.tsx', line: 69, column: 5, mapped: true },
    ]);
    await resolve([frame]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falls back to the bundled location when Next cannot map a frame or is not there', async () => {
    const echo = vi.fn(async () =>
      Response.json([{ status: 'fulfilled', value: { originalStackFrame: { file: frame.file, line1: 40, column1: 9 } } }]),
    );
    expect(await createNextResolver(echo as typeof fetch)([frame])).toEqual([
      { file: 'src/x.tsx', line: 40, column: 9, mapped: false },
    ]);
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await createNextResolver(down as typeof fetch)([frame])).toEqual([
      { file: 'src/x.tsx', line: 40, column: 9, mapped: false },
    ]);
  });
});
