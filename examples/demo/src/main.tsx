import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import type { ScreenCapture } from '@trungtnm/agent-annotator';

import { App } from './App';
import './styles.css';

// Development only: `import.meta.env.DEV` is `false` in a build, so the import is dropped.
const DevAnnotator = import.meta.env.DEV
  ? lazy(() => import('@trungtnm/agent-annotator').then((module) => ({ default: module.DevAnnotator })))
  : null;

// scripts/media drives this demo headlessly, where no one can answer the browser's
// "share this tab?" prompt; it supplies its own capture. Real apps never set this.
const capture = (window as { __agentAnnotatorCapture?: ScreenCapture }).__agentAnnotatorCapture;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {DevAnnotator && (
      <Suspense fallback={null}>
        <DevAnnotator appName="lumen" appDir="examples/demo" {...(capture ? { captureScreen: capture } : {})} />
      </Suspense>
    )}
  </StrictMode>,
);
