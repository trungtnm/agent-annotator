import { REDACTED, redactText, truncate } from './serialize';

/** Ancestors climbed before the selector settles for what it has. */
const MAX_DEPTH = 6;

const TEST_ID_ATTRIBUTES = ['data-testid', 'data-test', 'data-qa', 'data-cy', 'data-component'] as const;

/**
 * A CSS selector an agent can paste into `document.querySelector`, or grep for. It
 * anchors on the nearest unique id or test id, which survives a re-render, and falls
 * back to `tag:nth-of-type` steps. Classes are left out on purpose: with Tailwind they
 * are layout, not identity, and change with the very edit being asked for.
 */
export function cssSelector(element: Element): string {
  const doc = element.ownerDocument;
  const steps: string[] = [];
  let current: Element | null = element;
  while (current !== null && current !== doc.documentElement && steps.length < MAX_DEPTH) {
    const anchor = uniqueAnchor(current, doc);
    if (anchor !== null) {
      steps.unshift(anchor);
      return steps.join(' > ');
    }
    steps.unshift(positionalStep(current));
    current = current.parentElement;
  }
  return steps.join(' > ');
}

function uniqueAnchor(element: Element, doc: Document): string | null {
  // React `useId` ids (`«r1»`, `:r1:`) change between renders and builds; skip them.
  if (element.id && !/[«:]/.test(element.id)) {
    const selector = `#${escapeCss(element.id)}`;
    if (doc.querySelectorAll(selector).length === 1) return selector;
  }
  for (const attribute of TEST_ID_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (value) {
      const selector = `[${attribute}="${value.replace(/"/g, '\\"')}"]`;
      if (doc.querySelectorAll(selector).length === 1) return selector;
    }
  }
  return null;
}

function positionalStep(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const parent = element.parentElement;
  if (parent === null) return tag;
  const sameTag = Array.from(parent.children).filter((sibling) => sibling.tagName === element.tagName);
  return sameTag.length === 1 ? tag : `${tag}:nth-of-type(${sameTag.indexOf(element) + 1})`;
}

function escapeCss(value: string): string {
  const native = (globalThis as { CSS?: { escape?: (value: string) => string } }).CSS?.escape;
  return native ? native(value) : value.replace(/([^\w-])/g, '\\$1');
}

/** The attributes that tell an agent what an element IS, in the order worth reading. */
const DESCRIBED_ATTRIBUTES = [
  'id',
  'role',
  'type',
  'name',
  'href',
  'aria-label',
  'placeholder',
  'title',
  'alt',
  ...TEST_ID_ATTRIBUTES,
] as const;

/** `<button type="submit" aria-label="Save" class="…">`: the opening tag, abridged and screened. */
export function describeElement(element: Element): string {
  const parts = [element.tagName.toLowerCase()];
  for (const attribute of DESCRIBED_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (value) parts.push(`${attribute}="${truncate(redactText(value), 60)}"`);
  }
  const className = element.getAttribute('class');
  if (className) parts.push(`class="${truncate(className.trim().replace(/\s+/g, ' '), 120)}"`);
  return `<${parts.join(' ')}>`;
}

/** The element's visible text, whitespace collapsed, screened, cut to `max`. */
export function elementText(element: Element, max = 120): string {
  // innerText keeps the breaks between blocks ("Title" + "Body", not "TitleBody");
  // textContent is the fallback where there is no layout (tests).
  const raw = element instanceof HTMLElement && typeof element.innerText === 'string' ? element.innerText : element.textContent;
  const text = (raw ?? '').replace(/\s+/g, ' ').trim();
  return truncate(redactText(text), max);
}

/** The current value of a form control, which `textContent` never shows. */
export function controlValue(element: Element): string | null {
  if (element instanceof HTMLInputElement) {
    if (element.type === 'password') return REDACTED;
    if (element.type === 'checkbox' || element.type === 'radio') return element.checked ? 'checked' : 'unchecked';
    return truncate(redactText(element.value), 120);
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return truncate(redactText(element.value), 120);
  }
  return null;
}
