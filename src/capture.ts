import { describeAccessibility, nearbyText, sectionPath } from './context';
import { componentAncestors, componentName, componentState, debugStackOf, fiberOf, type Fiber } from './fiber';
import { cssSelector, controlValue, describeElement, elementText } from './selector';
import { toSnapshot, type Snapshot } from './serialize';
import { callSiteFrame, type FrameResolver, type RawFrame, type SourceLocation } from './stack';

/**
 * Everything one comment records about its element, taken at the moment of the click.
 * "The current value of the data" is the value the developer was LOOKING at when they
 * noticed the problem, so it is captured then, not when the prompt is copied — by which
 * time they may have navigated away and back.
 */
export interface ElementCapture {
  readonly page: {
    readonly url: string;
    readonly pathname: string;
    readonly search: string;
    readonly title: string;
  };
  readonly element: {
    readonly tag: string;
    readonly opening: string;
    readonly selector: string;
    readonly text: string;
    readonly value: string | null;
    readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly styles: Readonly<Record<string, string>>;
    /** Role, accessible name and ARIA states: `button "Save" (disabled)`. */
    readonly accessibility: string | null;
    /** Page heading and enclosing section labels: `Debt batches › New batch`. */
    readonly section: string | null;
    /** The text of the siblings either side, to tell identical elements apart. */
    readonly nearby: string | null;
  };
  readonly viewport: { readonly width: number; readonly height: number; readonly devicePixelRatio: number };
  /** Where the element's own JSX is written: usually the line to edit. */
  readonly jsx: SourceLocation | null;
  /** Enclosing components, nearest first, each with where IT was rendered from. */
  readonly components: ReadonlyArray<{ readonly name: string; readonly renderedAt: SourceLocation | null }>;
  /** Props and stateful hooks of the nearest components, PII redacted. */
  readonly data: ReadonlyArray<{ readonly component: string; readonly props: Snapshot; readonly state: Snapshot }>;
}

/** Computed styles worth quoting when the request is about how something looks. */
const STYLE_PROPERTIES = [
  'display',
  'position',
  'width',
  'height',
  'margin',
  'padding',
  'gap',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'color',
  'background-color',
  'border',
  'border-radius',
  'opacity',
  'overflow',
  'white-space',
] as const;

/** Styles whose value means "nothing set", left out to keep the list readable. */
const DEFAULT_STYLE_VALUES = new Set(['none', 'normal', 'auto', '0px', 'rgba(0, 0, 0, 0)', 'visible', 'static', '1']);

export interface CaptureOptions {
  /** Components whose props and state are snapshotted; further ones are only named. */
  readonly dataComponents?: number;
}

const DATA_COMPONENTS = 2;
/** Components whose render site is resolved to a source location. */
const LOCATED_COMPONENTS = 4;

export async function captureElement(
  element: Element,
  resolve: FrameResolver,
  options: CaptureOptions = {},
): Promise<ElementCapture> {
  const win = element.ownerDocument.defaultView ?? window;
  const fiber = fiberOf(element);
  const components = fiber === null ? [] : componentAncestors(fiber);

  // One request maps every frame: the element's own JSX site, then each component's.
  const sites: Array<RawFrame | null> = [fiber, ...components.slice(0, LOCATED_COMPONENTS)].map((f) =>
    f === null ? null : siteOf(f),
  );
  const wanted = sites.filter((site): site is RawFrame => site !== null);
  const resolved = wanted.length > 0 ? await resolve(wanted) : [];
  const locations = new Map<RawFrame, SourceLocation | undefined>(wanted.map((site, index) => [site, resolved[index]]));
  // A frame inside the framework says only that Next rendered the component: drop it.
  const locate = (site: RawFrame | null | undefined): SourceLocation | null => {
    const location = site ? locations.get(site) : undefined;
    return location === undefined || location.ignored === true ? null : location;
  };

  const rect = element.getBoundingClientRect();
  return {
    page: {
      url: win.location.href,
      pathname: win.location.pathname,
      search: win.location.search,
      title: element.ownerDocument.title,
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
      nearby: nearbyText(element),
    },
    viewport: { width: win.innerWidth, height: win.innerHeight, devicePixelRatio: win.devicePixelRatio },
    jsx: locate(sites[0]),
    components: components.map((component, index) => ({
      name: componentName(component),
      renderedAt: locate(sites[index + 1]),
    })),
    data: components.slice(0, options.dataComponents ?? DATA_COMPONENTS).map((component) => ({
      component: componentName(component),
      props: toSnapshot(component.memoizedProps),
      state: toSnapshot(componentState(component)),
    })),
  };
}

function siteOf(fiber: Fiber): RawFrame | null {
  const stack = debugStackOf(fiber);
  return stack === null ? null : callSiteFrame(stack);
}

function notableStyles(style: CSSStyleDeclaration): Record<string, string> {
  const out: Record<string, string> = {};
  for (const property of STYLE_PROPERTIES) {
    const value = style.getPropertyValue(property).trim();
    if (value && !DEFAULT_STYLE_VALUES.has(value)) out[property] = value;
  }
  return out;
}

/** The label shown while hovering: the nearest component and the tag, without any I/O. */
export function hoverLabel(element: Element): string {
  const fiber = fiberOf(element);
  const nearest = fiber === null ? undefined : componentAncestors(fiber, 1)[0];
  const tag = element.tagName.toLowerCase();
  return nearest === undefined ? tag : `${componentName(nearest)} · ${tag}`;
}
