import { defineConfig } from 'vitest/config';

/**
 * DB integration tests: boot a real embedded Postgres 17, apply every
 * migration, and run the RLS/trigger negative-test suite. Slower than unit
 * tests, so they live behind a dedicated config + `pnpm test:db` instead of
 * the default `pnpm test` include glob.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.itest.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 240_000,
    // one Postgres cluster at a time
    fileParallelism: false,
  },
});
