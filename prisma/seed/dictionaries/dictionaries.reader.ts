import type { ErrorObject } from 'ajv';
import { loadConfig } from 'yaml-loader';

import { DICTIONARIES_SCHEMA_FILE } from '../shared/constants';
import { errorSegments, formatPath } from '../shared/path';
import type { IDictionariesDocument, IDictionarySpec } from './types';

/**
 * Reads `src/generated/config/dictionaries.yml`: the dictionaries of the import file, written by the
 * `seedSchema` generator from the datamodel. The file is validated against the schema of the artifact,
 * so a broken or stale document names the path inside it instead of failing on a guess.
 *
 * @param filePath path of the artifact, relative to the project root
 * @returns the dictionaries in the order of the artifact
 * @throws Error naming the file and the path inside it that does not match the schema
 */
export function readDictionaries(filePath: string): IDictionarySpec[] {
  const document = loadConfig<IDictionariesDocument>(filePath, {
    searchFrom: __dirname,
    schemaPath: DICTIONARIES_SCHEMA_FILE,
    validate: true,
    describeErrors,
  });

  return Object.entries(document.dictionaries).map(([model, entry]) => ({
    model,
    key: entry.key,
    link: entry.link,
  }));
}

/**
 * Joins the violations into one message, one per line, with the path inside the artifact:
 * `dictionaries.Skill.link.target: must have required property 'target'`. The formatter stays short
 * on purpose: expanding `anyOf`/`oneOf` branches would multiply the text without adding a fact the
 * artifact author needs. `loadConfig` adds the file name itself.
 */
function describeErrors(errors: ErrorObject[], _file: string): string {
  return [...new Set(errors.map(describeViolation))].join('\n  ');
}

/** One violation as `<path>: <message>`; the document itself is reported as `root`. */
function describeViolation(error: ErrorObject): string {
  return `${formatPath(errorSegments(error))}: ${error.message ?? 'is invalid'}`;
}
