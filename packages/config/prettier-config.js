// Shared Prettier config for the Xidig monorepo.
// Consumed by the root `prettier.config.mjs` via `@xidig/config/prettier`.

/** @type {import("prettier").Config} */
const config = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  arrowParens: 'always',
  endOfLine: 'lf',
};

export default config;
