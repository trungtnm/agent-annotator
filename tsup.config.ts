import { defineConfig } from 'tsup';

/**
 * One ESM file plus its types. The `'use client'` banner keeps the module a client
 * boundary for React Server Components bundlers (Next.js App Router); bundling into one
 * file is also what lets ESM-strict bundlers resolve it without file extensions.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  // tsup 8 sets `baseUrl` for the declaration build, which TypeScript 6 deprecates.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  clean: true,
  sourcemap: true,
  target: 'es2022',
  external: ['react', 'react-dom'],
  banner: { js: "'use client';" },
});
