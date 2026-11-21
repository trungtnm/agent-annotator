import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConsoleEntry } from './console-capture';
import { clearConsole, consoleEntries, formatArgs, installConsoleCapture, subscribeConsole } from './console-capture';
import { buildConsolePrompt, locateEntries } from './console-prompt';
import { createRedactor, DEFAULT_REDACTION } from './redaction';
import type { FrameResolver } from './stack';

afterEach(() => {
  clearConsole();
  vi.restoreAllMocks();
});

describe('formatArgs', () => {
  it('fills format specifiers, drops %c styles and appends what is left', () => {
    expect(formatArgs(['Each child in a list needs a unique "key" prop.%s', '\n    at Row'])).toBe(
      'Each child in a list needs a unique "key" prop.\n    at Row',
    );
    expect(formatArgs(['%cStyled', 'color: red', 'tail'])).toBe('Styled tail');
    expect(formatArgs(['%d items, 100%%', '3.7'])).toBe('3 items, 100%');
    expect(formatArgs([{ a: 1 }, new TypeError('bad')])).toBe('{"a":1} TypeError: bad');
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(formatArgs(['x', circular])).toBe('x [object Object]');
  });
});

describe('console capture', () => {
  it('records warnings and errors once each, folds repeats and still calls the console', async () => {
    const printed: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void printed.push(args));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // The spies are the originals the capture wraps.
    installConsoleCapture();
    installConsoleCapture();
    const listener = vi.fn();
    const unsubscribe = subscribeConsole(listener);

    console.error('Failed to load %s', 'orders');
    console.error('Failed to load %s', 'orders');
    console.warn('Deprecated prop');
    await Promise.resolve();
    unsubscribe();

    const entries = consoleEntries();
    expect(entries.map((entry) => [entry.level, entry.message, entry.count])).toEqual([
      ['error', 'Failed to load orders', 2],
      ['warning', 'Deprecated prop', 1],
    ]);
    expect(entries[0]?.stack).toContain('console-capture.test');
    expect(listener).toHaveBeenCalled();
  });

  it('records uncaught errors and unhandled rejections', () => {
    installConsoleCapture();
    const error = new RangeError('Out of range');
    window.dispatchEvent(new ErrorEvent('error', { error, message: error.message }));
    const rejection = new Event('unhandledrejection') as Event & { reason?: unknown };
    rejection.reason = 'timeout';
    window.dispatchEvent(rejection);
    const entries = consoleEntries();
    expect(entries.map((entry) => [entry.source, entry.message])).toEqual([
      ['uncaught', 'RangeError: Out of range'],
      ['rejection', 'timeout'],
    ]);
  });
});

describe('failed requests', () => {
  it('records a resource an element could not load, but not the tool\'s own lookups', () => {
    installConsoleCapture();
    const image = document.createElement('img');
    image.setAttribute('src', 'http://localhost/missing.png');
    document.body.appendChild(image);
    image.dispatchEvent(new Event('error'));
    const map = document.createElement('script');
    map.setAttribute('src', 'http://localhost/app.js.map');
    document.body.appendChild(map);
    map.dispatchEvent(new Event('error'));
    expect(consoleEntries().map((entry) => [entry.source, entry.message])).toEqual([
      ['network', 'Failed to load resource: <img> could not load http://localhost/missing.png'],
    ]);
    image.remove();
    map.remove();
  });
});

describe('buildConsolePrompt', () => {
  const entry: ConsoleEntry = {
    id: 'a',
    level: 'error',
    source: 'console.error',
    message: 'Could not save customer an@example.com\n    at Save',
    stack: [
      'Error',
      '    at save (http://localhost:3000/_next/static/chunks/node_modules_react-dom.js:10:5)',
      '    at onClick (http://localhost:3000/_next/static/chunks/src_app.js:20:7)',
      '    at handle (http://localhost:3000/_next/static/chunks/src_app.js:30:2)',
    ].join('\n'),
    pathname: '/customers',
    count: 3,
    firstAt: '2026-11-21T06:00:00.000Z',
    lastAt: '2026-11-21T06:01:00.000Z',
  };

  it('names the nearest app frame, screens the message and counts repeats', async () => {
    const resolve: FrameResolver = async (frames) =>
      frames.map((frame) =>
        frame.file.includes('node_modules')
          ? { file: 'node_modules/react-dom/x.js', line: 1, column: 1, mapped: true }
          : { file: 'src/app/customers/page.tsx', line: frame.line1, column: frame.column1, mapped: true },
      );
    const locations = await locateEntries([entry], resolve);
    const prompt = buildConsolePrompt([entry], locations, {
      appName: 'web',
      appDir: 'apps/web',
      redactor: createRedactor(DEFAULT_REDACTION),
      now: new Date(2026, 10, 21, 13, 0),
    });
    expect(prompt).toContain('# Console problems: web (1 error)');
    expect(prompt).toContain('## 1. Error: Could not save customer [redacted]');
    expect(prompt).toContain('- **Source:** `apps/web/src/app/customers/page.tsx:20:7`');
    expect(prompt).toContain('- **Called from:** `apps/web/src/app/customers/page.tsx:30:2`');
    expect(prompt).toContain('- **Seen:** 3 times');
    expect(prompt).not.toContain('an@example.com');
    expect(prompt).not.toContain('react-dom');
  });

  it('says when no app frame was found', async () => {
    const prompt = buildConsolePrompt([{ ...entry, stack: null, level: 'warning', count: 1 }], await locateEntries([], async () => []), {
      appName: 'web',
      redactor: createRedactor({ ...DEFAULT_REDACTION, enabled: false }),
      now: new Date(),
    });
    expect(prompt).toContain('(1 warning)');
    expect(prompt).toContain('- **Source:** no app frame in the stack');
    expect(prompt).toContain('an@example.com');
    expect(prompt).not.toContain('Personal data has been replaced');
  });
});
