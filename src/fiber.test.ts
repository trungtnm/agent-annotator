import { describe, expect, it } from 'vitest';

import { debugSourceOf, type Fiber } from './fiber';

function withSource(source: unknown): Fiber {
  return { tag: 5, type: 'button', elementType: 'button', return: null, memoizedProps: {}, memoizedState: null, stateNode: null, _debugSource: source };
}

describe('debugSourceOf', () => {
  it("reads React 18's `_debugSource` as an original location", () => {
    expect(debugSourceOf(withSource({ fileName: '/repo/apps/web/src/page.tsx', lineNumber: 12, columnNumber: 7 }))).toEqual({
      file: '/repo/apps/web/src/page.tsx',
      line: 12,
      column: 7,
      mapped: true,
    });
  });

  it('keeps a location without a column', () => {
    expect(debugSourceOf(withSource({ fileName: 'src/page.tsx', lineNumber: 3 }))?.column).toBeNull();
  });

  it('flags library code as not where an edit belongs', () => {
    expect(debugSourceOf(withSource({ fileName: '/repo/node_modules/ui/button.js', lineNumber: 1 }))?.ignored).toBe(true);
  });

  it('returns null on React 19 and in production, where the field is absent', () => {
    expect(debugSourceOf(withSource(undefined))).toBeNull();
    expect(debugSourceOf(withSource(null))).toBeNull();
    expect(debugSourceOf(withSource({ fileName: '', lineNumber: 1 }))).toBeNull();
    expect(debugSourceOf(withSource({ fileName: 'src/page.tsx' }))).toBeNull();
  });
});
