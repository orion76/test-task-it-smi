/**
 * Constants of the seed engine shared by its modules.
 */

/** Content file of the image: the single input that describes the data. */
export const DATA_FILE = 'data/profile.yml';

/** JSON Schema the content file is validated against. */
export const SCHEMA_FILE = 'config/profile-data.schema.yml';

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
