import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { projectRoot } from '@lib';

/**
 * The spec imports the package source (`packages/yaml-loader/src/index.ts`) rather than the build
 * artifact of `lib/`: `lib/` is built locally with `npm run build:lib` and is not tracked by git
 * (the directory is listed in `.gitignore`), so a test that required it would fail on a clean
 * checkout, and `ts-jest` compiles the source anyway.
 */

const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');
const SCRATCH_ROOT = join(PROJECT_ROOT, '.tmp');

/** Runs the call and returns the thrown error, failing the test when nothing was thrown. */
function captureError(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    throw error;
  }

  throw new Error('expected the call to throw');
}

describe('projectRoot', () => {
  let scratch: string;

  beforeAll(() => {
    mkdirSync(SCRATCH_ROOT, { recursive: true });
  });

  beforeEach(() => {
    scratch = mkdtempSync(join(SCRATCH_ROOT, 'project-root-'));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('finds the project root from a directory inside the project', () => {
    const toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: __dirname,
      encoding: 'utf8',
    }).trim();

    expect(projectRoot(__dirname)).toBe(toplevel);
  });

  it('climbs over directories without a package.json up to the project root', () => {
    expect(projectRoot(join(PROJECT_ROOT, 'config'))).toBe(PROJECT_ROOT);
    expect(projectRoot(join(PROJECT_ROOT, 'src', 'common'))).toBe(PROJECT_ROOT);
  });

  it('stops at the nearest package.json, so the library package is its own root', () => {
    const packageDirectory = join(PROJECT_ROOT, 'packages', 'yaml-loader');

    expect(projectRoot(packageDirectory)).toBe(packageDirectory);
    expect(projectRoot(join(packageDirectory, 'utils'))).toBe(packageDirectory);
  });

  it('returns the root when the boundary lies above it', () => {
    expect(projectRoot(__dirname, dirname(PROJECT_ROOT))).toBe(PROJECT_ROOT);
  });

  it('rejects a search start outside the boundary, naming both paths', () => {
    const boundary = join(scratch, 'boundary');
    mkdirSync(boundary, { recursive: true });

    const error = captureError(() => projectRoot(scratch, boundary));

    expect(error.message).toContain('outside searchBoundary');
    expect(error.message).toContain(scratch);
    expect(error.message).toContain(boundary);
  });

  it('fails when the boundary is reached without a package.json, naming the boundary', () => {
    const start = join(scratch, 'a', 'b');
    mkdirSync(start, { recursive: true });

    const error = captureError(() => projectRoot(start, scratch));

    expect(error.message).toContain('no package.json');
    expect(error.message).toContain(scratch);
    expect(error.message).toContain(start);
  });

  it.each(['', '   ', undefined])('rejects the missing search start %p', (value) => {
    const searchFrom = value as unknown as string;
    const error = captureError(() => projectRoot(searchFrom));

    expect(error.message).toContain('searchFrom is required');
  });

  it('compares the boundary path-wise: /app does not contain /application', () => {
    const boundary = join(scratch, 'app');
    const start = join(scratch, 'application', 'x');
    mkdirSync(boundary, { recursive: true });
    mkdirSync(start, { recursive: true });

    const error = captureError(() => projectRoot(start, boundary));

    expect(error.message).toContain('outside searchBoundary');
    expect(error.message).toContain(start);
    expect(error.message).toContain(boundary);
  });
});
