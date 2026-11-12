/**
 * `buildProperty` derives the rule of one field of the import file from the DMMF, and
 * `isRequiredInFile` decides whether the row must carry it. Both read only the column plus the
 * config fragments, so the spec drives them directly: the mapping of a Prisma scalar to a JSON
 * Schema type, the enum values, the null alternative, and the required flag that follows from
 * nullability and defaults.
 */
import type { DMMF } from '@prisma/generator-helper';

import {
  buildProperty,
  isRequiredInFile,
  referenceTo,
} from '@generators/seed-schema/property.builder.mts';
import type { TSchemaFragment } from '@generators/seed-schema/types.mts';
import {
  domainDatamodel,
  experienceModel,
  field,
  model,
  profileModel,
  skillModel,
  socialLinkModel,
} from '../support/datamodel';

const datamodel = domainDatamodel();
const enums = new Map(enumsOf(datamodel.enums));
const noFragments = new Map<string, TSchemaFragment>();

/** Tie tables of the dictionaries: their inverse collections are not part of the import file. */
const linkModels = new Set(['ProfileSkill', 'ProfileSocialLink']);

/** The enum values as the builder takes them. */
function enumsOf(entries: readonly DMMF.DatamodelEnum[]): Array<[string, string[]]> {
  return entries.map((entry) => [entry.name, entry.values.map((value) => value.name)]);
}

/** One field of a model, by name. */
function fieldOf(model: DMMF.Model, name: string): DMMF.Field {
  const found = model.fields.find((entry) => entry.name === name);

  if (found === undefined) {
    throw new Error(`${model.name} has no field ${name}`);
  }

  return found;
}

describe('buildProperty', () => {
  it('maps a required text column to a non-empty string', () => {
    expect(
      buildProperty(profileModel(), fieldOf(profileModel(), 'name'), enums, noFragments, linkModels),
    ).toEqual({ type: 'string', minLength: 1 });
  });

  it('maps a required integer column to an integer', () => {
    // The domain has no integer column of its own, so the mapping is pinned on a synthetic model:
    // the rule is about the scalar type, not about the table it sits in.
    const counter = model('Counter', [field({ name: 'count', type: 'Int' })]);

    expect(
      buildProperty(counter, fieldOf(counter, 'count'), enums, noFragments, linkModels),
    ).toEqual({ type: 'integer' });
  });

  it('maps a required date column to a non-empty string, and the config adds its format', () => {
    expect(
      buildProperty(
        experienceModel(),
        fieldOf(experienceModel(), 'startedAt'),
        enums,
        noFragments,
        linkModels,
      ),
    ).toMatchObject({ type: 'string', minLength: 1 });
  });

  it('accepts null in a nullable column instead of omitting the rule', () => {
    expect(
      buildProperty(
        skillModel(),
        fieldOf(skillModel(), 'category'),
        enums,
        noFragments,
        linkModels,
      ),
    ).toEqual({
      type: ['string', 'null'],
      description: 'Free-form grouping: "language", "backend", "database", …',
    });
  });

  it('turns a scalar list into an array of items', () => {
    expect(
      buildProperty(
        experienceModel(),
        fieldOf(experienceModel(), 'achievements'),
        enums,
        noFragments,
        linkModels,
      ),
    ).toEqual({ type: 'array', items: { type: 'string' } });
  });

  it('takes the values of an enum column from the datamodel', () => {
    expect(
      buildProperty(
        socialLinkModel(),
        fieldOf(socialLinkModel(), 'kind'),
        enums,
        noFragments,
        linkModels,
      ),
    ).toEqual({
      enum: ['GITHUB', 'LINKEDIN', 'WEBSITE', 'OTHER'],
      description: 'Kind of the link: one of the `SocialKind` values.',
    });
  });

  it('adds null to a nullable enum column', () => {
    const nullable = field({
      name: 'kind',
      type: 'SocialKind',
      kind: 'enum',
      isRequired: false,
    });

    expect(buildProperty(socialLinkModel(), nullable, enums, noFragments, linkModels)).toEqual({
      type: ['string', 'null'],
      enum: ['GITHUB', 'LINKEDIN', 'WEBSITE', 'OTHER', null],
    });
  });

  it('turns an enum list into an array of enum values', () => {
    const list = field({ name: 'kinds', type: 'SocialKind', kind: 'enum', isList: true });

    expect(buildProperty(socialLinkModel(), list, enums, noFragments, linkModels)).toEqual({
      type: 'array',
      items: { enum: ['GITHUB', 'LINKEDIN', 'WEBSITE', 'OTHER'] },
    });
  });

  it('turns a collection relation into an array of references', () => {
    expect(
      buildProperty(
        profileModel(),
        fieldOf(profileModel(), 'experience'),
        enums,
        noFragments,
        linkModels,
      ),
    ).toEqual({ type: 'array', items: { $ref: '#/$defs/experience' } });
  });

  it('skips a single-valued relation, which is the inverse side of the parent link', () => {
    expect(
      buildProperty(
        experienceModel(),
        fieldOf(experienceModel(), 'profile'),
        enums,
        noFragments,
        linkModels,
      ),
    ).toBeNull();
  });

  it('skips the inverse collection of a tie table, which is not a property of the import file', () => {
    expect(
      buildProperty(
        socialLinkModel(),
        fieldOf(socialLinkModel(), 'profileSocialLinks'),
        enums,
        noFragments,
        linkModels,
      ),
    ).toBeNull();
    expect(
      buildProperty(
        skillModel(),
        fieldOf(skillModel(), 'profileSkills'),
        enums,
        noFragments,
        linkModels,
      ),
    ).toBeNull();
  });

  it('lets a fragment of the config replace the derived rule', () => {
    const fragments = new Map<string, TSchemaFragment>([
      ['Profile.name', { type: 'string', maxLength: 10 }],
    ]);

    expect(
      buildProperty(profileModel(), fieldOf(profileModel(), 'name'), enums, fragments, linkModels),
    ).toEqual({ type: 'string', maxLength: 10 });
  });

  it('keeps the documentation of the column when the fragment does not document itself', () => {
    const fragments = new Map<string, TSchemaFragment>([['Skill.category', { type: 'string' }]]);

    expect(
      buildProperty(
        skillModel(),
        fieldOf(skillModel(), 'category'),
        enums,
        fragments,
        linkModels,
      ),
    ).toEqual({
      type: 'string',
      description: 'Free-form grouping: "language", "backend", "database", …',
    });
  });

  it('lets the fragment document the field when it has its own text', () => {
    const fragments = new Map<string, TSchemaFragment>([
      ['Skill.category', { type: 'string', description: 'Own text.' }],
    ]);

    expect(
      buildProperty(
        skillModel(),
        fieldOf(skillModel(), 'category'),
        enums,
        fragments,
        linkModels,
      ),
    ).toMatchObject({ description: 'Own text.' });
  });

  it('fails with the location of a column whose enum the datamodel does not declare', () => {
    const missing = field({ name: 'kind', type: 'Missing', kind: 'enum' });

    expect(() =>
      buildProperty(socialLinkModel(), missing, enums, noFragments, linkModels),
    ).toThrow('seed-schema: SocialLink.kind: the enum "Missing" is not declared by the datamodel');
  });

  it('fails with the location of a scalar that has no JSON Schema counterpart', () => {
    const unsupported = field({ name: 'payload', type: 'Json' });

    expect(() =>
      buildProperty(profileModel(), unsupported, enums, noFragments, linkModels),
    ).toThrow(
      'seed-schema: Profile.payload: the scalar "Json" has no JSON Schema counterpart; ' +
        'add it to SCALAR_TYPES of the generator',
    );
  });
});

describe('isRequiredInFile', () => {
  it('does not require a column with a default, because the database fills it', () => {
    const finished = fieldOf(experienceModel(), 'finished');

    expect(isRequiredInFile(finished, { type: 'boolean' })).toBe(false);
  });

  it('requires a column that is not null and has no default', () => {
    const name = fieldOf(profileModel(), 'name');

    expect(isRequiredInFile(name, { type: 'string', minLength: 1 })).toBe(true);
  });

  it('does not require a nullable column whose rule accepts null', () => {
    expect(
      isRequiredInFile(fieldOf(skillModel(), 'category'), { type: ['string', 'null'] }),
    ).toBe(false);
    expect(
      isRequiredInFile(fieldOf(experienceModel(), 'endedAt'), {
        anyOf: [{ type: 'string' }, { type: 'null' }],
      }),
    ).toBe(false);
    expect(isRequiredInFile(fieldOf(experienceModel(), 'endedAt'), { enum: ['x', null] })).toBe(
      false,
    );
  });

  it('requires a nullable column whose rule does not accept null', () => {
    expect(isRequiredInFile(fieldOf(skillModel(), 'category'), { type: 'string' })).toBe(true);
  });
});

describe('referenceTo', () => {
  it('builds a reference into the definitions of the document', () => {
    expect(referenceTo('socialLink')).toBe('#/$defs/socialLink');
  });
});
