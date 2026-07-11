import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // apps/web's tsconfig sets jsx:'preserve' (Next transforms it at build);
  // vitest must compile JSX itself for component tests (*.test.tsx).
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
  resolve: {
    alias: {
      // apps/web's "@/*" tsconfig path (only that package uses it).
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
    },
  },
  test: {
    include: [
      '{apps,packages}/*/src/**/*.{test,spec}.{ts,tsx}',
      // Phase 8 MCP server lives outside src (a standalone stdio entrypoint).
      'apps/web/mcp/**/*.test.mjs',
    ],
    environment: 'node',
    passWithNoTests: false,
    // The web env module validates on import; skip that during tests so the
    // singleton doesn't throw. The dedicated env test calls parseEnv directly.
    env: {
      SKIP_ENV_VALIDATION: 'true',
    },
  },
});
