import { defineConfig } from 'vitest/config';

// Engine code is pure and runs under node; the UI/storage/worker layers need a DOM,
// so those globs opt into jsdom. setup.ts registers @testing-library/jest-dom matchers.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
    environmentMatchGlobs: [
      ['src/ui/**', 'jsdom'],
      ['src/storage/**', 'jsdom'],
      ['src/worker/**', 'jsdom'],
    ],
  },
});
