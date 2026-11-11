/**
 * Builds the rule of one field of the import file and the reference to a model definition: a value
 * column is derived from its kind and type, a list relation becomes an array of references, and a
 * field of the config replaces the derived rule.
 */
import type { DMMF } from '@prisma/generator-helper';

import { delegateName } from '../shared/dmmf.mts';
import { isMapping } from '../shared/mapping.mts';
import { GENERATOR_NAME, SCALAR_TYPES } from './constants.mts';
import { fail } from './shared/errors.mts';
import { location } from './shared/location.mts';
import type { TSchemaFragment } from './types.mts';

/**
 * Builds the rule of one field: a reference for a list relation, the derived rule of a value column,
 * or `null` when the field is not part of the import file (the inverse side of the parent link).
 *
 * @param model model the field belongs to
 * @param field field of the DMMF datamodel
 * @param enums values of every enum
 * @param fieldFragments field rules of the config, keyed by `Model.field`
 * @returns the subschema of the field, or `null` when the field is skipped
 */
export function buildProperty(
  model: DMMF.Model,
  field: DMMF.Field,
  enums: ReadonlyMap<string, string[]>,
  fieldFragments: ReadonlyMap<string, TSchemaFragment>,
): TSchemaFragment | null {
  if (field.kind === 'object') {
    if (!field.isList) {
      return null;
    }

    return { type: 'array', items: { $ref: referenceTo(delegateName(field.type)) } };
  }

  const fragment = fieldFragments.get(location(model, field));
  const property = fragment === undefined ? derivedProperty(model, field, enums) : { ...fragment };

  // The description of the column comes from the `///` comment of the Prisma schema; a fragment that
  // documents itself keeps its own text.
  if (property.description === undefined && field.documentation !== undefined) {
    property.description = field.documentation;
  }

  return property;
}

/**
 * Whether the import file has to carry the field. A column with a default is never required, and a
 * nullable one only when its rule accepts `null` — deriving the flag from the rule keeps the two in
 * step, so a config fragment that allows `null` cannot leave a field required by accident.
 *
 * @param field field of the DMMF datamodel
 * @param property rule of the field
 * @returns `true` when the key must be present
 */
export function isRequiredInFile(field: DMMF.Field, property: TSchemaFragment): boolean {
  if (field.hasDefaultValue) {
    return false;
  }

  return field.isRequired || !acceptsNull(property);
}

/** Reference to a definition of the document. */
export function referenceTo(defKey: string): string {
  return `#/$defs/${defKey}`;
}

/**
 * Rule of a value column, with the location of the column added to a failure.
 *
 * The derivation works on the column alone — the model is not part of the rule — so the location,
 * which is the place of the column in the document, is composed here, once, where the model is
 * known.
 *
 * @param model model the field belongs to
 * @param field field of the DMMF datamodel
 * @param enums values of every enum
 * @returns the subschema of the field
 */
function derivedProperty(
  model: DMMF.Model,
  field: DMMF.Field,
  enums: ReadonlyMap<string, string[]>,
): TSchemaFragment {
  try {
    return deriveProperty(field, enums);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(`${GENERATOR_NAME}: ${location(model, field)}: ${reason}`, { cause: error });
  }
}

/**
 * Derives the rule of a value column from its kind and type.
 *
 * @param field field of the DMMF datamodel
 * @param enums values of every enum
 * @returns the subschema of the field
 */
function deriveProperty(field: DMMF.Field, enums: ReadonlyMap<string, string[]>): TSchemaFragment {
  if (field.kind === 'enum') {
    return deriveEnum(field, enums);
  }

  const type = scalarTypeOf(field);

  if (field.isList) {
    return { type: 'array', items: { type } };
  }

  if (!field.isRequired) {
    return { type: [type, 'null'] };
  }

  // A required text column of the import file cannot be blank: an empty `name` would produce an
  // empty business card. Prisma has no such constraint, so it is added here, once for every text
  // column; a field rule of the config can still replace it.
  return type === 'string' ? { type, minLength: 1 } : { type };
}

/**
 * Derives the rule of an enum column: the values are the ones the enum declares.
 *
 * @param field field of the DMMF datamodel
 * @param enums values of every enum
 * @returns the subschema of the field
 */
function deriveEnum(field: DMMF.Field, enums: ReadonlyMap<string, string[]>): TSchemaFragment {
  const values = enums.get(field.type);

  if (values === undefined) {
    fail(`the enum "${field.type}" is not declared by the datamodel`);
  }

  if (field.isList) {
    return { type: 'array', items: { enum: values } };
  }

  if (field.isRequired) {
    return { enum: values };
  }

  // A nullable enum accepts `null` as an explicit value, not only an absent key.
  return { type: ['string', 'null'], enum: [...values, null] };
}

/**
 * JSON Schema type of the scalar of a column.
 *
 * @param field field of the DMMF datamodel
 * @returns the JSON Schema type
 */
function scalarTypeOf(field: DMMF.Field): string {
  const type = SCALAR_TYPES.get(field.type);

  if (type === undefined) {
    fail(
      `the scalar "${field.type}" has no JSON Schema counterpart; ` +
        'add it to SCALAR_TYPES of the generator',
    );
  }

  return type;
}

/** Whether a rule accepts `null`: a nullable type, a `null` alternative or a `null` enum value. */
function acceptsNull(rule: unknown): boolean {
  if (!isMapping(rule)) {
    return false;
  }

  const type = rule.type;

  if (Array.isArray(type)) {
    return type.includes('null');
  }

  if (type === 'null') {
    return true;
  }

  const values = rule.enum;

  if (Array.isArray(values) && values.includes(null)) {
    return true;
  }

  const alternatives = rule.anyOf;

  return Array.isArray(alternatives) && alternatives.some((branch) => acceptsNull(branch));
}
