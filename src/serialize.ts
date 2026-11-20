/**
 * Turns live React props and state into a small JSON-safe value for the prompt, with
 * personal data removed. The prompt is pasted into an AI agent, so whatever this lets
 * through leaves the machine: a dev database can still hold a copy of real customer data.
 *
 * Two independent screens:
 * - by KEY: a property whose name says it holds personal data or a secret is replaced
 *   whole, whatever its value;
 * - by VALUE: inside every string, an e-mail address, a Vietnamese phone number or a
 *   12-digit citizen ID is replaced where it stands, so text that merely mentions one
 *   (an element's label, a free-text note) is screened too.
 *
 * Amounts survive on purpose: they are what a UI bug is usually about, and no money
 * figure starts with 0, which is what the phone and ID patterns require.
 */

export const REDACTED = '[redacted]';

/** Matched against the key lower-cased with `_`, `-` and spaces removed. */
const PII_KEY =
  /(nationalid|cccd|cmnd|citizenid|identitynumber|idnumber|idcard|passport|phone|mobile|msisdn|zalo|email|fullname|(debtor|borrower|customer|guarantor|contact|person|holder|relative|spouse|recipient|payer)name|address|dob|dateofbirth|birthday|birthdate|bankaccount|accountnumber|cardnumber|password|passwd|secret|token|otp|apikey|authorization|cookie|signature)/;

const PII_VALUE: readonly RegExp[] = [
  /[^\s@<>()[\]"']+@[^\s@<>()[\]"']+\.[a-z]{2,}/gi,
  // +84 or 0, then 9–10 digits, optionally grouped by spaces or dots.
  /(?<!\d)(?:\+?84|0)(?:[\s.]?\d){9,10}(?!\d)/g,
  // CCCD: 12 digits, starting with the 0 of a province code.
  /(?<!\d)0\d{11}(?!\d)/g,
];

export function isPiiKey(key: string): boolean {
  return PII_KEY.test(key.toLowerCase().replace(/[\s_-]/g, ''));
}

export function redactText(text: string): string {
  return PII_VALUE.reduce((out, pattern) => out.replace(pattern, REDACTED), text);
}

export interface SerializeLimits {
  /** Nesting levels below the root before an object collapses to a summary. */
  readonly depth: number;
  /** Properties kept per object. */
  readonly keys: number;
  /** Items kept per array, Map or Set. */
  readonly items: number;
  /** Characters kept per string. */
  readonly string: number;
}

export const DEFAULT_LIMITS: SerializeLimits = { depth: 4, keys: 25, items: 5, string: 160 };

/** Props React adds or that only repeat the tree; noise in a prompt. */
const SKIPPED_KEYS = new Set(['children', 'ref', 'key', '$$typeof', '_owner', '_store']);

const REACT_ELEMENT_TYPES = new Set([Symbol.for('react.transitional.element'), Symbol.for('react.element')]);

export type Snapshot = null | boolean | number | string | readonly Snapshot[] | { readonly [key: string]: Snapshot };

export function toSnapshot(value: unknown, limits: SerializeLimits = DEFAULT_LIMITS): Snapshot {
  return walk(value, 0, limits, new Set());
}

function walk(value: unknown, depth: number, limits: SerializeLimits, path: Set<object>): Snapshot {
  switch (typeof value) {
    case 'undefined':
      return '<undefined>';
    case 'boolean':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : String(value);
    case 'bigint':
      return `${value}n`;
    case 'string':
      return truncate(redactText(value), limits.string);
    case 'symbol':
      return value.toString();
    case 'function':
      return `ƒ ${value.name || 'anonymous'}()`;
    default:
      break;
  }
  if (value === null) return null;
  const object = value as object;
  if (path.has(object)) return '<circular>';
  const summary = summarise(object);
  if (summary !== null) return summary;

  path.add(object);
  try {
    if (Array.isArray(object)) return walkList(object, object.length, depth, limits, path);
    if (object instanceof Set) return { '<Set>': walkList([...object], object.size, depth, limits, path) };
    if (object instanceof Map) {
      if (depth >= limits.depth) return `<Map(${object.size})>`;
      const entries: Record<string, Snapshot> = {};
      let kept = 0;
      for (const [key, entry] of object) {
        if (kept === limits.items) {
          entries['…'] = `+${object.size - kept}`;
          break;
        }
        const name = typeof key === 'string' ? key : String(walk(key, limits.depth, limits, path));
        entries[name] = isPiiKey(name) ? redactWhole(entry) : walk(entry, depth + 1, limits, path);
        kept += 1;
      }
      return { '<Map>': entries };
    }
    return walkObject(object as Record<string, unknown>, depth, limits, path);
  } finally {
    path.delete(object);
  }
}

function walkList(
  items: readonly unknown[],
  size: number,
  depth: number,
  limits: SerializeLimits,
  path: Set<object>,
): Snapshot {
  if (depth >= limits.depth) return `<Array(${size})>`;
  const kept = items.slice(0, limits.items).map((item) => walk(item, depth + 1, limits, path));
  return size > limits.items ? [...kept, `… +${size - limits.items}`] : kept;
}

function walkObject(
  object: Record<string, unknown>,
  depth: number,
  limits: SerializeLimits,
  path: Set<object>,
): Snapshot {
  const keys = Object.keys(object).filter((key) => !SKIPPED_KEYS.has(key) && !key.startsWith('__react'));
  if (depth >= limits.depth) return keys.length === 0 ? {} : `{…${keys.length} keys}`;
  const out: Record<string, Snapshot> = {};
  for (const key of keys.slice(0, limits.keys)) {
    let entry: unknown;
    try {
      entry = object[key];
    } catch {
      out[key] = '<getter threw>';
      continue;
    }
    out[key] = isPiiKey(key) ? redactWhole(entry) : walk(entry, depth + 1, limits, path);
  }
  if (keys.length > limits.keys) out['…'] = `+${keys.length - limits.keys} keys`;
  return out;
}

/**
 * A PII key's value is replaced whole, except an EMPTY one: "the phone is missing" is a
 * fact worth seeing when the bug is a blank field, and it discloses nothing.
 */
function redactWhole(value: unknown): Snapshot {
  if (value === null) return null;
  if (value === undefined) return '<undefined>';
  if (value === '') return '';
  return REDACTED;
}

/** A one-line stand-in for values whose insides would only be noise, or `null` to walk it. */
function summarise(object: object): string | null {
  if (REACT_ELEMENT_TYPES.has((object as { $$typeof?: symbol }).$$typeof as symbol)) {
    return `<${typeName((object as { type?: unknown }).type)} />`;
  }
  if (object instanceof Date) return Number.isNaN(object.getTime()) ? '<Invalid Date>' : object.toISOString();
  if (object instanceof Error) return `<${object.name}: ${truncate(redactText(object.message), 120)}>`;
  if (object instanceof RegExp) return object.toString();
  if (typeof Node !== 'undefined' && object instanceof Node) return `<${nodeLabel(object)}>`;
  if (typeof (object as { then?: unknown }).then === 'function') return '<Promise>';
  if (ArrayBuffer.isView(object)) return `<${object.constructor.name}(${object.byteLength} bytes)>`;
  if (object instanceof ArrayBuffer) return `<ArrayBuffer(${object.byteLength} bytes)>`;
  if (Array.isArray(object) || object instanceof Map || object instanceof Set) return null;
  // A class instance (a query observer, an editor, a client) is machinery, not data:
  // name it and stop. Plain objects — what an API returns — are walked.
  const proto: unknown = Object.getPrototypeOf(object);
  if (proto !== null && proto !== Object.prototype) {
    const name = (object.constructor as { name?: string } | undefined)?.name;
    return `<${name || 'object'}>`;
  }
  return null;
}

function nodeLabel(node: Node): string {
  if (typeof Element !== 'undefined' && node instanceof Element) {
    const id = node.id ? `#${node.id}` : '';
    return `${node.tagName.toLowerCase()}${id}`;
  }
  return node.nodeName.toLowerCase();
}

export function typeName(type: unknown): string {
  if (typeof type === 'string') return type;
  if (typeof type === 'function') {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName || fn.name || 'Anonymous';
  }
  if (typeof type === 'object' && type !== null) {
    const wrapper = type as { displayName?: string; render?: unknown; type?: unknown };
    if (wrapper.displayName) return wrapper.displayName;
    if (wrapper.render !== undefined) return typeName(wrapper.render);
    if (wrapper.type !== undefined) return typeName(wrapper.type);
  }
  return 'Anonymous';
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}… (+${text.length - max} chars)`;
}
