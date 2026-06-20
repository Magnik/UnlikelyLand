import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Integration suite — runs the real services against a real Postgres. Point
 * TEST_DATABASE_URL at a throwaway database with the migrations applied, then run
 * `npm run test:integration -w @unlikelyland/api`. Without TEST_DATABASE_URL the
 * suites skip themselves, so this never breaks the default unit run or CI.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@unlikelyland/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
    },
  },
  test: {
    include: ['test/integration/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
