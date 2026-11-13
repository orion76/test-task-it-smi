/**
 * The built `packages/yaml-loader/lib` is kept in the repository as an artifact, the same way
 * `src/generated/**` and `config/*.schema.yml` are: the library no longer changes, so the artifact
 * changes only together with its source instead of being rebuilt on every install. The price of
 * tracking a build output is that it can drift from the source — a hand edit of `lib/`, a forgotten
 * `npm run build:lib` after a change of `src/`, or a file that moved in the source and stayed behind
 * in the artifact all look like a working tree nobody would question. The library is installed into
 * `node_modules`, so a stale `lib/` is what the whole pipeline runs on.
 *
 * This spec closes that gap by rebuilding the package in a disposable copy under `.tmp/` and
 * comparing the result with the committed tree: every file, its bytes, and the listing itself, so a
 * surplus or a missing file fails the parity the same way an edited one does.
 *
 * The build runs in a copy rather than with `--outDir` pointed elsewhere: a source map records the
 * path to its source relative to the map, so a redirected output directory rewrites `sources` in
 * every `.map` and the comparison would fail for a reason unrelated to the artifact.
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

/** The library package, relative to the project root. */
const PACKAGE_DIRECTORY = 'packages/yaml-loader';

/** The build artifact of the package, relative to the package directory. */
const ARTIFACT_DIRECTORY = 'lib';

const COPY_ROOT = join(PROJECT_ROOT, '.tmp', 'unit', 'yaml-loader-lib');
const SELF_CHECK_ROOT = join(PROJECT_ROOT, '.tmp', 'unit', 'yaml-loader-lib-self-check');
const COMMITTED_ARTIFACT = join(PROJECT_ROOT, PACKAGE_DIRECTORY, ARTIFACT_DIRECTORY);

/** Relative paths of every file under `root`, sorted, with `/` as the separator. */
function listFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .map((path) => path.split(sep).join('/'))
    .sort();
}

/**
 * Divergences between a freshly built artifact and the committed one: a file the build did not emit
 * (`surplus`), a file it lost (`missing`) and a file whose bytes differ (`changed`). An empty list
 * means the two trees match; the sort keeps the message stable between runs.
 */
function differencesOf(actual: string, expected: string): string[] {
  const built = listFiles(actual);
  const committed = listFiles(expected);

  const differences = [
    ...built.filter((file) => !committed.includes(file)).map((file) => `surplus: ${file}`),
    ...committed.filter((file) => !built.includes(file)).map((file) => `missing: ${file}`),
    ...committed
      .filter((file) => built.includes(file))
      .filter((file) => {
        const builtPath = join(actual, file);
        const committedPath = join(expected, file);

        return !readFileSync(builtPath).equals(readFileSync(committedPath));
      })
      .map((file) => `changed: ${file}`),
  ];

  return differences.sort();
}

/**
 * `null` when the built artifact matches the committed one, otherwise a message naming every file
 * that diverged: the point of the failure is the list of files to look at, not a boolean.
 */
function mismatchOf(actual: string, expected: string): string | null {
  const differences = differencesOf(actual, expected);

  if (differences.length === 0) {
    return null;
  }

  return [
    `The committed ${PACKAGE_DIRECTORY}/${ARTIFACT_DIRECTORY} is stale: it does not match a fresh build.`,
    ...differences,
    `Rebuild with \`npm run build:lib\` and commit ${PACKAGE_DIRECTORY}/${ARTIFACT_DIRECTORY}/**.`,
  ].join('\n');
}

/** Copies the package without its artifact, rebuilds it there and returns the copy root. */
function buildArtifact(): string {
  rmSync(COPY_ROOT, { recursive: true, force: true });
  cpSync(join(PROJECT_ROOT, PACKAGE_DIRECTORY), COPY_ROOT, { recursive: true });
  // The copy starts without the artifact: only what `tsc` emits takes part in the comparison.
  rmSync(join(COPY_ROOT, ARTIFACT_DIRECTORY), { recursive: true, force: true });
  // The copy is not an installed package, so it borrows the dependencies of the project instead of
  // installing a second tree: `tsc` itself and the declared `types: ["node"]` resolve through it.
  symlinkSync(join(PROJECT_ROOT, 'node_modules'), join(COPY_ROOT, 'node_modules'), 'dir');

  const result = spawnSync(
    join(COPY_ROOT, 'node_modules', '.bin', 'tsc'),
    ['-p', 'tsconfig.json'],
    { cwd: COPY_ROOT, encoding: 'utf8' },
  );

  if (result.status !== 0) {
    throw new Error(`tsc failed in ${COPY_ROOT}:\n${result.stdout}\n${result.stderr}`);
  }

  return COPY_ROOT;
}

let copyRoot: string;

beforeAll(() => {
  copyRoot = buildArtifact();
});

afterAll(() => {
  rmSync(COPY_ROOT, { recursive: true, force: true });
  rmSync(SELF_CHECK_ROOT, { recursive: true, force: true });
});

describe('parity of the committed yaml-loader artifact', () => {
  it('rebuilds every committed file of lib byte for byte, the listing included', () => {
    expect(mismatchOf(join(copyRoot, ARTIFACT_DIRECTORY), COMMITTED_ARTIFACT)).toBeNull();
  });

  it('reports a surplus, a missing and an edited file as a divergence', () => {
    // The comparison is what the test above relies on, so its three failure modes are checked on
    // fixtures: without this control a silently empty comparison would keep the parity green.
    const committed = join(SELF_CHECK_ROOT, 'committed');
    const built = join(SELF_CHECK_ROOT, 'built');

    mkdirSync(join(committed, 'nested'), { recursive: true });
    mkdirSync(join(built, 'nested'), { recursive: true });

    writeFileSync(join(committed, 'kept.js'), 'exports.kept = 1;\n');
    writeFileSync(join(built, 'kept.js'), 'exports.kept = 1;\n');
    writeFileSync(join(committed, 'nested', 'edited.js.map'), '{"version":3}\n');
    writeFileSync(join(built, 'nested', 'edited.js.map'), '{"version":3,"sources":[]}\n');
    writeFileSync(join(committed, 'gone.d.ts'), 'export declare const gone: 1;\n');
    writeFileSync(join(built, 'extra.d.ts'), 'export declare const extra: 1;\n');

    const message = mismatchOf(built, committed);

    expect(message).not.toBeNull();
    expect(message).toContain('surplus: extra.d.ts');
    expect(message).toContain('missing: gone.d.ts');
    expect(message).toContain('changed: nested/edited.js.map');
  });
});
