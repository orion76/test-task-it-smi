/**
 * Guards the local start chain against a missing `.env`.
 *
 * Without the file Prisma reports a missing `DATABASE_URL` only when the first query runs, which is
 * several steps into `npm run dev`. The check runs first, so the developer reads the fix instead of
 * a driver error.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Root of the project: the guard looks for the `.env` next to `package.json`, not in the caller. */
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENV_FILE = '.env';
const EXAMPLE_FILE = '.env.example';

if (!existsSync(join(PROJECT_ROOT, ENV_FILE))) {
  console.error(`Файл ${ENV_FILE} не найден в ${PROJECT_ROOT}.`);
  console.error(`Скопируйте ${EXAMPLE_FILE} в ${ENV_FILE}: cp ${EXAMPLE_FILE} ${ENV_FILE}`);
  process.exit(1);
}
