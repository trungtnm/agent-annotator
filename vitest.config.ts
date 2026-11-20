import { defineConfig } from 'vitest/config';

/**
 * jsdom, because the fiber and overlay tests render a real React tree: the fiber walk is
 * only worth testing against the internals React actually builds, never a hand-made fake.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    // The overlay tests drive a whole React tree; a busy CI runner needs more than 5s.
    testTimeout: 15_000,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
