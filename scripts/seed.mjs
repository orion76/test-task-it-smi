/**
 * Runs the seed without building the project.
 *
 * The seed process needs `DATABASE_URL`, and Prisma Client reads `.env` only when the generated
 * client recorded the path of the file at `prisma generate` time — a client generated without
 * `.env` in place stays silent. The script loads the file into `process.env` (variables already
 * set win, as they do for the application) and runs `prisma/seed/main.ts` through `ts-node`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { projectRoot } from 'yaml-loader';

/** Root of the project: the seed reads `data/` and `src/generated/config/` relative to it. */
const PROJECT_ROOT = projectRoot(import.meta.dirname);
const ENV_FILE = join(PROJECT_ROOT, '.env');
const SEED_ENTRY = 'prisma/seed/main.ts';
const TS_NODE_PROJECT = 'tsconfig.seed.json';
const TS_NODE_REGISTER = 'ts-node/register/transpile-only';

if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

console.log('Наполняем базу данными…');

const result = spawnSync(process.execPath, ['--require', TS_NODE_REGISTER, SEED_ENTRY], {
  cwd: PROJECT_ROOT,
  env: { ...process.env, TS_NODE_PROJECT },
  stdio: 'inherit',
});

if (result.error !== undefined) {
  console.error(`Не удалось запустить сидинг: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
