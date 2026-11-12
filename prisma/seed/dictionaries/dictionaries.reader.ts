import { loadConfig } from 'yaml-loader';

import { toDisplayPath } from '../shared/path';
import { isRecord } from '../shared/record';
import { SeedError } from '../shared/seed.error';
import type { IDictionarySpec } from './types';

/**
 * Reads `config/dictionaries.yml`: the dictionaries of the import file, written by the `seedSchema`
 * generator from the datamodel. The shape is checked here, because the writer addresses a tie table
 * by these names and a broken artifact would write into a table the client does not have.
 *
 * @param filePath path of the artifact, relative to the project root
 * @returns the dictionaries in the order of the artifact
 * @throws SeedError naming the file and the entry that is wrong
 */
export function readDictionaries(filePath: string): IDictionarySpec[] {
  const displayPath = toDisplayPath(filePath);
  const document = loadConfig<unknown>(filePath, { searchFrom: __dirname });
  const block = isRecord(document) ? document.dictionaries : undefined;

  if (!isRecord(block)) {
    throw new SeedError(
      `${displayPath}: "dictionaries" is required and must be a mapping of model names`,
    );
  }

  return Object.entries(block).map(([model, entry]) => dictionaryOf(displayPath, model, entry));
}

/**
 * One dictionary of the artifact, checked against the names the writer reads.
 *
 * @param displayPath path of the artifact, for the message
 * @param model key of the `dictionaries` block, i.e. the model name
 * @param entry value of the entry as the YAML parser returned it
 * @returns the dictionary
 */
function dictionaryOf(displayPath: string, model: string, entry: unknown): IDictionarySpec {
  const place = `dictionaries.${model}`;

  if (!isRecord(entry)) {
    throw new SeedError(`${displayPath}: ${place} must be a mapping`);
  }

  if (!isRecord(entry.link)) {
    throw new SeedError(`${displayPath}: ${place}.link must be a mapping`);
  }

  return {
    model,
    key: nameOf(displayPath, `${place}.key`, entry.key),
    link: {
      model: nameOf(displayPath, `${place}.link.model`, entry.link.model),
      parent: nameOf(displayPath, `${place}.link.parent`, entry.link.parent),
      target: nameOf(displayPath, `${place}.link.target`, entry.link.target),
    },
  };
}

/**
 * Name the artifact declares: a column or a model of the datamodel.
 *
 * @param displayPath path of the artifact, for the message
 * @param place path of the value inside the artifact
 * @param value value as the YAML parser returned it
 * @returns the name
 */
function nameOf(displayPath: string, place: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SeedError(`${displayPath}: ${place} must be a name`);
  }

  return value;
}
