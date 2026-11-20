'use client';

// src/annotator.tsx
import { useCallback, useEffect as useEffect3, useRef as useRef3, useState as useState3 } from "react";
import { createPortal } from "react-dom";

// src/serialize.ts
var REDACTED = "[redacted]";
var PII_KEY = /(nationalid|cccd|cmnd|citizenid|identitynumber|idnumber|idcard|passport|phone|mobile|msisdn|zalo|email|fullname|(debtor|borrower|customer|guarantor|contact|person|holder|relative|spouse|recipient|payer)name|address|dob|dateofbirth|birthday|birthdate|bankaccount|accountnumber|cardnumber|password|passwd|secret|token|otp|apikey|authorization|cookie|signature)/;
var PII_VALUE = [
  /[^\s@<>()[\]"']+@[^\s@<>()[\]"']+\.[a-z]{2,}/gi,
  // +84 or 0, then 9–10 digits, optionally grouped by spaces or dots.
  /(?<!\d)(?:\+?84|0)(?:[\s.]?\d){9,10}(?!\d)/g,
  // CCCD: 12 digits, starting with the 0 of a province code.
  /(?<!\d)0\d{11}(?!\d)/g
];
function isPiiKey(key) {
  return PII_KEY.test(key.toLowerCase().replace(/[\s_-]/g, ""));
}
function redactText(text) {
  return PII_VALUE.reduce((out, pattern) => out.replace(pattern, REDACTED), text);
}
var DEFAULT_LIMITS = { depth: 4, keys: 25, items: 5, string: 160 };
var SKIPPED_KEYS = /* @__PURE__ */ new Set(["children", "ref", "key", "$$typeof", "_owner", "_store"]);
var REACT_ELEMENT_TYPES = /* @__PURE__ */ new Set([/* @__PURE__ */ Symbol.for("react.transitional.element"), /* @__PURE__ */ Symbol.for("react.element")]);
function toSnapshot(value, limits = DEFAULT_LIMITS) {
  return walk(value, 0, limits, /* @__PURE__ */ new Set());
}
function walk(value, depth, limits, path) {
  switch (typeof value) {
    case "undefined":
      return "<undefined>";
    case "boolean":
      return value;
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "bigint":
      return `${value}n`;
    case "string":
      return truncate(redactText(value), limits.string);
    case "symbol":
      return value.toString();
    case "function":
      return `\u0192 ${value.name || "anonymous"}()`;
    default:
      break;
  }
  if (value === null) return null;
  const object = value;
  if (path.has(object)) return "<circular>";
  const summary = summarise(object);
  if (summary !== null) return summary;
  path.add(object);
  try {
    if (Array.isArray(object)) return walkList(object, object.length, depth, limits, path);
    if (object instanceof Set) return { "<Set>": walkList([...object], object.size, depth, limits, path) };
    if (object instanceof Map) {
      if (depth >= limits.depth) return `<Map(${object.size})>`;
      const entries = {};
      let kept = 0;
      for (const [key, entry] of object) {
        if (kept === limits.items) {
          entries["\u2026"] = `+${object.size - kept}`;
          break;
        }
        const name = typeof key === "string" ? key : String(walk(key, limits.depth, limits, path));
        entries[name] = isPiiKey(name) ? redactWhole(entry) : walk(entry, depth + 1, limits, path);
        kept += 1;
      }
      return { "<Map>": entries };
    }
    return walkObject(object, depth, limits, path);
  } finally {
    path.delete(object);
  }
}
function walkList(items, size, depth, limits, path) {
  if (depth >= limits.depth) return `<Array(${size})>`;
  const kept = items.slice(0, limits.items).map((item) => walk(item, depth + 1, limits, path));
  return size > limits.items ? [...kept, `\u2026 +${size - limits.items}`] : kept;
}
function walkObject(object, depth, limits, path) {
  const keys = Object.keys(object).filter((key) => !SKIPPED_KEYS.has(key) && !key.startsWith("__react"));
  if (depth >= limits.depth) return keys.length === 0 ? {} : `{\u2026${keys.length} keys}`;
  const out = {};
  for (const key of keys.slice(0, limits.keys)) {
    let entry;
    try {
      entry = object[key];
    } catch {
      out[key] = "<getter threw>";
      continue;
    }
    out[key] = isPiiKey(key) ? redactWhole(entry) : walk(entry, depth + 1, limits, path);
  }
  if (keys.length > limits.keys) out["\u2026"] = `+${keys.length - limits.keys} keys`;
  return out;
}
function redactWhole(value) {
  if (value === null) return null;
  if (value === void 0) return "<undefined>";
  if (value === "") return "";
  return REDACTED;
}
function summarise(object) {
  if (REACT_ELEMENT_TYPES.has(object.$$typeof)) {
    return `<${typeName(object.type)} />`;
  }
  if (object instanceof Date) return Number.isNaN(object.getTime()) ? "<Invalid Date>" : object.toISOString();
  if (object instanceof Error) return `<${object.name}: ${truncate(redactText(object.message), 120)}>`;
  if (object instanceof RegExp) return object.toString();
  if (typeof Node !== "undefined" && object instanceof Node) return `<${nodeLabel(object)}>`;
  if (typeof object.then === "function") return "<Promise>";
  if (ArrayBuffer.isView(object)) return `<${object.constructor.name}(${object.byteLength} bytes)>`;
  if (object instanceof ArrayBuffer) return `<ArrayBuffer(${object.byteLength} bytes)>`;
  if (Array.isArray(object) || object instanceof Map || object instanceof Set) return null;
  const proto = Object.getPrototypeOf(object);
  if (proto !== null && proto !== Object.prototype) {
    const name = object.constructor?.name;
    return `<${name || "object"}>`;
  }
  return null;
}
function nodeLabel(node) {
  if (typeof Element !== "undefined" && node instanceof Element) {
    const id = node.id ? `#${node.id}` : "";
    return `${node.tagName.toLowerCase()}${id}`;
  }
  return node.nodeName.toLowerCase();
}
function typeName(type) {
  if (typeof type === "string") return type;
  if (typeof type === "function") {
    const fn = type;
    return fn.displayName || fn.name || "Anonymous";
  }
  if (typeof type === "object" && type !== null) {
    const wrapper = type;
    if (wrapper.displayName) return wrapper.displayName;
    if (wrapper.render !== void 0) return typeName(wrapper.render);
    if (wrapper.type !== void 0) return typeName(wrapper.type);
  }
  return "Anonymous";
}
function truncate(text, max) {
  return text.length <= max ? text : `${text.slice(0, max)}\u2026 (+${text.length - max} chars)`;
}

// src/context.ts
var IMPLICIT_ROLES = {
  a: "link",
  article: "article",
  aside: "complementary",
  button: "button",
  dialog: "dialog",
  form: "form",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  img: "img",
  li: "listitem",
  main: "main",
  nav: "navigation",
  ol: "list",
  option: "option",
  select: "combobox",
  table: "table",
  td: "cell",
  textarea: "textbox",
  th: "columnheader",
  tr: "row",
  ul: "list"
};
var INPUT_ROLES = {
  checkbox: "checkbox",
  radio: "radio",
  range: "slider",
  search: "searchbox",
  submit: "button",
  button: "button",
  number: "spinbutton"
};
var STATES = ["aria-expanded", "aria-selected", "aria-checked", "aria-pressed", "aria-current", "aria-invalid", "aria-busy"];
function roleOf(element) {
  const explicit = element.getAttribute("role");
  if (explicit) return explicit;
  const tag = element.tagName.toLowerCase();
  if (tag === "input") return INPUT_ROLES[element.type] ?? "textbox";
  if (tag === "a" && !element.hasAttribute("href")) return null;
  return IMPLICIT_ROLES[tag] ?? null;
}
function textOfIds(element, ids) {
  return ids.split(/\s+/).map((id) => visibleText(element.ownerDocument.getElementById(id))).join(" ");
}
function accessibleName(element) {
  const label = element.getAttribute("aria-label");
  if (label) return label;
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) return textOfIds(element, labelledBy);
  const labels = element.labels;
  if (labels && labels.length > 0) return Array.from(labels, (node) => visibleText(node)).join(" ");
  return element.getAttribute("alt") ?? element.getAttribute("title") ?? visibleText(element);
}
function clean(text, max) {
  return truncate(redactText(text.replace(/\s+/g, " ").trim()), max);
}
function describeAccessibility(element) {
  const role = roleOf(element);
  if (role === null) return null;
  const name = clean(accessibleName(element), 80);
  const states = [];
  if (element.disabled === true || element.getAttribute("aria-disabled") === "true") {
    states.push("disabled");
  }
  for (const state of STATES) {
    const value = element.getAttribute(state);
    if (value !== null) states.push(`${state}=${value}`);
  }
  return `${role}${name ? ` "${name}"` : ""}${states.length > 0 ? ` (${states.join(", ")})` : ""}`;
}
var SECTIONS = 'section, form, fieldset, dialog, [role="dialog"], table, article, aside, nav, [aria-label], [aria-labelledby]';
var SECTION_TITLE = ":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > legend, :scope > caption, :scope > header h1, :scope > header h2, :scope > header h3, :scope > div > h1, :scope > div > h2, :scope > div > h3";
var MAX_SECTIONS = 3;
function sectionLabel(section2) {
  const label = section2.getAttribute("aria-label");
  if (label) return label;
  const labelledBy = section2.getAttribute("aria-labelledby");
  if (labelledBy) return textOfIds(section2, labelledBy);
  const title = section2.querySelector(SECTION_TITLE);
  return title === null ? null : visibleText(title);
}
function sectionPath(element) {
  const labels = [];
  for (let current = element.parentElement?.closest(SECTIONS) ?? null; current !== null && labels.length < MAX_SECTIONS; current = current.parentElement?.closest(SECTIONS) ?? null) {
    const label = sectionLabel(current);
    if (label) labels.unshift(clean(label, 50));
  }
  const pageHeading = element.ownerDocument.querySelector("h1");
  if (pageHeading && !pageHeading.contains(element)) {
    const heading = clean(visibleText(pageHeading), 50);
    if (heading && labels[0] !== heading) labels.unshift(heading);
  }
  const path = labels.filter((label) => label !== "");
  return path.length === 0 ? null : path.join(" \u203A ");
}
function nearbyText(element) {
  const before = visibleText(element.previousElementSibling);
  const after = visibleText(element.nextElementSibling);
  const parts = [clean(before, 60), clean(after, 60)];
  if (parts[0] === "" && parts[1] === "") return null;
  return `before: "${parts[0]}" \xB7 after: "${parts[1]}"`;
}
function visibleText(node) {
  if (node === null || node === void 0) return "";
  const raw = node instanceof HTMLElement && typeof node.innerText === "string" ? node.innerText : node.textContent;
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

// src/fiber.ts
var FUNCTION_COMPONENT = 0;
var CLASS_COMPONENT = 1;
var FORWARD_REF = 11;
var MEMO_COMPONENT = 14;
var SIMPLE_MEMO_COMPONENT = 15;
var COMPONENT_TAGS = /* @__PURE__ */ new Set([FUNCTION_COMPONENT, CLASS_COMPONENT, FORWARD_REF, MEMO_COMPONENT, SIMPLE_MEMO_COMPONENT]);
var FRAMEWORK_COMPONENTS = /* @__PURE__ */ new Set([
  "AppDevOverlay",
  "AppDevOverlayErrorBoundary",
  "AppRouter",
  "ClientPageRoot",
  "ClientSegmentRoot",
  "DevRootHTTPAccessFallbackBoundary",
  "ErrorBoundary",
  "ErrorBoundaryHandler",
  "GlobalError",
  "HTTPAccessFallbackBoundary",
  "HTTPAccessFallbackErrorBoundary",
  "HandleRedirect",
  "Head",
  "HistoryUpdater",
  "HotReload",
  "InnerLayoutRouter",
  "InnerScrollAndFocusHandler",
  "LayoutRouter",
  "LoadingBoundary",
  "MetadataBoundary",
  "MetadataOutlet",
  "OuterLayoutRouter",
  "OutletBoundary",
  "RedirectBoundary",
  "RedirectErrorBoundary",
  "RenderFromTemplateContext",
  "ReplaySsrOnlyErrors",
  "Root",
  "RootErrorBoundary",
  "Router",
  "RuntimeStyles",
  "ScrollAndFocusHandler",
  "SegmentStateProvider",
  "SegmentViewNode",
  "ServerRoot",
  "ViewportBoundary",
  "DevAnnotator"
]);
function fiberOf(node) {
  let current = node;
  while (current !== null) {
    for (const key of Object.keys(current)) {
      if (key.startsWith("__reactFiber$")) return current[key] ?? null;
    }
    current = current.parentNode;
  }
  return null;
}
function isComponent(fiber) {
  return COMPONENT_TAGS.has(fiber.tag);
}
function componentName(fiber) {
  return typeName(fiber.elementType ?? fiber.type);
}
function componentAncestors(fiber, limit = 12) {
  const out = [];
  let previousName = null;
  for (let current = fiber; current !== null && out.length < limit; current = current.return) {
    if (!isComponent(current)) continue;
    const name = componentName(current);
    if (FRAMEWORK_COMPONENTS.has(name) || name.startsWith("__next") || name === "Anonymous" || name === previousName) {
      continue;
    }
    out.push(current);
    previousName = name;
  }
  return out;
}
function componentState(fiber) {
  if (fiber.tag === CLASS_COMPONENT) {
    return fiber.memoizedState === null || fiber.memoizedState === void 0 ? [] : [fiber.memoizedState];
  }
  const values = [];
  let hook = fiber.memoizedState;
  while (hook !== null && typeof hook === "object" && "next" in hook) {
    if (hook.queue !== null && hook.queue !== void 0) values.push(hook.memoizedState);
    hook = hook.next;
  }
  return values;
}
function debugStackOf(fiber) {
  const stack = fiber._debugStack;
  if (stack instanceof Error) return stack.stack ?? null;
  return typeof stack === "string" ? stack : null;
}

// src/selector.ts
var MAX_DEPTH = 6;
var TEST_ID_ATTRIBUTES = ["data-testid", "data-test", "data-qa", "data-cy", "data-component"];
function cssSelector(element) {
  const doc = element.ownerDocument;
  const steps = [];
  let current = element;
  while (current !== null && current !== doc.documentElement && steps.length < MAX_DEPTH) {
    const anchor = uniqueAnchor(current, doc);
    if (anchor !== null) {
      steps.unshift(anchor);
      return steps.join(" > ");
    }
    steps.unshift(positionalStep(current));
    current = current.parentElement;
  }
  return steps.join(" > ");
}
function uniqueAnchor(element, doc) {
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
function positionalStep(element) {
  const tag = element.tagName.toLowerCase();
  const parent = element.parentElement;
  if (parent === null) return tag;
  const sameTag = Array.from(parent.children).filter((sibling) => sibling.tagName === element.tagName);
  return sameTag.length === 1 ? tag : `${tag}:nth-of-type(${sameTag.indexOf(element) + 1})`;
}
function escapeCss(value) {
  const native = globalThis.CSS?.escape;
  return native ? native(value) : value.replace(/([^\w-])/g, "\\$1");
}
var DESCRIBED_ATTRIBUTES = [
  "id",
  "role",
  "type",
  "name",
  "href",
  "aria-label",
  "placeholder",
  "title",
  "alt",
  ...TEST_ID_ATTRIBUTES
];
function describeElement(element) {
  const parts = [element.tagName.toLowerCase()];
  for (const attribute of DESCRIBED_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (value) parts.push(`${attribute}="${truncate(redactText(value), 60)}"`);
  }
  const className = element.getAttribute("class");
  if (className) parts.push(`class="${truncate(className.trim().replace(/\s+/g, " "), 120)}"`);
  return `<${parts.join(" ")}>`;
}
function elementText(element, max = 120) {
  const raw = element instanceof HTMLElement && typeof element.innerText === "string" ? element.innerText : element.textContent;
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  return truncate(redactText(text), max);
}
function controlValue(element) {
  if (element instanceof HTMLInputElement) {
    if (element.type === "password") return REDACTED;
    if (element.type === "checkbox" || element.type === "radio") return element.checked ? "checked" : "unchecked";
    return truncate(redactText(element.value), 120);
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return truncate(redactText(element.value), 120);
  }
  return null;
}

// src/source-map.ts
var BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var DIGIT = new Map([...BASE64].map((char, index) => [char, index]));
function decodeVlq(segment) {
  const values = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = DIGIT.get(char);
    if (digit === void 0) return values;
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
      continue;
    }
    values.push(value & 1 ? -(value >> 1) : value >> 1);
    value = 0;
    shift = 0;
  }
  return values;
}
function lookupPlain(map, line, column) {
  let source = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  const lines = map.mappings.split(";");
  for (let current = 0; current <= line && current < lines.length; current++) {
    let generated = 0;
    let best = null;
    for (const segment of (lines[current] ?? "").split(",")) {
      if (segment === "") continue;
      const fields = decodeVlq(segment);
      generated += fields[0] ?? 0;
      if (fields.length < 4) continue;
      source += fields[1] ?? 0;
      sourceLine += fields[2] ?? 0;
      sourceColumn += fields[3] ?? 0;
      const name = map.sources[source];
      if (current === line && generated <= column && name !== void 0) {
        best = { source: name, line: sourceLine, column: sourceColumn };
      }
    }
    if (current === line) return best;
  }
  return null;
}
function originalPosition(map, line1, column1) {
  const line = line1 - 1;
  const column = column1 - 1;
  if (!("sections" in map)) return lookupPlain(map, line, column);
  let hit;
  for (const section2 of map.sections) {
    const { offset } = section2;
    if (offset.line < line || offset.line === line && offset.column <= column) hit = section2;
    else break;
  }
  if (hit === void 0) return null;
  const inLine = line - hit.offset.line;
  return lookupPlain(hit.map, inLine, inLine === 0 ? column - hit.offset.column : column);
}
function sourcePath(source) {
  if (source.startsWith("file://")) return decodeURIComponent(source.slice("file://".length));
  if (/^https?:\/\//.test(source)) {
    const path = decodeURIComponent(new URL(source).pathname);
    return path.startsWith("/@fs/") ? path.slice("/@fs".length) : path.replace(/^\//, "");
  }
  if (/^turbopack:\/\/\/\[turbopack\]/.test(source)) return null;
  return source;
}
var TIMEOUT_MS = 3e3;
function createSourceMapLookup(fetchImpl) {
  const maps = /* @__PURE__ */ new Map();
  const load = (url) => {
    let pending = maps.get(url);
    if (pending === void 0) {
      pending = fetchMap(fetchImpl, `${url.replace(/[?#].*$/, "")}.map`).then(
        (beside) => beside ?? mapFromScript(fetchImpl, url)
      );
      maps.set(url, pending);
    }
    return pending;
  };
  return async (frame) => {
    if (!/^https?:\/\//.test(frame.file)) return null;
    const map = await load(frame.file.replace(/#.*$/, ""));
    if (map === null) return null;
    const original = originalPosition(map, frame.line1, frame.column1);
    const file = original === null ? null : sourcePath(original.source);
    if (original === null || file === null) return null;
    return {
      file,
      line: original.line + 1,
      column: original.column + 1,
      mapped: true,
      .../(?:^|\/)node_modules\//.test(file) ? { ignored: true } : {}
    };
  };
}
var MAPPING_URL = /\/\/[#@] sourceMappingURL=(\S+)\s*$/;
async function mapFromScript(fetchImpl, url) {
  const script = await fetchText(fetchImpl, url);
  const tail = script?.slice(-2e5).trimEnd();
  const reference = tail === void 0 ? void 0 : MAPPING_URL.exec(tail)?.[1];
  if (reference === void 0) return null;
  const inline = /^data:application\/json(?:;charset=[^;,]+)?;base64,(.*)$/i.exec(reference);
  if (inline?.[1] !== void 0) {
    try {
      const bytes = Uint8Array.from(atob(inline[1]), (char) => char.charCodeAt(0));
      return asSourceMap(JSON.parse(new TextDecoder().decode(bytes)), url);
    } catch {
      return null;
    }
  }
  try {
    return await fetchMap(fetchImpl, new URL(reference, url).href);
  } catch {
    return null;
  }
}
async function fetchText(fetchImpl, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
function asSourceMap(body, base) {
  if (typeof body !== "object" || body === null) return null;
  if ("sections" in body && Array.isArray(body.sections)) return body;
  if (!("mappings" in body) || !("sources" in body) || !Array.isArray(body.sources)) return null;
  const root = "sourceRoot" in body && typeof body.sourceRoot === "string" ? body.sourceRoot : "";
  const prefix = root === "" || root.endsWith("/") ? root : `${root}/`;
  const relative = (source) => !/^[a-z]+:|^\//i.test(source);
  const sources = body.sources.map((source) => {
    if (typeof source !== "string") return source;
    const rooted = relative(source) ? `${prefix}${source}` : source;
    if (base === void 0 || !relative(rooted)) return rooted;
    try {
      return new URL(rooted, base).href;
    } catch {
      return rooted;
    }
  });
  return { ...body, sources };
}
async function fetchMap(fetchImpl, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) return null;
    return asSourceMap(await response.json(), url);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// src/stack.ts
var CHROME_FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
var FIREFOX_FRAME = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/;
function parseStack(stack) {
  const frames = [];
  for (const line of stack.split("\n")) {
    const match = CHROME_FRAME.exec(line) ?? FIREFOX_FRAME.exec(line);
    if (match === null) continue;
    const [, methodName, file, line1, column1] = match;
    if (file === void 0 || line1 === void 0 || column1 === void 0) continue;
    frames.push({ file, line1: Number(line1), column1: Number(column1), methodName: methodName ?? "" });
  }
  return frames;
}
var REACT_FRAME = /(?:^|[/\\])(?:react|react-dom|scheduler)(?:[/\\]|@)|react-jsx-(?:dev-)?runtime|react\.development|react-dom[^/\\]*\.development|next[/\\]dist[/\\]compiled[/\\]react/;
var REACT_METHOD = /^(?:exports\.)?(?:jsxDEV|jsxs?|createElement|react-stack-top-frame)$|^Object\.(?:jsxDEV|jsxs?)$/;
function callSiteFrame(stack) {
  for (const frame of parseStack(stack)) {
    if (REACT_METHOD.test(frame.methodName) || REACT_FRAME.test(frame.file)) continue;
    return frame;
  }
  return null;
}
function bundledPath(file) {
  const internal = /^webpack-internal:\/\/\/(?:\([^)]*\)\/)?(?:\.\/)?(.*)$/.exec(file);
  if (internal?.[1]) return internal[1];
  if (file.startsWith("file://")) return decodeURIComponent(file.slice("file://".length));
  return file;
}
function unmapped(frame) {
  return { file: bundledPath(frame.file), line: frame.line1, column: frame.column1, mapped: false };
}
var NEXT_ENDPOINT = "/__nextjs_original-stack-frames";
var TIMEOUT_MS2 = 3e3;
function createNextResolver(fetchImpl = (...args) => fetch(...args)) {
  const cache = /* @__PURE__ */ new Map();
  const keyOf = (frame) => `${frame.file}:${frame.line1}:${frame.column1}`;
  const viaSourceMap = createSourceMapLookup(fetchImpl);
  return async (frames) => {
    const pending = frames.filter((frame) => !cache.has(keyOf(frame)));
    if (pending.length > 0) {
      const fromNext = await requestOriginalFrames(fetchImpl, pending);
      const mapped = await Promise.all(
        pending.map(async (frame, index) => fromNext[index] ?? await viaSourceMap(frame))
      );
      pending.forEach((frame, index) => cache.set(keyOf(frame), mapped[index] ?? unmapped(frame)));
    }
    return frames.map((frame) => cache.get(keyOf(frame)) ?? unmapped(frame));
  };
}
async function requestOriginalFrames(fetchImpl, frames) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS2);
  try {
    const response = await fetchImpl(NEXT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        frames: frames.map((frame) => ({ ...frame, arguments: [] })),
        isServer: false,
        isEdgeServer: false,
        isAppDirectory: true
      }),
      signal: controller.signal
    });
    if (!response.ok) return frames.map(() => null);
    const body = await response.json();
    if (!Array.isArray(body)) return frames.map(() => null);
    return frames.map((_, index) => toLocation(body[index]));
  } catch {
    return frames.map(() => null);
  } finally {
    clearTimeout(timer);
  }
}
function toLocation(entry) {
  const original = entry?.status === "fulfilled" ? entry.value?.originalStackFrame : null;
  if (!original?.file || typeof original.line1 !== "number") return null;
  if (/^(?:webpack-internal|https?):/.test(original.file)) return null;
  return {
    file: original.file,
    line: original.line1,
    column: original.column1 ?? null,
    mapped: true,
    ...original.ignored === true || /(?:^|\/)node_modules\//.test(original.file) ? { ignored: true } : {}
  };
}

// src/capture.ts
var STYLE_PROPERTIES = [
  "display",
  "position",
  "width",
  "height",
  "margin",
  "padding",
  "gap",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "color",
  "background-color",
  "border",
  "border-radius",
  "opacity",
  "overflow",
  "white-space"
];
var DEFAULT_STYLE_VALUES = /* @__PURE__ */ new Set(["none", "normal", "auto", "0px", "rgba(0, 0, 0, 0)", "visible", "static", "1"]);
var DATA_COMPONENTS = 2;
var LOCATED_COMPONENTS = 4;
async function captureElement(element, resolve, options = {}) {
  const win = element.ownerDocument.defaultView ?? window;
  const fiber = fiberOf(element);
  const components = fiber === null ? [] : componentAncestors(fiber);
  const sites = [fiber, ...components.slice(0, LOCATED_COMPONENTS)].map(
    (f) => f === null ? null : siteOf(f)
  );
  const wanted = sites.filter((site) => site !== null);
  const resolved = wanted.length > 0 ? await resolve(wanted) : [];
  const locations = new Map(wanted.map((site, index) => [site, resolved[index]]));
  const locate = (site) => {
    const location2 = site ? locations.get(site) : void 0;
    return location2 === void 0 || location2.ignored === true ? null : location2;
  };
  const rect = element.getBoundingClientRect();
  return {
    page: {
      url: win.location.href,
      pathname: win.location.pathname,
      search: win.location.search,
      title: element.ownerDocument.title
    },
    element: {
      tag: element.tagName.toLowerCase(),
      opening: describeElement(element),
      selector: cssSelector(element),
      text: elementText(element),
      value: controlValue(element),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      styles: notableStyles(win.getComputedStyle(element)),
      accessibility: describeAccessibility(element),
      section: sectionPath(element),
      nearby: nearbyText(element)
    },
    viewport: { width: win.innerWidth, height: win.innerHeight, devicePixelRatio: win.devicePixelRatio },
    jsx: locate(sites[0]),
    components: components.map((component, index) => ({
      name: componentName(component),
      renderedAt: locate(sites[index + 1])
    })),
    data: components.slice(0, options.dataComponents ?? DATA_COMPONENTS).map((component) => ({
      component: componentName(component),
      props: toSnapshot(component.memoizedProps),
      state: toSnapshot(componentState(component))
    }))
  };
}
function siteOf(fiber) {
  const stack = debugStackOf(fiber);
  return stack === null ? null : callSiteFrame(stack);
}
function notableStyles(style) {
  const out = {};
  for (const property of STYLE_PROPERTIES) {
    const value = style.getPropertyValue(property).trim();
    if (value && !DEFAULT_STYLE_VALUES.has(value)) out[property] = value;
  }
  return out;
}
function hoverLabel(element) {
  const fiber = fiberOf(element);
  const nearest = fiber === null ? void 0 : componentAncestors(fiber, 1)[0];
  const tag = element.tagName.toLowerCase();
  return nearest === void 0 ? tag : `${componentName(nearest)} \xB7 ${tag}`;
}

// src/callouts.ts
var CARD_WIDTH = 260;
var LINE_HEIGHT = 18;
var PADDING = 16;
var GAP = 6;
var MARGIN = 4;
var CARD_LINES = 4;
var CHARS_PER_LINE = 36;
function cardHeight(comment) {
  const lines = comment.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / CHARS_PER_LINE)), 0);
  return PADDING + LINE_HEIGHT * Math.min(CARD_LINES, Math.max(1, lines));
}
function overlaps(a, b) {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}
function layoutCallouts(targets, viewport) {
  const placed = [];
  const width = Math.min(CARD_WIDTH, viewport.width - 2 * MARGIN);
  const ordered = [...targets].sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
  for (const target of ordered) {
    const height = cardHeight(target.comment);
    const above = target.box.top - height - GAP;
    let top = above >= MARGIN ? above : target.box.top + target.box.height + GAP;
    const left = Math.min(Math.max(MARGIN, target.box.left), viewport.width - width - MARGIN);
    let card = { top, left, width, height };
    for (let moved = true; moved; ) {
      moved = false;
      for (const other of placed) {
        if (overlaps(card, other.card)) {
          top = other.card.top + other.card.height + GAP;
          card = { top, left, width, height };
          moved = true;
        }
      }
    }
    placed.push({ ...target, card: { ...card, top: Math.min(card.top, viewport.height - height - MARGIN) } });
  }
  return placed.sort((a, b) => a.number - b.number);
}

// src/icons.tsx
import { jsx } from "react/jsx-runtime";
var PATHS = {
  comment: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", "M12 7v6M9 10h6"],
  pause: ["M8 5v14M16 5v14"],
  play: ["M7 4l13 8-13 8z"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  camera: ["M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z", "M12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"],
  list: ["M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"],
  copy: ["M10 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z", "M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"],
  help: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"],
  arrow: ["M5 19L19 5", "M10 5h9v9"],
  rect: ["M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"],
  highlight: ["M9 11l-6 6v3h9l3-3", "M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"],
  pen: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  text: ["M4 7V4h16v3", "M9 20h6", "M12 4v16"],
  pixelate: ["M3 3h6v6H3z", "M15 3h6v6h-6z", "M9 9h6v6H9z", "M3 15h6v6H3z", "M15 15h6v6h-6z"],
  undo: ["M9 14L4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"],
  download: ["M12 3v12", "M7 10l5 5 5-5", "M5 21h14"],
  close: ["M18 6L6 18", "M6 6l12 12"],
  select: ["M4 3l7 17 2.5-7.5L21 10z"],
  redo: ["M15 14l5-5-5-5", "M20 9H9.5a5.5 5.5 0 0 0 0 11H13"],
  zoomIn: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M20 20l-4-4", "M11 8v6M8 11h6"],
  zoomOut: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M20 20l-4-4", "M8 11h6"],
  fit: ["M4 9V4h5", "M20 9V4h-5", "M4 15v5h5", "M20 15v5h-5"],
  eraser: ["M7 21h10", "M5 15l9-9 5 5-9 9H8z"],
  crop: ["M6 2v14a2 2 0 0 0 2 2h14", "M18 22V8a2 2 0 0 0-2-2H2"],
  cropOff: ["M6 2v14a2 2 0 0 0 2 2h14", "M18 22V8a2 2 0 0 0-2-2H2", "M3 3l18 18"],
  collapse: ["M9 6l6 6-6 6"],
  ruler: ["M3 17L17 3l4 4L7 21z", "M7 13l2 2", "M10 10l2 2", "M13 7l2 2"]
};
function Icon(props) {
  const size = props.size ?? 18;
  return /* @__PURE__ */ jsx(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      style: { display: "block", flex: "none" },
      children: PATHS[props.name].map((d) => /* @__PURE__ */ jsx("path", { d }, d))
    }
  );
}

// src/tooltip.tsx
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { jsx as jsx2, jsxs } from "react/jsx-runtime";
var FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
var DELAY_MS = 350;
var EDGE = 8;
var MOD_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "\u2318" : "Ctrl";
function Tooltip(props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const timer = useRef(null);
  const bubble = useRef(null);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const show = (delay) => {
    clear();
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clear();
    setOpen(false);
    setShift(0);
  };
  useEffect(() => clear, []);
  useLayoutEffect(() => {
    if (!open || bubble.current === null) return;
    const rect = bubble.current.getBoundingClientRect();
    if (rect.width === 0) return;
    if (rect.right > window.innerWidth - EDGE) setShift(window.innerWidth - EDGE - rect.right);
    else if (rect.left < EDGE) setShift(EDGE - rect.left);
  }, [open]);
  return /* @__PURE__ */ jsxs(
    "span",
    {
      style: { position: "relative", display: "inline-flex" },
      onPointerEnter: () => show(DELAY_MS),
      onPointerLeave: hide,
      onPointerDown: hide,
      onFocus: (event) => {
        if (focusVisible(event.target)) show(0);
      },
      onBlur: hide,
      children: [
        props.children(open ? id : void 0),
        open ? /* @__PURE__ */ jsxs(
          "span",
          {
            ref: bubble,
            id,
            role: "tooltip",
            style: {
              position: "absolute",
              left: "50%",
              [props.placement === "above" ? "bottom" : "top"]: "calc(100% + 8px)",
              transform: `translateX(calc(-50% + ${shift}px))`,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              width: "max-content",
              maxWidth: 260,
              padding: "6px 9px",
              borderRadius: 7,
              background: "#0E0E0E",
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
              color: "#FFFFFF",
              font: `500 12px/1.35 ${FONT}`,
              letterSpacing: "normal",
              textAlign: "left",
              textTransform: "none",
              whiteSpace: "normal",
              pointerEvents: "none",
              zIndex: 1
            },
            children: [
              /* @__PURE__ */ jsxs("span", { style: { display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }, children: [
                /* @__PURE__ */ jsx2("span", { style: { fontWeight: 600 }, children: props.label }),
                props.shortcut === void 0 || props.shortcut.length === 0 ? null : /* @__PURE__ */ jsx2("span", { style: { display: "inline-flex", gap: 3, marginLeft: "auto" }, children: props.shortcut.map((key) => /* @__PURE__ */ jsx2(
                  "kbd",
                  {
                    style: {
                      font: `600 11px/16px ${FONT}`,
                      minWidth: 16,
                      padding: "0 4px",
                      textAlign: "center",
                      borderRadius: 4,
                      background: "rgba(255,255,255,0.14)",
                      color: "#FFFFFF"
                    },
                    children: key
                  },
                  key
                )) })
              ] }),
              props.detail === void 0 ? null : /* @__PURE__ */ jsx2("span", { style: { color: "#B9B5AE" }, children: props.detail })
            ]
          }
        ) : null
      ]
    }
  );
}
function focusVisible(target) {
  try {
    return target instanceof HTMLElement && target.matches(":focus-visible");
  } catch {
    return false;
  }
}

// src/overlay-parts.tsx
import { Fragment, jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
var ACCENT = "#D97757";
var INK = "#1F1E1D";
var MUTED = "#6B6862";
var LINE = "#E5E2DC";
var Z = 2147483e3;
var FONT2 = {
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSize: 13,
  lineHeight: 1.45,
  color: INK,
  letterSpacing: "normal",
  textTransform: "none"
};
var BUTTON = {
  ...FONT2,
  appearance: "none",
  border: `1px solid ${LINE}`,
  background: "#FFFFFF",
  borderRadius: 6,
  padding: "5px 10px",
  cursor: "pointer",
  fontWeight: 500
};
var PRIMARY = { ...BUTTON, background: ACCENT, borderColor: ACCENT, color: "#FFFFFF" };
function boxOf(element) {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}
function Highlight(props) {
  const { box } = props;
  const labelAbove = box.top > 24;
  return /* @__PURE__ */ jsxs2(Fragment, { children: [
    /* @__PURE__ */ jsx3(
      "div",
      {
        style: {
          position: "fixed",
          top: box.top,
          left: box.left,
          width: box.width,
          height: box.height,
          border: `2px solid ${ACCENT}`,
          background: props.strong ? "rgba(217, 119, 87, 0.18)" : "rgba(217, 119, 87, 0.08)",
          borderRadius: 3,
          pointerEvents: "none",
          zIndex: Z,
          boxSizing: "border-box"
        }
      }
    ),
    /* @__PURE__ */ jsx3(
      "div",
      {
        style: {
          ...FONT2,
          position: "fixed",
          top: labelAbove ? box.top - 22 : box.top + box.height + 2,
          left: Math.max(0, box.left),
          background: ACCENT,
          color: "#FFFFFF",
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 6px",
          borderRadius: 3,
          pointerEvents: "none",
          zIndex: Z,
          whiteSpace: "nowrap"
        },
        children: props.label
      }
    )
  ] });
}
function AreaBox(props) {
  return /* @__PURE__ */ jsx3(
    "div",
    {
      style: {
        position: "fixed",
        top: props.box.top,
        left: props.box.left,
        width: props.box.width,
        height: props.box.height,
        border: `2px dashed ${ACCENT}`,
        background: "rgba(217, 119, 87, 0.08)",
        pointerEvents: "none",
        zIndex: Z,
        boxSizing: "border-box"
      }
    }
  );
}
function Pin(props) {
  const top = Math.min(Math.max(props.box.top - 10, 4), window.innerHeight - 26);
  const left = Math.min(Math.max(props.box.left - 10, 4), window.innerWidth - 26);
  return /* @__PURE__ */ jsx3(
    "button",
    {
      type: "button",
      onClick: props.onClick,
      "aria-label": `Comment ${props.number}`,
      style: {
        ...FONT2,
        position: "fixed",
        top,
        left,
        width: 22,
        height: 22,
        borderRadius: "50% 50% 50% 4px",
        border: "2px solid #FFFFFF",
        background: ACCENT,
        color: "#FFFFFF",
        fontSize: 11,
        fontWeight: 700,
        padding: 0,
        cursor: "pointer",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        zIndex: Z + 1
      },
      children: props.number
    }
  );
}
function Hint(props) {
  return /* @__PURE__ */ jsxs2(
    "div",
    {
      role: "status",
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        ...FONT2,
        position: "fixed",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        background: INK,
        color: "#FFFFFF",
        fontSize: 12,
        padding: "6px 12px",
        borderRadius: 999,
        zIndex: Z + 2,
        maxWidth: "calc(100vw - 32px)",
        textAlign: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)"
      },
      children: [
        /* @__PURE__ */ jsx3("span", { style: { ...FONT2, fontSize: 12, color: "#FFFFFF" }, children: "Comment mode. Click: comment on an element \xB7 Select text: comment on a passage \xB7 \u2318/Ctrl+click: pick several \xB7 Shift+drag: mark an area \xB7 Alt+click: interact normally \xB7 Esc: exit" }),
        /* @__PURE__ */ jsx3(Tooltip, { label: "Hide this hint", detail: "The ? button in the toolbar brings it back.", placement: "below", children: (describedBy) => /* @__PURE__ */ jsx3(
          "button",
          {
            type: "button",
            onClick: props.onDismiss,
            "aria-label": "Hide hint",
            "aria-describedby": describedBy,
            style: { ...FONT2, appearance: "none", background: "none", border: 0, padding: "0 2px", color: "#FFFFFF", fontSize: 16, lineHeight: 1, cursor: "pointer" },
            children: "\xD7"
          }
        ) })
      ]
    }
  );
}
function Editor(props) {
  const width = 320;
  const height = 170;
  const { anchor } = props;
  let top = window.innerHeight - height - 80;
  let left = window.innerWidth - width - 16;
  if (anchor !== null) {
    const below = anchor.top + anchor.height + 8;
    top = below + height < window.innerHeight ? below : Math.max(8, anchor.top - height - 8);
    left = Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8);
  }
  const canSave = props.comment.trim().length > 0;
  return /* @__PURE__ */ jsxs2(
    "div",
    {
      role: "dialog",
      "aria-label": "Comment on element",
      style: {
        ...FONT2,
        position: "fixed",
        top,
        left,
        width,
        background: "#FFFFFF",
        border: `1px solid ${LINE}`,
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        padding: 10,
        zIndex: Z + 3,
        boxSizing: "border-box"
      },
      children: [
        /* @__PURE__ */ jsx3("div", { style: { ...FONT2, fontSize: 11, color: MUTED, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: props.title }),
        /* @__PURE__ */ jsx3(
          "textarea",
          {
            autoFocus: true,
            value: props.comment,
            placeholder: "What should change here?",
            onChange: (event) => props.onChange(event.target.value),
            onKeyDown: (event) => {
              event.stopPropagation();
              if (event.key === "Escape") props.onCancel();
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canSave) props.onSave();
            },
            style: {
              ...FONT2,
              width: "100%",
              height: 84,
              resize: "vertical",
              border: `1px solid ${LINE}`,
              borderRadius: 6,
              padding: 8,
              boxSizing: "border-box",
              outline: "none",
              background: "#FFFFFF"
            }
          }
        ),
        /* @__PURE__ */ jsxs2("div", { style: { display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }, children: [
          props.editing ? /* @__PURE__ */ jsx3("button", { type: "button", onClick: props.onDelete, style: { ...BUTTON, marginRight: "auto", color: "#B42318" }, children: "Delete" }) : null,
          /* @__PURE__ */ jsx3("button", { type: "button", onClick: props.onCancel, style: BUTTON, children: "Cancel" }),
          /* @__PURE__ */ jsx3("button", { type: "button", onClick: props.onSave, disabled: !canSave, style: { ...PRIMARY, opacity: canSave ? 1 : 0.5 }, children: "Save (\u2318\u21B5)" })
        ] })
      ]
    }
  );
}
function Panel(props) {
  return /* @__PURE__ */ jsxs2(
    "div",
    {
      "aria-label": "Comment list",
      style: {
        ...FONT2,
        position: "fixed",
        right: 16,
        bottom: 72,
        width: 340,
        maxHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        background: "#FFFFFF",
        border: `1px solid ${LINE}`,
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        zIndex: Z + 2,
        boxSizing: "border-box"
      },
      children: [
        /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", padding: "8px 10px", borderBottom: `1px solid ${LINE}` }, children: [
          /* @__PURE__ */ jsxs2("strong", { style: { ...FONT2, fontWeight: 600 }, children: [
            "Comments (",
            props.entries.length,
            ")"
          ] }),
          /* @__PURE__ */ jsx3("button", { type: "button", onClick: props.onClose, "aria-label": "Hide list", style: { ...BUTTON, marginLeft: "auto", padding: "2px 8px" }, children: "Hide" })
        ] }),
        /* @__PURE__ */ jsx3("ol", { style: { ...FONT2, listStyle: "none", margin: 0, padding: 0, overflowY: "auto", flex: 1 }, children: props.entries.map((entry) => /* @__PURE__ */ jsx3("li", { style: { borderBottom: `1px solid ${LINE}` }, children: /* @__PURE__ */ jsxs2(
          "button",
          {
            type: "button",
            onClick: () => props.onEdit(entry.id),
            style: { ...FONT2, display: "flex", gap: 8, width: "100%", textAlign: "left", background: "none", border: 0, padding: "8px 10px", cursor: "pointer" },
            children: [
              /* @__PURE__ */ jsx3("span", { style: { ...FONT2, color: ACCENT, fontWeight: 700, minWidth: 16 }, children: entry.number }),
              /* @__PURE__ */ jsxs2("span", { style: { ...FONT2, flex: 1, minWidth: 0 }, children: [
                /* @__PURE__ */ jsx3("span", { style: { ...FONT2, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: entry.comment }),
                /* @__PURE__ */ jsxs2("span", { style: { ...FONT2, display: "block", fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [
                  entry.where,
                  entry.onThisPage ? "" : " \xB7 other page"
                ] })
              ] })
            ]
          }
        ) }, entry.id)) }),
        /* @__PURE__ */ jsxs2("div", { style: { padding: 10, display: "flex", alignItems: "center", gap: 8 }, children: [
          /* @__PURE__ */ jsxs2("label", { style: { ...FONT2, display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: MUTED, cursor: "pointer", flex: 1 }, children: [
            /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: props.includeData, onChange: (event) => props.onIncludeData(event.target.checked) }),
            "Include props/state (personal data redacted)"
          ] }),
          /* @__PURE__ */ jsx3("button", { type: "button", onClick: props.onClear, style: { ...BUTTON, color: "#B42318" }, children: "Clear all" })
        ] })
      ]
    }
  );
}
function Callouts(props) {
  return /* @__PURE__ */ jsx3(Fragment, { children: props.callouts.map((callout) => /* @__PURE__ */ jsxs2("div", { children: [
    /* @__PURE__ */ jsx3(
      "div",
      {
        style: {
          position: "fixed",
          top: callout.box.top,
          left: callout.box.left,
          width: callout.box.width,
          height: callout.box.height,
          border: `2px ${callout.area === true ? "dashed" : "solid"} ${ACCENT}`,
          background: callout.area === true ? "rgba(217, 119, 87, 0.08)" : "transparent",
          borderRadius: 3,
          pointerEvents: "none",
          zIndex: Z,
          boxSizing: "border-box"
        }
      }
    ),
    /* @__PURE__ */ jsxs2(
      "button",
      {
        type: "button",
        "aria-label": `Comment ${callout.number}: ${callout.comment}`,
        onClick: props.onEdit === null ? void 0 : () => props.onEdit?.(callout.number),
        style: {
          ...FONT2,
          position: "fixed",
          top: callout.card.top,
          left: callout.card.left,
          width: callout.card.width,
          maxHeight: callout.card.height,
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          textAlign: "left",
          padding: "7px 10px",
          background: "#FFFFFF",
          border: `1.5px solid ${ACCENT}`,
          borderRadius: 8,
          boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
          cursor: props.onEdit === null ? "default" : "pointer",
          zIndex: Z + 1,
          boxSizing: "border-box",
          overflow: "hidden"
        },
        children: [
          /* @__PURE__ */ jsx3(
            "span",
            {
              style: {
                ...FONT2,
                flex: "none",
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                background: ACCENT,
                color: "#FFFFFF",
                fontSize: 11,
                fontWeight: 700,
                lineHeight: "18px",
                textAlign: "center"
              },
              children: callout.number
            }
          ),
          /* @__PURE__ */ jsx3(
            "span",
            {
              style: {
                ...FONT2,
                lineHeight: "18px",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: CARD_LINES,
                overflow: "hidden"
              },
              children: callout.comment
            }
          )
        ]
      }
    )
  ] }, callout.number)) });
}
function Toast(props) {
  const error = props.notice.tone === "error";
  return /* @__PURE__ */ jsxs2(
    "div",
    {
      role: "status",
      "aria-live": "polite",
      onClick: props.onDismiss,
      style: {
        ...FONT2,
        position: "fixed",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        width: "max-content",
        maxWidth: "min(420px, calc(100vw - 32px))",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "10px 14px",
        background: INK,
        color: "#FFFFFF",
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        // Above the screenshot editor, which reports through it.
        zIndex: Z + 6,
        cursor: "pointer"
      },
      children: [
        /* @__PURE__ */ jsx3("span", { style: { ...FONT2, color: error ? "#FF8A80" : "#7EE2A8", fontWeight: 700 }, children: error ? "!" : "\u2713" }),
        /* @__PURE__ */ jsxs2("span", { style: { ...FONT2, color: "#FFFFFF" }, children: [
          /* @__PURE__ */ jsx3("strong", { style: { ...FONT2, display: "block", color: "#FFFFFF", fontWeight: 600 }, children: props.notice.title }),
          props.notice.detail === void 0 ? null : /* @__PURE__ */ jsx3("span", { style: { ...FONT2, display: "block", color: "#D6D3CE", fontSize: 12 }, children: props.notice.detail })
        ] })
      ]
    }
  );
}
function Toolbar(props) {
  const none = props.count === 0;
  if (props.collapsed) return /* @__PURE__ */ jsx3(CollapsedToolbar, { ...props });
  return /* @__PURE__ */ jsxs2(
    "div",
    {
      role: "toolbar",
      "aria-label": "Dev annotator",
      style: {
        ...FONT2,
        position: "fixed",
        right: 16,
        bottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: 4,
        background: INK,
        borderRadius: 12,
        boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
        zIndex: Z + 2
      },
      children: [
        /* @__PURE__ */ jsx3(
          ToolButton,
          {
            icon: "comment",
            label: props.active ? "Turn off comment mode" : "Turn on comment mode",
            hint: "Click an element, select text, \u2318/Ctrl+click several or Shift+drag an area to comment on it.",
            shortcut: props.active ? "Esc" : "Alt+Shift+C",
            pressed: props.active,
            accent: true,
            onClick: props.onToggleActive
          }
        ),
        /* @__PURE__ */ jsx3(
          ToolButton,
          {
            icon: props.paused ? "play" : "pause",
            label: props.paused ? "Resume animations" : "Pause animations",
            hint: props.paused ? "Resume animations and videos" : "Pause animations and videos to comment on the current frame",
            pressed: props.paused,
            onClick: props.onTogglePaused
          }
        ),
        /* @__PURE__ */ jsx3(
          ToolButton,
          {
            icon: "eye",
            label: props.showComments ? "Show comments as numbers" : "Show comments in full",
            hint: props.showComments ? "Collapse comments back to numbered pins" : "Show every comment beside its element",
            pressed: props.showComments,
            disabled: none,
            onClick: props.onToggleComments
          }
        ),
        /* @__PURE__ */ jsx3(
          ToolButton,
          {
            icon: "camera",
            label: "Screenshot",
            hint: "Capture this tab with every comment shown, then mark it up",
            disabled: props.capturing,
            onClick: props.onScreenshot
          }
        ),
        /* @__PURE__ */ jsx3(Divider, {}),
        /* @__PURE__ */ jsx3(
          Tooltip,
          {
            label: props.panelOpen && !none ? "Hide comment list" : "Comment list",
            detail: none ? "No comments yet." : "Every comment, on this page and others; click one to edit it.",
            placement: "above",
            children: (describedBy) => /* @__PURE__ */ jsxs2(
              "button",
              {
                type: "button",
                onClick: props.onTogglePanel,
                disabled: none,
                "aria-pressed": props.panelOpen && !none,
                "aria-label": `Comment list (${props.count})`,
                "aria-describedby": describedBy,
                style: { ...barButton(props.panelOpen && !none, false, none), gap: 6, padding: "0 10px" },
                children: [
                  /* @__PURE__ */ jsx3(Icon, { name: "list" }),
                  /* @__PURE__ */ jsx3("span", { style: { ...FONT2, color: "inherit", fontWeight: 600 }, children: props.count })
                ]
              }
            )
          }
        ),
        /* @__PURE__ */ jsx3(
          Tooltip,
          {
            label: "Copy prompt",
            detail: none ? "Add a comment first." : "Every comment as one Markdown prompt for your coding agent.",
            placement: "above",
            children: (describedBy) => /* @__PURE__ */ jsxs2(
              "button",
              {
                type: "button",
                onClick: props.onCopy,
                disabled: none,
                "aria-describedby": describedBy,
                style: {
                  ...barButton(false, false, none),
                  gap: 6,
                  padding: "0 12px",
                  background: none ? "transparent" : ACCENT,
                  color: "#FFFFFF"
                },
                children: [
                  /* @__PURE__ */ jsx3(Icon, { name: "copy", size: 16 }),
                  /* @__PURE__ */ jsx3("span", { style: { ...FONT2, color: "inherit", fontWeight: 600 }, children: "Copy prompt" })
                ]
              }
            )
          }
        ),
        props.onShowHint === null ? null : /* @__PURE__ */ jsxs2(Fragment, { children: [
          /* @__PURE__ */ jsx3(Divider, {}),
          /* @__PURE__ */ jsx3(ToolButton, { icon: "help", label: "Show hint", hint: "Show the comment-mode shortcuts", onClick: props.onShowHint })
        ] }),
        /* @__PURE__ */ jsx3(Divider, {}),
        /* @__PURE__ */ jsx3(ToolButton, { icon: "collapse", label: "Collapse toolbar", hint: "Fold the toolbar into one button. Alt+Shift+C still works.", onClick: props.onToggleCollapsed })
      ]
    }
  );
}
function CollapsedToolbar(props) {
  const detail = [
    props.count === 0 ? "No comments yet." : `${props.count} comment${props.count === 1 ? "" : "s"}.`,
    props.active ? "Comment mode is on." : null
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ jsx3("div", { role: "toolbar", "aria-label": "Dev annotator", style: { position: "fixed", right: 16, bottom: 16, zIndex: Z + 2 }, children: /* @__PURE__ */ jsx3(Tooltip, { label: "Expand toolbar", detail, placement: "above", children: (describedBy) => /* @__PURE__ */ jsxs2(
    "button",
    {
      type: "button",
      onClick: props.onToggleCollapsed,
      "aria-label": "Expand toolbar",
      "aria-describedby": describedBy,
      style: {
        ...barButton(false, false, false),
        position: "relative",
        width: 44,
        height: 44,
        borderRadius: 22,
        background: INK,
        boxShadow: props.active ? `0 0 0 2px ${ACCENT}, 0 6px 20px rgba(0,0,0,0.28)` : "0 6px 20px rgba(0,0,0,0.28)"
      },
      children: [
        /* @__PURE__ */ jsx3(Icon, { name: "comment" }),
        props.count === 0 ? null : /* @__PURE__ */ jsx3(
          "span",
          {
            "aria-hidden": "true",
            style: {
              ...FONT2,
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 9,
              background: ACCENT,
              color: "#FFFFFF",
              fontSize: 11,
              fontWeight: 700,
              lineHeight: "18px",
              textAlign: "center",
              boxSizing: "border-box"
            },
            children: props.count
          }
        )
      ]
    }
  ) }) });
}
function Divider() {
  return /* @__PURE__ */ jsx3("span", { "aria-hidden": "true", style: { width: 1, height: 20, margin: "0 4px", background: "rgba(255,255,255,0.18)" } });
}
function barButton(pressed, accent, disabled) {
  return {
    ...FONT2,
    appearance: "none",
    height: 36,
    minWidth: 36,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    border: 0,
    borderRadius: 8,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
    color: "#FFFFFF",
    background: pressed ? accent ? ACCENT : "rgba(255,255,255,0.18)" : "transparent"
  };
}
function ToolButton(props) {
  return /* @__PURE__ */ jsx3(
    Tooltip,
    {
      label: props.label,
      ...props.hint === void 0 ? {} : { detail: props.hint },
      ...props.shortcut === void 0 ? {} : { shortcut: keyCaps(props.shortcut) },
      placement: "above",
      children: (describedBy) => /* @__PURE__ */ jsx3(
        "button",
        {
          type: "button",
          onClick: props.onClick,
          disabled: props.disabled,
          "aria-label": props.label,
          "aria-describedby": describedBy,
          ...props.pressed === void 0 ? {} : { "aria-pressed": props.pressed },
          ...props.shortcut === void 0 ? {} : { "aria-keyshortcuts": props.shortcut === "Esc" ? "Escape" : props.shortcut },
          style: barButton(props.pressed === true, props.accent === true, props.disabled === true),
          children: /* @__PURE__ */ jsx3(Icon, { name: props.icon })
        }
      )
    }
  );
}
function keyCaps(shortcut) {
  const mac = MOD_KEY === "\u2318";
  const names = mac ? { Alt: "\u2325", Shift: "\u21E7", Ctrl: "\u2303", Meta: "\u2318" } : {};
  return shortcut.split("+").map((key) => names[key] ?? key);
}

// src/page-tools.ts
var OWN_SELECTOR = "[data-dev-annotator]";
var MAX_AREA_ELEMENTS = 8;
function contains(outer, inner) {
  return inner.left >= outer.x && inner.top >= outer.y && inner.right <= outer.x + outer.width && inner.bottom <= outer.y + outer.height;
}
function holds(rect, area) {
  return rect.left <= area.x && rect.top <= area.y && rect.right >= area.x + area.width && rect.bottom >= area.y + area.height;
}
function isContent(element) {
  if (element.closest(OWN_SELECTOR) !== null) return false;
  if (element.closest('[aria-hidden="true"]') !== null) return false;
  return !(element instanceof SVGElement) || element instanceof SVGSVGElement;
}
function commonAncestor(elements) {
  const [first, ...rest] = elements;
  let node = first ?? null;
  while (node !== null && !rest.every((element) => node?.contains(element))) node = node.parentElement;
  return node;
}
function coveringAncestor(start, area, body) {
  let node = start;
  while (node !== null && node !== body && !holds(node.getBoundingClientRect(), area)) node = node.parentElement;
  return node ?? body;
}
function elementsInArea(doc, area) {
  const inside2 = [];
  for (const element of Array.from(doc.body.querySelectorAll("*"))) {
    if (!isContent(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (contains(area, rect) && !inside2.some((kept) => kept.contains(element))) inside2.push(element);
  }
  let start;
  if (inside2.length > 0) {
    const common = commonAncestor(inside2);
    start = inside2.length === 1 ? common?.parentElement ?? null : common;
  } else {
    const centre = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
    const under = typeof doc.elementsFromPoint === "function" ? doc.elementsFromPoint(centre.x, centre.y) : [];
    start = under.find(isContent) ?? null;
  }
  return { container: coveringAncestor(start, area, doc.body), inside: inside2.slice(0, MAX_AREA_ELEMENTS) };
}
function pauseMotion(doc) {
  const animations = typeof doc.getAnimations === "function" ? doc.getAnimations().filter((animation) => animation.playState === "running") : [];
  const videos = Array.from(doc.querySelectorAll("video")).filter((video) => !video.paused);
  for (const animation of animations) animation.pause();
  for (const video of videos) video.pause();
  return () => {
    for (const animation of animations) animation.play();
    for (const video of videos) void video.play().catch(() => void 0);
  };
}

// src/prompt.ts
var DATA_BLOCK_MAX = 3e3;
function buildPrompt(annotations, options) {
  const first = annotations[0]?.targets[0]?.page;
  const origin = first === void 0 ? "" : new URL(first.url).origin;
  const lines = [
    `# UI change requests: ${options.appName} (${annotations.length} ${annotations.length === 1 ? "comment" : "comments"})`,
    "",
    `Dev environment ${origin}, recorded ${formatTime(options.now)}.` + (options.appDir ? ` The app lives in \`${options.appDir}\`; file paths are from the repo root.` : ""),
    "",
    "Work through the comments below one by one. Each names the selected element, where its JSX is in the source, the components around it" + (options.includeData ? ", and their props/state when the comment was made" : "") + `. The element's JSX location is exact; a component's "rendered at" location may point at an earlier render branch when React reused the component, so check it against the code. Open the source file before editing. If the line numbers have drifted, search by selector, element text and component name. Personal data has been replaced with \`${REDACTED}\`; never treat it as a real value. When done, summarise the changes by comment number.`
  ];
  annotations.forEach((annotation, index) => {
    lines.push("", "---", "", ...section(annotation, index + 1, options));
  });
  return `${lines.join("\n")}
`;
}
var KIND_NOTE = {
  element: null,
  text: null,
  group: "The comment applies to ALL of the elements below.",
  area: "A comment on an area of the screen: the first element contains the area, the others lie wholly inside it."
};
function section(annotation, number, options) {
  const page = annotation.targets[0]?.page;
  const out = [
    `## ${number}. ${headline(annotation.comment)}`,
    "",
    ...annotation.comment.split("\n").map((line) => `> ${line}`),
    ""
  ];
  if (page !== void 0) {
    out.push(`- **Page:** \`${page.pathname}${page.search}\`${page.title ? `, title "${page.title}"` : ""}`);
  }
  const note = KIND_NOTE[annotation.kind];
  if (note !== null) out.push(`- **Kind:** ${note}`);
  if (annotation.selectedText !== void 0) out.push(`- **Selected text:** "${annotation.selectedText}"`);
  if (annotation.area !== void 0) {
    const { area } = annotation;
    out.push(`- **Area:** ${area.width}\xD7${area.height} at (${area.x}, ${area.y}) in the viewport`);
  }
  if (annotation.kind !== "area" && annotation.targets.length === 1 && annotation.targets[0] !== void 0) {
    out.push(...targetLines(annotation.targets[0], options));
    out.push(...dataBlocks(annotation.targets[0], options));
    return out;
  }
  annotation.targets.forEach((target, index) => {
    const label = annotation.kind !== "area" ? `Element ${index + 1}` : index === 0 ? "Container" : `Inside the area ${index}`;
    out.push("", `### ${number}.${index + 1} ${label}`, "", ...targetLines(target, options));
    out.push(...dataBlocks(target, options));
  });
  if (annotation.kind === "area" && annotation.targets.length === 1) {
    out.push("", "_No element lies wholly inside the area: it is empty space within the container._");
  }
  return out;
}
function targetLines(capture, options) {
  const { element } = capture;
  const out = [`- **Element:** \`${element.opening}\`${element.text ? `, text "${element.text}"` : ""}`];
  if (element.accessibility !== null) out.push(`- **Role (a11y):** ${element.accessibility}`);
  if (element.section !== null) out.push(`- **Section:** ${element.section}`);
  if (element.nearby !== null) out.push(`- **Nearby:** ${element.nearby}`);
  if (element.value !== null) out.push(`- **Current input value:** "${element.value}"`);
  out.push(`- **Selector:** \`${element.selector}\``);
  out.push(`- **Element JSX:** ${capture.jsx === null ? "could not be located" : location(capture.jsx, options.appDir)}`);
  if (capture.components.length > 0) {
    const chain = capture.components.map(
      (component) => component.renderedAt === null ? `\`${component.name}\`` : `\`${component.name}\` (rendered at ${location(component.renderedAt, options.appDir)})`
    );
    out.push(`- **Components, nearest first:** ${chain.join(" \u2190 ")}`);
  }
  out.push(
    `- **Position:** ${element.rect.width}\xD7${element.rect.height} at (${element.rect.x}, ${element.rect.y}); viewport ${capture.viewport.width}\xD7${capture.viewport.height} @${capture.viewport.devicePixelRatio}x`
  );
  const styles = Object.entries(element.styles);
  if (styles.length > 0) out.push(`- **Current style:** ${styles.map(([key, value]) => `${key}: ${value}`).join("; ")}`);
  return out;
}
function dataBlocks(capture, options) {
  if (!options.includeData) return [];
  const telling = capture.data.filter((block) => !isEmpty(block.props) || !isEmpty(block.state));
  return telling.flatMap((block) => [
    "",
    `**Data of \`${block.component}\`** (state in hook call order):`,
    "",
    "```json",
    dataJson(block),
    "```"
  ]);
}
function dataJson(block) {
  const value = { props: block.props, state: block.state };
  const pretty = JSON.stringify(value, null, 2);
  if (pretty.length <= DATA_BLOCK_MAX) return pretty;
  const compact = JSON.stringify(value);
  return compact.length <= DATA_BLOCK_MAX ? compact : `${compact.slice(0, DATA_BLOCK_MAX)} \u2026 (truncated)`;
}
function location(source, appDir) {
  const file = repoPath(source.file, appDir);
  const position = source.column === null ? `${source.line}` : `${source.line}:${source.column}`;
  return `\`${file}:${position}\`${source.mapped ? "" : " (line in the bundled output, approximate)"}`;
}
function repoPath(file, appDir) {
  if (!appDir || /^[a-z]+:/i.test(file)) return file;
  if (file.startsWith("/")) {
    const at = file.lastIndexOf(`/${appDir}/`);
    return at === -1 ? file : file.slice(at + 1);
  }
  const parts = [];
  for (const part of `${appDir}/${file}`.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}
function headline(comment) {
  const first = comment.trim().split("\n")[0] ?? "";
  return first.length <= 70 ? first : `${first.slice(0, 70)}\u2026`;
}
function formatTime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function isEmpty(snapshot) {
  if (snapshot === null) return true;
  if (Array.isArray(snapshot)) return snapshot.length === 0;
  return typeof snapshot === "object" && Object.keys(snapshot).length === 0;
}

// src/flags.ts
function readFlag(key) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key, value) {
  try {
    if (value) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
  }
}

// src/screenshot.ts
var CaptureCancelled = class extends Error {
  constructor() {
    super("Screen capture was cancelled");
    this.name = "CaptureCancelled";
  }
};
var captureTab = async (prepare) => {
  const media = typeof navigator === "undefined" ? void 0 : navigator.mediaDevices;
  if (media?.getDisplayMedia === void 0) {
    throw new Error("This browser cannot capture the tab (it needs the Screen Capture API, on localhost or https).");
  }
  const ratio = window.devicePixelRatio || 1;
  let stream;
  try {
    stream = await media.getDisplayMedia({
      video: {
        displaySurface: "browser",
        width: { ideal: Math.round(window.innerWidth * ratio) },
        height: { ideal: Math.round(window.innerHeight * ratio) },
        // Not part of the DOM lib yet; Chrome honours it.
        ...{ cursor: "never" }
      },
      audio: false,
      // Chrome: offer this tab first, as a one-click "Allow".
      ...{ preferCurrentTab: true, selfBrowserSurface: "include", surfaceSwitching: "exclude", monitorTypeSurfaces: "exclude" }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") throw new CaptureCancelled();
    throw error;
  }
  const video = document.createElement("video");
  try {
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await prepare();
    await freshFrame(video);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  }
};
async function freshFrame(video) {
  if (typeof video.requestVideoFrameCallback === "function") {
    for (let frame = 0; frame < 3; frame++) {
      await Promise.race([
        new Promise((resolve) => video.requestVideoFrameCallback(() => resolve())),
        // A static page may produce no new frame at all; then the current one is current.
        new Promise((resolve) => window.setTimeout(resolve, 250))
      ]);
    }
    return;
  }
  await new Promise((resolve) => window.setTimeout(resolve, 400));
}
function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob === null ? reject(new Error("The image could not be encoded")) : resolve(blob), "image/png");
  });
}
async function copyImage(canvas) {
  if (typeof ClipboardItem === "undefined" || navigator.clipboard?.write === void 0) {
    throw new Error("This browser cannot put an image on the clipboard; use Save instead.");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": canvasBlob(canvas) })]);
}
async function saveImage(canvas, fileName) {
  const url = URL.createObjectURL(await canvasBlob(canvas));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.setAttribute("data-dev-annotator", "");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function shotFileName(appName, pathname, now) {
  const pad = (n) => String(n).padStart(2, "0");
  const page = pathname.split("/").filter(Boolean).join("-").replace(/[^a-z0-9-]+/gi, "").slice(0, 40);
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${[appName, page || "home", stamp].join("-")}.png`;
}

// src/screenshot-editor.tsx
import {
  useEffect as useEffect2,
  useLayoutEffect as useLayoutEffect2,
  useRef as useRef2,
  useState as useState2
} from "react";

// src/callout-tip.tsx
import { jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
var FONT3 = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
var RED = "#E5484D";
var LOOP = "3.2s";
var KEY_TIMES = "0;0.12;0.55;0.85;1";
function CalloutTip(props) {
  return /* @__PURE__ */ jsxs3(
    "div",
    {
      role: "note",
      "aria-label": "Callout tip",
      style: {
        position: "absolute",
        left: props.left,
        top: props.top,
        width: 264,
        padding: 12,
        borderRadius: 10,
        background: "#0E0E0E",
        border: "1px solid rgba(255,255,255,0.16)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        color: "#FFFFFF",
        font: `500 12px/1.4 ${FONT3}`,
        zIndex: 2
      },
      children: [
        /* @__PURE__ */ jsx4(
          "span",
          {
            "aria-hidden": "true",
            style: {
              position: "absolute",
              top: -6,
              left: 18,
              width: 10,
              height: 10,
              background: "#0E0E0E",
              borderLeft: "1px solid rgba(255,255,255,0.16)",
              borderTop: "1px solid rgba(255,255,255,0.16)",
              transform: "rotate(45deg)"
            }
          }
        ),
        /* @__PURE__ */ jsx4(Demo, {}),
        /* @__PURE__ */ jsx4("strong", { style: { display: "block", marginTop: 10, font: `600 13px/1.35 ${FONT3}`, color: "#FFFFFF" }, children: props.nudge ? "Tip: drag instead of clicking" : "Drag to point at something" }),
        /* @__PURE__ */ jsx4("span", { style: { display: "block", marginTop: 4, color: "#C9C5BE" }, children: props.nudge ? "Press on what you mean and drag to where the text goes: the box gets a tail pointing there." : "Press on what you mean, drag to where the text goes, then type. A plain click makes a box without a tail." }),
        /* @__PURE__ */ jsx4(
          "button",
          {
            type: "button",
            onClick: props.onDismiss,
            style: {
              appearance: "none",
              marginTop: 10,
              padding: "5px 12px",
              border: 0,
              borderRadius: 6,
              background: "rgba(255,255,255,0.14)",
              color: "#FFFFFF",
              font: `600 12px/1.2 ${FONT3}`,
              cursor: "pointer"
            },
            children: "Got it"
          }
        )
      ]
    }
  );
}
function Demo() {
  const x = "52;52;172;172;52";
  const y = "70;70;27;27;70";
  return /* @__PURE__ */ jsxs3("svg", { width: "240", height: "96", viewBox: "0 0 240 96", "aria-hidden": "true", style: { display: "block", borderRadius: 6, background: "#F6F3EE" }, children: [
    /* @__PURE__ */ jsx4("rect", { x: "16", y: "56", width: "74", height: "28", rx: "4", fill: "#E6E0D6" }),
    /* @__PURE__ */ jsx4("rect", { x: "24", y: "64", width: "40", height: "5", rx: "2", fill: "#B9B2A6" }),
    /* @__PURE__ */ jsx4("rect", { x: "24", y: "73", width: "56", height: "4", rx: "2", fill: "#CFC8BC" }),
    /* @__PURE__ */ jsxs3("line", { x1: "52", y1: "70", x2: "52", y2: "70", stroke: RED, strokeWidth: "3", strokeLinecap: "round", children: [
      /* @__PURE__ */ jsx4("animate", { attributeName: "x2", values: x, keyTimes: KEY_TIMES, dur: LOOP, repeatCount: "indefinite" }),
      /* @__PURE__ */ jsx4("animate", { attributeName: "y2", values: y, keyTimes: KEY_TIMES, dur: LOOP, repeatCount: "indefinite" }),
      /* @__PURE__ */ jsx4("animate", { attributeName: "opacity", values: "0;1;1;1;0", keyTimes: KEY_TIMES, dur: LOOP, calcMode: "discrete", repeatCount: "indefinite" })
    ] }),
    /* @__PURE__ */ jsxs3("g", { opacity: "0", children: [
      /* @__PURE__ */ jsx4("rect", { x: "128", y: "13", width: "92", height: "28", rx: "5", fill: RED }),
      /* @__PURE__ */ jsx4("text", { x: "174", y: "31.5", textAnchor: "middle", fill: "#FFFFFF", style: { font: `600 12px ${FONT3}` }, children: "Too tight" }),
      /* @__PURE__ */ jsx4("animate", { attributeName: "opacity", values: "0;0;1;0;0", keyTimes: KEY_TIMES, dur: LOOP, calcMode: "discrete", repeatCount: "indefinite" })
    ] }),
    /* @__PURE__ */ jsx4("circle", { cx: "52", cy: "70", r: "0", fill: "none", stroke: "#1F1E1D", strokeWidth: "1.5", children: /* @__PURE__ */ jsx4("animate", { attributeName: "r", values: "0;11;0;0;0", keyTimes: KEY_TIMES, dur: LOOP, repeatCount: "indefinite" }) }),
    /* @__PURE__ */ jsxs3("g", { children: [
      /* @__PURE__ */ jsx4("path", { d: "M0 0 L0 15 L4 11 L7 18 L10 17 L7 10 L12 10 Z", fill: "#FFFFFF", stroke: "#1F1E1D", strokeWidth: "1.2", strokeLinejoin: "round" }),
      /* @__PURE__ */ jsx4("animateTransform", { attributeName: "transform", type: "translate", values: "52 70;52 70;172 27;172 27;52 70", keyTimes: KEY_TIMES, dur: LOOP, repeatCount: "indefinite" })
    ] })
  ] });
}

// src/screenshot-draw.ts
var WEIGHT_FACTOR = { 1: 0.6, 2: 1, 3: 1.7 };
var COLORS = ["#E5484D", "#F5A524", "#30A46C", "#0091FF", "#8E4EC6", "#1F1E1D"];
var FONT_FAMILY = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
var LINE_HEIGHT2 = 1.25;
function strokeWidth(imageWidth, weight = 2) {
  return Math.max(2, Math.round(imageWidth / 400 * WEIGHT_FACTOR[weight]));
}
function fontSize(imageWidth, weight = 2) {
  return Math.max(14, Math.round(imageWidth / 48 * WEIGHT_FACTOR[weight]));
}
function textFont(imageWidth, weight) {
  return `600 ${fontSize(imageWidth, weight)}px ${FONT_FAMILY}`;
}
function headSize(from, to, width) {
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  const length = Math.min(width * 6, span * 0.5);
  return { length, half: length * 0.52 };
}
function arrowOutline(from, to, width) {
  const { length, half } = headSize(from, to, width);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const along = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal = { x: -along.y, y: along.x };
  const base = { x: to.x - along.x * length, y: to.y - along.y * length };
  const at = (point, offset) => ({ x: point.x + normal.x * offset, y: point.y + normal.y * offset });
  const tail = width * 0.35;
  const neck = width * 0.85;
  return [at(from, tail), at(base, neck), at(base, half), to, at(base, -half), at(base, -neck), at(from, -tail)];
}
function calloutLayout(mark, imageWidth, measure) {
  const size = fontSize(imageWidth, mark.weight);
  const lines = mark.text.split("\n");
  const font = textFont(imageWidth, mark.weight);
  const padX = size * 0.5;
  const padY = size * 0.3;
  const lineHeight = size * LINE_HEIGHT2;
  const textWidth = Math.max(size * 1.5, ...lines.map((line) => measure(line, font)));
  const width = textWidth + 2 * padX;
  const height = lines.length * lineHeight + 2 * padY;
  return {
    box: { x: mark.at.x - width / 2, y: mark.at.y - height / 2, width, height },
    size,
    padX,
    padY,
    lineHeight,
    lines,
    radius: size * 0.22
  };
}
function tailBase(layout, tip) {
  const { box, size, radius } = layout;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = tip.x - cx;
  const dy = tip.y - cy;
  if (Math.abs(dx) <= box.width / 2 && Math.abs(dy) <= box.height / 2) return null;
  const inset = 1;
  if (Math.abs(dy) * (box.width / 2) >= Math.abs(dx) * (box.height / 2)) {
    const half2 = Math.min(size * 0.32, (box.width - 2 * radius) / 3);
    const y2 = dy > 0 ? box.y + box.height - inset : box.y + inset;
    const reach2 = dy === 0 ? 0 : box.height / 2 / Math.abs(dy) * dx;
    const x2 = Math.min(Math.max(cx + reach2, box.x + radius + half2), box.x + box.width - radius - half2);
    return [{ x: x2 - half2, y: y2 }, { x: x2 + half2, y: y2 }];
  }
  const half = Math.min(size * 0.32, (box.height - 2 * radius) / 3);
  const x = dx > 0 ? box.x + box.width - inset : box.x + inset;
  const reach = dx === 0 ? 0 : box.width / 2 / Math.abs(dx) * dy;
  const y = Math.min(Math.max(cy + reach, box.y + radius + half), box.y + box.height - radius - half);
  return [{ x, y: y - half }, { x, y: y + half }];
}
function textColorOn(fill) {
  const hex = /^#?([0-9a-f]{6})$/i.exec(fill)?.[1];
  if (hex === void 0) return "#FFFFFF";
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
  const luminance = 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  return luminance > 0.6 ? "#1F1E1D" : "#FFFFFF";
}
function normalized(from, to) {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y)
  };
}
function isTrivial(mark) {
  if (mark.tool === "text") return mark.text.trim() === "";
  if (mark.tool === "pen") return mark.points.length < 2;
  const box = normalized(mark.from, mark.to);
  return box.width < 4 && box.height < 4;
}
function canvasMeasure(context) {
  return (text, font) => {
    if (context === null) return text.length * Number.parseFloat(font.split(" ")[1] ?? "16") * 0.56;
    context.save();
    context.font = font;
    const width = context.measureText(text).width;
    context.restore();
    return width;
  };
}
function markBounds(mark, imageWidth, measure) {
  const pad = strokeWidth(imageWidth, mark.weight) / 2;
  switch (mark.tool) {
    case "text":
      return calloutLayout(mark, imageWidth, measure).box;
    case "pen": {
      const xs = mark.points.map((point) => point.x);
      const ys = mark.points.map((point) => point.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x: x - pad, y: y - pad, width: Math.max(...xs) - x + 2 * pad, height: Math.max(...ys) - y + 2 * pad };
    }
    case "arrow": {
      const points = arrowOutline(mark.from, mark.to, strokeWidth(imageWidth, mark.weight));
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x: x - pad, y: y - pad, width: Math.max(...xs) - x + 2 * pad, height: Math.max(...ys) - y + 2 * pad };
    }
    default: {
      const box = normalized(mark.from, mark.to);
      return { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad };
    }
  }
}
function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}
function inside(point, box, slack) {
  return point.x >= box.x - slack && point.x <= box.x + box.width + slack && point.y >= box.y - slack && point.y <= box.y + box.height + slack;
}
function hitTest(marks, point, imageWidth, measure, slack) {
  for (let index = marks.length - 1; index >= 0; index--) {
    const mark = marks[index];
    if (mark === void 0) continue;
    const tolerance = slack + strokeWidth(imageWidth, mark.weight);
    if ((mark.tool === "arrow" || mark.tool === "ruler") && distanceToSegment(point, mark.from, mark.to) <= tolerance) return index;
    if (mark.tool === "pen") {
      for (let at = 1; at < mark.points.length; at++) {
        const a = mark.points[at - 1];
        const b = mark.points[at];
        if (a !== void 0 && b !== void 0 && distanceToSegment(point, a, b) <= tolerance) return index;
      }
    }
    if (mark.tool === "text" && mark.tail !== void 0) {
      const layout = calloutLayout(mark, imageWidth, measure);
      const base = tailBase(layout, mark.tail);
      if (base !== null) {
        const mid = { x: (base[0].x + base[1].x) / 2, y: (base[0].y + base[1].y) / 2 };
        if (distanceToSegment(point, mid, mark.tail) <= tolerance) return index;
      }
    }
    if (mark.tool !== "arrow" && mark.tool !== "ruler" && mark.tool !== "pen" && inside(point, markBounds(mark, imageWidth, measure), slack)) return index;
  }
  return null;
}
function translate(mark, dx, dy) {
  const move = (point) => ({ x: point.x + dx, y: point.y + dy });
  switch (mark.tool) {
    case "text":
      return { ...mark, at: move(mark.at) };
    case "pen":
      return { ...mark, points: mark.points.map(move) };
    default:
      return { ...mark, from: move(mark.from), to: move(mark.to) };
  }
}
function union(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}
function expand(box, by) {
  return { x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by };
}
function outputFrame(image, marks, imageWidth, measure) {
  let frame = image;
  const margin = Math.max(16, Math.round(Math.max(image.width, image.height) / 50));
  for (const mark of marks) {
    const box = expand(markBounds(mark, imageWidth, measure), margin);
    const outside = box.x < image.x || box.y < image.y || box.x + box.width > image.x + image.width || box.y + box.height > image.y + image.height;
    if (outside) frame = union(frame, box);
  }
  return {
    x: Math.floor(frame.x),
    y: Math.floor(frame.y),
    width: Math.ceil(frame.x + frame.width) - Math.floor(frame.x),
    height: Math.ceil(frame.y + frame.height) - Math.floor(frame.y)
  };
}
function edgeColor(image) {
  try {
    const context = image.getContext("2d", { willReadFrequently: true });
    if (context === null || image.width === 0 || image.height === 0) return "#FFFFFF";
    const strips = [
      context.getImageData(0, 0, image.width, 1),
      context.getImageData(0, image.height - 1, image.width, 1),
      context.getImageData(0, 0, 1, image.height),
      context.getImageData(image.width - 1, 0, 1, image.height)
    ];
    const tally = /* @__PURE__ */ new Map();
    for (const { data } of strips) {
      for (let at = 0; at < data.length; at += 4) {
        const red = data[at] ?? 0;
        const green = data[at + 1] ?? 0;
        const blue = data[at + 2] ?? 0;
        const key = red >> 3 << 10 | green >> 3 << 5 | blue >> 3;
        const entry = tally.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
        entry.count++;
        entry.red += red;
        entry.green += green;
        entry.blue += blue;
        tally.set(key, entry);
      }
    }
    let best;
    for (const entry of tally.values()) if (best === void 0 || entry.count > best.count) best = entry;
    if (best === void 0) return "#FFFFFF";
    const { count } = best;
    const hex = (sum) => Math.round(sum / count).toString(16).padStart(2, "0");
    return `#${hex(best.red)}${hex(best.green)}${hex(best.blue)}`;
  } catch {
    return "#FFFFFF";
  }
}
function paint(canvas, base, marks, options = {}) {
  const context = canvas.getContext("2d");
  if (context === null) return;
  const imageWidth = base.width;
  const image = options.image ?? { x: 0, y: 0, width: base.width, height: base.height };
  const frame = options.frame ?? image;
  const view = options.view ?? frame;
  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.translate(-view.x, -view.y);
  if (options.backdrop !== void 0) {
    context.fillStyle = options.backdrop;
    context.fillRect(view.x, view.y, view.width, view.height);
  }
  context.save();
  if (options.backdrop !== void 0) {
    context.shadowColor = "rgba(0, 0, 0, 0.5)";
    context.shadowBlur = Math.max(12, imageWidth / 80);
    context.shadowOffsetY = Math.max(4, imageWidth / 300);
  }
  context.fillStyle = options.background ?? "#FFFFFF";
  context.fillRect(frame.x, frame.y, frame.width, frame.height);
  context.restore();
  context.drawImage(base, image.x, image.y, image.width, image.height, image.x, image.y, image.width, image.height);
  for (const mark of marks) {
    context.save();
    const width = strokeWidth(imageWidth, mark.weight);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = width;
    context.strokeStyle = mark.color;
    context.fillStyle = mark.color;
    drawMark(context, base, mark, width, imageWidth, options.pixelRatio ?? 1);
    context.restore();
  }
  const chosen = options.selected === null || options.selected === void 0 ? void 0 : marks[options.selected];
  if (chosen !== void 0) {
    const accent = options.accent ?? "#0091FF";
    drawSelection(context, markBounds(chosen, imageWidth, canvasMeasure(context)), imageWidth, accent);
    if (chosen.tool === "text" && chosen.tail !== void 0) drawHandle(context, chosen.tail, tailHandleRadius(imageWidth), accent);
  }
  if (options.cropPreview !== void 0 && options.cropPreview !== null) drawCropPreview(context, image, options.cropPreview, imageWidth, options.pixelRatio ?? 1);
  context.restore();
}
function drawCropPreview(context, view, crop, imageWidth, ratio) {
  context.save();
  context.beginPath();
  context.rect(view.x, view.y, view.width, view.height);
  context.rect(crop.x, crop.y, crop.width, crop.height);
  context.fillStyle = "rgba(0, 0, 0, 0.55)";
  context.fill("evenodd");
  const line = Math.max(1.5, imageWidth / 900);
  context.lineWidth = line;
  context.strokeStyle = "#FFFFFF";
  context.setLineDash([line * 5, line * 4]);
  context.strokeRect(crop.x, crop.y, crop.width, crop.height);
  context.setLineDash([]);
  pill(context, `${Math.round(crop.width / ratio)} \xD7 ${Math.round(crop.height / ratio)}`, { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 }, fontSize(imageWidth, 1), "rgba(0,0,0,0.75)", "#FFFFFF");
  context.restore();
}
function pill(context, label, at, size, fill, ink) {
  context.save();
  context.font = `600 ${size}px ${FONT_FAMILY}`;
  const width = context.measureText(label).width + size;
  const height = size * 1.5;
  context.beginPath();
  context.roundRect(at.x - width / 2, at.y - height / 2, width, height, height / 2);
  context.fillStyle = fill;
  context.fill();
  context.fillStyle = ink;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, at.x, at.y + size * 0.05);
  context.restore();
}
function rulerLabel(from, to, ratio) {
  const dx = Math.round(Math.abs(to.x - from.x) / ratio);
  const dy = Math.round(Math.abs(to.y - from.y) / ratio);
  const length = Math.round(Math.hypot(to.x - from.x, to.y - from.y) / ratio);
  return dx === 0 || dy === 0 ? `${length} px` : `${length} px \xB7 ${dx} \xD7 ${dy}`;
}
function tailHandleRadius(imageWidth) {
  return Math.max(5, imageWidth / 220);
}
function drawHandle(context, at, radius, accent) {
  context.save();
  context.beginPath();
  context.arc(at.x, at.y, radius, 0, Math.PI * 2);
  context.fillStyle = "#FFFFFF";
  context.fill();
  context.lineWidth = Math.max(1.5, radius / 3);
  context.strokeStyle = accent;
  context.stroke();
  context.restore();
}
function drawSelection(context, box, imageWidth, accent) {
  const line = Math.max(1.5, imageWidth / 1e3);
  const gap = line * 4;
  const x = box.x - gap;
  const y = box.y - gap;
  const width = box.width + 2 * gap;
  const height = box.height + 2 * gap;
  context.save();
  context.lineWidth = line;
  context.strokeStyle = accent;
  context.setLineDash([line * 4, line * 3]);
  context.strokeRect(x, y, width, height);
  context.setLineDash([]);
  context.fillStyle = "#FFFFFF";
  const handle = line * 5;
  for (const [hx, hy] of [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height]
  ]) {
    context.fillRect(hx - handle / 2, hy - handle / 2, handle, handle);
    context.strokeRect(hx - handle / 2, hy - handle / 2, handle, handle);
  }
  context.restore();
}
function drawMark(context, base, mark, width, imageWidth, pixelRatio) {
  switch (mark.tool) {
    case "ruler": {
      const line = Math.max(1.5, width * 0.45);
      const angle = Math.atan2(mark.to.y - mark.from.y, mark.to.x - mark.from.x);
      const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
      const tick = line * 6;
      context.lineWidth = line;
      context.lineCap = "butt";
      context.beginPath();
      context.moveTo(mark.from.x, mark.from.y);
      context.lineTo(mark.to.x, mark.to.y);
      for (const end of [mark.from, mark.to]) {
        context.moveTo(end.x + normal.x * tick, end.y + normal.y * tick);
        context.lineTo(end.x - normal.x * tick, end.y - normal.y * tick);
      }
      context.stroke();
      const size = fontSize(imageWidth, 1);
      const side = normal.y > 0 ? -1 : 1;
      const mid = { x: (mark.from.x + mark.to.x) / 2 + normal.x * side * size * 1.3, y: (mark.from.y + mark.to.y) / 2 + normal.y * side * size * 1.3 };
      pill(context, rulerLabel(mark.from, mark.to, pixelRatio), mid, size, mark.color, textColorOn(mark.color));
      return;
    }
    case "arrow": {
      const [first, ...rest] = arrowOutline(mark.from, mark.to, width);
      if (first === void 0) return;
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (const point of rest) context.lineTo(point.x, point.y);
      context.closePath();
      context.shadowColor = "rgba(0, 0, 0, 0.25)";
      context.shadowBlur = width * 1.2;
      context.shadowOffsetY = width * 0.3;
      context.fill();
      return;
    }
    case "rect": {
      const box = normalized(mark.from, mark.to);
      context.beginPath();
      context.roundRect(box.x, box.y, box.width, box.height, width * 1.5);
      context.stroke();
      return;
    }
    case "highlight": {
      const box = normalized(mark.from, mark.to);
      context.globalAlpha = 0.3;
      context.fillRect(box.x, box.y, box.width, box.height);
      return;
    }
    case "pixelate": {
      const box = normalized(mark.from, mark.to);
      if (box.width < 1 || box.height < 1) return;
      const block = Math.max(8, Math.round(imageWidth / 120) * (mark.weight === 3 ? 2 : 1));
      const small = document.createElement("canvas");
      small.width = Math.max(1, Math.round(box.width / block));
      small.height = Math.max(1, Math.round(box.height / block));
      small.getContext("2d")?.drawImage(base, box.x, box.y, box.width, box.height, 0, 0, small.width, small.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(small, 0, 0, small.width, small.height, box.x, box.y, box.width, box.height);
      return;
    }
    case "pen": {
      const [first, ...rest] = mark.points;
      if (first === void 0) return;
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (const point of rest) context.lineTo(point.x, point.y);
      context.stroke();
      return;
    }
    case "text": {
      const layout = calloutLayout(mark, imageWidth, canvasMeasure(context));
      const { box, size, padY, lineHeight, lines, radius } = layout;
      context.beginPath();
      context.roundRect(box.x, box.y, box.width, box.height, radius);
      const base2 = mark.tail === void 0 ? null : tailBase(layout, mark.tail);
      if (base2 !== null && mark.tail !== void 0) {
        const tip = mark.tail;
        const [a, c] = base2;
        const turn = a.x * tip.y - tip.x * a.y + tip.x * c.y - c.x * tip.y + c.x * a.y - a.x * c.y;
        const [first, last] = turn >= 0 ? [a, c] : [c, a];
        context.moveTo(first.x, first.y);
        context.lineTo(tip.x, tip.y);
        context.lineTo(last.x, last.y);
        context.closePath();
      }
      context.shadowColor = "rgba(0, 0, 0, 0.28)";
      context.shadowBlur = size * 0.5;
      context.shadowOffsetY = size * 0.12;
      context.fill("nonzero");
      context.shadowColor = "transparent";
      context.fillStyle = textColorOn(mark.color);
      context.font = textFont(imageWidth, mark.weight);
      context.textAlign = "center";
      context.textBaseline = "middle";
      lines.forEach((line, index) => {
        context.fillText(line, box.x + box.width / 2, box.y + padY + index * lineHeight + lineHeight / 2);
      });
      return;
    }
  }
}

// src/screenshot-editor.tsx
import { jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
var TOOLS = [
  { tool: "select", icon: "select", label: "Select & move", key: "V", detail: "Click a mark to select it, drag to move it, Delete to remove it. Double-click text to edit it." },
  { tool: "arrow", icon: "arrow", label: "Arrow", key: "A", detail: "Hold Shift to snap to 45\xB0." },
  { tool: "rect", icon: "rect", label: "Rectangle", key: "R", detail: "Hold Shift for a square." },
  { tool: "highlight", icon: "highlight", label: "Highlight", key: "H", detail: "A translucent marker over an area." },
  { tool: "pen", icon: "pen", label: "Pen", key: "P", detail: "Draw freehand." },
  {
    tool: "text",
    icon: "text",
    label: "Callout",
    key: "T",
    detail: "Drag from what you point at to where the text goes: one box with a tail. A click gives a box without one. Enter places it, Shift+Enter adds a line."
  },
  { tool: "ruler", icon: "ruler", label: "Ruler", key: "M", detail: "Measure in the page\u2019s own pixels. Hold Shift to keep it straight." },
  { tool: "crop", icon: "crop", label: "Crop", key: "C", detail: "Drag the part to keep. Undo, or Reset crop, brings the rest back." },
  { tool: "pixelate", icon: "pixelate", label: "Pixelate", key: "B", detail: "Hide personal data before the image leaves this machine." }
];
var WEIGHTS = [
  { weight: 1, label: "Thin", dot: 4 },
  { weight: 2, label: "Medium", dot: 7 },
  { weight: 3, label: "Thick", dot: 10 }
];
var ZOOM_STOPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
var MIN_ZOOM = 0.1;
var MAX_ZOOM = 8;
var PAD = 24;
var PICK_SLACK = 6;
var NO_MARKS = [];
var CALLOUT_TIP_KEY = "agent-annotator:callout-tip-done";
var EMPTY_DOC = { marks: NO_MARKS, crop: null };
var measureContext;
function textMeasure() {
  if (measureContext === void 0) {
    measureContext = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  }
  return canvasMeasure(measureContext ?? null);
}
function ScreenshotEditor(props) {
  const { image, fileName, onClose, onNotice } = props;
  const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const canvasRef = useRef2(null);
  const areaRef = useRef2(null);
  const customColorRef = useRef2(null);
  const [history, setHistory] = useState2({ past: [], present: EMPTY_DOC, future: [] });
  const marks = history.present.marks;
  const crop = history.present.crop;
  const view = crop ?? { x: 0, y: 0, width: image.width, height: image.height };
  const [saved, setSaved] = useState2(EMPTY_DOC);
  const [cropDraft, setCropDraftState] = useState2(null);
  const [tool, setTool] = useState2("arrow");
  const [color, setColor] = useState2(COLORS[0]);
  const [weight, setWeight] = useState2(2);
  const [selectedRaw, setSelected] = useState2(null);
  const selected = selectedRaw !== null && selectedRaw < marks.length ? selectedRaw : null;
  const [drawing, setDrawingState] = useState2(null);
  const [drag, setDragState] = useState2(null);
  const drawingRef = useRef2(null);
  const dragRef = useRef2(null);
  const cropRef = useRef2(null);
  const setDrawing = (next) => {
    drawingRef.current = next;
    setDrawingState(next);
  };
  const setDrag = (next) => {
    dragRef.current = next;
    setDragState(next);
  };
  const setCropDraft = (next) => {
    cropRef.current = next;
    setCropDraftState(next);
  };
  const [text, setText] = useState2(null);
  const [hovering, setHovering] = useState2(false);
  const [spaceHeld, setSpaceHeld] = useState2(false);
  const [panning, setPanning] = useState2(false);
  const panRef = useRef2(null);
  const [confirmClose, setConfirmClose] = useState2(false);
  const dialogRef = useRef2(null);
  const [tipDone, setTipDone] = useState2(() => readFlag(CALLOUT_TIP_KEY));
  const [tipNudge, setTipNudge] = useState2(false);
  const [tipAt, setTipAt] = useState2(null);
  const learnCallout = () => {
    setTipDone(true);
    writeFlag(CALLOUT_TIP_KEY, true);
  };
  const showTip = tool === "text" && !tipDone;
  useLayoutEffect2(() => {
    if (!showTip) return;
    const dialog = dialogRef.current;
    const button = dialog?.querySelector('[aria-label="Callout"]');
    if (dialog === null || dialog === void 0 || button === null || button === void 0) return;
    const box = button.getBoundingClientRect();
    const frame2 = dialog.getBoundingClientRect();
    setTipAt({ left: Math.max(8, box.left - frame2.left + box.width / 2 - 23), top: box.bottom - frame2.top + 10 });
  }, [showTip]);
  const [zoom, setZoom] = useState2(null);
  const [areaSize, setAreaSize] = useState2({ width: 0, height: 0 });
  const frame = outputFrame(view, marks, image.width, textMeasure());
  const fitScale = areaSize.width > 2 * PAD && areaSize.height > 2 * PAD ? (
    // Never blow a capture up past the size it had on the page.
    Math.min((areaSize.width - 2 * PAD) / frame.width, (areaSize.height - 2 * PAD) / frame.height, 1 / ratio)
  ) : 1 / ratio;
  const scale = zoom ?? fitScale;
  const board = boardAround(expand(frame, 12 / scale), view, areaSize, scale);
  const [background] = useState2(() => edgeColor(image));
  const anchorRef = useRef2(null);
  const dirty = history.present !== saved && (marks.length > 0 || crop !== null);
  const commitDoc = (change) => setHistory((current) => ({ past: [...current.past, current.present], present: change(current.present), future: [] }));
  const commit = (next) => commitDoc((doc) => ({ ...doc, marks: next }));
  const commitCrop = (next) => {
    commitDoc((doc) => ({ ...doc, crop: next }));
    setZoom(null);
  };
  const undo = () => setHistory(
    (current) => current.past.length === 0 ? current : { past: current.past.slice(0, -1), present: current.past[current.past.length - 1] ?? EMPTY_DOC, future: [current.present, ...current.future] }
  );
  const redo = () => setHistory(
    (current) => current.future.length === 0 ? current : { past: [...current.past, current.present], present: current.future[0] ?? EMPTY_DOC, future: current.future.slice(1) }
  );
  const replaceAt = (index, mark) => commit(mark === null ? marks.filter((_, at) => at !== index) : marks.map((kept, at) => at === index ? mark : kept));
  let visible = drag === null ? marks : marks.map((mark, at) => at === drag.index ? drag.moved : mark);
  if (text !== null) {
    const live = {
      tool: "text",
      at: text.at,
      text: text.value,
      color: text.color,
      weight: text.weight,
      ...text.tail === void 0 ? {} : { tail: text.tail }
    };
    visible = text.editing === null ? [...visible, live] : visible.map((mark, at) => at === text.editing ? live : mark);
  }
  if (drawing !== null) visible = [...visible, drawing];
  const outline = text === null && drawing === null ? selected : null;
  const liveFrame = outputFrame(view, visible, image.width, textMeasure());
  const paintBase = { view: board, image: view, frame: liveFrame, background, backdrop: "#0E0E0E", pixelRatio: ratio };
  const cropBox = cropDraft === null ? null : clampTo(normalized(cropDraft.from, cropDraft.to), view);
  useEffect2(() => {
    const canvas = canvasRef.current;
    if (canvas !== null) paint(canvas, image, visible, { ...paintBase, selected: outline, accent: "#0091FF", cropPreview: cropBox });
  });
  useEffect2(() => {
    const area = areaRef.current;
    if (area === null) return void 0;
    const measure = () => setAreaSize({ width: area.clientWidth, height: area.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect2(() => {
    const anchor = anchorRef.current;
    anchorRef.current = null;
    const canvas = canvasRef.current;
    const area = areaRef.current;
    if (anchor === null || canvas === null || area === null) return;
    const rect = canvas.getBoundingClientRect();
    area.scrollLeft += rect.left + (anchor.image.x - board.x) * scale - anchor.client.x;
    area.scrollTop += rect.top + (anchor.image.y - board.y) * scale - anchor.client.y;
  }, [scale, board.x, board.y]);
  const zoomTo = (nextScale, client) => {
    const canvas = canvasRef.current;
    const area = areaRef.current;
    if (canvas !== null && area !== null) {
      const rect = canvas.getBoundingClientRect();
      const box = area.getBoundingClientRect();
      const at = client ?? { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      if (scale > 0) anchorRef.current = { image: { x: board.x + (at.x - rect.left) / scale, y: board.y + (at.y - rect.top) / scale }, client: at };
    }
    setZoom(nextScale === null ? null : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale * ratio)) / ratio);
  };
  const percent = scale * ratio;
  const zoomStep = (direction) => {
    const next = direction === 1 ? ZOOM_STOPS.find((stop) => stop > percent * 1.01) : [...ZOOM_STOPS].reverse().find((stop) => stop < percent * 0.99);
    if (next !== void 0) zoomTo(next / ratio);
  };
  const wheelRef = useRef2(() => void 0);
  const onWheel = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomTo(scale * Math.exp(-event.deltaY * 0.01), { x: event.clientX, y: event.clientY });
  };
  useEffect2(() => {
    const area = areaRef.current;
    if (area === null) return void 0;
    const onWheel2 = (event) => wheelRef.current(event);
    area.addEventListener("wheel", onWheel2, { passive: false });
    return () => area.removeEventListener("wheel", onWheel2);
  }, []);
  const measureText = textMeasure;
  const pick = (point, only) => {
    const index = hitTest(marks, point, image.width, measureText(), PICK_SLACK / scale);
    return index !== null && (only === void 0 || marks[index]?.tool === only) ? index : null;
  };
  const imagePoint = (event) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect === void 0 || scale <= 0) return { x: 0, y: 0 };
    return { x: board.x + (event.clientX - rect.left) / scale, y: board.y + (event.clientY - rect.top) / scale };
  };
  const commitText = () => {
    if (text === null) return;
    const value = text.value.replace(/\s+$/, "");
    if (text.editing !== null) {
      const original = marks[text.editing];
      if (original?.tool === "text") replaceAt(text.editing, value.trim() === "" ? null : { ...original, text: value });
    } else if (value.trim() !== "") {
      commit([
        ...marks,
        { tool: "text", at: text.at, text: value, color: text.color, weight: text.weight, ...text.tail === void 0 ? {} : { tail: text.tail } }
      ]);
    }
    setText(null);
  };
  const editText = (index) => {
    const mark = marks[index];
    if (mark?.tool !== "text") return;
    setSelected(null);
    setText({ at: mark.at, value: mark.text, color: mark.color, weight: mark.weight, editing: index, ...mark.tail === void 0 ? {} : { tail: mark.tail } });
  };
  const onPointerDown = (event) => {
    if (event.button === 1 || event.button === 0 && spaceHeld) {
      const area = areaRef.current;
      if (area === null) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = { x: event.clientX, y: event.clientY, left: area.scrollLeft, top: area.scrollTop };
      setPanning(true);
      return;
    }
    if (event.button !== 0) return;
    const point = imagePoint(event);
    if (tool === "select") {
      const current = selected === null ? void 0 : marks[selected];
      if (selected !== null && current?.tool === "text" && current.tail !== void 0) {
        const grip = tailHandleRadius(image.width) + PICK_SLACK / scale;
        if (Math.hypot(point.x - current.tail.x, point.y - current.tail.y) <= grip) {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag({ mode: "tail", index: selected, origin: point, original: current, moved: current });
          return;
        }
      }
      const index = pick(point);
      select(index);
      const mark = index === null ? void 0 : marks[index];
      if (index !== null && mark !== void 0) {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ mode: "move", index, origin: point, original: mark, moved: mark });
      }
      return;
    }
    if (tool === "crop") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelected(null);
      setCropDraft({ from: point, to: point });
      return;
    }
    if (tool === "text") {
      commitText();
      const existing = pick(point, "text");
      if (existing !== null) {
        editText(existing);
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelected(null);
      setDrawing({ tool: "text", at: point, text: "", tail: point, color, weight });
      return;
    }
    setSelected(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawing(tool === "pen" ? { tool, points: [point], color, weight } : { tool, from: point, to: point, color, weight });
  };
  const onPointerMove = (event) => {
    const pan = panRef.current;
    if (pan !== null) {
      const area = areaRef.current;
      if (area !== null) {
        area.scrollLeft = pan.left - (event.clientX - pan.x);
        area.scrollTop = pan.top - (event.clientY - pan.y);
      }
      return;
    }
    const point = imagePoint(event);
    const cropDraft2 = cropRef.current;
    const drag2 = dragRef.current;
    const drawing2 = drawingRef.current;
    if (cropDraft2 !== null) {
      setCropDraft({ ...cropDraft2, to: point });
      return;
    }
    if (drag2 !== null) {
      let dx = point.x - drag2.origin.x;
      let dy = point.y - drag2.origin.y;
      if (event.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      setDrag({
        ...drag2,
        moved: drag2.mode === "tail" && drag2.original.tool === "text" ? { ...drag2.original, tail: point } : translate(drag2.original, dx, dy)
      });
      return;
    }
    if (drawing2 !== null) {
      setDrawing(
        drawing2.tool === "pen" ? { ...drawing2, points: [...drawing2.points, point] } : drawing2.tool === "text" ? { ...drawing2, at: point } : { ...drawing2, to: event.shiftKey ? straighten(drawing2.from, point, drawing2.tool) : point }
      );
      return;
    }
    if (tool === "select") setHovering(pick(point) !== null);
  };
  const onPointerUp = () => {
    if (panRef.current !== null) {
      panRef.current = null;
      setPanning(false);
      return;
    }
    const cropDraft2 = cropRef.current;
    const drag2 = dragRef.current;
    const drawing2 = drawingRef.current;
    if (cropDraft2 !== null) {
      const cropBox2 = clampTo(normalized(cropDraft2.from, cropDraft2.to), view);
      if (cropBox2.width * scale >= 8 && cropBox2.height * scale >= 8) {
        commitCrop({ x: Math.round(cropBox2.x), y: Math.round(cropBox2.y), width: Math.round(cropBox2.width), height: Math.round(cropBox2.height) });
      }
      setCropDraft(null);
      return;
    }
    if (drag2 !== null) {
      if (drag2.moved !== drag2.original) replaceAt(drag2.index, drag2.moved);
      setDrag(null);
      return;
    }
    if (drawing2 !== null) {
      if (drawing2.tool === "text") {
        const tip = drawing2.tail ?? drawing2.at;
        const dragged = Math.hypot(drawing2.at.x - tip.x, drawing2.at.y - tip.y) * scale >= 12;
        if (dragged) learnCallout();
        else if (!tipDone) setTipNudge(true);
        setText({ at: drawing2.at, value: "", color: drawing2.color, weight: drawing2.weight, editing: null, ...dragged ? { tail: tip } : {} });
      } else if (!isTrivial(drawing2)) {
        commit([...marks, drawing2]);
      }
      setDrawing(null);
    }
  };
  const pickColor = (next) => {
    setColor(next);
    const mark = selected === null ? void 0 : marks[selected];
    if (selected !== null && mark !== void 0 && mark.color !== next) replaceAt(selected, { ...mark, color: next });
  };
  const pickWeight = (next) => {
    setWeight(next);
    const mark = selected === null ? void 0 : marks[selected];
    if (selected !== null && mark !== void 0 && mark.weight !== next) replaceAt(selected, { ...mark, weight: next });
  };
  const chooseTool = (next) => {
    commitText();
    setTool(next);
    if (next !== "select") setSelected(null);
  };
  const select = (index) => {
    setSelected(index);
    const mark = index === null ? void 0 : marks[index];
    if (mark !== void 0) {
      setColor(mark.color);
      setWeight(mark.weight);
    }
  };
  const pickColorRef = useRef2(pickColor);
  useEffect2(() => {
    const input = customColorRef.current;
    if (input === null) return void 0;
    const onChange = () => pickColorRef.current(input.value);
    input.addEventListener("change", onChange);
    return () => input.removeEventListener("change", onChange);
  }, []);
  const run = async (action) => {
    commitText();
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    paint(canvas, image, marks, { view: frame, image: view, frame, background, pixelRatio: ratio });
    try {
      if (action === "copy") {
        await copyImage(canvas);
        onNotice({ title: "Screenshot copied", detail: "Paste it into your coding agent, a ticket or a chat." });
      } else {
        await saveImage(canvas, fileName);
        onNotice({ title: "Screenshot saved", detail: fileName });
      }
      setSaved(history.present);
    } catch (error) {
      onNotice({
        title: action === "copy" ? "Could not copy the screenshot" : "Could not save the screenshot",
        detail: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    }
  };
  const requestClose = () => {
    if (dirty && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };
  useEffect2(() => {
    if (!confirmClose) return void 0;
    const timer = window.setTimeout(() => setConfirmClose(false), 3e3);
    return () => window.clearTimeout(timer);
  }, [confirmClose]);
  const keyRef = useRef2(() => false);
  const onKey = (event) => {
    const command = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (event.key === "Escape") {
      if (cropRef.current !== null) setCropDraft(null);
      else if (drawingRef.current !== null) setDrawing(null);
      else if (dragRef.current !== null) setDrag(null);
      else select(null);
      return true;
    }
    if (command) {
      if (key === "z") (event.shiftKey ? redo : undo)();
      else if (key === "y") redo();
      else if (key === "c") void run("copy");
      else if (key === "s") void run("save");
      else if (key === "=" || key === "+") zoomStep(1);
      else if (key === "-") zoomStep(-1);
      else if (key === "0") zoomTo(null);
      else if (key === "1") zoomTo(1 / ratio);
      else return false;
      return true;
    }
    if (event.altKey) return false;
    if ((event.key === "Delete" || event.key === "Backspace") && selected !== null) {
      replaceAt(selected, null);
      setSelected(null);
      return true;
    }
    const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    const mark = selected === null ? void 0 : marks[selected];
    if (nudge !== void 0 && selected !== null && mark !== void 0) {
      const step = (event.shiftKey ? 10 : 1) / scale;
      replaceAt(selected, translate(mark, (nudge[0] ?? 0) * step, (nudge[1] ?? 0) * step));
      return true;
    }
    const weightKey = WEIGHTS.find((entry) => String(entry.weight) === event.key);
    if (weightKey !== void 0) {
      pickWeight(weightKey.weight);
      return true;
    }
    const toolKey = TOOLS.find((entry) => entry.key === event.key.toUpperCase());
    if (toolKey !== void 0) {
      chooseTool(toolKey.tool);
      return true;
    }
    return false;
  };
  useLayoutEffect2(() => {
    keyRef.current = onKey;
    wheelRef.current = onWheel;
    pickColorRef.current = pickColor;
  });
  useEffect2(() => {
    const typing = (target) => target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement && target.type !== "color";
    const onKeyDown = (event) => {
      if (typing(event.target)) return;
      if (event.key === " ") {
        event.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (keyRef.current(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onKeyUp = (event) => {
      if (event.key === " ") setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, []);
  const cursor = panning ? "grabbing" : spaceHeld ? "grab" : tool === "select" ? drag !== null ? "grabbing" : hovering ? "move" : "default" : "crosshair";
  const custom = !COLORS.includes(color.toUpperCase());
  const textLayout = text === null ? null : calloutLayout({ at: text.at, text: text.value, weight: text.weight }, image.width, measureText());
  return /* @__PURE__ */ jsxs4(
    "div",
    {
      ref: dialogRef,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Screenshot editor",
      style: { ...FONT2, position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#0E0E0E", zIndex: Z + 5 },
      children: [
        /* @__PURE__ */ jsxs4(
          "div",
          {
            role: "toolbar",
            "aria-label": "Markup tools",
            style: { display: "flex", alignItems: "center", gap: 2, padding: "8px 12px", background: INK, borderBottom: "1px solid rgba(255,255,255,0.12)", flexWrap: "wrap", rowGap: 6 },
            children: [
              TOOLS.map((entry) => /* @__PURE__ */ jsx5(
                BarButton,
                {
                  icon: entry.icon,
                  label: entry.label,
                  detail: entry.detail,
                  shortcut: [entry.key],
                  pressed: tool === entry.tool,
                  onClick: () => chooseTool(entry.tool)
                },
                entry.tool
              )),
              /* @__PURE__ */ jsx5(Divider2, {}),
              COLORS.map((swatch) => /* @__PURE__ */ jsx5(Tooltip, { label: COLOR_NAMES[swatch] ?? swatch, placement: "below", children: (describedBy) => /* @__PURE__ */ jsx5(
                "button",
                {
                  type: "button",
                  onClick: () => pickColor(swatch),
                  "aria-label": `Colour ${COLOR_NAMES[swatch] ?? swatch}`,
                  "aria-describedby": describedBy,
                  "aria-pressed": color.toUpperCase() === swatch,
                  style: swatchStyle(swatch, color.toUpperCase() === swatch)
                }
              ) }, swatch)),
              /* @__PURE__ */ jsx5(Tooltip, { label: "Custom colour", detail: "Pick any colour.", placement: "below", children: (describedBy) => /* @__PURE__ */ jsxs4("span", { style: { position: "relative", display: "inline-flex" }, children: [
                /* @__PURE__ */ jsx5(
                  "span",
                  {
                    "aria-hidden": "true",
                    style: {
                      ...swatchStyle(custom ? color : "#FFFFFF", custom),
                      background: custom ? `radial-gradient(circle, ${color} 0 45%, transparent 47%), conic-gradient(#E5484D, #F5A524, #30A46C, #0091FF, #8E4EC6, #E5484D)` : "conic-gradient(#E5484D, #F5A524, #30A46C, #0091FF, #8E4EC6, #E5484D)"
                    }
                  }
                ),
                /* @__PURE__ */ jsx5(
                  "input",
                  {
                    ref: customColorRef,
                    type: "color",
                    "aria-label": "Custom colour",
                    "aria-describedby": describedBy,
                    value: /^#[0-9a-f]{6}$/i.test(color) ? color : "#000000",
                    onChange: (event) => setColor(event.target.value),
                    style: { position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", padding: 0, border: 0 }
                  }
                )
              ] }) }),
              /* @__PURE__ */ jsx5(Divider2, {}),
              WEIGHTS.map((entry) => /* @__PURE__ */ jsx5(Tooltip, { label: `${entry.label} stroke`, shortcut: [String(entry.weight)], placement: "below", children: (describedBy) => /* @__PURE__ */ jsx5(
                "button",
                {
                  type: "button",
                  onClick: () => pickWeight(entry.weight),
                  "aria-label": `${entry.label} stroke`,
                  "aria-describedby": describedBy,
                  "aria-pressed": weight === entry.weight,
                  style: { ...iconButton(weight === entry.weight), width: 30, minWidth: 30 },
                  children: /* @__PURE__ */ jsx5("span", { "aria-hidden": "true", style: { width: entry.dot, height: entry.dot, borderRadius: entry.dot, background: "#FFFFFF" } })
                }
              ) }, entry.weight)),
              /* @__PURE__ */ jsx5(Divider2, {}),
              /* @__PURE__ */ jsx5(BarButton, { icon: "undo", label: "Undo", shortcut: [MOD_KEY, "Z"], disabled: history.past.length === 0, onClick: undo }),
              /* @__PURE__ */ jsx5(BarButton, { icon: "redo", label: "Redo", shortcut: [MOD_KEY, "\u21E7", "Z"], disabled: history.future.length === 0, onClick: redo }),
              /* @__PURE__ */ jsx5(
                BarButton,
                {
                  icon: "eraser",
                  label: "Delete selected",
                  detail: "Select a mark with V first.",
                  shortcut: ["\u232B"],
                  disabled: selected === null,
                  onClick: () => {
                    if (selected === null) return;
                    replaceAt(selected, null);
                    setSelected(null);
                  }
                }
              ),
              /* @__PURE__ */ jsx5(BarButton, { icon: "trash", label: "Clear all marks", disabled: marks.length === 0, onClick: () => commit(NO_MARKS) }),
              /* @__PURE__ */ jsx5(
                BarButton,
                {
                  icon: "cropOff",
                  label: "Reset crop",
                  detail: crop === null ? "The image is not cropped." : "Show the whole capture again.",
                  disabled: crop === null,
                  onClick: () => commitCrop(null)
                }
              ),
              /* @__PURE__ */ jsx5("span", { style: { flex: 1, minWidth: 8 } }),
              /* @__PURE__ */ jsx5(BarButton, { icon: "zoomOut", label: "Zoom out", shortcut: [MOD_KEY, "\u2212"], disabled: percent <= MIN_ZOOM * 1.01, onClick: () => zoomStep(-1) }),
              /* @__PURE__ */ jsx5(Tooltip, { label: zoom === null ? "Actual size" : "Fit to window", shortcut: zoom === null ? [MOD_KEY, "1"] : [MOD_KEY, "0"], placement: "below", children: (describedBy) => /* @__PURE__ */ jsx5(
                "button",
                {
                  type: "button",
                  onClick: () => zoomTo(zoom === null ? 1 / ratio : null),
                  "aria-label": `Zoom ${Math.round(percent * 100)}%`,
                  "aria-describedby": describedBy,
                  style: { ...iconButton(false), minWidth: 54, padding: "0 6px", fontVariantNumeric: "tabular-nums" },
                  children: /* @__PURE__ */ jsxs4("span", { style: { ...FONT2, color: "inherit", fontWeight: 600, fontSize: 12 }, children: [
                    Math.round(percent * 100),
                    "%"
                  ] })
                }
              ) }),
              /* @__PURE__ */ jsx5(BarButton, { icon: "zoomIn", label: "Zoom in", shortcut: [MOD_KEY, "+"], disabled: percent >= MAX_ZOOM * 0.99, onClick: () => zoomStep(1) }),
              /* @__PURE__ */ jsx5(BarButton, { icon: "fit", label: "Fit to window", shortcut: [MOD_KEY, "0"], pressed: zoom === null, onClick: () => zoomTo(null) }),
              /* @__PURE__ */ jsx5(Divider2, {}),
              /* @__PURE__ */ jsx5(BarButton, { icon: "copy", label: "Copy image", shortcut: [MOD_KEY, "C"], text: "Copy", primary: true, onClick: () => void run("copy") }),
              /* @__PURE__ */ jsx5(BarButton, { icon: "download", label: "Save as PNG", detail: fileName, shortcut: [MOD_KEY, "S"], text: "Save", onClick: () => void run("save") }),
              /* @__PURE__ */ jsx5(
                BarButton,
                {
                  icon: "close",
                  label: confirmClose ? "Discard marks and close" : "Close",
                  detail: confirmClose ? "Click again to close without copying or saving." : dirty ? "Your marks are not copied or saved yet." : void 0,
                  text: confirmClose ? "Discard?" : void 0,
                  danger: confirmClose,
                  onClick: requestClose
                }
              )
            ]
          }
        ),
        showTip && tipAt !== null ? /* @__PURE__ */ jsx5(CalloutTip, { left: tipAt.left, top: tipAt.top, nudge: tipNudge, onDismiss: learnCallout }) : null,
        /* @__PURE__ */ jsx5("div", { ref: areaRef, style: { position: "relative", flex: 1, minHeight: 0, overflow: "auto" }, children: /* @__PURE__ */ jsx5("div", { style: { display: "flex", minWidth: "100%", minHeight: "100%", width: "max-content", height: "max-content" }, children: /* @__PURE__ */ jsxs4("div", { style: { position: "relative", margin: "auto", width: board.width * scale, height: board.height * scale, flex: "none" }, children: [
          /* @__PURE__ */ jsx5(
            "canvas",
            {
              ref: canvasRef,
              width: board.width,
              height: board.height,
              onPointerDown,
              onPointerMove,
              onPointerUp,
              onPointerCancel: onPointerUp,
              onPointerLeave: () => setHovering(false),
              onDoubleClick: (event) => {
                const index = pick(imagePoint(event), "text");
                if (index !== null) editText(index);
              },
              style: {
                display: "block",
                width: "100%",
                height: "100%",
                cursor,
                touchAction: "none"
              }
            }
          ),
          text === null || textLayout === null ? null : /* @__PURE__ */ jsx5(
            "textarea",
            {
              "aria-label": "Callout text",
              autoFocus: true,
              spellCheck: false,
              rows: textLayout.lines.length,
              value: text.value,
              onChange: (event) => setText({ ...text, value: event.target.value }),
              onBlur: commitText,
              onKeyDown: (event) => {
                event.stopPropagation();
                if (event.key === "Escape") setText(null);
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  commitText();
                }
              },
              style: {
                position: "absolute",
                left: (textLayout.box.x - board.x) * scale,
                top: (textLayout.box.y - board.y) * scale,
                width: textLayout.box.width * scale,
                height: textLayout.box.height * scale,
                margin: 0,
                padding: `${textLayout.padY * scale}px ${textLayout.padX * scale}px`,
                boxSizing: "border-box",
                border: 0,
                borderRadius: textLayout.radius * scale,
                outline: "1.5px dashed rgba(255,255,255,0.85)",
                outlineOffset: 3,
                resize: "none",
                overflow: "hidden",
                whiteSpace: "pre",
                textAlign: "center",
                background: "transparent",
                // The canvas paints the text; this only shows the caret and the selection.
                color: "transparent",
                caretColor: textColorOn(text.color),
                font: `600 ${textLayout.size * scale}px/${textLayout.lineHeight * scale}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
              }
            }
          )
        ] }) }) }),
        /* @__PURE__ */ jsx5(
          "div",
          {
            "aria-hidden": "true",
            style: { ...FONT2, padding: "6px 12px", fontSize: 12, color: "#9C978F", background: INK, borderTop: "1px solid rgba(255,255,255,0.08)", textAlign: "center" },
            children: tool === "select" ? "Drag a mark to move it (Shift keeps one axis) \xB7 drag a callout\u2019s round grip to re-aim its tail \xB7 arrow keys nudge \xB7 \u232B deletes \xB7 double-click text to edit" : tool === "text" ? "Drag from what you point at to where the text goes \xB7 click for a box without a tail \xB7 Enter places it, Shift+Enter adds a line" : `Hold Space and drag to pan \xB7 ${MOD_KEY} + scroll to zoom \xB7 V to select and move marks \xB7 Esc cancels`
          }
        )
      ]
    }
  );
}
var COLOR_NAMES = {
  "#E5484D": "Red",
  "#F5A524": "Amber",
  "#30A46C": "Green",
  "#0091FF": "Blue",
  "#8E4EC6": "Purple",
  "#1F1E1D": "Black"
};
function swatchStyle(fill, active) {
  return {
    appearance: "none",
    display: "block",
    width: 22,
    height: 22,
    margin: "0 3px",
    padding: 0,
    borderRadius: 11,
    background: fill,
    border: active ? "2px solid #FFFFFF" : "2px solid rgba(255,255,255,0.25)",
    boxShadow: active ? `0 0 0 2px ${fill === "#FFFFFF" ? ACCENT : fill}` : "none",
    cursor: "pointer",
    boxSizing: "border-box"
  };
}
function iconButton(pressed) {
  return {
    ...FONT2,
    appearance: "none",
    height: 34,
    minWidth: 34,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 0,
    border: 0,
    borderRadius: 8,
    cursor: "pointer",
    color: "#FFFFFF",
    background: pressed ? "rgba(255,255,255,0.2)" : "transparent"
  };
}
function Divider2() {
  return /* @__PURE__ */ jsx5("span", { "aria-hidden": "true", style: { width: 1, height: 20, margin: "0 6px", background: "rgba(255,255,255,0.18)" } });
}
function BarButton(props) {
  return /* @__PURE__ */ jsx5(Tooltip, { label: props.label, ...props.detail === void 0 ? {} : { detail: props.detail }, ...props.shortcut === void 0 ? {} : { shortcut: props.shortcut }, placement: "below", children: (describedBy) => /* @__PURE__ */ jsxs4(
    "button",
    {
      type: "button",
      onClick: props.onClick,
      disabled: props.disabled,
      "aria-label": props.label,
      "aria-describedby": describedBy,
      ...props.pressed === void 0 ? {} : { "aria-pressed": props.pressed },
      style: {
        ...iconButton(props.pressed === true),
        padding: props.text === void 0 ? 0 : "0 12px",
        cursor: props.disabled ? "default" : "pointer",
        opacity: props.disabled ? 0.35 : 1,
        background: props.danger ? "#B42318" : props.primary ? ACCENT : props.pressed ? "rgba(255,255,255,0.2)" : "transparent"
      },
      children: [
        /* @__PURE__ */ jsx5(Icon, { name: props.icon }),
        props.text === void 0 ? null : /* @__PURE__ */ jsx5("span", { style: { ...FONT2, color: "inherit", fontWeight: 600 }, children: props.text })
      ]
    }
  ) });
}
function straighten(from, to, tool) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (tool === "arrow" || tool === "ruler") {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    return { x: from.x + length * Math.cos(angle), y: from.y + length * Math.sin(angle) };
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: from.x + Math.sign(dx || 1) * side, y: from.y + Math.sign(dy || 1) * side };
}
function clampTo(box, within) {
  const x = Math.max(box.x, within.x);
  const y = Math.max(box.y, within.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(box.x + box.width, within.x + within.width) - x),
    height: Math.max(0, Math.min(box.y + box.height, within.y + within.height) - y)
  };
}
function boardAround(content, image, area, scale) {
  const width = Math.max(0, area.width - 2) / scale;
  const height = Math.max(0, area.height - 2) / scale;
  const centre = { x: image.x + image.width / 2, y: image.y + image.height / 2 };
  const box = union(content, { x: centre.x - width / 2, y: centre.y - height / 2, width, height });
  const x = Math.floor(box.x);
  const y = Math.floor(box.y);
  const right = box.width > content.width + 1 ? Math.floor(box.x + box.width) : Math.ceil(box.x + box.width);
  const bottom = box.height > content.height + 1 ? Math.floor(box.y + box.height) : Math.ceil(box.y + box.height);
  return { x, y, width: right - x, height: bottom - y };
}

// src/annotator.tsx
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
var ISOLATED = ["pointerdown", "pointerup", "mousedown", "mouseup", "dblclick"];
var REFLOW_MS = 400;
var MIN_AREA = 8;
var HINT_HIDDEN_KEY = "agent-annotator:hint-hidden";
var SHOW_COMMENTS_KEY = "agent-annotator:show-comments";
var COLLAPSED_KEY = "agent-annotator:toolbar-collapsed";
var NOTICE_MS = 5e3;
var KIND_LABEL = {
  element: () => "",
  text: () => "text",
  group: (count) => `${count} element`,
  area: () => "area"
};
function DevAnnotator(props) {
  const { appName, appDir } = props;
  const storageKey = `agent-annotator:${appName}`;
  const [resolveFrames] = useState3(() => props.resolveFrames ?? createNextResolver());
  const [active, setActive] = useState3(false);
  const [items, setItems] = useState3(() => restore(storageKey));
  const [includeData, setIncludeData] = useState3(true);
  const [panelOpen, setPanelOpen] = useState3(true);
  const [paused, setPaused] = useState3(false);
  const [hintHidden, setHintHidden] = useState3(() => readFlag(HINT_HIDDEN_KEY));
  const [hover, setHover] = useState3(null);
  const [group, setGroup] = useState3([]);
  const [dragBox, setDragBox] = useState3(null);
  const [draft, setDraft] = useState3(null);
  const [showComments, setShowComments] = useState3(() => readFlag(SHOW_COMMENTS_KEY));
  const [collapsed, setCollapsed] = useState3(() => readFlag(COLLAPSED_KEY));
  const [capturing, setCapturing] = useState3(false);
  const [shot, setShot] = useState3(null);
  const [notice, setNotice] = useState3(null);
  const [, setFrame] = useState3(0);
  useEffect3(() => {
    persist(
      storageKey,
      items.map((item) => item.annotation)
    );
  }, [items, storageKey]);
  const draftRef = useRef3(null);
  const groupRef = useRef3([]);
  const shotOpenRef = useRef3(false);
  useEffect3(() => {
    draftRef.current = draft;
    groupRef.current = group;
    shotOpenRef.current = shot !== null || capturing;
  });
  const startDraft = useCallback(
    (selection) => {
      if (draftRef.current !== null && draftRef.current.comment.trim() !== "") return;
      const several = selection.elements.length > 1;
      const captures = Promise.all(
        selection.elements.map(
          (element) => captureElement(element, resolveFrames, { dataComponents: several ? 1 : 2 })
        )
      );
      setDraft({ ...selection, captures, comment: "", editingId: null });
    },
    [resolveFrames]
  );
  useEffect3(() => {
    if (!active) return void 0;
    let dragStart = null;
    let swallowNextClick = false;
    const ignored = (event) => event.altKey || event.target instanceof Element && event.target.closest(OWN_SELECTOR) !== null;
    const isolate = (event) => {
      if (ignored(event)) return;
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const onMouseDown = (event) => {
      if (ignored(event)) return;
      isolate(event);
      if (event.shiftKey) {
        event.preventDefault();
        dragStart = { x: event.clientX, y: event.clientY };
        setDragBox({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
      }
    };
    const onMouseUp = (event) => {
      if (ignored(event)) return;
      isolate(event);
      if (dragStart !== null) {
        const area = rectBetween(dragStart, { x: event.clientX, y: event.clientY });
        dragStart = null;
        setDragBox(null);
        if (area.width >= MIN_AREA && area.height >= MIN_AREA) {
          swallowNextClick = true;
          const { container, inside: inside2 } = elementsInArea(document, area);
          const origin = container.getBoundingClientRect();
          startDraft({
            kind: "area",
            elements: [container, ...inside2],
            label: `Area ${area.width}\xD7${area.height}`,
            area,
            areaInContainer: { ...area, x: area.x - origin.left, y: area.y - origin.top }
          });
        }
        return;
      }
      const text = selectedText();
      if (text !== null) {
        swallowNextClick = true;
        startDraft({ kind: "text", elements: [text.element], label: `Text \xB7 ${hoverLabel(text.element)}`, selectedText: text.text });
      }
    };
    const onClick = (event) => {
      if (ignored(event) || !(event.target instanceof Element)) return;
      event.preventDefault();
      isolate(event);
      if (swallowNextClick) {
        swallowNextClick = false;
        return;
      }
      const element = pickTarget(event.target);
      if (event.metaKey || event.ctrlKey) {
        setGroup(
          (current) => current.includes(element) ? current.filter((kept) => kept !== element) : [...current, element]
        );
        return;
      }
      startDraft({ kind: "element", elements: [element], label: hoverLabel(element) });
    };
    const onKeyUp = (event) => {
      if (event.key !== "Meta" && event.key !== "Control") return;
      const elements = groupRef.current;
      if (elements.length === 0) return;
      setGroup([]);
      const [only] = elements;
      if (elements.length === 1 && only !== void 0) {
        startDraft({ kind: "element", elements: [only], label: hoverLabel(only) });
      } else {
        startDraft({ kind: "group", elements, label: `${elements.length} element` });
      }
    };
    const onMove = (event) => {
      if (dragStart !== null) {
        setDragBox(rectBetween(dragStart, { x: event.clientX, y: event.clientY }));
        return;
      }
      if (!(event.target instanceof Element) || event.target.closest(OWN_SELECTOR) !== null) {
        setHover(null);
        return;
      }
      const element = pickTarget(event.target);
      setHover((current) => current?.element === element ? current : { element, label: hoverLabel(element) });
    };
    for (const type of ISOLATED) {
      if (type !== "mousedown" && type !== "mouseup") window.addEventListener(type, isolate, true);
    }
    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("keyup", onKeyUp, true);
    const root = document.documentElement;
    const previousCursor = root.style.cursor;
    root.style.cursor = "crosshair";
    return () => {
      for (const type of ISOLATED) window.removeEventListener(type, isolate, true);
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("mouseup", onMouseUp, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("keyup", onKeyUp, true);
      root.style.cursor = previousCursor;
      setHover(null);
      setGroup([]);
      setDragBox(null);
    };
  }, [active, startDraft]);
  useEffect3(() => {
    const onKey = (event) => {
      if (shotOpenRef.current) return;
      if (event.altKey && event.shiftKey && event.code === "KeyC") {
        event.preventDefault();
        setActive((value) => !value);
      } else if (event.key === "Escape") {
        if (draftRef.current !== null) setDraft(null);
        else if (groupRef.current.length > 0) setGroup([]);
        else setActive(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  useEffect3(() => paused ? pauseMotion(document) : void 0, [paused]);
  useEffect3(() => {
    if (notice === null) return void 0;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const tracking = active || draft !== null || items.length > 0;
  useEffect3(() => {
    if (!tracking) return void 0;
    const bump = () => setFrame((frame) => frame + 1);
    window.addEventListener("scroll", bump, true);
    window.addEventListener("resize", bump);
    const timer = window.setInterval(bump, REFLOW_MS);
    return () => {
      window.removeEventListener("scroll", bump, true);
      window.removeEventListener("resize", bump);
      window.clearInterval(timer);
    };
  }, [tracking]);
  const saveDraft = async () => {
    if (draft === null || draft.comment.trim() === "") return;
    const { comment, editingId } = draft;
    setDraft(null);
    window.getSelection()?.removeAllRanges();
    if (editingId !== null) {
      setItems(
        (current) => current.map(
          (item) => item.annotation.id === editingId ? { ...item, annotation: { ...item.annotation, comment } } : item
        )
      );
      return;
    }
    const targets = await draft.captures;
    const annotation = {
      id: newId(),
      kind: draft.kind,
      comment,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      targets,
      ...draft.selectedText === void 0 ? {} : { selectedText: draft.selectedText },
      ...draft.area === void 0 ? {} : { area: draft.area },
      ...draft.areaInContainer === void 0 ? {} : { areaInContainer: draft.areaInContainer }
    };
    setItems((current) => [...current, { annotation, elements: draft.elements }]);
    setPanelOpen(true);
  };
  const editItem = (id) => {
    const item = items.find((candidate) => candidate.annotation.id === id);
    if (item === void 0) return;
    const { annotation } = item;
    const first = annotation.targets[0];
    const element = liveElement(item);
    const area = element === null ? null : liveArea(item, element);
    setDraft({
      kind: annotation.kind,
      ...area === null ? {} : { area },
      elements: element === null ? [] : [element],
      label: first?.components[0]?.name ?? first?.element.tag ?? annotation.kind,
      ...annotation.selectedText === void 0 ? {} : { selectedText: annotation.selectedText },
      captures: Promise.resolve(annotation.targets),
      comment: annotation.comment,
      editingId: id
    });
  };
  const copyPrompt = async () => {
    const prompt = buildPrompt(
      items.map((item) => item.annotation),
      { appName, appDir, includeData, now: /* @__PURE__ */ new Date() }
    );
    await writeClipboard(prompt);
    const count = items.length;
    setNotice({
      title: "Prompt copied \u2014 ready for your coding agent",
      detail: `Paste it into Claude Code, Codex or Cursor. It gives the file, line and component behind ${count === 1 ? "your comment" : `each of your ${count} comments`}.`
    });
  };
  const takeScreenshot = async () => {
    setDraft(null);
    setPanelOpen(false);
    setNotice(null);
    try {
      const image = await (props.captureScreen ?? captureTab)(async () => {
        setCapturing(true);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        await new Promise((resolve) => window.setTimeout(resolve, 300));
      });
      setShot({ image, fileName: shotFileName(appName, window.location.pathname, /* @__PURE__ */ new Date()) });
    } catch (error) {
      setNotice(
        error instanceof CaptureCancelled ? { title: "Screenshot cancelled", detail: 'Choose "This tab" and Allow when the browser asks.', tone: "error" } : { title: "Could not take the screenshot", detail: error instanceof Error ? error.message : String(error), tone: "error" }
      );
    } finally {
      setCapturing(false);
    }
  };
  const toggleComments = () => {
    setShowComments(!showComments);
    writeFlag(SHOW_COMMENTS_KEY, !showComments);
  };
  const entries = items.map((item, index) => {
    const { annotation } = item;
    const first = annotation.targets[0];
    const kind = KIND_LABEL[annotation.kind](annotation.targets.length);
    const component = first?.components[0]?.name;
    const what = kind || `${component ? `${component} \xB7 ` : ""}${first?.element.tag ?? ""}`;
    return {
      id: annotation.id,
      number: index + 1,
      comment: annotation.comment,
      where: `${first?.page.pathname ?? ""} \xB7 ${what}`,
      onThisPage: liveElement(item) !== null
    };
  });
  const hideHint = (hidden) => {
    setHintHidden(hidden);
    writeFlag(HINT_HIDDEN_KEY, hidden);
  };
  const draftElement = draft?.elements[0];
  const draftBox = draftElement?.isConnected ? boxOf(draftElement) : null;
  const onScreen = items.flatMap((item, index) => {
    const element = liveElement(item);
    if (element === null) return [];
    const area = liveArea(item, element);
    return [
      area === null ? { number: index + 1, comment: item.annotation.comment, box: boxOf(element) } : { number: index + 1, comment: item.annotation.comment, box: areaBox(area), area: true }
    ];
  });
  const callouts = showComments || capturing ? layoutCallouts(onScreen, { width: window.innerWidth, height: window.innerHeight }) : null;
  const editNumber = (number) => {
    const item = items[number - 1];
    if (item !== void 0) editItem(item.annotation.id);
  };
  const overlay = capturing ? /* @__PURE__ */ jsx6("div", { "data-dev-annotator": "", children: /* @__PURE__ */ jsx6(Callouts, { callouts: callouts ?? [], onEdit: null }) }) : /* @__PURE__ */ jsxs5("div", { "data-dev-annotator": "", children: [
    active && !hintHidden ? /* @__PURE__ */ jsx6(Hint, { onDismiss: () => hideHint(true) }) : null,
    active && hover !== null && hover.element !== draftElement && dragBox === null ? /* @__PURE__ */ jsx6(Highlight, { box: boxOf(hover.element), label: hover.label, strong: false }) : null,
    group.map((element, index) => /* @__PURE__ */ jsx6(Highlight, { box: boxOf(element), label: `#${index + 1}`, strong: true }, index)),
    dragBox !== null ? /* @__PURE__ */ jsx6(AreaBox, { box: { top: dragBox.y, left: dragBox.x, width: dragBox.width, height: dragBox.height } }) : null,
    draft?.area !== void 0 ? /* @__PURE__ */ jsx6(AreaBox, { box: { top: draft.area.y, left: draft.area.x, width: draft.area.width, height: draft.area.height } }) : null,
    draft !== null && draft.kind !== "area" ? draft.elements.filter((element) => element.isConnected).map((element, index) => /* @__PURE__ */ jsx6(Highlight, { box: boxOf(element), label: index === 0 ? draft.label : `#${index + 1}`, strong: true }, index)) : null,
    callouts !== null ? /* @__PURE__ */ jsx6(Callouts, { callouts, onEdit: editNumber }) : onScreen.map((target) => /* @__PURE__ */ jsx6(Pin, { box: target.box, number: target.number, onClick: () => editNumber(target.number) }, target.number)),
    draft !== null ? /* @__PURE__ */ jsx6(
      Editor,
      {
        anchor: draft.area === void 0 ? draftBox : areaBox(draft.area),
        title: draft.editingId === null ? draft.label : `Edit comment \xB7 ${draft.label}`,
        comment: draft.comment,
        editing: draft.editingId !== null,
        onChange: (comment) => setDraft((current) => current === null ? null : { ...current, comment }),
        onSave: () => void saveDraft(),
        onCancel: () => setDraft(null),
        onDelete: () => {
          const id = draft.editingId;
          setDraft(null);
          setItems((current) => current.filter((item) => item.annotation.id !== id));
        }
      }
    ) : null,
    panelOpen && !collapsed && items.length > 0 ? /* @__PURE__ */ jsx6(
      Panel,
      {
        entries,
        includeData,
        onIncludeData: setIncludeData,
        onEdit: editItem,
        onClear: () => {
          setDraft(null);
          setItems([]);
        },
        onClose: () => setPanelOpen(false)
      }
    ) : null,
    /* @__PURE__ */ jsx6(
      Toolbar,
      {
        active,
        paused,
        count: items.length,
        panelOpen,
        showComments,
        capturing,
        collapsed,
        onToggleCollapsed: () => {
          setCollapsed(!collapsed);
          writeFlag(COLLAPSED_KEY, !collapsed);
        },
        onShowHint: active && hintHidden ? () => hideHint(false) : null,
        onToggleActive: () => setActive((value) => !value),
        onTogglePaused: () => setPaused((value) => !value),
        onToggleComments: toggleComments,
        onScreenshot: () => void takeScreenshot(),
        onTogglePanel: () => setPanelOpen((value) => !value),
        onCopy: () => void copyPrompt()
      }
    ),
    notice !== null ? /* @__PURE__ */ jsx6(Toast, { notice, onDismiss: () => setNotice(null) }) : null,
    shot !== null ? /* @__PURE__ */ jsx6(ScreenshotEditor, { image: shot.image, fileName: shot.fileName, onClose: () => setShot(null), onNotice: setNotice }) : null
  ] });
  return createPortal(overlay, document.body);
}
function pickTarget(target) {
  if (target instanceof SVGElement && !(target instanceof SVGSVGElement)) return target.closest("svg") ?? target;
  return target;
}
function rectBetween(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}
function areaBox(area) {
  return { top: area.y, left: area.x, width: area.width, height: area.height };
}
function selectedText() {
  const selection = window.getSelection();
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null;
  const text = selection.toString().replace(/\s+/g, " ").trim();
  if (text === "") return null;
  const node = selection.getRangeAt(0).commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  if (element === null || element.closest(OWN_SELECTOR) !== null) return null;
  return { element, text: truncate(redactText(text), 500) };
}
function liveArea(item, container) {
  const offset = item.annotation.areaInContainer;
  if (item.annotation.kind !== "area" || offset === void 0) return null;
  const origin = container.getBoundingClientRect();
  return { x: origin.left + offset.x, y: origin.top + offset.y, width: offset.width, height: offset.height };
}
function liveElement(item) {
  const [element] = item.elements;
  if (element?.isConnected) return element;
  const first = item.annotation.targets[0];
  if (first === void 0 || window.location.pathname !== first.page.pathname) return null;
  try {
    return document.querySelector(first.element.selector);
  } catch {
    return null;
  }
}
function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function restore(key) {
  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((annotation) => Array.isArray(annotation?.targets) && annotation.targets.length > 0).map((annotation) => ({ annotation, elements: [] }));
  } catch {
    return [];
  }
}
function persist(key, annotations) {
  try {
    if (annotations.length === 0) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(annotations));
  } catch {
  }
}
async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("data-dev-annotator", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}
export {
  DevAnnotator,
  buildPrompt,
  createNextResolver
};
//# sourceMappingURL=index.js.map