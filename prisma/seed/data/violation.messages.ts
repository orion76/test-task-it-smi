/**
 * Wording of the AJV violations of the data file: the reason read from the keyword the schema failed
 * on. Nothing here knows a specific property of the domain; the path of the field comes from
 * `shared/path`, and the file itself is named by the caller (`prisma/seed/main.ts`).
 */
import type { ErrorObject } from 'ajv';

import { alternativesOf, isJsonSchema, resolvePointer } from '../schema/json-schema';
import type { IJsonSchema } from '../schema/types';
import { joinTypeNames, typeName } from '../shared/ajv-type-names';
import { MAX_DESCRIPTION_DEPTH } from './constants';

/**
 * Keeps the report readable: the sub-errors of a union describe alternatives that are not required
 * to match, so a field reports the union error itself instead of one line per rejected branch.
 */
export function selectErrors(errors: ErrorObject[]): ErrorObject[] {
  const reported = new Set(
    errors
      .filter((error) => error.keyword === 'anyOf' || error.keyword === 'oneOf')
      .map((error) => error.instancePath),
  );

  return errors.filter(
    (error) =>
      error.keyword === 'anyOf' || error.keyword === 'oneOf' || !reported.has(error.instancePath),
  );
}

/** Turns an AJV error into the reason part of the message. */
export function describeError(
  error: ErrorObject,
  errors: ErrorObject[],
  root: IJsonSchema,
): string {
  const params = error.params as Record<string, unknown>;

  switch (error.keyword) {
    case 'required':
      return `missing required property "${String(params.missingProperty)}"`;
    case 'additionalProperties':
      return `unexpected property "${String(params.additionalProperty)}"`;
    case 'type':
      return describeType(params);
    case 'const':
      return `must be equal to ${JSON.stringify(params.allowedValue)}`;
    case 'enum':
      return `must be one of: ${(params.allowedValues as unknown[]).join(', ')}`;
    case 'minLength':
      return 'must not be empty';
    case 'pattern':
      return `must match the pattern ${String(params.pattern)}`;
    case 'format':
      return `must match the "${String(params.format)}" format`;
    case 'formatMinimum':
      return `must not be earlier than ${String(params.limit)}`;
    case 'formatMaximum':
      return `must not be later than ${String(params.limit)}`;
    case 'anyOf':
    case 'oneOf':
      return describeUnion(error, errors, root);
    default:
      return error.message ?? 'is invalid';
  }
}

/**
 * Builds the reason of a `type` violation. The keyword parameter is a plain string for a single
 * type and an array for a union (`["string", "null"]` in the schema), so the union is spelled out
 * as `must be a string or null` instead of the raw `must be string,null`.
 */
function describeType(params: Record<string, unknown>): string {
  const types = Array.isArray(params.type) ? params.type : [params.type];
  const names = types.map((type) => typeName(String(type)));

  return `must be ${joinTypeNames(names)}`;
}

/**
 * Names the alternatives of a union from the schema itself, read from `error.parentSchema` that AJV
 * attaches because the instance compiles with `verbose`: the default message says nothing about them.
 * A comparison violation is reported with its limit instead, because "expected a date" would hide the
 * actual problem of a value that already is a date.
 */
function describeUnion(error: ErrorObject, errors: ErrorObject[], root: IJsonSchema): string {
  const siblings = errors.filter((candidate) => candidate.instancePath === error.instancePath);
  const boundary = siblings.find(
    (candidate) =>
      candidate.keyword === 'formatMinimum' || candidate.keyword === 'formatMaximum',
  );

  if (boundary !== undefined) {
    return describeError(boundary, errors, root);
  }

  const alternatives = isJsonSchema(error.parentSchema)
    ? alternativesOf(error.parentSchema).map((alternative) =>
        describeAlternative(alternative, root, 0),
      )
    : [];

  if (alternatives.length === 0) {
    return 'must match one of the alternatives of the schema';
  }

  return `must match one of: ${alternatives.join(' or ')}`;
}

/** Renders one alternative of a union as a noun phrase, following local references. */
function describeAlternative(candidate: IJsonSchema, root: IJsonSchema, depth: number): string {
  const schema = resolveReference(candidate, root);

  if (depth > MAX_DESCRIPTION_DEPTH) {
    return 'a value';
  }

  if (schema.const !== undefined) {
    return JSON.stringify(schema.const);
  }

  if (Array.isArray(schema.enum)) {
    return schema.enum.map((value) => JSON.stringify(value)).join(', ');
  }

  const nested = alternativesOf(schema);

  if (nested.length > 0) {
    return nested
      .map((alternative) => describeAlternative(alternative, root, depth + 1))
      .join(' or ');
  }

  const parts = [schema.type === undefined ? 'a value' : describeType({ type: schema.type })];

  if (schema.format !== undefined) {
    parts.push(`in the "${schema.format}" format`);
  }

  if (schema.pattern !== undefined) {
    parts.push(`matching the pattern ${schema.pattern}`);
  }

  return parts.join(' ');
}

function resolveReference(candidate: IJsonSchema, root: IJsonSchema): IJsonSchema {
  const ref = candidate.$ref;

  if (ref === undefined) {
    return candidate;
  }

  return resolvePointer(root, ref) ?? candidate;
}
