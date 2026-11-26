# Next.js guide

Works with the App Router on Next.js 15, under webpack (`next dev`) and Turbopack
(`next dev --turbopack`), which runs on React 19.

On Next.js 14 with React 18, the Pages Router gets exact JSX locations. The App Router on Next.js 14
runs a React canary that records no source location, so the prompt names the components and their
data but says the JSX "could not be located".

## 1. Install

```bash
pnpm add -D @trungtnm/agent-annotator
```

## 2. Mount it in development only

Create a client component. `process.env.NODE_ENV` is inlined by Next, so in a production build
the condition is the constant `false`, the bundler drops the branch and the package with it.

```tsx
// app/dev-annotator.tsx
'use client';

import dynamic from 'next/dynamic';

const DevAnnotator =
  process.env.NODE_ENV === 'development'
    ? dynamic(() => import('@trungtnm/agent-annotator').then((m) => m.DevAnnotator), { ssr: false })
    : null;

export function DevAnnotatorMount() {
  return DevAnnotator === null ? null : <DevAnnotator appName="web" />;
}
```

Render it once, in the root layout, after your providers:

```tsx
// app/layout.tsx
import { DevAnnotatorMount } from './dev-annotator';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <DevAnnotatorMount />
      </body>
    </html>
  );
}
```

Living in the root layout, it survives client-side navigation, so one prompt can cover several
pages.

On the Pages Router, keep the same component outside `app/` (here, `dev-annotator.tsx` at the
project root) and render it in `pages/_app.tsx`:

```tsx
// pages/_app.tsx
import type { AppProps } from 'next/app';
import { DevAnnotatorMount } from '../dev-annotator';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <DevAnnotatorMount />
    </>
  );
}
```

## 3. In a monorepo, tell it where the app lives

Next maps sources relative to the app. Pass the app's folder from the repo root and every path in
the prompt starts from the root, ready for an agent working at the top of the repo:

```tsx
<DevAnnotator appName="admin" appDir="apps/admin" />
```

## How source lines are found

Under webpack the overlay asks Next's own dev endpoint (`/__nextjs_original-stack-frames`, the
one the error overlay uses) to map the frames. Under Turbopack that endpoint does not map browser
chunks, so it reads each chunk's source map (`<chunk>.js.map`) instead. Both give the original
file and line.

## Content Security Policy

The overlay uses inline `style` attributes only (no `<style>` elements, no external assets), so a
CSP that allows `style-src 'unsafe-inline'` for attributes is enough. The screenshot feature needs
no extra permission beyond the browser's own prompt.

## Troubleshooting

- **Lines marked "approximate"**: the dev server did not expose a source map for that script;
  the component chain and selector are still exact.
- **Nothing appears**: check that the component renders inside `<body>` and that you are running
  `next dev`, not a production build.
