import { typeName } from './serialize';

/**
 * Reading React's internal fiber tree from a DOM node. None of this is public API; it is
 * the same walk React DevTools does, kept to the fields that have been stable across
 * React 18 and 19. Development builds only: `_debugStack` does not exist in production.
 */

export interface Fiber {
  readonly tag: number;
  readonly type: unknown;
  readonly elementType: unknown;
  readonly return: Fiber | null;
  readonly memoizedProps: unknown;
  readonly memoizedState: unknown;
  readonly stateNode: unknown;
  readonly _debugStack?: unknown;
}

/** Fiber tags (react-reconciler `ReactWorkTags`) for things that are components. */
const FUNCTION_COMPONENT = 0;
const CLASS_COMPONENT = 1;
const FORWARD_REF = 11;
const MEMO_COMPONENT = 14;
const SIMPLE_MEMO_COMPONENT = 15;
const COMPONENT_TAGS = new Set([FUNCTION_COMPONENT, CLASS_COMPONENT, FORWARD_REF, MEMO_COMPONENT, SIMPLE_MEMO_COMPONENT]);

/**
 * Framework plumbing between a page and the root. Naming it in the prompt only buries
 * the components the request is about.
 */
const FRAMEWORK_COMPONENTS = new Set([
  'AppDevOverlay',
  'AppDevOverlayErrorBoundary',
  'AppRouter',
  'ClientPageRoot',
  'ClientSegmentRoot',
  'DevRootHTTPAccessFallbackBoundary',
  'ErrorBoundary',
  'ErrorBoundaryHandler',
  'GlobalError',
  'HTTPAccessFallbackBoundary',
  'HTTPAccessFallbackErrorBoundary',
  'HandleRedirect',
  'Head',
  'HistoryUpdater',
  'HotReload',
  'InnerLayoutRouter',
  'InnerScrollAndFocusHandler',
  'LayoutRouter',
  'LoadingBoundary',
  'MetadataBoundary',
  'MetadataOutlet',
  'OuterLayoutRouter',
  'OutletBoundary',
  'RedirectBoundary',
  'RedirectErrorBoundary',
  'RenderFromTemplateContext',
  'ReplaySsrOnlyErrors',
  'Root',
  'RootErrorBoundary',
  'Router',
  'RuntimeStyles',
  'ScrollAndFocusHandler',
  'SegmentStateProvider',
  'SegmentViewNode',
  'ServerRoot',
  'ViewportBoundary',
  'DevAnnotator',
]);

/** The fiber React attached to this node, or to its nearest ancestor that has one. */
export function fiberOf(node: Node): Fiber | null {
  let current: Node | null = node;
  while (current !== null) {
    for (const key of Object.keys(current)) {
      if (key.startsWith('__reactFiber$')) return (current as unknown as Record<string, Fiber>)[key] ?? null;
    }
    current = current.parentNode;
  }
  return null;
}

export function isComponent(fiber: Fiber): boolean {
  return COMPONENT_TAGS.has(fiber.tag);
}

export function componentName(fiber: Fiber): string {
  return typeName(fiber.elementType ?? fiber.type);
}

/**
 * The components enclosing the fiber, nearest first, without framework plumbing and
 * without a memo/forwardRef wrapper repeating the component it wraps.
 */
export function componentAncestors(fiber: Fiber, limit = 12): Fiber[] {
  const out: Fiber[] = [];
  let previousName: string | null = null;
  for (let current: Fiber | null = fiber; current !== null && out.length < limit; current = current.return) {
    if (!isComponent(current)) continue;
    const name = componentName(current);
    if (FRAMEWORK_COMPONENTS.has(name) || name.startsWith('__next') || name === 'Anonymous' || name === previousName) {
      continue;
    }
    out.push(current);
    previousName = name;
  }
  return out;
}

interface HookNode {
  readonly memoizedState: unknown;
  readonly queue: unknown;
  readonly next: HookNode | null;
}

/**
 * The values of a component's stateful hooks — `useState`, `useReducer`,
 * `useSyncExternalStore` (which is how React Query hands a component its `data`) — in
 * call order. React keeps no hook NAMES; the order matches the order the hooks are
 * called in the component's source. A class component's `this.state` comes back whole.
 */
export function componentState(fiber: Fiber): unknown[] {
  if (fiber.tag === CLASS_COMPONENT) {
    return fiber.memoizedState === null || fiber.memoizedState === undefined ? [] : [fiber.memoizedState];
  }
  const values: unknown[] = [];
  let hook = fiber.memoizedState as HookNode | null;
  // A hook list node always carries `next`; anything else is not a hook list.
  while (hook !== null && typeof hook === 'object' && 'next' in hook) {
    if (hook.queue !== null && hook.queue !== undefined) values.push(hook.memoizedState);
    hook = hook.next;
  }
  return values;
}

/** The stack React captured when this fiber's element was created, if this is a dev build. */
export function debugStackOf(fiber: Fiber): string | null {
  const stack = fiber._debugStack;
  if (stack instanceof Error) return stack.stack ?? null;
  return typeof stack === 'string' ? stack : null;
}
