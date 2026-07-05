// Shared flat ESLint config for the Xidig monorepo.
// Consumed by the root `eslint.config.mjs` via `@xidig/config/eslint`.
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// JSX attributes whose string values reach users' eyes or screen readers.
const USER_FACING_JSX_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'label',
  'placeholder',
  'title',
]);

// Two or more consecutive letters (any script) = copy, not markup glue.
// Lone letters, numbers, punctuation, and whitespace stay allowed.
const COPY_PATTERN = /\p{L}{2,}/u;

/**
 * PRD §22: the UI is bilingual, so feature work may only ship strings through
 * @xidig/i18n keys — never hardcoded JSX copy. Escapes (brand marks, test
 * fixtures) require an eslint-disable line with a justification comment; see
 * docs/i18n.md.
 * @type {import("eslint").Rule.RuleModule}
 */
const noHardcodedCopyRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'UI copy must go through @xidig/i18n t() keys, never hardcoded JSX strings',
    },
    schema: [],
    messages: {
      jsxText:
        'Hardcoded UI copy "{{text}}" — add a key to the @xidig/i18n dictionaries and render it with t() (docs/i18n.md).',
      jsxAttribute:
        'Hardcoded user-facing {{attribute}} — use a t() key from @xidig/i18n instead (docs/i18n.md).',
    },
  },
  create(context) {
    /** Copy text of a string-ish expression, or null. Catches the braces
     *  bypass: {'copy'}, {`copy`}, {cond ? 'a' : 'b'} in children/attributes. */
    function copyText(expression) {
      if (expression == null) return null;
      if (expression.type === 'Literal' && typeof expression.value === 'string') {
        return COPY_PATTERN.test(expression.value) ? expression.value : null;
      }
      if (expression.type === 'TemplateLiteral') {
        const cooked = expression.quasis.map((quasi) => quasi.value.cooked ?? '').join(' ');
        return COPY_PATTERN.test(cooked) ? cooked : null;
      }
      if (expression.type === 'ConditionalExpression') {
        return copyText(expression.consequent) ?? copyText(expression.alternate);
      }
      return null;
    }

    return {
      JSXText(node) {
        if (COPY_PATTERN.test(node.value)) {
          context.report({
            node,
            messageId: 'jsxText',
            data: { text: node.value.trim().slice(0, 40) },
          });
        }
      },
      JSXExpressionContainer(node) {
        // Attribute values are handled by the JSXAttribute visitor below.
        if (node.parent.type === 'JSXAttribute') return;
        if (node.parent.type !== 'JSXElement' && node.parent.type !== 'JSXFragment') return;
        const text = copyText(node.expression);
        if (text !== null) {
          context.report({
            node,
            messageId: 'jsxText',
            data: { text: text.trim().slice(0, 40) },
          });
        }
      },
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier') return;
        if (!USER_FACING_JSX_ATTRIBUTES.has(node.name.name)) return;
        const value = node.value;
        const text =
          value !== null && value.type === 'JSXExpressionContainer'
            ? copyText(value.expression)
            : copyText(value);
        if (text !== null) {
          context.report({
            node: value,
            messageId: 'jsxAttribute',
            data: { attribute: node.name.name },
          });
        }
      },
    };
  },
};

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
  {
    // App and shared-UI components render user-facing copy; dictionaries and
    // pure-logic .ts files are exempt by construction (rule only sees JSX).
    files: ['apps/*/src/**/*.tsx', 'packages/ui/src/**/*.tsx', 'packages/i18n/src/**/*.tsx'],
    ignores: ['**/*.test.tsx', '**/*.spec.tsx'],
    plugins: {
      'xidig-i18n': { rules: { 'no-hardcoded-copy': noHardcodedCopyRule } },
    },
    rules: {
      'xidig-i18n/no-hardcoded-copy': 'error',
    },
  },
  // Must come last: turns off stylistic rules that conflict with Prettier.
  eslintConfigPrettier,
);
