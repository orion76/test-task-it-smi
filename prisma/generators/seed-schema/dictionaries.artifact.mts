/**
 * Renders `src/generated/config/dictionaries.yml`: the `dictionaries` block of the config resolved
 * against the datamodel, in the shape the seed reads. The artifact is committed, like the schema of
 * the import file, so the seed never parses the generator config.
 */
import { stringify } from 'yaml';

import { DICTIONARIES_HEADER, DICTIONARIES_VERSION } from './constants.mts';
import type { IDictionaryEntry, IDictionarySpec } from './types.mts';

/**
 * Renders the artifact: the header and the dictionaries keyed by model name.
 *
 * @param specs dictionaries of the config, resolved against the datamodel
 * @returns the content of `src/generated/config/dictionaries.yml`
 */
export function renderDictionaries(specs: readonly IDictionarySpec[]): string {
  const dictionaries: Record<string, IDictionaryEntry> = {};

  for (const spec of specs) {
    dictionaries[spec.model] = { key: spec.key, link: spec.link };
  }

  const document = { version: DICTIONARIES_VERSION, dictionaries };

  return `${DICTIONARIES_HEADER}\n\n${stringify(document, { lineWidth: 0, singleQuote: true })}`;
}
