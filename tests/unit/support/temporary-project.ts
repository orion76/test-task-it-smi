/**
 * A disposable copy of the project that a spec may break on purpose.
 *
 * Some modules hard-code their inputs: `readContract`, `loadApiFields`, `referenceOf` and
 * `validateApiFields` read `config/api-fields.yml` from the project root found from their own
 * directory, because in production that file is not a parameter. A test cannot pass another path,
 * and rewriting the real file would race with every other spec of the run, so the spec gets its own
 * project root: the generator, the sources and the contract are copied into `.tmp/`, broken there,
 * and executed in a child process. The copy is made from the working tree at test time, so the code
 * under test is the current source, not a stale duplicate kept in git.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { parse } from 'yaml';

import { PROJECT_ROOT } from './project-root';
import type { ITemporaryProject, UHarnessResult, URunner } from './types';

/**
 * Creates the copy: `package.json` (the project root marker), `prisma/generators`, `src`, the API
 * contract and its schema. Everything is a straight copy of the working tree, so a spec never edits
 * the repository.
 *
 * @param name directory name under `.tmp/unit`; unique per spec file
 * @returns the disposable project
 */
export function createTemporaryProject(name: string): ITemporaryProject {
  const root = join(PROJECT_ROOT, '.tmp', 'unit', name);

  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'temporary-project', private: true, type: 'commonjs' }, null, 2)}\n`,
    'utf8',
  );
  cpSync(join(PROJECT_ROOT, 'prisma', 'generators'), join(root, 'prisma', 'generators'), {
    recursive: true,
  });
  cpSync(join(PROJECT_ROOT, 'src'), join(root, 'src'), { recursive: true });

  // The contract and the schema it is validated against are two files of `config/`: a harness that
  // copies only the contract loses the schema and cannot check the contract at all.
  for (const file of ['api-fields.yml', 'api-fields.schema.yml']) {
    cpSync(join(PROJECT_ROOT, 'config', file), join(root, 'config', file));
  }

  return {
    root,
    write(relativePath: string, content: string): void {
      const file = join(root, relativePath);

      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content, 'utf8');
    },
    remove(): void {
      rmSync(root, { recursive: true, force: true });
    },
    run(script: string, runner: URunner): UHarnessResult {
      return runHarness(root, script, runner);
    },
  };
}

/** The API contract as the copy holds it, parsed by the spec to build a broken variant. */
export function contractOf(project: ITemporaryProject): Record<string, unknown> {
  const content = readFileSync(join(project.root, 'config', 'api-fields.yml'), 'utf8');
  const document: unknown = parse(content);

  if (!isRecord(document)) {
    throw new Error('config/api-fields.yml of the copy is not a mapping');
  }

  return document;
}

/** Message of a harness that was expected to fail; fails the spec when it succeeded. */
export function failureOf(result: UHarnessResult): string {
  if (result.ok) {
    throw new Error('expected the harness to report a failure');
  }

  return result.message;
}

/** Value of a harness that was expected to succeed. */
export function valueOf(result: UHarnessResult): unknown {
  if (!result.ok) {
    throw new Error(`expected the harness to succeed, got: ${result.message}`);
  }

  return result.value;
}

/** Runs the script and turns its last output line into a result; any other outcome is a failure. */
function runHarness(root: string, script: string, runner: URunner): UHarnessResult {
  const command = runner === 'node' ? process.execPath : join(PROJECT_ROOT, 'node_modules', '.bin', 'ts-node');
  const args = runner === 'node' ? [join(root, script)] : ['-T', join(root, script)];
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://user:password@localhost:5432/temporary',
      TS_NODE_TRANSPILE_ONLY: 'true',
    },
  });

  if (result.status !== 0) {
    throw new Error(
      `the harness ${script} exited with ${String(result.status)}:\n${result.stdout}\n${result.stderr}`,
    );
  }

  const line = result.stdout
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .at(-1);

  if (line === undefined) {
    throw new Error(`the harness ${script} printed nothing`);
  }

  return harnessResultOf(JSON.parse(line) as unknown);
}

/** Narrows what the harness printed: the harness is ours, so a wrong shape is a broken spec. */
function harnessResultOf(value: unknown): UHarnessResult {
  if (!isRecord(value)) {
    throw new Error('the harness must print an object');
  }

  if (value.ok === true) {
    return { ok: true, value: value.value };
  }

  if (typeof value.message === 'string') {
    return { ok: false, message: value.message };
  }

  throw new Error(`the harness printed an unexpected result: ${JSON.stringify(value)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
