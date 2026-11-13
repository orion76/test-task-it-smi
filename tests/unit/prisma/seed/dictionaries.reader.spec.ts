import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { readDictionaries } from '@seed/dictionaries/dictionaries.reader';
import { DICTIONARIES_FILE, DICTIONARIES_VERSION } from '@seed/shared/constants';
import { SeedError } from '@seed/shared/seed.error';

/**
 * The artifact `config/dictionaries.yml` is generated, so its `version` is checked the way the other
 * format markers are: the spec takes the real block and replaces only the `version` field, because
 * the rest of the document is what the writer addresses its tables by. The broken copies live in
 * `.tmp/` (gitignored) and are addressed relative to the project root, as `loadConfig` expects.
 */

const PROJECT_ROOT = resolve(__dirname, '..', '..', '..', '..');
const SCRATCH_ROOT = join(PROJECT_ROOT, '.tmp');

/** The `dictionaries` block of the real artifact, which every broken copy keeps unchanged. */
const DICTIONARIES_BLOCK = [
  'dictionaries:',
  '  Skill:',
  '    key: name',
  '    link:',
  '      model: ProfileSkill',
  '      parent: profileId',
  '      target: skillId',
  '  SocialLink:',
  '    key: url',
  '    link:',
  '      model: ProfileSocialLink',
  '      parent: profileId',
  '      target: socialLinkId',
];

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

describe('readDictionaries', () => {
  let scratch: string;

  beforeAll(() => {
    mkdirSync(SCRATCH_ROOT, { recursive: true });
  });

  beforeEach(() => {
    scratch = mkdtempSync(join(SCRATCH_ROOT, 'dictionaries-reader-'));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  /** Writes an artifact into the scratch directory and returns its path from the project root. */
  function writeArtifact(name: string, lines: readonly string[]): string {
    const file = join(scratch, name);

    writeFileSync(file, `${lines.join('\n')}\n`);

    return relative(PROJECT_ROOT, file);
  }

  it('accepts the version the generated artifact declares', () => {
    expect(DICTIONARIES_VERSION).toBe(1);
    expect(readDictionaries(DICTIONARIES_FILE)).toEqual([
      {
        model: 'Skill',
        key: 'name',
        link: { model: 'ProfileSkill', parent: 'profileId', target: 'skillId' },
      },
      {
        model: 'SocialLink',
        key: 'url',
        link: { model: 'ProfileSocialLink', parent: 'profileId', target: 'socialLinkId' },
      },
    ]);
  });

  it('reads the dictionaries of a document that declares the current version', () => {
    const artifact = writeArtifact('current.yml', ['version: 1', ...DICTIONARIES_BLOCK]);

    expect(readDictionaries(artifact).map((dictionary) => dictionary.model)).toEqual([
      'Skill',
      'SocialLink',
    ]);
  });

  it('rejects another version with the file, the expected and the actual value', () => {
    const artifact = writeArtifact('version-2.yml', ['version: 2', ...DICTIONARIES_BLOCK]);

    const error = captureError(() => readDictionaries(artifact));

    expect(error).toBeInstanceOf(SeedError);
    expect(error.message).toBe(`${artifact}: "version" must be equal to 1, got 2`);
  });

  it('rejects a document without a version, naming the absence as the actual value', () => {
    const artifact = writeArtifact('without-version.yml', DICTIONARIES_BLOCK);

    const error = captureError(() => readDictionaries(artifact));

    expect(error).toBeInstanceOf(SeedError);
    expect(error.message).toBe(`${artifact}: "version" must be equal to 1, got none`);
  });

  it('rejects a version that is written as a string', () => {
    // The marker is compared by value, not by its text: `version: "1"` is another document of the
    // parser, and a run that accepted it would read an artifact the generator never writes.
    const artifact = writeArtifact('quoted-version.yml', ['version: "1"', ...DICTIONARIES_BLOCK]);

    expect(captureError(() => readDictionaries(artifact)).message).toBe(
      `${artifact}: "version" must be equal to 1, got "1"`,
    );
  });

  it('checks the version before the dictionaries block', () => {
    // A document of another format may not have the block at all or may name it differently, so the
    // missing block is never reported for it: the version is the first thing the reader reads.
    const artifact = writeArtifact('version-2-without-block.yml', ['version: 2']);

    expect(captureError(() => readDictionaries(artifact)).message).toBe(
      `${artifact}: "version" must be equal to 1, got 2`,
    );
  });
});
