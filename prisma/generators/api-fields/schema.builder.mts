/**
 * Builds the JSON Schema of the API contract from the models of the datamodel.
 *
 * The document has three blocks: `version`, `models` and `queries`. Everything they refer to is
 * pinned down to the names the datamodel declares, so a typo becomes a build error instead of a
 * field that silently leaves the API or a query that reads a table nobody has. A tie table of a
 * collection is not a model of the API: its rows are read through the collection that names it.
 */
import type { DMMF } from '@prisma/generator-helper';

import { compare, delegateName } from '../shared/dmmf.mts';
import { PROPERTY_SCHEMA, QUERY_SCHEMA, SORT_SCHEMA, VALUE_FIELD_KINDS } from './constants.mts';
import { linkModelsOf, throughCollectionsOf } from './through.links.mts';
import type { IThroughCollection, TSchemaNode } from './types.mts';

/**
 * Builds the JSON Schema of the whole contract from the models of the datamodel.
 *
 * @param models models of the DMMF datamodel
 * @returns the schema of the API contract
 */
export function buildSchema(models: readonly DMMF.Model[]): TSchemaNode {
  const linkModels = linkModelsOf(models);
  const sorted = models
    .filter((model) => !linkModels.has(model.name))
    .sort((left, right) => compare(left.name, right.name));
  const modelProperties: Record<string, TSchemaNode> = {};

  for (const model of sorted) {
    modelProperties[model.name] = {
      type: 'object',
      additionalProperties: false,
      required: ['description'],
      properties: {
        description: { type: 'string', minLength: 1 },
        properties: buildProperties(model.fields),
        references: buildReferences(model, models, linkModels),
        order: buildOrder(model.fields),
      },
    };
  }

  const entities = sorted.map((model) => delegateName(model.name));

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    additionalProperties: false,
    required: ['version', 'models'],
    properties: {
      version: { const: 1 },
      models: {
        type: 'object',
        additionalProperties: false,
        properties: modelProperties,
      },
      queries: {
        type: 'object',
        additionalProperties: {
          ...QUERY_SCHEMA,
          properties: { ...QUERY_SCHEMA.properties, entity: { enum: entities } },
        },
      },
    },
    $defs: { property: PROPERTY_SCHEMA, sort: SORT_SCHEMA },
  };
}

/**
 * Names of the value fields of one model, sorted: the columns a row stores in itself.
 *
 * @param fields fields of one model
 * @returns the column names in name order
 */
function valueFieldNames(fields: readonly DMMF.Field[]): string[] {
  return fields
    .filter((field) => VALUE_FIELD_KINDS.has(field.kind))
    .map((field) => field.name)
    .sort(compare);
}

/**
 * Builds the `properties` block of one model: the sorted names of its value fields, each one
 * referring to the shared `property` definition.
 *
 * @param fields fields of one model
 * @returns the `properties` subschema
 */
function buildProperties(fields: readonly DMMF.Field[]): TSchemaNode {
  const properties: Record<string, TSchemaNode> = {};

  for (const name of valueFieldNames(fields)) {
    properties[name] = { $ref: '#/$defs/property' };
  }

  return { type: 'object', additionalProperties: false, properties };
}

/**
 * Builds the `order` block of one model: entries of exactly one column each, the column pinned to
 * the value fields of the model. A typo in a column name fails the build instead of ordering by a
 * column nobody has.
 *
 * @param fields fields of one model
 * @returns the `order` subschema
 */
function buildOrder(fields: readonly DMMF.Field[]): TSchemaNode {
  return {
    type: 'array',
    items: {
      type: 'object',
      minProperties: 1,
      maxProperties: 1,
      propertyNames: { enum: valueFieldNames(fields) },
      additionalProperties: { $ref: '#/$defs/sort' },
    },
  };
}

/**
 * Builds the `references` block of one model: its relations, each pinned to the entity it points at
 * and to the column that holds its identifier. A collection read through a tie table has no column of
 * its own, so it is declared under a name the contract chooses, and `additionalProperties` accepts
 * only the through-form of a table that ties this model to another one.
 *
 * @param model model whose relations are described
 * @param models every model of the datamodel, for the back-relation and tie-table lookups
 * @param linkModels tie tables: their inverse collections are not part of the API
 * @returns the `references` subschema
 */
function buildReferences(
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  linkModels: ReadonlySet<string>,
): TSchemaNode {
  const properties: Record<string, TSchemaNode> = {};
  const relations = model.fields
    .filter((field) => field.kind === 'object' && !linkModels.has(field.type))
    .map((field) => ({ field, property: foreignKeyOf(field, model, models) }))
    .sort((left, right) => compare(left.field.name, right.field.name));

  for (const { field, property } of relations) {
    if (property !== null) {
      properties[field.name] = directReference(field, property);
    }
  }

  const collections = throughCollectionsOf(model, models);

  return {
    type: 'object',
    additionalProperties:
      collections.length === 0 ? false : { oneOf: collections.map(throughReference) },
    properties,
  };
}

/** One relation read through a column of a row: the entity and the column that names it. */
function directReference(field: DMMF.Field, property: string): TSchemaNode {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['description', 'entity', 'property'],
    properties: {
      description: { type: 'string', minLength: 1 },
      entity: { const: delegateName(field.type) },
      property: { const: property },
    },
  };
}

/**
 * One collection read through a tie table: the entity it holds, the table and the two columns. The
 * name of the field is the one the contract chooses, so only the read is pinned here.
 */
function throughReference(collection: IThroughCollection): TSchemaNode {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['description', 'entity', 'through'],
    properties: {
      description: { type: 'string', minLength: 1 },
      entity: { const: collection.entity },
      through: {
        type: 'object',
        additionalProperties: false,
        required: ['entity', 'parent', 'target'],
        properties: {
          entity: { const: delegateName(collection.link.model) },
          parent: { const: collection.link.parent },
          target: { const: collection.link.target },
        },
      },
    },
  };
}

/**
 * Column that holds the identifier of the related row.
 *
 * The relation may declare it itself (`relationFromFields`) or leave it to the opposite side, which
 * is the case for a list: `Profile.experience` has no key of its own, `Experience.profile` has one.
 *
 * @returns the column name, or `null` when the relation carries no foreign key at all (a relation
 *   without a key is read through a tie table or is not part of the API)
 */
function foreignKeyOf(
  field: DMMF.Field,
  model: DMMF.Model,
  models: readonly DMMF.Model[],
): string | null {
  const own = field.relationFromFields?.[0];

  if (own !== undefined) {
    return own;
  }

  const target = models.find((candidate) => candidate.name === field.type);

  if (target === undefined) {
    return null;
  }

  const back = target.fields.find(
    (candidate) =>
      candidate.kind === 'object' &&
      candidate.type === model.name &&
      (field.relationName === undefined || candidate.relationName === field.relationName),
  );

  return back?.relationFromFields?.[0] ?? null;
}
