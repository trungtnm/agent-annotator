import { ReactNode } from 'react';

/**
 * What counts as personal data, and the switch that turns screening off. The prompt is
 * pasted into an AI agent, so whatever gets through leaves the machine: a dev database can
 * still hold a copy of real customer data.
 *
 * Two independent screens:
 * - by KEY: a property whose name says it holds personal data or a secret is replaced
 *   whole, whatever its value;
 * - by VALUE: inside every string, an e-mail address, the number formats of the selected
 *   countries and the user's own patterns are replaced where they stand, so text that
 *   merely mentions one (an element's label, a free-text note) is screened too.
 *
 * Amounts survive on purpose: they are what a UI bug is usually about. Every built-in
 * number pattern needs a shape no money figure has (a leading 0 or country code, a
 * separator, letters around the digits).
 */
declare const REDACTED = "[redacted]";
type RedactionCountry = 'vn' | 'us' | 'sg';
interface RedactionSettings {
    /** Off: props, state and page text go into the prompt as they are. */
    readonly enabled: boolean;
    /** Whose phone and ID formats are screened by value; e-mail addresses always are. */
    readonly countries: readonly RedactionCountry[];
    /**
     * Extra value patterns, as regular expression sources (`INV-\d{6}`) or literals with
     * flags (`/acct[0-9]+/i`). Every match is replaced; blank and invalid lines are skipped.
     */
    readonly patterns: readonly string[];
}
/** What `DevAnnotator`'s `redaction` prop takes: any field left out keeps its default. */
interface RedactionOptions {
    readonly enabled?: boolean;
    readonly countries?: readonly RedactionCountry[];
    readonly patterns?: ReadonlyArray<string | RegExp>;
}
declare const COUNTRIES: RedactionCountry[];
declare const DEFAULT_REDACTION: RedactionSettings;

/**
 * Taking the screenshot, and getting it out of the browser.
 *
 * The capture is the tab itself, through the Screen Capture API: the browser asks once
 * ("share this tab?") and hands back real pixels — canvases, videos, cross-origin images
 * and fonts exactly as rendered, which a DOM-to-image library can only approximate. Between
 * the permission and the grab, `prepare` gets the page ready: the tool's own controls away,
 * every comment shown in full.
 */
type ScreenCapture = (prepare: () => Promise<void>) => Promise<HTMLCanvasElement>;

/**
 * Where in the source an element's JSX is written.
 *
 * React 19 dropped `fiber._debugSource` (the file:line a Babel plugin used to stamp on
 * every element). What it keeps, in development, is `fiber._debugStack`: an Error created
 * when the element was created, so its stack names the render function — and the line —
 * that wrote the JSX. Those frames point at bundled code (`webpack-internal:///…`), so
 * they are sent to the dev server's own `/__nextjs_original-stack-frames`, the endpoint
 * Next's error overlay uses to map frames back through the source maps. Under Turbopack
 * that endpoint rejects browser chunk URLs, so those frames go through the chunk's own
 * source map instead (`source-map.ts`).
 *
 * That endpoint is Next internals, not an API. Everything here degrades instead of
 * failing: no answer means the frame's own file and bundled line, flagged as such.
 */
interface RawFrame {
    readonly file: string;
    readonly line1: number;
    readonly column1: number;
    readonly methodName: string;
}
interface SourceLocation {
    /**
     * Relative to the app's directory when Next mapped it (webpack), absolute when the chunk's
     * source map did (Turbopack), else the bundled URL or path.
     */
    readonly file: string;
    readonly line: number;
    readonly column: number | null;
    /** True when the line is the ORIGINAL source line, false when it is the bundled one. */
    readonly mapped: boolean;
    /** Next flagged the frame as framework or library code: not where an edit belongs. */
    readonly ignored?: boolean;
}
type FrameResolver = (frames: readonly RawFrame[]) => Promise<SourceLocation[]>;
/**
 * Maps frames through Next's dev server in ONE request. Always resolves, one location per
 * frame, in order: a frame Next could not map, or any failure of the request, falls back
 * to the frame as bundled.
 */
declare function createNextResolver(fetchImpl?: typeof fetch): FrameResolver;

interface DevAnnotatorProps {
    /** Names the app in the prompt and keys the saved comments (`web`, `admin`). */
    readonly appName: string;
    /** The app's directory from the repo root, so source paths in the prompt open as-is. */
    readonly appDir?: string;
    /**
     * Personal-data redaction for this app: on or off, which countries' phone and ID
     * formats to screen, and extra patterns. Each browser can change it from the toolbar's
     * redaction settings; these are the defaults it starts from and resets to.
     */
    readonly redaction?: RedactionOptions;
    /** Overrides how stack frames are mapped to source; tests pass one, apps never do. */
    readonly resolveFrames?: FrameResolver;
    /** Overrides how the tab is captured; tests pass one, apps never do. */
    readonly captureScreen?: ScreenCapture;
}
/**
 * Development-only overlay: a floating button switches on "comment mode". In it, a click
 * pins a comment to an element, a text selection to a passage, Cmd/Ctrl+click gathers
 * several elements under one comment and Shift+drag marks an area — and the page sees
 * none of it. "Copy prompt" puts every comment, with what the tool learned about its
 * elements, on the clipboard as one Markdown prompt for a coding agent.
 *
 * Comments survive client-side navigation (this component lives in the root layout) and
 * a full reload (sessionStorage), so one request can span several pages.
 */
declare function DevAnnotator(props: DevAnnotatorProps): ReactNode;

type Snapshot = null | boolean | number | string | readonly Snapshot[] | {
    readonly [key: string]: Snapshot;
};

/**
 * Everything one comment records about its element, taken at the moment of the click.
 * "The current value of the data" is the value the developer was LOOKING at when they
 * noticed the problem, so it is captured then, not when the prompt is copied — by which
 * time they may have navigated away and back.
 */
interface ElementCapture {
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
        readonly rect: {
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        };
        readonly styles: Readonly<Record<string, string>>;
        /** Role, accessible name and ARIA states: `button "Save" (disabled)`. */
        readonly accessibility: string | null;
        /** Page heading and enclosing section labels: `Debt batches › New batch`. */
        readonly section: string | null;
        /** The text of the siblings either side, to tell identical elements apart. */
        readonly nearby: string | null;
    };
    readonly viewport: {
        readonly width: number;
        readonly height: number;
        readonly devicePixelRatio: number;
    };
    /** Where the element's own JSX is written: usually the line to edit. */
    readonly jsx: SourceLocation | null;
    /** Enclosing components, nearest first, each with where IT was rendered from. */
    readonly components: ReadonlyArray<{
        readonly name: string;
        readonly renderedAt: SourceLocation | null;
    }>;
    /** Props and stateful hooks of the nearest components, personal data redacted unless redaction is off. */
    readonly data: ReadonlyArray<{
        readonly component: string;
        readonly props: Snapshot;
        readonly state: Snapshot;
    }>;
}

interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/**
 * What one comment is about:
 * - `element`: one clicked element;
 * - `text`: a passage selected inside an element (the element is the target);
 * - `group`: several elements picked with Cmd/Ctrl+click, one request for all of them;
 * - `area`: a dragged region — the first target is the element holding the region, the
 *   rest are the elements wholly inside it (none, for a comment on empty space).
 */
type AnnotationKind = 'element' | 'text' | 'group' | 'area';
interface Annotation {
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
    /**
     * `false` when the comment was made with redaction switched off, so its captures hold
     * the page's data as it was. Comments saved before the setting existed were screened.
     */
    readonly redacted?: boolean;
}
interface PromptOptions {
    /** Shown in the heading: which app the comments are about. */
    readonly appName: string;
    /** The app's directory from the repo root (`apps/web`); prefixes every source path. */
    readonly appDir?: string | undefined;
    /** Include the props/state snapshots. */
    readonly includeData: boolean;
    readonly now: Date;
}
/**
 * The Markdown handed to the coding agent. It is written FOR the agent: what to do comes
 * first, then one section per comment with the facts it needs to find the code without
 * searching — the source line before the selector, the selector before the text.
 */
declare function buildPrompt(annotations: readonly Annotation[], options: PromptOptions): string;

export { type Annotation, COUNTRIES, DEFAULT_REDACTION, DevAnnotator, type DevAnnotatorProps, type ElementCapture, type FrameResolver, type PromptOptions, REDACTED, type RedactionCountry, type RedactionOptions, type RedactionSettings, type ScreenCapture, type SourceLocation, buildPrompt, createNextResolver };
