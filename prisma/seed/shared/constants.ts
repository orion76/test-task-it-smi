/**
 * Constants of the seed engine shared by its modules.
 */

/** Content file of the image: the single input that describes the data. */
export const DATA_FILE = 'data/profile.yml';

/** JSON Schema the content file is validated against. */
export const SCHEMA_FILE = 'config/profile-data.schema.yml';

/**
 * Dictionaries of the content file and their tie tables, written by the `seedSchema` generator: the
 * writer inserts one row per dictionary value and one tie row per parent.
 */
export const DICTIONARIES_FILE = 'config/dictionaries.yml';

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
