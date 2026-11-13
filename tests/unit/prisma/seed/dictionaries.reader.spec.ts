import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { readDictionaries } from '@seed/dictionaries/dictionaries.reader';
import type { IDictionarySpec } from '@seed/dictionaries/types';
import { DICTIONARIES_FILE } from '@seed/shared/constants';

import { PROJECT_ROOT } from '../../support/project-root';

/**
 * The artifact `src/generated/config/dictionaries.yml` is a result of `prisma generate`, and its
 * shape is described by `dictionaries.schema.yml` of the same run: the reader validates the document
 * against that schema, so every broken copy below changes one field of the real shape and expects
 * the AJV message with the path inside the document. The copies live in `.tmp/` (gitignored) and are
 * addressed relative to the project root, as `loadConfig` expects.
 */

const SCRATCH_ROOT = join(PROJECT_ROOT, '.tmp');

/** The `dictionaries` block of the real artifact, which the broken copies keep unchanged. */
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

/** The dictionaries of the generated artifact, in the order it lists them. */
const ARTIFACT_DICTIONARIES: IDictionarySpec[] = [
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

  it('reads the generated artifact in the order it lists the dictionaries', () => {
    expect(readDictionaries(DICTIONARIES_FILE)).toEqual(ARTIFACT_DICTIONARIES);
  });

  it('accepts a document that declares the current version', () => {
    const artifact = writeArtifact('current.yml', ['version: 1', ...DICTIONARIES_BLOCK]);

    expect(readDictionaries(artifact).map((dictionary) => dictionary.model)).toEqual([
      'Skill',
      'SocialLink',
    ]);
  });

  it('rejects another version with the path of the field', () => {
    const artifact = writeArtifact('version-2.yml', ['version: 2', ...DICTIONARIES_BLOCK]);

    expect(captureError(() => readDictionaries(artifact)).message).toBe(
      `${artifact}: version: must be equal to constant`,
    );
  });

  it('rejects a document without a version, naming the missing property', () => {
    const artifact = writeArtifact('without-version.yml', DICTIONARIES_BLOCK);

    expect(captureError(() => readDictionaries(artifact)).message).toBe(
      `${artifact}: version: must have required property 'version'`,
    );
  });

  it('rejects a version that is written as a string', () => {
    // The schema declares the marker as an integer, and AJV reports both the type and the constant:
    // a document the generator never writes is rejected instead of being compared as text.
    const artifact = writeArtifact('quoted-version.yml', ['version: "1"', ...DICTIONARIES_BLOCK]);

    expect(captureError(() => readDictionaries(artifact)).message).toBe(
      `${artifact}: version: must be integer\n  version: must be equal to constant`,
    );
  });

  it('rejects a document without the dictionaries block', () => {
    const artifact = writeArtifact('without-dictionaries.yml', ['version: 1']);

    expect(captureError(() => readDictionaries(artifact)).message).toBe(
      `${artifact}: dictionaries: must have required property 'dictionaries'`,
    );
  });

  it('rejects an empty key of a dictionary with the path of the entry', () => {
    const artifact = writeArtifact('empty-key.yml', [
      'version: 1',
      'dictionaries:',
      '  Skill:',
      '    key: ""',
      '    link:',
      '      model: ProfileSkill',
      '      parent: profileId',
      '      target: skillId',
    ]);

    expect(captureError(() => readDictionaries(artifact)).message).toBe(
      `${artifact}: dictionaries.Skill.key: must NOT have fewer than 1 characters`,
    );
  });

  it('rejects a key the entry does not declare with the path of the entry', () => {
    // `property` belongs to the generator config and never reaches the artifact, so the entry is
    // closed: a key the engine would ignore is reported instead of being read silently.
    const artifact = writeArtifact('extra-key.yml', [
      'version: 1',
      'dictionaries:',
      '  Skill:',
      '    key: name',
      '    property: name',
      '    link:',
      '      model: ProfileSkill',
      '      parent: profileId',
      '      target: skillId',
    ]);

    expect(captureError(() => readDictionaries(artifact)).message).toBe(
      `${artifact}: dictionaries.Skill.property: must NOT have additional properties`,
    );
  });

  it('rejects an incomplete link with the path of the missing column', () => {
    const artifact = writeArtifact('without-target.yml', [
      'version: 1',
      'dictionaries:',
      '  Skill:',
      '    key: name',
      '    link:',
      '      model: ProfileSkill',
      '      parent: profileId',
    ]);

    expect(captureError(() => readDictionaries(artifact)).message).toBe(
      `${artifact}: dictionaries.Skill.link.target: must have required property 'target'`,
    );
  });

  it('reports every violation of the document, not just the first one', () => {
    const artifact = writeArtifact('version-2-without-block.yml', ['version: 2']);

    const message = captureError(() => readDictionaries(artifact)).message;

    expect(message).toContain(`${artifact}: `);
    expect(message).toContain('dictionaries: must have required property');
    expect(message).toContain('version: must be equal to constant');
  });
});
