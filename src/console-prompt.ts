import type { ConsoleEntry, ConsoleSource } from './console-capture';
import { formatTime, location } from './prompt';
import { REDACTED, type Redactor } from './redaction';
import { parseStack, type FrameResolver, type SourceLocation } from './stack';

export interface ConsolePromptOptions {
  readonly appName: string;
  readonly appDir?: string | undefined;
  /** Screens each message; the log keeps them as logged. */
  readonly redactor: Redactor;
  readonly now: Date;
}

/** Frames of one stack sent for mapping; the app's own code is near the top. */
const FRAMES_PER_ENTRY = 12;
/** App frames printed per entry. */
const STACK_SHOWN = 5;
/** A message past this is cut in the prompt. */
const MESSAGE_SHOWN = 4000;
/** Library code, mapped or bundled: `node_modules`, Vite's prebundled deps, Next's compiled React. */
const LIBRARY_FILE = /(?:^|[/\\])node_modules[/\\]|next[/\\]dist[/\\]|react-dom[^/\\]*\.development|\/@vite\/client|<anonymous>/;

const SOURCE_LABEL: Readonly<Record<ConsoleSource, string>> = {
  'console.error': 'console.error',
  'console.warn': 'console.warn',
  uncaught: 'uncaught exception',
  rejection: 'unhandled promise rejection',
  network: 'failed request (logged by the browser)',
};

/**
 * Each entry's stack mapped to the original source, keeping the app's own frames only:
 * frames the dev server flags as framework code, and anything in `node_modules`, are
 * where the error surfaced, not where it can be fixed. One resolver call for all entries.
 */
export async function locateEntries(
  entries: readonly ConsoleEntry[],
  resolveFrames: FrameResolver,
): Promise<ReadonlyMap<string, readonly SourceLocation[]>> {
  const perEntry = entries.map((entry) =>
    entry.stack === null ? [] : parseStack(entry.stack).slice(0, FRAMES_PER_ENTRY),
  );
  const resolved = await resolveFrames(perEntry.flat());
  const out = new Map<string, readonly SourceLocation[]>();
  let at = 0;
  entries.forEach((entry, index) => {
    const count = perEntry[index]?.length ?? 0;
    const frames = resolved.slice(at, at + count);
    at += count;
    out.set(
      entry.id,
      frames.filter((frame) => frame.ignored !== true && !LIBRARY_FILE.test(frame.file)),
    );
  });
  return out;
}

/**
 * The Markdown handed to the coding agent for console warnings and errors, shaped like the
 * comment prompt: what to do first, then one section per entry, the source line before the
 * message.
 */
export function buildConsolePrompt(
  entries: readonly ConsoleEntry[],
  locations: ReadonlyMap<string, readonly SourceLocation[]>,
  options: ConsolePromptOptions,
): string {
  const errors = entries.filter((entry) => entry.level === 'error').length;
  const warnings = entries.length - errors;
  const counts = [plural(errors, 'error'), plural(warnings, 'warning')].filter((part) => part !== null).join(', ');
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const lines: string[] = [
    `# Console problems: ${options.appName} (${counts})`,
    '',
    `Dev environment ${origin}, recorded ${formatTime(options.now)}.` +
      (options.appDir ? ` The app lives in \`${options.appDir}\`; file paths are from the repo root.` : ''),
    '',
    'These warnings and errors were logged in the browser console while using the app. ' +
      'Work through them one by one: find the cause in the app\'s code and fix it there; do not silence the log or ' +
      'wrap it in a try/catch that hides it. Where an entry names a source location, it is the nearest app frame of ' +
      'its stack, mapped to the original source; framework and library frames are left out. Open the source file ' +
      'before editing. If an entry is caused by a library, say so and propose the fix on the app\'s side. ' +
      (options.redactor.enabled ? `Personal data has been replaced with \`${REDACTED}\`; never treat it as a real value. ` : '') +
      'When done, summarise the fixes by entry number.',
  ];
  entries.forEach((entry, index) => {
    lines.push('', '---', '', ...section(entry, index + 1, locations.get(entry.id) ?? [], options));
  });
  return `${lines.join('\n')}\n`;
}

function section(entry: ConsoleEntry, number: number, frames: readonly SourceLocation[], options: ConsolePromptOptions): string[] {
  const message = options.redactor.text(entry.message);
  const shown = message.length <= MESSAGE_SHOWN ? message : `${message.slice(0, MESSAGE_SHOWN)}… (truncated)`;
  const out: string[] = [
    `## ${number}. ${title(entry, message)}`,
    '',
    `- **Logged by:** ${SOURCE_LABEL[entry.source]}`,
    `- **Page:** \`${entry.pathname}\``,
    entry.count === 1
      ? `- **Seen:** once, at ${clock(entry.firstAt)}`
      : `- **Seen:** ${entry.count} times, first at ${clock(entry.firstAt)}, last at ${clock(entry.lastAt)}`,
  ];
  const [nearest, ...rest] = frames;
  // A failed request has no stack: the URL in the message is what to search the code for.
  if (entry.source !== 'network') out.push(`- **Source:** ${nearest === undefined ? 'no app frame in the stack' : location(nearest, options.appDir)}`);
  if (rest.length > 0) {
    out.push(`- **Called from:** ${rest.slice(0, STACK_SHOWN - 1).map((frame) => location(frame, options.appDir)).join(' ← ')}`);
  }
  out.push('', '```text', shown.replace(/```/g, "'''"), '```');
  return out;
}

/** `Error: Failed to save`, but a thrown `TypeError: …` is not labelled twice. */
function title(entry: ConsoleEntry, message: string): string {
  const line = headline(message);
  if (entry.level === 'error' && /^[A-Za-z]*(?:Error|Exception)\b/.test(line)) return line;
  return `${entry.level === 'error' ? 'Error' : 'Warning'}: ${line}`;
}

function headline(message: string): string {
  const first = message.trim().split('\n')[0] ?? '';
  return first.length <= 90 ? first : `${first.slice(0, 90)}…`;
}

function clock(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function plural(count: number, noun: string): string | null {
  return count === 0 ? null : `${count} ${noun}${count === 1 ? '' : 's'}`;
}
