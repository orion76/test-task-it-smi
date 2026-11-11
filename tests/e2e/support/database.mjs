// Shared database settings of the e2e run.
//
// ES module on purpose: the file is imported by the Jest config and by the global setup, both of
// which run outside the TypeScript pipeline (no transform is applied to them), while the specs get
// the resulting connection strings from the environment the config exports. This file stays the
// only place that names the databases.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPPORT_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Project root: `tests/e2e/support` is three levels below it. */
export const ROOT = path.resolve(SUPPORT_DIR, '..', '..', '..');

/** Seeded database every read test runs against. */
export const TEST_DATABASE_NAME = 'it_smi_e2e';

/** Migrated but not seeded database, used to check the empty-table error path. */
export const EMPTY_DATABASE_NAME = 'it_smi_e2e_empty';

export const HOST = process.env.E2E_DB_HOST ?? 'localhost';
export const PORT = process.env.E2E_DB_PORT ?? '5432';
export const USER = process.env.E2E_DB_USER ?? 'postgres';

const PASSWORD = process.env.E2E_DB_PASSWORD ?? 'postgres';

/**
 * Connection string of one database, in the shape `prisma migrate deploy` and the app expect.
 * @param {string} name database name
 * @returns {string} PostgreSQL connection string
 */
export function databaseUrl(name) {
  return `postgresql://${USER}:${PASSWORD}@${HOST}:${PORT}/${name}?schema=public`;
}
