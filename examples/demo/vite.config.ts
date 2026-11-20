import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The demo runs the package from its SOURCE, so editing src/ shows here at once. `dedupe`
 * makes the package's `react` import resolve to this app's copy: two Reacts would break hooks.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@trungtnm/agent-annotator': fileURLToPath(new URL('../../src/index.ts', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  server: { fs: { allow: ['../..'] } },
});
