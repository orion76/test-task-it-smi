/**
 * Constants of the seed engine shared by its modules.
 *
 * The format version of the dictionaries artifact is not declared here: the generator that writes the
 * artifact and its schema owns it (`prisma/generators/seed-schema/constants.mts`), and the reader
 * rejects another value through the schema instead of comparing a number of its own.
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

/**
 * JSON Schema of the dictionaries artifact: written by the same generator, so it lives in the
 * generated tree as well. The reader validates the artifact against it, and the path inside the file
 * comes from AJV instead of a hand-written check.
 */
export const DICTIONARIES_SCHEMA_FILE = 'src/generated/config/dictionaries.schema.yml';

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
