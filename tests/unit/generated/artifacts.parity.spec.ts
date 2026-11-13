/**
 * The committed artifacts of the generators are results of the pipeline, not hand-written code:
 * everything under `src/generated` — the API contract schema, the seed data schema, the
 * dictionaries, the GraphQL entity classes and the resolvers — is built from `prisma/schema.prisma`
 * plus `config/api-fields.yml`. A divergence between a fresh generation and the committed tree means
 * an artifact was edited by hand or the regeneration was forgotten, so this spec rebuilds them in a
 * disposable copy of the project under `.tmp/` and compares byte for byte with the committed ones.
 *
 * The generated tree is compared as a whole: not only the content of every file, but the listing
 * itself, so a file added by hand or a file missing from the tree fails the parity the same way an
 * edited one does. The YAML artifacts live inside that tree, so they are covered by the same
 * comparison and a new artifact needs no entry here.
 *
 * `src/schema.gql` is not part of the parity: it belongs to `tests/unit/graphql/schema.spec.ts`.
 *
 * The copy is made from the working tree at test time, so the code under test is the current
 * source; only the schema and the contract are inputs, none of the compared artifacts feeds a
 * generator, so a hand edit cannot survive the regeneration.
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';

import { PROJECT_ROOT } from '../support/project-root';

/**
 * The generated directory the parity covers, relative to the project root: every artifact of
 * `prisma generate` lives under this single root, so one entry covers the GraphQL tree and the YAML
 * schemas at once. The copy loses its content before the regeneration: a generator writes files but
 * does not own the directory, so a stale file survives a regeneration and would hide itself from
 * the comparison.
 */
const ARTIFACT_DIRECTORIES = ['src/generated'] as const;

const COPY_ROOT = join(PROJECT_ROOT, '.tmp', 'unit', 'artifacts-parity');
const SELF_CHECK_ROOT = join(PROJECT_ROOT, '.tmp', 'unit', 'artifacts-parity-self-check');

/** Path of one artifact inside a project root. */
function pathIn(root: string, artifact: string): string {
  return join(root, artifact);
}

/** Relative paths of every file under `root`, sorted, with `/` as the separator. */
function listFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .map((path) => path.split(sep).join('/'))
    .sort();
}

/**
 * Divergences of one generated directory: a file the generation did not produce (`surplus`), a file
 * it lost (`missing`) and a file whose content differs (`changed`). `actual` is the freshly
 * generated tree, `expected` is the committed one; an empty list means the two match.
 */
function differencesOf(actual: string, expected: string): string[] {
  const generated = listFiles(actual);
  const committed = listFiles(expected);

  const differences = [
    ...generated.filter((file) => !committed.includes(file)).map((file) => `surplus: ${file}`),
    ...committed.filter((file) => !generated.includes(file)).map((file) => `missing: ${file}`),
    ...committed
      .filter((file) => generated.includes(file))
      .filter(
        (file) =>
          readFileSync(join(actual, file), 'utf8') !== readFileSync(join(expected, file), 'utf8'),
      )
      .map((file) => `changed: ${file}`),
  ];

  return differences.sort();
}

/**
 * `git status --porcelain` lines outside `.tmp/`. The parity runs in a copy, so a line that appeared
 * after it is a write into the working tree, i.e. the copy leaked into the sources.
 */
function workingTreeChanges(): string[] {
  const result = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`git status failed in ${PROJECT_ROOT}:\n${result.stderr}`);
  }

  return (result.stdout ?? '')
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.includes('.tmp/'));
}

/** Regenerates the artifacts in a disposable copy and returns the copy root. */
function regenerate(): string {
  rmSync(COPY_ROOT, { recursive: true, force: true });
  mkdirSync(COPY_ROOT, { recursive: true });

  for (const directory of ['prisma', 'src', 'config']) {
    cpSync(join(PROJECT_ROOT, directory), join(COPY_ROOT, directory), { recursive: true });
  }

  for (const directory of ARTIFACT_DIRECTORIES) {
    rmSync(join(COPY_ROOT, directory), { recursive: true, force: true });
  }

  // The real manifest carries the `prisma:generate` script; a minimal one would have no such script.
  cpSync(join(PROJECT_ROOT, 'package.json'), join(COPY_ROOT, 'package.json'));
  symlinkSync(join(PROJECT_ROOT, 'node_modules'), join(COPY_ROOT, 'node_modules'), 'dir');

  const result = spawnSync('npm', ['run', 'prisma:generate'], {
    cwd: COPY_ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: 'postgresql://user:password@localhost:5432/parity' },
  });

  if (result.status !== 0) {
    throw new Error(`npm run prisma:generate failed in ${COPY_ROOT}:\n${result.stdout}\n${result.stderr}`);
  }

  return COPY_ROOT;
}

let copyRoot: string;
let treeBefore: string[];

beforeAll(() => {
  treeBefore = workingTreeChanges();
  copyRoot = regenerate();
});

afterAll(() => {
  rmSync(COPY_ROOT, { recursive: true, force: true });
  rmSync(SELF_CHECK_ROOT, { recursive: true, force: true });
});

describe('parity of the committed generator artifacts', () => {
  it('rebuilds the generated tree: the same files, byte for byte', () => {
    for (const directory of ARTIFACT_DIRECTORIES) {
      expect(differencesOf(pathIn(copyRoot, directory), pathIn(PROJECT_ROOT, directory)))
        .toEqual([]);
    }
  });

  it('regenerating in the copy did not touch the working tree', () => {
    // Nothing outside `.tmp/` may be written by the parity run: the copy carries its own `prisma/`,
    // `src/` and `config/`, and the only symlink points at the shared `node_modules`. The state is
    // compared with the one taken right before the regeneration, so a tree that was already dirty
    // for unrelated reasons does not disguise a write and does not fail the test by itself.
    expect(workingTreeChanges()).toEqual(treeBefore);
  });

  it('reports a surplus, a missing and an edited file as a divergence', () => {
    // The comparison is what the test above relies on, so its three failure modes are checked on
    // fixtures: without this control a silently empty comparison would keep the parity green.
    const committed = join(SELF_CHECK_ROOT, 'committed');
    const generated = join(SELF_CHECK_ROOT, 'generated');

    mkdirSync(join(committed, 'nested'), { recursive: true });
    mkdirSync(join(generated, 'nested'), { recursive: true });

    writeFileSync(join(committed, 'kept.ts'), 'export const kept = 1;\n');
    writeFileSync(join(generated, 'kept.ts'), 'export const kept = 1;\n');
    writeFileSync(join(committed, 'nested', 'edited.ts'), 'export const value = 1;\n');
    writeFileSync(join(generated, 'nested', 'edited.ts'), 'export const value = 2;\n');
    writeFileSync(join(committed, 'missing.ts'), 'export const missing = 1;\n');
    writeFileSync(join(generated, 'surplus.ts'), 'export const surplus = 1;\n');

    expect(differencesOf(generated, committed)).toEqual([
      'changed: nested/edited.ts',
      'missing: missing.ts',
      'surplus: surplus.ts',
    ]);
  });
});
