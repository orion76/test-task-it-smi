import type { ErrorObject } from 'ajv';
import { loadConfig } from 'yaml-loader';

import { API_FIELDS_CONFIG_PATH, API_FIELDS_SCHEMA_PATH } from '../../common/config/config-paths';

/**
 * Validates `api-fields.yml` against the schema generated from `schema.prisma`: the schema enumerates
 * the models, their fields and the entities the queries may read, so a typo or a missing relation
 * fails the build instead of quietly dropping a field from the API.
 *
 * @throws Error naming the file, the path inside it and the AJV message
 */
export function validateApiFields(): void {
  loadConfig<unknown>(API_FIELDS_CONFIG_PATH, {
    searchFrom: __dirname,
    schemaPath: API_FIELDS_SCHEMA_PATH,
    validate: true,
    describeErrors,
  });
}

/**
 * Joins the violations into one message, one per line: `Profile.fields.nmae: must NOT have
 * additional properties`.
 *
 * The formatter stays short on purpose: expanding `anyOf`/`oneOf` branches would multiply the code
 * without adding a fact the config author needs. `loadConfig` adds the `file:` prefix itself.
 */
function describeErrors(errors: ErrorObject[], _file: string): string {
  return [...new Set(errors.map(describeError))].join('\n  ');
}

/** Turns an AJV error into `<path>: <message>`, where the path reads like the config itself. */
function describeError(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>;
  const segments = error.instancePath.split('/').filter((segment) => segment.length > 0);

  // `additionalProperties` and `required` point at the parent object: the offending key is a param.
  for (const key of [params.additionalProperty, params.missingProperty]) {
    if (typeof key === 'string') {
      segments.push(key);
    }
  }

  return `${segments.join('.') || '(root)'}: ${error.message ?? 'is invalid'}`;
}
