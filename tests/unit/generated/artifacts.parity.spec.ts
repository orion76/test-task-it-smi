/**
 * The committed artifacts of the generators are results of the pipeline, not hand-written code: the
 * schema of the API contract, the two GraphQL resolvers, the seed data schema and the GraphQL
 * entity classes are all built from `prisma/schema.prisma` plus `config/api-fields.yml`. A
 * divergence between a fresh generation and the committed tree means the artifact was edited by
 * hand or the regeneration was forgotten, so this spec rebuilds them in a disposable copy of the
 * project under `.tmp/` and compares byte for byte with the committed ones.
 *
 * The generated directories are compared as a whole: not only the content of every file, but the
 * listing itself, so a file added by hand or a file missing from the tree fails the parity the same
 * way an edited one does.
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
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

import { PROJECT_ROOT } from '../support/project-root';

/**
 * Schema of the API config, relative to the project root: the artifact of `apiFields`, which lives
 * in `config/` next to the contract it validates.
 */
const CONTRACT_SCHEMA = 'config/api-fields.schema.yml';

/** The artifacts the parity covers, relative to the project root. */
const ARTIFACTS = [
  CONTRACT_SCHEMA,
  'src/generated/graphql/resolvers/relations.resolver.ts',
  'src/generated/graphql/resolvers/queries.resolver.ts',
  'config/profile-data.schema.yml',
  'config/dictionaries.yml',
] as const;

/**
 * The generated directories the parity covers, relative to the project root. The copy loses their
 * content before the regeneration: a generator writes files but does not own the directory, so a
 * stale file survives a regeneration and would hide itself from the comparison. Both GraphQL trees
 * live under one root, so the single directory covers the entity classes and the resolvers at once:
 * a file dropped by a generator cannot stay behind in a sibling directory nobody cleaned.
 */
const ARTIFACT_DIRECTORIES = ['src/generated/graphql'] as const;

const COPY_ROOT = join(PROJECT_ROOT, '.tmp', 'unit', 'artifacts-parity');
const SELF_CHECK_ROOT = join(PROJECT_ROOT, '.tmp', 'unit', 'artifacts-parity-self-check');

/** Path of one artifact inside a project root. */
function artifactOf(root: string, artifact: string): string {
  return join(root, artifact);
}

/**
 * Whether `directory` covers `path`, i.e. whether removing the directory would remove that file too.
 * Both arguments are relative to the same root.
 */
function isInside(directory: string, path: string): boolean {
  const difference = relative(directory, path);

  return difference.length > 0 && !difference.startsWith('..') && !isAbsolute(difference);
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
  it('rebuilds every committed artifact byte for byte from the schema and the contract', () => {
    for (const artifact of ARTIFACTS) {
      expect(readFileSync(artifactOf(copyRoot, artifact), 'utf8')).toBe(
        readFileSync(artifactOf(PROJECT_ROOT, artifact), 'utf8'),
      );
    }
  });

  it('rebuilds every generated directory: the same files, byte for byte', () => {
    for (const directory of ARTIFACT_DIRECTORIES) {
      expect(differencesOf(artifactOf(copyRoot, directory), artifactOf(PROJECT_ROOT, directory)))
        .toEqual([]);
    }
  });

  it('the cleanup of the generated directories leaves the API contract schema alone', () => {
    // The cleanup removes whole directories, and the contract schema is not generated into the
    // GraphQL tree: a directory widened past the generated files would delete it before the
    // regeneration and hide a stale copy of it. The copy has to hold the schema after the
    // regeneration as well.
    for (const directory of ARTIFACT_DIRECTORIES) {
      expect(isInside(directory, CONTRACT_SCHEMA)).toBe(false);
    }

    expect(existsSync(artifactOf(copyRoot, CONTRACT_SCHEMA))).toBe(true);
  });

  it('regenerating in the copy did not touch the working tree', () => {
    // Nothing outside `.tmp/` may be written by the parity run: the copy carries its own `prisma/`,
    // `src/` and `config/`, and the only symlink points at the shared `node_modules`. The state is
    // compared with the one taken right before the regeneration, so a tree that was already dirty
    // for unrelated reasons does not disguise a write and does not fail the test by itself.
    expect(workingTreeChanges()).toEqual(treeBefore);
  });

  it('reports a surplus, a missing and an edited file as a divergence', () => {
    // The comparison is what the tests above rely on, so its three failure modes are checked on
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
