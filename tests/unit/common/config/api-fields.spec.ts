/**
 * `referenceOf` reads the contract by the entity of a row (`profile`, `socialLink`, …), not by the
 * model name (`Profile`, `SocialLink`): that is the spelling of the `type` column and of the Prisma
 * client delegate, so the index has to answer the same way. A relation the contract does not declare
 * is a mistake of the resolver, so it is reported with the file, the entity and the field.
 *
 * `orderOf` reads the `order` block of the same model: the read order of a collection belongs to
 * the contract, so the data layer names no column of its own.
 *
 * The happy paths read the real contract in this process; the broken shapes (a `references` block
 * that is not a mapping, an empty `entity` or `property`) need a broken file, which lives in a
 * disposable copy of the project run by a harness in a child process.
 */
import { orderOf, referenceOf } from '@src/common/config/api-fields';

import { createTemporaryProject, failureOf, valueOf } from '../../support/temporary-project';
import type { ITemporaryProject } from '../../support/types';

const HARNESS = 'harness.ts';

const HARNESS_SOURCE = `import { referenceOf } from './src/common/config/api-fields';

try {
  console.log(JSON.stringify({ ok: true, value: referenceOf('profile', 'links') }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
}
`;

let project: ITemporaryProject;

beforeAll(() => {
  project = createTemporaryProject('api-fields');
  project.write(HARNESS, HARNESS_SOURCE);
});

afterAll(() => {
  project.remove();
});

describe('referenceOf', () => {
  it('returns the entity and the column of a declared relation', () => {
    expect(referenceOf('profile', 'links')).toEqual({ entity: 'socialLink', property: 'profileId' });
    expect(referenceOf('profile', 'experience')).toEqual({
      entity: 'experience',
      property: 'profileId',
    });
  });

  it('answers the inverse side of a relation the same way', () => {
    expect(referenceOf('socialLink', 'profile')).toEqual({
      entity: 'profile',
      property: 'profileId',
    });
    expect(referenceOf('skill', 'profile')).toEqual({ entity: 'profile', property: 'profileId' });
  });

  it('indexes the contract by the entity name, not by the model name', () => {
    const index = valueOf(project.run(HARNESS, 'ts-node')) as Record<string, unknown>;

    expect(index).toEqual({ entity: 'socialLink', property: 'profileId' });
    // The entity key is `socialLink`, so the model spelling `SocialLink` has no reference at all.
    expect(() => referenceOf('SocialLink', 'profile')).toThrow(
      'config/api-fields.yml: no reference "profile" of entity "SocialLink"; ' +
        'declare it in the "references" block of the model',
    );
  });

  it('fails with the file, the entity and the field when the relation is not declared', () => {
    expect(() => referenceOf('profile', 'ghost')).toThrow(
      'config/api-fields.yml: no reference "ghost" of entity "profile"; ' +
        'declare it in the "references" block of the model',
    );
  });

  it('fails naming the model path when the references block is not a mapping', () => {
    project.write(
      'config/api-fields.yml',
      'version: 1\nmodels:\n  Profile:\n    description: Owner\n    references: owner\n',
    );

    expect(failureOf(project.run(HARNESS, 'ts-node'))).toBe(
      'config/api-fields.yml: models.Profile.references must be a mapping',
    );
  });

  it('fails naming the model and the field when the entity of a reference is empty', () => {
    project.write(
      'config/api-fields.yml',
      [
        'version: 1',
        'models:',
        '  Profile:',
        '    description: Owner',
        '    references:',
        '      links:',
        '        entity:',
        '        property: profileId',
        '',
      ].join('\n'),
    );

    expect(failureOf(project.run(HARNESS, 'ts-node'))).toBe(
      'config/api-fields.yml: Profile.references.links.entity must be an entity name',
    );
  });

  it('fails naming the model and the field when the column of a reference is empty', () => {
    project.write(
      'config/api-fields.yml',
      [
        'version: 1',
        'models:',
        '  Profile:',
        '    description: Owner',
        '    references:',
        '      links:',
        '        entity: socialLink',
        '        property:',
        '',
      ].join('\n'),
    );

    expect(failureOf(project.run(HARNESS, 'ts-node'))).toBe(
      'config/api-fields.yml: Profile.references.links.property must be a column name',
    );
  });

  it('fails with the file name when the contract has no models block', () => {
    project.write('config/api-fields.yml', 'version: 1\n');

    expect(failureOf(project.run(HARNESS, 'ts-node'))).toBe(
      'config/api-fields.yml: "models" is required and must be a mapping of model names',
    );
  });
});

describe('orderOf', () => {
  it('returns the ordering the model declares', () => {
    expect(orderOf('skill')).toEqual([
      { category: { sort: 'asc', nulls: 'last' } },
      { name: 'asc' },
      { id: 'asc' },
    ]);
    expect(orderOf('experience')).toEqual([{ startedAt: 'desc' }, { id: 'asc' }]);
  });

  it('answers undefined for an entity the contract does not name', () => {
    expect(orderOf('ghost')).toBeUndefined();
  });
});
