/**
 * The schema of the API contract is derived from the datamodel alone: it decides which models,
 * columns, relations and read orders `config/api-fields.yml` may mention. A wrong mapping here does
 * not fail the build — it silently accepts a contract that names a table, a column or an order key
 * nobody has — so the spec pins the mapping down: every model is listed, value columns become
 * `properties`, relations become `references` with the entity and the foreign key filled in, the
 * `order` block is pinned to the columns of the model, and a relation without a key is not
 * published at all.
 */
import { buildSchema } from '@generators/api-fields/schema.builder.mts';

import {
  domainDatamodel,
  field,
  model,
  projectModel,
  skillModel,
} from '../support/datamodel';
import { at, keysAt } from '../support/json';

const datamodel = domainDatamodel();
const schema: ReturnType<typeof buildSchema> = buildSchema(datamodel.models);

describe('buildSchema', () => {
  it('lists every model of the datamodel in name order', () => {
    expect(keysAt(schema, 'properties', 'models', 'properties')).toEqual([
      'Experience',
      'Profile',
      'Project',
      'Skill',
      'SocialLink',
    ]);
  });

  it('requires a description and forbids extra keys on the document and on a model', () => {
    expect(at(schema, 'additionalProperties')).toBe(false);
    expect(at(schema, 'required')).toEqual(['version', 'models']);
    expect(at(schema, 'properties', 'models', 'additionalProperties')).toBe(false);
    expect(at(schema, 'properties', 'models', 'properties', 'Skill')).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['description'],
      properties: {
        description: { type: 'string', minLength: 1 },
        properties: {
          type: 'object',
          additionalProperties: false,
          properties: {
            category: { $ref: '#/$defs/property' },
            id: { $ref: '#/$defs/property' },
            name: { $ref: '#/$defs/property' },
            profileId: { $ref: '#/$defs/property' },
            type: { $ref: '#/$defs/property' },
          },
        },
        references: {
          type: 'object',
          additionalProperties: false,
          properties: {
            profile: {
              type: 'object',
              additionalProperties: false,
              required: ['description', 'entity', 'property'],
              properties: {
                description: { type: 'string', minLength: 1 },
                entity: { const: 'profile' },
                property: { const: 'profileId' },
              },
            },
          },
        },
        order: {
          type: 'array',
          items: {
            type: 'object',
            minProperties: 1,
            maxProperties: 1,
            propertyNames: { enum: ['category', 'id', 'name', 'profileId', 'type'] },
            additionalProperties: { $ref: '#/$defs/sort' },
          },
        },
      },
    });
  });

  it('lists value columns and enum columns, sorted, and leaves relations out of properties', () => {
    expect(keysAt(schema, 'properties', 'models', 'properties', 'Profile', 'properties', 'properties', 'properties'))
      .toEqual(['createdAt', 'description', 'id', 'name', 'slug', 'type', 'updatedAt']);
    expect(keysAt(schema, 'properties', 'models', 'properties', 'SocialLink', 'properties', 'properties', 'properties'))
      .toContain('kind');
    expect(keysAt(schema, 'properties', 'models', 'properties', 'Profile', 'properties', 'references', 'properties'))
      .toEqual(['experience', 'links', 'projects', 'skills']);
  });

  it('pins every entry of the order block to one value column of the model', () => {
    expect(
      at(schema, 'properties', 'models', 'properties', 'Skill', 'properties', 'order'),
    ).toEqual({
      type: 'array',
      items: {
        type: 'object',
        minProperties: 1,
        maxProperties: 1,
        propertyNames: { enum: ['category', 'id', 'name', 'profileId', 'type'] },
        additionalProperties: { $ref: '#/$defs/sort' },
      },
    });
    // A relation is not a column of the row, so it cannot be ordered by.
    expect(
      at(
        schema,
        'properties',
        'models',
        'properties',
        'Profile',
        'properties',
        'order',
        'items',
        'propertyNames',
        'enum',
      ),
    ).not.toContain('skills');
  });

  it('publishes the shared sort value once: a direction or the full form with nulls', () => {
    expect(at(schema, '$defs', 'sort')).toEqual({
      oneOf: [
        { enum: ['asc', 'desc'] },
        {
          type: 'object',
          additionalProperties: false,
          required: ['sort', 'nulls'],
          properties: {
            sort: { enum: ['asc', 'desc'] },
            nulls: { enum: ['first', 'last'] },
          },
        },
      ],
    });
  });

  it('pins a relation to the delegate of its target and to its foreign key column', () => {
    const links = at(
      schema,
      'properties',
      'models',
      'properties',
      'Profile',
      'properties',
      'references',
      'properties',
      'links',
      'properties',
    );

    expect(links).toEqual({
      description: { type: 'string', minLength: 1 },
      entity: { const: 'socialLink' },
      property: { const: 'profileId' },
    });
    expect(
      at(
        schema,
        'properties',
        'models',
        'properties',
        'SocialLink',
        'properties',
        'references',
        'properties',
        'profile',
        'properties',
        'entity',
        'const',
      ),
    ).toBe('profile');
  });

  it('takes the foreign key of a collection from the opposite side of the relation', () => {
    expect(
      at(
        schema,
        'properties',
        'models',
        'properties',
        'Profile',
        'properties',
        'references',
        'properties',
        'experience',
        'properties',
        'property',
        'const',
      ),
    ).toBe('profileId');
  });

  it('leaves a relation without an identifier column out of references', () => {
    const project = model('Project', [
      field({ name: 'id', type: 'String', hasDefaultValue: true }),
      field({ name: 'name', type: 'String' }),
      field({ name: 'mentor', type: 'Skill', kind: 'object', relationFromFields: [] }),
    ]);
    const withMentor = buildSchema([project, skillModel()]);

    expect(keysAt(withMentor, 'properties', 'models', 'properties', 'Project', 'properties', 'references', 'properties'))
      .toEqual([]);
    expect(
      keysAt(withMentor, 'properties', 'models', 'properties', 'Project', 'properties', 'properties', 'properties'),
    ).toEqual(['id', 'name']);
  });

  it('gives a model without relations an empty references block', () => {
    const skill = skillModel();
    const isolated = model(
      'Skill',
      skill.fields.filter((entry) => entry.kind !== 'object'),
      skill.documentation,
    );
    const mixed = buildSchema(
      datamodel.models.map((entry) => (entry.name === 'Skill' ? isolated : entry)),
    );

    expect(keysAt(mixed, 'properties', 'models', 'properties', 'Skill', 'properties', 'references', 'properties'))
      .toEqual([]);
    expect(at(mixed, 'properties', 'models', 'properties', 'Skill', 'required')).toEqual([
      'description',
    ]);
    expect(at(mixed, 'properties', 'models', 'properties', 'Skill', 'additionalProperties')).toBe(
      false,
    );
    // Without the opposite side `Profile.skills` has no foreign key to point at, so it is not
    // published either: the collection and the single relation are two ends of one fact.
    expect(keysAt(mixed, 'properties', 'models', 'properties', 'Profile', 'properties', 'references', 'properties'))
      .toEqual(['experience', 'links', 'projects']);
  });

  it('keeps every relation of a model with several relations', () => {
    expect(
      at(schema, 'properties', 'models', 'properties', 'Profile', 'required'),
    ).toEqual(['description']);
    expect(
      keysAt(schema, 'properties', 'models', 'properties', 'Profile', 'properties', 'references', 'properties'),
    ).toEqual(['experience', 'links', 'projects', 'skills']);
  });

  it('names the entity of a reference by the delegate name of the model', () => {
    const entities = at(
      schema,
      'properties',
      'queries',
      'additionalProperties',
      'properties',
      'entity',
      'enum',
    );

    expect(entities).toEqual(['experience', 'profile', 'project', 'skill', 'socialLink']);
  });

  it('publishes the shared property definition once', () => {
    expect(at(schema, '$defs', 'property')).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['description'],
      properties: { description: { type: 'string', minLength: 1 } },
    });
  });

  it('keeps a project without an optional relation as it was declared', () => {
    const project = projectModel();
    const rebuilt = buildSchema([project]);

    expect(keysAt(rebuilt, 'properties', 'models', 'properties', 'Project', 'properties', 'properties', 'properties'))
      .toEqual(['description', 'id', 'name', 'profileId', 'type', 'url']);
  });
});
