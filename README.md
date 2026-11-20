# agent-annotator

A development-only overlay for React apps. Point at the running UI, say what should change,
and hand your coding agent one prompt that already knows where the code is.

- **Comment on anything on the page**: an element, a selected passage, several elements at
  once, or a dragged area.
- **Copy prompt** puts one Markdown prompt on the clipboard. Per comment it names the page,
  the element, the **JSX file and line that rendered it**, the React component chain, and a
  snapshot of the nearest components' props and state with personal data redacted.
- **Screenshot** captures the tab with every comment drawn in, then opens a Shottr-style
  editor: arrows, callouts, boxes, highlight, pen, ruler, crop and pixelate, with copy and
  save as PNG.

Nothing leaves the machine: the prompt and the image go to your clipboard or disk, and the
overlay is meant to be loaded only in development.

## Requirements

- **React 19**, in a development build. Source locations come from React 19's
  `_debugStack`; a production build has none.
- A bundler dev server that exposes source maps. **Next.js 15** (webpack or Turbopack) works
  out of the box; any dev server that serves `<script>.map` next to each script is mapped
  through it; otherwise the prompt gives the bundled line, flagged as approximate.
- Screenshots use the Screen Capture API (`getDisplayMedia`): Chromium browsers on
  `localhost` or `https`. The browser asks once per capture; pick **This tab**.

## Install

```bash
pnpm add -D @trungtnm/agent-annotator
# or, before the first npm release:
pnpm add -D github:trungtnm/agent-annotator#v0.1.0
```

## Use

### Next.js (App Router)

Mount it from a client component in the root layout, behind a `NODE_ENV` check, so the
production build drops the import entirely:

```tsx
// app/dev-annotator-mount.tsx
'use client';

import dynamic from 'next/dynamic';

const DevAnnotator =
  process.env.NODE_ENV === 'development'
    ? dynamic(() => import('@trungtnm/agent-annotator').then((m) => m.DevAnnotator), { ssr: false })
    : null;

export function DevAnnotatorMount() {
  return DevAnnotator === null ? null : <DevAnnotator appName="web" appDir="apps/web" />;
}
```

```tsx
// app/layout.tsx
<body>
  {children}
  <DevAnnotatorMount />
</body>
```

### Vite and others

```tsx
import { lazy, Suspense } from 'react';

const DevAnnotator = import.meta.env.DEV
  ? lazy(() => import('@trungtnm/agent-annotator').then((m) => ({ default: m.DevAnnotator })))
  : null;

export function App() {
  return (
    <>
      {/* your app */}
      {DevAnnotator && (
        <Suspense fallback={null}>
          <DevAnnotator appName="web" />
        </Suspense>
      )}
    </>
  );
}
```

### Props

| Prop | | |
|---|---|---|
| `appName` | required | Names the app in the prompt, the screenshot file name and the saved comments. |
| `appDir` | optional | The app's directory from the repo root (`apps/web`). Source paths in the prompt are then written from the repo root, ready to open. |
| `resolveFrames` | optional | Replaces how stack frames are mapped to source (see `createNextResolver`). |
| `captureScreen` | optional | Replaces how the tab is captured; mainly for tests. |

## Using it

| | |
|---|---|
| **Alt+Shift+C** | Turn comment mode on or off (or the first toolbar button). |
| Click | Comment on an element. |
| Select text | Comment on that passage. |
| **⌘/Ctrl**+click | Pick several elements; release ⌘/Ctrl to write one comment for all. |
| **Shift**+drag | Comment on an area. |
| **Alt**+click | Use the page normally while comment mode is on. |
| Esc | Close the editor, drop a selection, leave comment mode. |

The toolbar (bottom right) also pauses animations, shows every comment in full instead of
numbered pins, opens the comment list, copies the prompt, and folds into one button.
Comments survive navigation and reloads (sessionStorage, per tab).

### Screenshot editor

| Key | Tool |
|---|---|
| V | Select and move: drag a mark, arrow keys nudge, ⌫ deletes, double-click a callout to edit it |
| A | Arrow (Shift snaps to 45°) |
| T | Callout: press on what it points at, drag to where the text goes, type, Enter; a click gives a box without a tail |
| R / H / P | Rectangle, highlight, pen |
| M | Ruler, in the page's CSS pixels |
| C | Crop (undoable) |
| B | Pixelate, to hide personal data |
| 1 / 2 / 3 | Stroke weight |
| ⌘Z, ⇧⌘Z | Undo, redo |
| ⌘+ ⌘− ⌘0 ⌘1, ⌘+scroll, Space+drag | Zoom in/out, fit, actual size; pan |
| ⌘C, ⌘S | Copy PNG, save PNG |

Marks can go outside the picture: the image grows to hold them, filled with the colour found
along its edge.

## Privacy

Props, state and selected text are screened before they reach the prompt. Values under keys
that name personal data (phone, email, name, address, national ID, bank account, password,
token and similar), and text that looks like an email address, a Vietnamese phone number or a
12-digit Vietnamese citizen ID, are replaced with `[redacted]`. Phone and ID patterns for other
countries are welcome as contributions. The element's own visible text is kept, because it is what you
pointed at; use the **Include props/state** switch and the pixelate tool for anything else.

## How source locations are found

React 19 records, in development, the stack at which each element was created. The overlay
takes the first frame outside React, then maps it to the original source: through Next.js's
own `/__nextjs_original-stack-frames` endpoint (webpack), or through the script's source map
fetched from the dev server (Turbopack and others). A frame that cannot be mapped is given as
the bundled position, marked approximate.

## Develop

```bash
pnpm install
pnpm check   # lint, typecheck, test, build
```

`dist/` is committed so the repository can be used as a git dependency; CI fails when it does
not match the source, so run `pnpm build` before committing.

## License

[MIT](LICENSE)
