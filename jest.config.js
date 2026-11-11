// The alias map of the specs (`@src/…`, `@generators/…`, …) is declared once, in
// `tsconfig.spec.json`: `tsc` and the ESLint project read it there, and this module converts it to
// the shape Jest expects. Nothing is duplicated here, so `moduleNameMapper` cannot drift from the
// map the type check uses.
const aliases = require('./tests/support/aliases.js');

/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts', 'mts'],
  rootDir: '.',
  // Substitutions are `<rootDir>/…`, so the mapper is independent of `rootDir` and of where Jest is
  // started from. Aliased imports of `.mts` resolve too: `moduleFileExtensions` above names the
  // extension the mapped path ends with.
  moduleNameMapper: aliases.moduleNameMapper(),
  // The search area is pinned to `tests/`: Jest does not read `.gitignore`, so with the project root
  // as the area a spec parked in `.tmp/` or `.history/` (throwaway runs, editor backups) is picked up
  // by the run and a "green" result no longer proves the real suite was executed. Unit specs live in
  // `tests/unit/`. Module resolution is unaffected: imports of `packages/yaml-loader` still resolve
  // from the project root.
  roots: ['<rootDir>/tests'],
  testRegex: '.*\\.spec\\.ts$',
  // `.mts` is an ES module (the tooling of `prisma/`), so Jest has to load it as one. The specs
  // themselves stay CommonJS: they import the `.mts` module through `require(esm)`, which Node 24
  // and Jest 30 support for a synchronous graph, while `__dirname` — used by the specs to locate
  // fixtures — does not exist in an ES module and would break the existing suites.
  extensionsToTreatAsEsm: ['.mts'],
  transform: {
    // `tsconfig.json` of the application names no `types`, and TypeScript 6 no longer pulls every
    // `@types` package in implicitly, so the runner globals (`describe`, `it`, `expect`) and the
    // `node:*` modules of the specs would not resolve. The override applies to the specs only: the
    // application build keeps its own settings.
    //
    // `module` is overridden to `ESNext` because the application config is CommonJS: an `.mts` file
    // compiled as CommonJS would reach the ES module loader as `exports`-style code and fail. The
    // CommonJS specs keep their own module kind: `ts-jest` forces CommonJS for a file that Jest does
    // not treat as ESM.
    '^.+\\.(ts|mts)$': [
      'ts-jest',
      {
        useESM: true,
        isolatedModules: true,
        tsconfig: { types: ['node', 'jest'], module: 'ESNext' },
      },
    ],
  },
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  coverageDirectory: './coverage',
};
