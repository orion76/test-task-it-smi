/**
 * Renders `src/generated/config/dictionaries.schema.yml`: the JSON Schema of the dictionaries
 * artifact. The shape the seed reads is described here instead of being checked by hand, so a broken
 * or stale artifact is reported with the path inside the file. The schema is committed, like the
 * artifact it describes, and the parity test keeps both in step with the generator.
 */
import { stringify } from 'yaml';

import { DICTIONARIES_SCHEMA_HEADER, DICTIONARIES_VERSION } from './constants.mts';
import type { TSchemaFragment } from './types.mts';

/**
 * Renders the schema of the dictionaries artifact.
 *
 * The format version comes from `DICTIONARIES_VERSION`, the constant the artifact itself is written
 * from, so the value the generator stores and the value the schema accepts cannot drift apart.
 *
 * @returns the content of `src/generated/config/dictionaries.schema.yml`
 */
export function renderDictionariesSchema(): string {
  const document: TSchemaFragment = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://it-smi.local/schema/dictionaries.schema.yml',
    title: 'Dictionaries',
    description:
      'Format of src/generated/config/dictionaries.yml: the dictionaries of the import file and ' +
      'the tables that tie them to the parent that lists them. The schema describes the shape the ' +
      'seed relies on; whether the named models and columns exist is checked by the generator ' +
      'against the datamodel.',
    type: 'object',
    additionalProperties: false,
    required: ['version', 'dictionaries'],
    properties: {
      version: {
        type: 'integer',
        const: DICTIONARIES_VERSION,
        description: 'Format version, written from DICTIONARIES_VERSION of the generator.',
      },
      dictionaries: {
        type: 'object',
        additionalProperties: dictionarySchema(),
      },
    },
  };

  return `${DICTIONARIES_SCHEMA_HEADER}\n\n${stringify(document, { lineWidth: 0, singleQuote: true })}`;
}

/**
 * One entry of the `dictionaries` block: the key of a dictionary row and the table that ties it to
 * the parent. `property` is left out on purpose: it nests the collection in the import file and never
 * reaches the artifact.
 *
 * @returns the schema of one dictionary entry
 */
function dictionarySchema(): TSchemaFragment {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['key', 'link'],
    properties: {
      key: { type: 'string', minLength: 1 },
      link: linkSchema(),
    },
  };
}

/**
 * The `link` block: the tie table and the two columns it stores, every name a non-empty string.
 *
 * @returns the schema of the tie table of one dictionary
 */
function linkSchema(): TSchemaFragment {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['model', 'parent', 'target'],
    properties: {
      model: { type: 'string', minLength: 1 },
      parent: { type: 'string', minLength: 1 },
      target: { type: 'string', minLength: 1 },
    },
  };
}
