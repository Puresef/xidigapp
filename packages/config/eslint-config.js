// Shared flat ESLint config for the Xidig monorepo.
// Consumed by the root `eslint.config.mjs` via `@xidig/config/eslint`.
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/** @type {import("eslint").Linter.Config[]} */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      '**/database.types.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Must come last: turns off stylistic rules that conflict with Prettier.
  eslintConfigPrettier,
);
