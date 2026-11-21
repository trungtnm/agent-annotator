/**
 * The browser console's warnings and errors, kept so they can be handed to a coding agent
 * like a comment. Five sources: `console.error`, `console.warn`, uncaught exceptions
 * (`error` on window), unhandled promise rejections, and requests that failed — the
 * "Failed to load resource" lines the browser prints itself, never through `console`.
 *
 * Not seen, because the page's JavaScript cannot see them: what browser extensions log
 * from their own pages and isolated worlds, and anything logged before the tool started.
 *
 * The console methods are wrapped, not replaced: the original always runs first, with the
 * same arguments, so DevTools and any other wrapper (Next's error overlay) see every call.
 * The log is one per window, kept on `globalThis` so hot reloads and Strict Mode's double
 * mount never wrap twice. It lives in memory only: raw messages can carry personal data,
 * and they are screened when the prompt is built, not stored.
 */

export type ConsoleLevel = 'error' | 'warning';
export type ConsoleSource = 'console.error' | 'console.warn' | 'uncaught' | 'rejection' | 'network';

export interface ConsoleEntry {
  readonly id: string;
  readonly level: ConsoleLevel;
  readonly source: ConsoleSource;
  /** The message as the console prints it: format specifiers filled in, `%c` styles dropped. */
  readonly message: string;
  /** The stack of the thrown error, else of the console call itself; `null` when none. */
  readonly stack: string | null;
  readonly pathname: string;
  /** How many times this same message was logged; repeats are folded into one entry. */
  readonly count: number;
  readonly firstAt: string;
  readonly lastAt: string;
}

/** Past this, the oldest entries are dropped. */
const MAX_ENTRIES = 200;
/** One message, as stored; React's component stacks make some very long. */
const MAX_MESSAGE = 8000;

interface ConsoleLog {
  entries: readonly ConsoleEntry[];
  readonly listeners: Set<() => void>;
  installed: boolean;
}

const LOG_KEY = Symbol.for('agent-annotator:console-log');

function log(): ConsoleLog {
  const holder = globalThis as typeof globalThis & { [LOG_KEY]?: ConsoleLog };
  holder[LOG_KEY] ??= { entries: [], listeners: new Set(), installed: false };
  return holder[LOG_KEY];
}

/**
 * Starts recording. Safe to call any number of times; does nothing outside a browser.
 *
 * Recording must never break the page: every capture is guarded, so a browser that lacks
 * an API, or a value that cannot be printed, costs that one entry and nothing else. Each
 * source is set up on its own, so one that cannot start leaves the others running.
 */
export function installConsoleCapture(): void {
  const state = log();
  if (state.installed || typeof window === 'undefined') return;
  state.installed = true;
  // A warning logged while recording one (a listener's own console call) is not recorded.
  let recording = false;
  const record = (level: ConsoleLevel, source: ConsoleSource, read: () => Captured): void => {
    if (recording) return;
    recording = true;
    try {
      const { message, stack } = read();
      add(state, level, source, message, stack);
    } catch {
      // Not recordable; the page goes on as if the tool were not there.
    } finally {
      recording = false;
    }
  };

  const wrap = (method: 'error' | 'warn', level: ConsoleLevel, source: ConsoleSource): void => {
    const original = console[method];
    if (typeof original !== 'function') return;
    console[method] = function (this: Console, ...args: unknown[]): void {
      // The original runs first and outside the guard: its own throw is the page's to see.
      original.apply(this, args);
      record(level, source, () => {
        const error = args.find((arg): arg is Error => arg instanceof Error);
        // The first two lines of a fresh stack are "Error" and this wrapper.
        const stack = error?.stack ?? new Error().stack?.split('\n').slice(2).join('\n') ?? null;
        return { message: formatArgs(args), stack };
      });
    };
  };
  attempt(() => wrap('error', 'error', 'console.error'));
  attempt(() => wrap('warn', 'warning', 'console.warn'));

  attempt(() =>
    window.addEventListener('error', (event: ErrorEvent) => {
      // A resource that failed to load fires `error` on its element, not as an ErrorEvent.
      if (typeof ErrorEvent === 'undefined' || !(event instanceof ErrorEvent)) return;
      record('error', 'uncaught', () => {
        const error: unknown = event.error;
        const where = event.filename ? `\n    at ${event.filename}:${event.lineno}:${event.colno}` : '';
        return {
          message: error instanceof Error ? describeError(error) : String(event.message),
          stack: error instanceof Error && error.stack ? error.stack : where || null,
        };
      });
    }),
  );
  attempt(() =>
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      record('error', 'rejection', () => {
        const reason: unknown = event.reason;
        return {
          message: reason instanceof Error ? describeError(reason) : formatArgs([reason]),
          stack: reason instanceof Error ? (reason.stack ?? null) : null,
        };
      });
    }),
  );
  watchFailedRequests((read) => record('error', 'network', () => ({ message: read(), stack: null })));
}

interface Captured {
  readonly message: string;
  readonly stack: string | null;
}

/** Runs one setup step; a browser that cannot do it simply goes without. */
function attempt(step: () => void): void {
  try {
    step();
  } catch {
    // Unsupported here.
  }
}

/** The tool's own lookups: a 404 there is the tool probing, not the app failing. */
const OWN_REQUEST = /\/__nextjs_original-stack-frames|\.map(?:\?|$)/;

/** The last HTTP status the Resource Timing buffer holds for a URL; `undefined` when it has none. */
function statusOf(url: string): number | undefined {
  try {
    const entries = performance.getEntriesByName(url, 'resource') as PerformanceResourceTiming[];
    return entries[entries.length - 1]?.responseStatus;
  } catch {
    return undefined;
  }
}

/**
 * Requests answered with an error status, from the Resource Timing buffer (it holds the
 * ones made before the tool started, too), and resources an element could not load at all
 * (a refused connection, a blocked script), which leave no status to read.
 *
 * Older browsers lack parts of this. Without `responseStatus` (before Chrome 109) a request
 * answered 404 is not seen, but an element that fails to load still is. Without
 * `PerformanceObserver`, or its `type`/`buffered` options, the observer is skipped or
 * falls back to the older `entryTypes` form.
 */
function watchFailedRequests(report: (read: () => string) => void): void {
  attempt(() => {
    if (typeof PerformanceObserver === 'undefined') return;
    const supported = PerformanceObserver.supportedEntryTypes;
    if (Array.isArray(supported) && !supported.includes('resource')) return;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        // `responseStatus` is missing in older browsers: nothing to go on there.
        const status: unknown = entry.responseStatus;
        if (typeof status !== 'number' || status < 400 || OWN_REQUEST.test(entry.name)) continue;
        report(() => `Failed to load resource: ${status} for ${entry.initiatorType} ${entry.name}`);
      }
    });
    try {
      observer.observe({ type: 'resource', buffered: true });
    } catch {
      // Before the `type` option: requests from now on only.
      observer.observe({ entryTypes: ['resource'] });
    }
  });
  // An element's load error does not bubble: listened for in the capture phase.
  attempt(() =>
    window.addEventListener(
      'error',
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || (typeof ErrorEvent !== 'undefined' && event instanceof ErrorEvent)) return;
        report(() => {
          const url = target.getAttribute('src') === null ? (target as HTMLLinkElement).href : (target as HTMLImageElement).src;
          // Thrown, not reported: `record` drops it. Not a resource, the tool's own, or
          // an error status the observer reports with the status itself.
          if (!url || OWN_REQUEST.test(url) || (statusOf(url) ?? 0) >= 400) throw new Skip();
          return `Failed to load resource: <${target.tagName.toLowerCase()}> could not load ${url}`;
        });
      },
      true,
    ),
  );
}

/** A capture that turned out to be nothing to record. */
class Skip extends Error {}

function add(state: ConsoleLog, level: ConsoleLevel, source: ConsoleSource, message: string, stack: string | null): void {
  const now = new Date().toISOString();
  const pathname = window.location.pathname;
  const text = message.length <= MAX_MESSAGE ? message : `${message.slice(0, MAX_MESSAGE)}… (truncated)`;
  const same = state.entries.find(
    (entry) => entry.level === level && entry.message === text && entry.pathname === pathname,
  );
  state.entries =
    same === undefined
      ? [
          ...state.entries,
          { id: newId(), level, source, message: text, stack, pathname, count: 1, firstAt: now, lastAt: now },
        ].slice(-MAX_ENTRIES)
      : state.entries.map((entry) => (entry === same ? { ...entry, count: entry.count + 1, lastAt: now } : entry));
  // Listeners re-render React; a log from inside a render must not set state during it.
  const notify = (): void => state.listeners.forEach((listener) => listener());
  if (typeof queueMicrotask === 'function') queueMicrotask(notify);
  else void Promise.resolve().then(notify);
}

export function consoleEntries(): readonly ConsoleEntry[] {
  return log().entries;
}

export function subscribeConsole(listener: () => void): () => void {
  const { listeners } = log();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Forgets the given entries, or every entry. */
export function clearConsole(ids?: ReadonlySet<string>): void {
  const state = log();
  state.entries = ids === undefined ? [] : state.entries.filter((entry) => !ids.has(entry.id));
  state.listeners.forEach((listener) => listener());
}

/**
 * The arguments as the console would print them: a leading format string has its `%s`,
 * `%d`, `%i`, `%f`, `%o`, `%O` and `%j` filled from the arguments after it, `%c` takes a
 * style and prints nothing, and what is left over follows, space-separated.
 */
export function formatArgs(args: readonly unknown[]): string {
  const [first, ...rest] = args;
  const queue = [...rest];
  let head = '';
  if (typeof first === 'string') {
    head = first.replace(/%([sdifoOjc%])/g, (match, spec: string) => {
      if (spec === '%') return '%';
      if (queue.length === 0) return match;
      const value = queue.shift();
      if (spec === 'c') return '';
      if (spec === 'd' || spec === 'i') return String(Number.parseInt(String(value), 10));
      if (spec === 'f') return String(Number.parseFloat(String(value)));
      return show(value);
    });
  } else if (args.length > 0) {
    queue.unshift(first);
  }
  return [head, ...queue.map(show)].filter((part) => part !== '').join(' ');
}

function show(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return describeError(value);
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof Element !== 'undefined' && value instanceof Element) return `<${value.tagName.toLowerCase()}>`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // Circular, or a getter that throws; `String` throws too on an object with no prototype.
    try {
      return String(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
}

function describeError(error: Error): string {
  return error.message ? `${error.name}: ${error.message}` : error.name;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
