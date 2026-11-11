// @ts-check
import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import angular from 'angular-eslint';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * The client is a standalone package (`npm install` in `client/`), so it carries its own lint
 * configuration: the browser instead of Node, the Angular component rules and the template rules —
 * none of them make sense for the backend at the repository root. Formatting repeats the root
 * settings on purpose: both packages are formatted the same way even though they are checked
 * separately.
 *
 * `client/**` is listed in the `ignores` of the root `eslint.config.mjs`, so the root
 * `npm run lint` does not read these files twice.
 */

/** The only sources of the package: templates are inline, so there are no `.html` sources. */
const TS = ['**/*.ts'];

export default defineConfig([
  {
    // `dist` is the output of `ng build`, `.angular` holds the build cache, dependencies are not
    // sources.
    ignores: ['dist/**', 'node_modules/**', '.angular/**', 'out-tsc/**'],
  },
  eslint.configs.recommended,
  {
    files: TS,
    extends: [...tseslint.configs.recommended, ...angular.configs.tsRecommended],
    languageOptions: {
      globals: globals.browser,
    },
    // Inline templates are linted as templates of the component, with the rules below.
    processor: angular.processInlineTemplates,
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
  {
    // The configuration file itself is Node.js code, not browser code.
    files: ['**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // Formatting. `disable-legacy` switches off the core rules that ESLint deprecated in favour of
    // the plugin, so a rule is never reported twice.
    files: ['**/*.ts', '**/*.mjs'],
    plugins: { '@stylistic': stylistic },
    rules: {
      ...stylistic.configs['disable-legacy'].rules,
      ...stylistic.configs.recommended.rules,

      '@stylistic/semi': ['error', 'always'],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
      '@stylistic/arrow-parens': ['error', 'always'],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'never' }],
      '@stylistic/quote-props': ['error', 'as-needed'],
      '@stylistic/operator-linebreak': [
        'error',
        'after',
        { overrides: { '?': 'before', ':': 'before' } },
      ],
      '@stylistic/multiline-ternary': 'off',
      '@stylistic/indent-binary-ops': 'off',
      '@stylistic/member-delimiter-style': [
        'error',
        {
          multiline: { delimiter: 'semi', requireLast: true },
          singleline: { delimiter: 'semi', requireLast: false },
        },
      ],
      // 100 columns; strings, template literals and comments are exempt: text that cannot be
      // wrapped without changing it. The rule is not auto-fixable — it reports a line to wrap.
      '@stylistic/max-len': [
        'error',
        {
          code: 100,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
          ignoreComments: true,
        },
      ],
      // Every file ends with exactly one newline.
      '@stylistic/eol-last': ['error', 'always'],
    },
  },
]);
