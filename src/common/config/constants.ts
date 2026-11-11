/**
 * Constants of the configuration module: the AJV instance of the environment validator and the
 * names its violation messages use. The paths of the configuration files live in `config-paths.ts`.
 */
import Ajv from 'ajv';

/**
 * Own AJV instance, deliberately not shared with the `data/profile.yml` validator
 * (`prisma/seed/data/data.validator.ts`).
 *
 * `coerceTypes` and `useDefaults` are what `process.env` needs and would hide authoring mistakes in
 * the profile data, so each validator keeps its own instance and its own options.
 */
export const AJV = new Ajv({ allErrors: true, coerceTypes: true, useDefaults: true });

/** Human-readable names of JSON Schema types, used in the violation messages. */
export const TYPE_NAMES: Record<string, string> = {
  array: 'an array',
  boolean: 'a boolean',
  integer: 'an integer',
  null: 'null',
  number: 'a number',
  object: 'an object',
  string: 'a string',
};
