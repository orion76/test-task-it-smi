// Global setup of the e2e run: prepares PostgreSQL before the first spec starts.
//
// Steps, in order: start the compose service `db`, create the two test databases (seeded and
// empty), apply the committed migrations with `prisma migrate deploy`, build the seed and load
// `data/profile.yml` into the seeded database. Every step is idempotent, so a second run on an
// already prepared volume does the same work and leaves the same state.
//
// Anything that cannot be done — Docker missing, the container not healthy, migrations rejected —
// is reported with the command to run and fails the run at once: a spec must not sit waiting for a
// database that will never answer.

import { spawnSync } from 'node:child_process';

import {
  EMPTY_DATABASE_NAME,
  ROOT,
  TEST_DATABASE_NAME,
  USER,
  databaseUrl,
} from './database.mjs';

const DOCKER_TIMEOUT = 300000;
const COMMAND_TIMEOUT = 180000;

/**
 * Runs one command from the project root and fails with its stderr when the exit code is not zero.
 * @param {string} command executable
 * @param {string[]} args arguments
 * @param {{ timeout?: number, env?: Record<string, string>, allowFailure?: boolean }} options spawn options
 * @returns {{ status: number | null, stdout: string, stderr: string }} captured result
 */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: options.timeout ?? COMMAND_TIMEOUT,
    env: { ...process.env, ...options.env },
  });

  if (result.error !== undefined) {
    throw new Error(
      `${command} ${args.join(' ')} could not run: ${result.error.message}.\n` +
        'The e2e suite needs a running Docker daemon with PostgreSQL (see docker-compose.yml).',
      { cause: result.error },
    );
  }

  if (result.status !== 0 && options.allowFailure !== true) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${String(result.status)}.\n` +
        `${result.stderr.trim()}`,
    );
  }

  return result;
}

/** Starts the `db` service and waits for its healthcheck. */
function startDatabase() {
  console.log('[e2e] docker compose up -d db --wait');

  try {
    run('docker', ['compose', 'up', '-d', 'db', '--wait'], { timeout: DOCKER_TIMEOUT });
  } catch (error) {
    throw new Error(
      'PostgreSQL is not available. Start it with `docker compose up -d db --wait` ' +
        'and run `npm run test:e2e` again.',
      { cause: error },
    );
  }
}

/**
 * Creates a database when it does not exist yet; an existing one is kept as is, so a rerun does not
 * depend on the previous run having been cleaned up.
 * @param {string} name database name
 */
function ensureDatabase(name) {
  const existing = run('docker', [
    'compose', 'exec', '-T', 'db',
    'psql', '-U', USER, '-d', 'postgres', '-tAc',
    `SELECT 1 FROM pg_database WHERE datname = '${name}'`,
  ]);

  if (existing.stdout.trim() === '1') {
    console.log(`[e2e] database ${name} exists`);

    return;
  }

  console.log(`[e2e] creating database ${name}`);

  const created = run(
    'docker',
    ['compose', 'exec', '-T', 'db', 'psql', '-U', USER, '-d', 'postgres', '-c',
      `CREATE DATABASE "${name}"`],
    { allowFailure: true },
  );

  // A concurrent run may have created it between the check and the command; that is not a failure.
  if (created.status !== 0 && !created.stderr.includes('already exists')) {
    throw new Error(`CREATE DATABASE "${name}" failed: ${created.stderr.trim()}`);
  }
}

/**
 * Applies the committed migrations to one database.
 * @param {string} name database name
 */
function migrate(name) {
  console.log(`[e2e] prisma migrate deploy → ${name}`);

  run('node', ['node_modules/.bin/prisma', 'migrate', 'deploy'], {
    env: { DATABASE_URL: databaseUrl(name) },
  });
}

/** Empties the profile table of the empty-database fixture, keeping the migration state. */
function clearProfiles() {
  run('docker', [
    'compose', 'exec', '-T', 'db',
    'psql', '-U', USER, '-d', EMPTY_DATABASE_NAME, '-c',
    'TRUNCATE TABLE "Profile" CASCADE',
  ]);
}

/** Compiles `prisma/seed` to `dist/prisma` and loads the seed data into the test database. */
function seed() {
  console.log('[e2e] npm run build:seed');

  run('npm', ['run', 'build:seed']);

  console.log(`[e2e] seeding ${TEST_DATABASE_NAME}`);

  run('node', ['dist/prisma/seed/main.js'], {
    env: { DATABASE_URL: databaseUrl(TEST_DATABASE_NAME) },
  });
}

/** Prepares everything the specs need: PostgreSQL, the two databases, their schema and the seed. */
export default async function globalSetup() {
  startDatabase();
  ensureDatabase(TEST_DATABASE_NAME);
  ensureDatabase(EMPTY_DATABASE_NAME);
  migrate(TEST_DATABASE_NAME);
  migrate(EMPTY_DATABASE_NAME);
  clearProfiles();
  seed();
}
