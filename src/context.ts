import { redactText, truncate } from './serialize';

/**
 * What an element is to a user, and where on the page it sits, in words an agent can
 * search the source for: the accessible role and name ("button Save"), and the labels of
 * the sections enclosing it ("Debt batches › New batch"). A selector says WHERE in the DOM; this
 * says which part of the SCREEN, which is how the source is organised.
 */

const IMPLICIT_ROLES: Readonly<Record<string, string>> = {
  a: 'link',
  article: 'article',
  aside: 'complementary',
  button: 'button',
  dialog: 'dialog',
  form: 'form',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  img: 'img',
  li: 'listitem',
  main: 'main',
  nav: 'navigation',
  ol: 'list',
  option: 'option',
  select: 'combobox',
  table: 'table',
  td: 'cell',
  textarea: 'textbox',
  th: 'columnheader',
  tr: 'row',
  ul: 'list',
};

const INPUT_ROLES: Readonly<Record<string, string>> = {
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  search: 'searchbox',
  submit: 'button',
  button: 'button',
  number: 'spinbutton',
};

const STATES = ['aria-expanded', 'aria-selected', 'aria-checked', 'aria-pressed', 'aria-current', 'aria-invalid', 'aria-busy'];

function roleOf(element: Element): string | null {
  const explicit = element.getAttribute('role');
  if (explicit) return explicit;
  const tag = element.tagName.toLowerCase();
  if (tag === 'input') return INPUT_ROLES[(element as HTMLInputElement).type] ?? 'textbox';
  if (tag === 'a' && !element.hasAttribute('href')) return null;
  return IMPLICIT_ROLES[tag] ?? null;
}

function textOfIds(element: Element, ids: string): string {
  return ids
    .split(/\s+/)
    .map((id) => visibleText(element.ownerDocument.getElementById(id)))
    .join(' ');
}

function accessibleName(element: Element): string {
  const label = element.getAttribute('aria-label');
  if (label) return label;
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) return textOfIds(element, labelledBy);
  const labels = (element as HTMLInputElement).labels;
  if (labels && labels.length > 0) return Array.from(labels, (node) => visibleText(node)).join(' ');
  return element.getAttribute('alt') ?? element.getAttribute('title') ?? visibleText(element);
}

function clean(text: string, max: number): string {
  return truncate(redactText(text.replace(/\s+/g, ' ').trim()), max);
}

/** `button "Save" (disabled, aria-expanded=false)`, or `null` for an element with no role. */
export function describeAccessibility(element: Element): string | null {
  const role = roleOf(element);
  if (role === null) return null;
  const name = clean(accessibleName(element), 80);
  const states: string[] = [];
  if ((element as HTMLButtonElement).disabled === true || element.getAttribute('aria-disabled') === 'true') {
    states.push('disabled');
  }
  for (const state of STATES) {
    const value = element.getAttribute(state);
    if (value !== null) states.push(`${state}=${value}`);
  }
  return `${role}${name ? ` "${name}"` : ''}${states.length > 0 ? ` (${states.join(', ')})` : ''}`;
}

const SECTIONS = 'section, form, fieldset, dialog, [role="dialog"], table, article, aside, nav, [aria-label], [aria-labelledby]';
const SECTION_TITLE = ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > legend, :scope > caption, :scope > header h1, :scope > header h2, :scope > header h3, :scope > div > h1, :scope > div > h2, :scope > div > h3';
const MAX_SECTIONS = 3;

function sectionLabel(section: Element): string | null {
  const label = section.getAttribute('aria-label');
  if (label) return label;
  const labelledBy = section.getAttribute('aria-labelledby');
  if (labelledBy) return textOfIds(section, labelledBy);
  const title = section.querySelector(SECTION_TITLE);
  return title === null ? null : visibleText(title);
}

/**
 * The page heading, then the labels of up to three enclosing sections, outermost first:
 * `Debt batches › New batch › Source file`. `null` when nothing on the way up is labelled.
 */
export function sectionPath(element: Element): string | null {
  const labels: string[] = [];
  for (let current = element.parentElement?.closest(SECTIONS) ?? null; current !== null && labels.length < MAX_SECTIONS; current = current.parentElement?.closest(SECTIONS) ?? null) {
    const label = sectionLabel(current);
    if (label) labels.unshift(clean(label, 50));
  }
  const pageHeading = element.ownerDocument.querySelector('h1');
  if (pageHeading && !pageHeading.contains(element)) {
    const heading = clean(visibleText(pageHeading), 50);
    if (heading && labels[0] !== heading) labels.unshift(heading);
  }
  const path = labels.filter((label) => label !== '');
  return path.length === 0 ? null : path.join(' › ');
}

/** The text just before and after the element, which tells two identical buttons apart. */
export function nearbyText(element: Element): string | null {
  const before = visibleText(element.previousElementSibling);
  const after = visibleText(element.nextElementSibling);
  const parts = [clean(before, 60), clean(after, 60)];
  if (parts[0] === '' && parts[1] === '') return null;
  return `before: "${parts[0]}" · after: "${parts[1]}"`;
}

/**
 * Text as the page shows it: `innerText` keeps the breaks between blocks ("Title" + "Body",
 * not "TitleBody"); `textContent` is the fallback where there is no layout (tests).
 */
function visibleText(node: Element | null | undefined): string {
  if (node === null || node === undefined) return '';
  const raw = node instanceof HTMLElement && typeof node.innerText === 'string' ? node.innerText : node.textContent;
  return (raw ?? '').replace(/\s+/g, ' ').trim();
}
