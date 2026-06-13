import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Engine, moderation, and content tests are intentionally framework-free so
 * they run without Nest DI or a database. We alias the contracts package to
 * its TypeScript source so tests don't require a prior build step.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@unlikelyland/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.spec.ts'],
  },
});
