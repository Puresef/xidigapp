import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages}/*/src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
    passWithNoTests: false,
    // The web env module validates on import; skip that during tests so the
    // singleton doesn't throw. The dedicated env test calls parseEnv directly.
    env: {
      SKIP_ENV_VALIDATION: 'true',
    },
  },
});
