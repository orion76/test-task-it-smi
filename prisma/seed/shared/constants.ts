/**
 * Constants of the seed engine shared by its modules.
 */

/** Content file of the image: the single input that describes the data. */
export const DATA_FILE = 'data/profile.yml';

/**
 * JSON Schema the content file is validated against: an artifact of `prisma generate`, so it lives in
 * `src/generated/` with the rest of the generated tree instead of `config/`, which a human edits.
 */
export const SCHEMA_FILE = 'src/generated/config/profile-data.schema.yml';

/**
 * Dictionaries of the content file and their tie tables, written by the `seedSchema` generator: the
 * writer inserts one row per dictionary value and one tie row per parent. The artifact is read the
 * same way as the schema, from the generated tree rather than from `config/`.
 */
export const DICTIONARIES_FILE = 'src/generated/config/dictionaries.yml';

/** Format version the dictionaries artifact declares; any other value is a hard error. */
export const DICTIONARIES_VERSION = 1;

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
