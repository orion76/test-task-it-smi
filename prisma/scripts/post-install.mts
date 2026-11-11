/**
 * Root `postinstall` hook that re-applies the `prisma-nestjs-graphql` cleanup after `npm install`:
 * the `postinstall` of `@prisma/client` runs `prisma generate`, which brings back the unused imports
 * the generator emits for hidden fields. The checks keep the hook a no-op where the files are absent,
 * because `npm ci` also runs in the `deps` and `runtime` stages of the Dockerfile.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Project root, resolved from this file so the hook does not depend on the working directory. */
const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const GENERATED_DIRECTORY = join(PROJECT_ROOT, 'src', 'generated', 'graphql', 'entities');
const CLEANUP_SCRIPT = join(PROJECT_ROOT, 'prisma', 'scripts', 'post-generate.mts');

if (!existsSync(GENERATED_DIRECTORY)) {
  console.log(`prisma-nestjs-graphql: ${GENERATED_DIRECTORY} does not exist, nothing to clean`);
  process.exit(0);
}

if (!existsSync(CLEANUP_SCRIPT)) {
  console.log(
    `prisma-nestjs-graphql: cleanup script ${CLEANUP_SCRIPT} does not exist, skipping it`,
  );
  process.exit(0);
}

execFileSync(process.execPath, [CLEANUP_SCRIPT], { stdio: 'inherit' });
