/**
 * Hand-written datamodel of the domain, shaped exactly like the DMMF Prisma hands to a generator.
 *
 * The real `prisma/schema.prisma` has five models, one enum and one `String[]` column; the fixture
 * repeats that shape field by field (kinds, nullability, defaults, documentation, relation names and
 * the foreign key of a relation). Running `prisma generate` to obtain a fixture would test Prisma
 * instead of the generator and would make the spec depend on the binary, so the datamodel is spelled
 * out here. A change of `schema.prisma` is a change of this file, which is the point: the specs are
 * about rendering, and their input is data.
 */
import type { DMMF } from '@prisma/generator-helper';

import type { IFieldSpec } from './types';

/** Builds one field: a scalar of the row unless `kind` says otherwise. */
export function field(spec: IFieldSpec): DMMF.Field {
  return {
    kind: spec.kind ?? 'scalar',
    name: spec.name,
    type: spec.type,
    isRequired: spec.isRequired ?? true,
    isList: spec.isList ?? false,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    hasDefaultValue: spec.hasDefaultValue ?? false,
    documentation: spec.documentation,
    relationName: spec.relationName,
    relationFromFields: spec.relationFromFields,
  };
}

/** Builds one model from its fields. */
export function model(
  name: string,
  fields: DMMF.Field[],
  documentation?: string,
): DMMF.Model {
  return {
    name,
    dbName: null,
    schema: null,
    fields,
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
    documentation,
  };
}

/** Builds one enum: `values` are the names of its members. */
function enumOf(name: string, values: string[]): DMMF.DatamodelEnum {
  return {
    name,
    values: values.map((value) => ({ name: value, dbName: null })),
    dbName: null,
  };
}

/** Builds a datamodel from its models and enums: the types and indexes blocks stay empty. */
function datamodel(
  models: DMMF.Model[],
  enums: DMMF.DatamodelEnum[],
): DMMF.Datamodel {
  return { models, enums, types: [], indexes: [] };
}

/** The enum of the domain: the kind of a social link. */
function socialKind(): DMMF.DatamodelEnum {
  return enumOf('SocialKind', ['GITHUB', 'LINKEDIN', 'WEBSITE', 'OTHER']);
}

/** The `Profile` model with its four collections, as `schema.prisma` declares it. */
export function profileModel(): DMMF.Model {
  return model(
    'Profile',
    [
      field({ name: 'id', type: 'String', hasDefaultValue: true }),
      field({ name: 'type', type: 'String', hasDefaultValue: true }),
      field({
        name: 'slug',
        type: 'String',
        documentation: 'Kebab-case latin key of the idempotent profile upsert.',
      }),
      field({ name: 'name', type: 'String' }),
      field({ name: 'description', type: 'String' }),
      field({ name: 'createdAt', type: 'DateTime', hasDefaultValue: true }),
      field({ name: 'updatedAt', type: 'DateTime' }),
      field({
        name: 'links',
        type: 'SocialLink',
        kind: 'object',
        isList: true,
        relationName: 'ProfileToSocialLink',
        relationFromFields: [],
      }),
      field({
        name: 'skills',
        type: 'Skill',
        kind: 'object',
        isList: true,
        relationName: 'ProfileToSkill',
        relationFromFields: [],
      }),
      field({
        name: 'experience',
        type: 'Experience',
        kind: 'object',
        isList: true,
        relationName: 'ExperienceToProfile',
        relationFromFields: [],
      }),
      field({
        name: 'projects',
        type: 'Project',
        kind: 'object',
        isList: true,
        relationName: 'ProfileToProject',
        relationFromFields: [],
      }),
    ],
    'Business-card owner with nested collections.',
  );
}

/** The `SocialLink` model: one item of `profile.links`, the owner of the `profileId` column. */
export function socialLinkModel(): DMMF.Model {
  return model(
    'SocialLink',
    [
      field({ name: 'id', type: 'String', hasDefaultValue: true }),
      field({ name: 'type', type: 'String', hasDefaultValue: true }),
      field({ name: 'profileId', type: 'String' }),
      field({ name: 'label', type: 'String' }),
      field({ name: 'url', type: 'String' }),
      field({
        name: 'kind',
        type: 'SocialKind',
        kind: 'enum',
        documentation: 'Kind of the link: one of the `SocialKind` values.',
      }),
      field({
        name: 'profile',
        type: 'Profile',
        kind: 'object',
        relationName: 'ProfileToSocialLink',
        relationFromFields: ['profileId'],
      }),
    ],
    'External link of the profile owner: one item of `profile.links`.',
  );
}

/** The `Skill` model: one item of `profile.skills`, the only model with a nullable text column. */
export function skillModel(): DMMF.Model {
  return model(
    'Skill',
    [
      field({ name: 'id', type: 'String', hasDefaultValue: true }),
      field({ name: 'type', type: 'String', hasDefaultValue: true }),
      field({ name: 'profileId', type: 'String' }),
      field({ name: 'name', type: 'String' }),
      field({
        name: 'category',
        type: 'String',
        isRequired: false,
        documentation: 'Free-form grouping: "language", "backend", "database", …',
      }),
      field({
        name: 'profile',
        type: 'Profile',
        kind: 'object',
        relationName: 'ProfileToSkill',
        relationFromFields: ['profileId'],
      }),
    ],
    'Skill of the profile owner.',
  );
}

/** The `Experience` model: the only `String[]` column and the only nullable date of the domain. */
export function experienceModel(): DMMF.Model {
  return model(
    'Experience',
    [
      field({ name: 'id', type: 'String', hasDefaultValue: true }),
      field({ name: 'type', type: 'String', hasDefaultValue: true }),
      field({ name: 'profileId', type: 'String' }),
      field({ name: 'company', type: 'String' }),
      field({ name: 'position', type: 'String' }),
      field({
        name: 'startedAt',
        type: 'DateTime',
        documentation:
          'Calendar date `YYYY-MM-DD`. A period of employment has neither a time of day nor a time zone.',
      }),
      field({
        name: 'endedAt',
        type: 'DateTime',
        isRequired: false,
        documentation:
          'Calendar date `YYYY-MM-DD`, or `null` while the job is current. The pair `finished`/`endedAt` ' +
          'is checked by the seed when it writes a row; a read validates nothing and returns the row as is.',
      }),
      field({
        name: 'finished',
        type: 'Boolean',
        hasDefaultValue: true,
        documentation:
          'Whether the employment is over. `false` marks a current job, and then `endedAt` is empty; an ' +
          'owner may hold several jobs at once, so this is a fact about the row, not about a missing date. ' +
          '`NOT NULL DEFAULT false`, so rows written before the flag existed read as `false`.',
      }),
      field({ name: 'achievements', type: 'String', isList: true }),
      field({
        name: 'profile',
        type: 'Profile',
        kind: 'object',
        relationName: 'ExperienceToProfile',
        relationFromFields: ['profileId'],
      }),
    ],
    'Employment record of the profile owner.',
  );
}

/** The `Project` model: a nullable link and a nullable description. */
export function projectModel(): DMMF.Model {
  return model(
    'Project',
    [
      field({ name: 'id', type: 'String', hasDefaultValue: true }),
      field({ name: 'type', type: 'String', hasDefaultValue: true }),
      field({ name: 'profileId', type: 'String' }),
      field({ name: 'name', type: 'String' }),
      field({ name: 'url', type: 'String', isRequired: false }),
      field({ name: 'description', type: 'String', isRequired: false }),
      field({
        name: 'profile',
        type: 'Profile',
        kind: 'object',
        relationName: 'ProfileToProject',
        relationFromFields: ['profileId'],
      }),
    ],
    'Project of the profile owner. The link and the description are optional.',
  );
}

/** The datamodel of the domain in the declaration order of `schema.prisma`. */
export function domainDatamodel(): DMMF.Datamodel {
  return datamodel(
    [profileModel(), socialLinkModel(), skillModel(), experienceModel(), projectModel()],
    [socialKind()],
  );
}
