import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { consoleEntries, formatArgs, installConsoleCapture } from './console-capture';

/**
 * Browsers without the newer APIs the capture leans on. Each test starts a fresh log
 * (the log is one per window, so the global holder is dropped) and puts the console back.
 */
const LOG_KEY = Symbol.for('agent-annotator:console-log');
const realError = console.error;
const realWarn = console.warn;

type ObserverCallback = (list: { getEntries: () => unknown[] }) => void;

/** A PerformanceObserver from before Chrome 109: no `responseStatus`, and optionally no `type` option. */
function oldObserver(options: { readonly typeOption: boolean }): { emit: (entries: unknown[]) => void; observed: unknown[] } {
  let callback: ObserverCallback = () => undefined;
  const observed: unknown[] = [];
  class FakeObserver {
    static supportedEntryTypes = ['resource'];
    constructor(next: ObserverCallback) {
      callback = next;
    }
    observe(init: Record<string, unknown>): void {
      if ('type' in init && !options.typeOption) throw new TypeError("Failed to execute 'observe': type is not supported");
      observed.push(init);
    }
  }
  vi.stubGlobal('PerformanceObserver', FakeObserver);
  return { emit: (entries) => callback({ getEntries: () => entries }), observed };
}

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[LOG_KEY];
  console.error = vi.fn();
  console.warn = vi.fn();
});

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[LOG_KEY];
  console.error = realError;
  console.warn = realWarn;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('console capture in older browsers', () => {
  it('skips requests without responseStatus, and falls back to entryTypes when `type` is refused', () => {
    const observer = oldObserver({ typeOption: false });
    expect(() => installConsoleCapture()).not.toThrow();
    expect(observer.observed).toEqual([{ entryTypes: ['resource'] }]);

    expect(() => observer.emit([{ name: 'http://localhost/api/missing', initiatorType: 'fetch' }])).not.toThrow();
    expect(consoleEntries()).toEqual([]);

    // Where the status is there, it is used.
    observer.emit([{ name: 'http://localhost/api/missing', initiatorType: 'fetch', responseStatus: 404 }]);
    expect(consoleEntries().map((entry) => entry.message)).toEqual([
      'Failed to load resource: 404 for fetch http://localhost/api/missing',
    ]);
  });

  it('still records the console when there is no PerformanceObserver and no queueMicrotask', async () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    vi.stubGlobal('queueMicrotask', undefined);
    expect(() => installConsoleCapture()).not.toThrow();
    console.error('vẫn ghi được');
    await Promise.resolve();
    expect(consoleEntries().map((entry) => entry.message)).toEqual(['vẫn ghi được']);
  });

  it('reports an element that failed to load even when Resource Timing lookups throw', () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    vi.spyOn(performance, 'getEntriesByName').mockImplementation(() => {
      throw new TypeError('not supported');
    });
    installConsoleCapture();
    const image = document.createElement('img');
    image.setAttribute('src', 'http://localhost/broken.png');
    document.body.appendChild(image);
    expect(() => image.dispatchEvent(new Event('error'))).not.toThrow();
    image.remove();
    expect(consoleEntries().map((entry) => entry.message)).toEqual([
      'Failed to load resource: <img> could not load http://localhost/broken.png',
    ]);
  });

  it('never lets an unprintable value break the page\'s console call', () => {
    installConsoleCapture();
    const bare = Object.create(null) as Record<string, unknown>;
    bare['self'] = bare;
    expect(formatArgs(['x', bare])).toBe('x [object Object]');
    const hostile = {
      toJSON(): never {
        throw new Error('no');
      },
    };
    expect(() => console.error('bad value', hostile)).not.toThrow();
    expect(console.error).not.toBe(realError);
  });
});
