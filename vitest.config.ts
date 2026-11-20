import { defineConfig } from 'vitest/config';

/**
 * jsdom, because the fiber and overlay tests render a real React tree: the fiber walk is
 * only worth testing against the internals React actually builds, never a hand-made fake.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
