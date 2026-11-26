# Vite guide

Works with Vite and `@vitejs/plugin-react` on React 18 or 19. The demo in
[`examples/demo`](../examples/demo) is a complete Vite setup.

## 1. Install

```bash
pnpm add -D @trungtnm/agent-annotator
```

## 2. Mount it in development only

`import.meta.env.DEV` is `false` in `vite build`, so the dynamic import is dropped from
production bundles.

```tsx
// src/main.tsx
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

const DevAnnotator = import.meta.env.DEV
  ? lazy(() => import('@trungtnm/agent-annotator').then((m) => ({ default: m.DevAnnotator })))
  : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {DevAnnotator && (
      <Suspense fallback={null}>
        <DevAnnotator appName="web" />
      </Suspense>
    )}
  </StrictMode>,
);
```

## 3. Paths in the prompt

Vite serves each module at its path from the project root (`/src/components/Header.tsx`), and the
prompt uses that path: `src/components/Header.tsx:17:9`. In a monorepo, add the app's folder:

```tsx
<DevAnnotator appName="web" appDir="apps/web" />
```

Files outside the Vite root (served under `/@fs/`) come out as absolute paths.

## How source lines are found

Vite inlines a source map in every transformed module. The overlay fetches the module, reads its
`sourceMappingURL`, and maps the frame through it, so lines are exact without any plugin.

## Troubleshooting

- **Two copies of React** (hooks errors): make sure the package resolves your app's React. In a
  linked or aliased setup, add `resolve: { dedupe: ['react', 'react-dom'] }` to `vite.config.ts`.
- **Lines marked "approximate"**: a plugin removed the inline source map; re-enable source maps
  for development.
