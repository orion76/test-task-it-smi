// Jest project of the e2e suite.
//
// The unit config (`jest.config.js`) matches `*.spec.ts` only and its `roots` is `tests/`, so
// `*.e2e-spec.ts` is invisible to it: e2e runs need their own project. `globalSetup` prepares
// PostgreSQL (compose service, a separate test database, migrations, seed) before the first spec
// starts, so a run is one command and does not depend on a manually prepared database.
//
// ES module: the shared database settings are ES modules as well, and the config exports the
// connection strings into the environment, which the forked workers inherit.
//
// Run the suite through `npm run test:e2e`, not a bare Jest: Nest 12 ships as ES modules only, so
// Jest needs `--experimental-vm-modules` in `NODE_OPTIONS` (the script sets it) to load them.

import { EMPTY_DATABASE_NAME, TEST_DATABASE_NAME, databaseUrl } from './tests/e2e/support/database.mjs';
// Path aliases of the specs: one definition in `tsconfig.spec.json`, shared with the unit config
// through the CommonJS helper, which an ES module reaches as its default export.
import aliases from './tests/support/aliases.js';

const testDatabaseUrl = databaseUrl(TEST_DATABASE_NAME);

// The setup runs in this process and prepares the test database, while the specs run in forked
// workers that inherit the environment: setting the connection strings here is what makes every
// spec talk to the test databases instead of the development one from `.env`.
process.env.DATABASE_URL = testDatabaseUrl;
process.env.E2E_TEST_DATABASE_URL = testDatabaseUrl;
process.env.E2E_EMPTY_DATABASE_URL = databaseUrl(EMPTY_DATABASE_NAME);

/** @type {import('jest').Config} */
const config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  // The search area is pinned to the e2e folder, like the unit run is pinned to `tests/`: Jest does
  // not read `.gitignore`, and a spec parked in `.tmp/` must not be picked up by a run.
  roots: ['<rootDir>/tests/e2e'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  // The same alias map the unit run uses: the specs import the application with `@src/…` instead of
  // counting `../` levels back to the project root.
  moduleNameMapper: aliases.moduleNameMapper(),
  transform: {
    // Same runner-global override as the unit config: TypeScript 6 does not pull `@types` implicitly.
    // `paths` is passed along because `ts-jest` type-checks against the application `tsconfig.json`,
    // which declares no aliases: without the map every `@src/…` import would fail the check even
    // though the run resolves it. The unit config needs no map here — it compiles with
    // `isolatedModules`, i.e. without a type check.
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: { types: ['node', 'jest'], paths: aliases.paths } },
    ],
  },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/tests/e2e/support/global-setup.mjs',
  // Starting Nest, opening the Prisma client and reading the seed data take seconds, not
  // milliseconds: the default 5 s is below that.
  testTimeout: 30000,
  // One worker: several specs create and delete rows of the same single profile table, and the
  // database holds one shared dataset. The suite is small, so the serial run costs nothing, while
  // parallel files would make the assertions depend on each other's timing.
  maxWorkers: 1,
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
};

export default config;
