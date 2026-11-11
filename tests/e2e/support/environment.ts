/**
 * Connection strings the e2e run reads from the environment.
 *
 * The Jest config of the suite is the only place that knows the databases: it resolves them through
 * `tests/e2e/support/database.mjs` and puts the connection strings into the environment, which the
 * workers inherit. A spec started without that environment (for example with a hand-written config)
 * fails here with the command to run instead of silently connecting to the development database
 * from `.env`.
 */

/**
 * Reads a required environment variable.
 * @param name variable name
 * @throws Error naming the variable and the command that sets it
 */
function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is not set: run the suite with \`npm run test:e2e\`.`);
  }

  return value;
}

/** Seeded database the read tests work on. */
export const TEST_DATABASE_URL = requiredEnvironmentVariable('E2E_TEST_DATABASE_URL');

/** Migrated but empty database, used by the error-path tests. */
export const EMPTY_DATABASE_URL = requiredEnvironmentVariable('E2E_EMPTY_DATABASE_URL');
