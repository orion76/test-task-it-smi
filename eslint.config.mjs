// @ts-check
import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Formatting is done by ESLint itself: `@stylistic/eslint-plugin` supplies the style rules, so
 * `npm run lint:fix` (or fix-on-save in the editor) fixes and formats in one pass, with a single
 * tool and a single configuration for the whole project.
 *
 * The rules below reproduce the style the project already had (single quotes, semicolons, trailing
 * commas, two-space indent, 100 columns). The `recommended` preset is the base; the overrides are
 * the points where that preset disagrees with the code base — each one is explained where it is set.
 */

/** Extensions linted with type information: the application and the seed compiler project. */
const TS = ['**/*.ts', '**/*.mts', '**/*.cts'];

export default [
  {
    // `src/generated` is the single root of the artifacts of `prisma generate` — the GraphQL entity
    // classes and the resolver declarations — and `src/schema.gql` is printed from the same schema:
    // generated, not hand-written source, so the project rules do not apply to them.
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      // Local editor backups and the scratch directory of the checks: not sources.
      '.history/**',
      '.tmp/**',
      '.opencode/**',
      // Artifacts of `prisma generate`: rewritten by the generators, so their style is the
      // generators' business, not the project's.
      'src/generated/**',
      // Artifacts of `npm run build:lib`: emitted by `tsc` and kept in the repository as an artifact,
      // so their formatting and quoting are the compiler's business, not the project's.
      'packages/yaml-loader/lib/**',
      // The client is a standalone package with its own `client/eslint.config.mjs` and its own
      // `npm run lint`: the browser globals and the Angular component and template rules live
      // there, while the rules of this config describe the backend. Linting `client/**` here would
      // check the same files with the wrong target.
      'client/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    // `src` is covered by `tsconfig.json`, which is the project the type-aware rules read.
    files: TS,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Пустой класс-модуль Nest — норма: вся конфигурация в декораторе @Module.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    // The tooling of `prisma/` (generators, their configs and the install/generate hooks) lives in
    // its own TypeScript project (`tsconfig.generators.json`): plain `node` runs the `.mts` files by
    // stripping the types, nothing is emitted, so the project service cannot resolve them. An
    // explicit `project` gives the type-aware rules the same information the type check uses.
    files: ['prisma/**/*.mts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['./tsconfig.generators.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // The seed engine lives in its own TypeScript project (`tsconfig.seed.json`): it is compiled to
    // `dist/prisma` separately from the application, so it is not covered by `tsconfig.json` and
    // the project service cannot resolve it. An explicit `project` gives the type-aware rules the
    // same information the build uses.
    files: ['prisma/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['./tsconfig.seed.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // The library of `packages/` lives in its own TypeScript project
    // (`packages/yaml-loader/tsconfig.json`): it is compiled to `packages/yaml-loader/lib`
    // separately from the application and is not covered by `tsconfig.json`, so the project service
    // cannot resolve it. An explicit `project` gives the type-aware rules the same information the
    // library build uses.
    files: ['packages/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['./packages/yaml-loader/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // The build steps of `scripts/` live in their own TypeScript project (`tsconfig.scripts.json`):
    // they run through `ts-node` in `npm run build` and lie outside `src/`, so the project service
    // cannot resolve them. An explicit `project` gives the type-aware rules the same information the
    // type check uses.
    files: ['scripts/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['./tsconfig.scripts.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // The specs of `tests/` are outside `src/`, so `tsconfig.json` does not include them and the
    // project service cannot resolve them. `tsconfig.spec.json` is the project of the specs: it
    // extends the application settings and adds the runner globals. The library sources are included
    // there as well, so the types of the imported package resolve for the type-aware rules.
    files: ['tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['./tsconfig.spec.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // The tooling configuration itself (`eslint.config.mjs`, `jest.config.js`) is plain JavaScript:
    // no TypeScript project exists for it, so type-aware rules are switched off and Node globals are
    // declared.
    files: ['**/*.mjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
  },
  {
    // These two are CommonJS, not ES modules: `package.json` sets `type: commonjs`, the unit Jest
    // config has to load the shared alias helper with `require`, and the helper reads
    // `tsconfig.spec.json` through `require('typescript')`. Plain JavaScript offers no other way to
    // load a module synchronously, so the rule does not apply here. The e2e config is `.mjs` and
    // imports the helper instead, so it is not listed.
    files: ['jest.config.js', 'tests/support/aliases.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Formatting. `disable-legacy` switches off the core rules that ESLint deprecated in favour of
    // the plugin, so a rule is never reported twice.
    plugins: { '@stylistic': stylistic },
    rules: {
      ...stylistic.configs['disable-legacy'].rules,
      ...stylistic.configs.recommended.rules,

      // Semicolons and 1tbs braces: the project style (the preset asks for `never` and `stroustrup`).
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
      // `always` keeps `(value) => …` everywhere, including single parameters.
      '@stylistic/arrow-parens': ['error', 'always'],
      // Double quotes stay allowed when they avoid escaping: `"don't"` reads better than `'don\'t'`.
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'never' }],
      // A property name is quoted only when it has to be (`'import/resolver'`), not for consistency.
      '@stylistic/quote-props': ['error', 'as-needed'],
      // Operators end the line (`a +\n b`), while `?` and `:` start theirs — the usual shape of a
      // wrapped expression.
      '@stylistic/operator-linebreak': [
        'error',
        'after',
        { overrides: { '?': 'before', ':': 'before' } },
      ],
      // A ternary that fits one line stays on one line: the preset would always split it.
      '@stylistic/multiline-ternary': 'off',
      // Continuation lines of a binary expression are indented by two spaces relative to its start,
      // not aligned with it: the preset forbids the former.
      '@stylistic/indent-binary-ops': 'off',
      // Type members end with a semicolon on every line, as `type X = { a: string }` reads.
      '@stylistic/member-delimiter-style': [
        'error',
        {
          multiline: { delimiter: 'semi', requireLast: true },
          singleline: { delimiter: 'semi', requireLast: false },
        },
      ],
      // 100 columns, the width the project was formatted to. Strings, template literals and comments
      // are exempt: they cannot be wrapped without changing the text. The rule is not auto-fixable —
      // it reports a line that has to be wrapped by hand.
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
    },
  },
  {
    // Layer boundaries. `db` and `graphql` are independent: each of them may depend on `common`
    // only, never on the other. `app` is the composition root (`main.ts`, `app.module.ts`, the
    // `health` entry point): it is the one place that wires the layers together, so it may import
    // both. Everything else is allowed by default, so a new service file does not break the rule
    // and the config stays about architecture instead of about a file inventory.
    //
    // Element patterns are folder patterns (the plugin resolves the innermost matching folder), so
    // every layer is described twice: `src/<layer>/*` for its subfolders and `src/<layer>` for the
    // files that lie directly in the layer root (`src/db/profile.service.ts`). Without the second
    // pattern those files would stay unclassified and the rule would silently skip them.
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      // The plugin resolves an import to a file before classifying it, and its resolver follows
      // the `import/resolver` settings. Node's default resolution knows no TypeScript extension, so
      // without this block every import would look unresolvable — and an unresolvable dependency is
      // skipped instead of checked.
      'import/resolver': {
        node: { extensions: ['.ts', '.js', '.json'] },
      },
      'boundaries/elements': [
        { type: 'common', pattern: 'src/common/*' },
        { type: 'common', pattern: 'src/common' },
        { type: 'db', pattern: 'src/db/*' },
        { type: 'db', pattern: 'src/db' },
        { type: 'graphql', pattern: 'src/graphql/*' },
        { type: 'graphql', pattern: 'src/graphql' },
        { type: 'app', pattern: 'src/*' },
        { type: 'app', pattern: 'src' },
      ],
    },
    rules: {
      ...boundaries.configs.recommended.rules,
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { element: { type: 'db' } },
              disallow: { to: { element: { type: 'graphql' } } },
            },
            {
              from: { element: { type: 'graphql' } },
              disallow: { to: { element: { type: 'db' } } },
            },
            {
              from: { element: { type: 'common' } },
              disallow: { to: { element: { types: ['db', 'graphql'] } } },
            },
          ],
        },
      ],
    },
  },
];
