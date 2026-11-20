import type { ElementCapture } from './capture';
import { REDACTED } from './serialize';
import type { Rect } from './page-tools';
import type { SourceLocation } from './stack';

/**
 * What one comment is about:
 * - `element`: one clicked element;
 * - `text`: a passage selected inside an element (the element is the target);
 * - `group`: several elements picked with Cmd/Ctrl+click, one request for all of them;
 * - `area`: a dragged region — the first target is the element holding the region, the
 *   rest are the elements wholly inside it (none, for a comment on empty space).
 */
export type AnnotationKind = 'element' | 'text' | 'group' | 'area';

export interface Annotation {
  readonly id: string;
  readonly kind: AnnotationKind;
  readonly comment: string;
  readonly createdAt: string;
  readonly targets: readonly ElementCapture[];
  /** `text` only: the selected passage, screened for personal data. */
  readonly selectedText?: string;
  /** `area` only: the dragged region in viewport pixels at the time of the comment. */
  readonly area?: Rect;
  /**
   * `area` only: the same region relative to the container's top-left corner, so it can be
   * drawn back over the page after scrolling or a reload. Not part of the prompt.
   */
  readonly areaInContainer?: Rect;
}

export interface PromptOptions {
  /** Shown in the heading: which app the comments are about. */
  readonly appName: string;
  /** The app's directory from the repo root (`apps/web`); prefixes every source path. */
  readonly appDir?: string | undefined;
  /** Include the props/state snapshots. */
  readonly includeData: boolean;
  readonly now: Date;
}

/** Past this, a component's data block is printed compact, then cut. */
const DATA_BLOCK_MAX = 3000;

/**
 * The Markdown handed to the coding agent. It is written FOR the agent: what to do comes
 * first, then one section per comment with the facts it needs to find the code without
 * searching — the source line before the selector, the selector before the text.
 */
export function buildPrompt(annotations: readonly Annotation[], options: PromptOptions): string {
  const first = annotations[0]?.targets[0]?.page;
  const origin = first === undefined ? '' : new URL(first.url).origin;
  const lines: string[] = [
    `# UI change requests: ${options.appName} (${annotations.length} ${annotations.length === 1 ? 'comment' : 'comments'})`,
    '',
    `Dev environment ${origin}, recorded ${formatTime(options.now)}.` +
      (options.appDir ? ` The app lives in \`${options.appDir}\`; file paths are from the repo root.` : ''),
    '',
    'Work through the comments below one by one. Each names the selected element, where its JSX is in the source, ' +
      'the components around it' +
      (options.includeData ? ', and their props/state when the comment was made' : '') +
      '. The element\'s JSX location is exact; a component\'s "rendered at" location may point at an earlier render ' +
      'branch when React reused the component, so check it against the code. ' +
      'Open the source file before editing. If the line numbers have drifted, search by selector, element text and component name. ' +
      `Personal data has been replaced with \`${REDACTED}\`; never treat it as a real value. ` +
      'When done, summarise the changes by comment number.',
  ];
  annotations.forEach((annotation, index) => {
    lines.push('', '---', '', ...section(annotation, index + 1, options));
  });
  return `${lines.join('\n')}\n`;
}

const KIND_NOTE: Readonly<Record<AnnotationKind, string | null>> = {
  element: null,
  text: null,
  group: 'The comment applies to ALL of the elements below.',
  area: 'A comment on an area of the screen: the first element contains the area, the others lie wholly inside it.',
};

function section(annotation: Annotation, number: number, options: PromptOptions): string[] {
  const page = annotation.targets[0]?.page;
  const out: string[] = [
    `## ${number}. ${headline(annotation.comment)}`,
    '',
    ...annotation.comment.split('\n').map((line) => `> ${line}`),
    '',
  ];
  if (page !== undefined) {
    out.push(`- **Page:** \`${page.pathname}${page.search}\`${page.title ? `, title "${page.title}"` : ''}`);
  }
  const note = KIND_NOTE[annotation.kind];
  if (note !== null) out.push(`- **Kind:** ${note}`);
  if (annotation.selectedText !== undefined) out.push(`- **Selected text:** "${annotation.selectedText}"`);
  if (annotation.area !== undefined) {
    const { area } = annotation;
    out.push(`- **Area:** ${area.width}×${area.height} at (${area.x}, ${area.y}) in the viewport`);
  }

  if (annotation.kind !== 'area' && annotation.targets.length === 1 && annotation.targets[0] !== undefined) {
    out.push(...targetLines(annotation.targets[0], options));
    out.push(...dataBlocks(annotation.targets[0], options));
    return out;
  }
  annotation.targets.forEach((target, index) => {
    const label = annotation.kind !== 'area' ? `Element ${index + 1}` : index === 0 ? 'Container' : `Inside the area ${index}`;
    out.push('', `### ${number}.${index + 1} ${label}`, '', ...targetLines(target, options));
    out.push(...dataBlocks(target, options));
  });
  if (annotation.kind === 'area' && annotation.targets.length === 1) {
    out.push('', '_No element lies wholly inside the area: it is empty space within the container._');
  }
  return out;
}

function targetLines(capture: ElementCapture, options: PromptOptions): string[] {
  const { element } = capture;
  const out: string[] = [`- **Element:** \`${element.opening}\`${element.text ? `, text "${element.text}"` : ''}`];
  if (element.accessibility !== null) out.push(`- **Role (a11y):** ${element.accessibility}`);
  if (element.section !== null) out.push(`- **Section:** ${element.section}`);
  if (element.nearby !== null) out.push(`- **Nearby:** ${element.nearby}`);
  if (element.value !== null) out.push(`- **Current input value:** "${element.value}"`);
  out.push(`- **Selector:** \`${element.selector}\``);
  out.push(`- **Element JSX:** ${capture.jsx === null ? 'could not be located' : location(capture.jsx, options.appDir)}`);
  if (capture.components.length > 0) {
    const chain = capture.components.map((component) =>
      component.renderedAt === null
        ? `\`${component.name}\``
        : `\`${component.name}\` (rendered at ${location(component.renderedAt, options.appDir)})`,
    );
    out.push(`- **Components, nearest first:** ${chain.join(' ← ')}`);
  }
  out.push(
    `- **Position:** ${element.rect.width}×${element.rect.height} at (${element.rect.x}, ${element.rect.y}); ` +
      `viewport ${capture.viewport.width}×${capture.viewport.height} @${capture.viewport.devicePixelRatio}x`,
  );
  const styles = Object.entries(element.styles);
  if (styles.length > 0) out.push(`- **Current style:** ${styles.map(([key, value]) => `${key}: ${value}`).join('; ')}`);
  return out;
}

function dataBlocks(capture: ElementCapture, options: PromptOptions): string[] {
  if (!options.includeData) return [];
  return capture.data.flatMap((block) => [
    '',
    `**Data of \`${block.component}\`** (state in hook call order):`,
    '',
    '```json',
    dataJson(block),
    '```',
  ]);
}

function dataJson(block: ElementCapture['data'][number]): string {
  const value = { props: block.props, state: block.state };
  const pretty = JSON.stringify(value, null, 2);
  if (pretty.length <= DATA_BLOCK_MAX) return pretty;
  const compact = JSON.stringify(value);
  return compact.length <= DATA_BLOCK_MAX ? compact : `${compact.slice(0, DATA_BLOCK_MAX)} … (truncated)`;
}

function location(source: SourceLocation, appDir: string | undefined): string {
  const file = repoPath(source.file, appDir);
  const position = source.column === null ? `${source.line}` : `${source.line}:${source.column}`;
  return `\`${file}:${position}\`${source.mapped ? '' : ' (line in the bundled output, approximate)'}`;
}

/**
 * `src/x.tsx` with `apps/web` → `apps/web/src/x.tsx`; `../../node_modules/…`
 * collapses; an absolute path (Turbopack) is cut back to the repo root at the app directory.
 */
export function repoPath(file: string, appDir: string | undefined): string {
  if (!appDir || /^[a-z]+:/i.test(file)) return file;
  if (file.startsWith('/')) {
    const at = file.lastIndexOf(`/${appDir}/`);
    return at === -1 ? file : file.slice(at + 1);
  }
  const parts: string[] = [];
  for (const part of `${appDir}/${file}`.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function headline(comment: string): string {
  const first = comment.trim().split('\n')[0] ?? '';
  return first.length <= 70 ? first : `${first.slice(0, 70)}…`;
}

function formatTime(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
