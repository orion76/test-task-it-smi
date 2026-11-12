/**
 * Checks of the seed-schema config: unknown keys, `null` instead of a fragment, an empty `omit`
 * entry. Referential checks (models and fields) need the datamodel and live next to the blocks they
 * validate. A silently lost restriction is worse than a crash, so every check fails the generation.
 */
import type { DMMF } from '@prisma/generator-helper';

import { delegateName } from '../shared/dmmf.mts';
import { isMapping } from '../shared/mapping.mts';
import {
  CONFIG_KEYS,
  DICTIONARY_KEYS,
  DICTIONARY_LINK_KEYS,
  FRAGMENT_KEYWORDS,
  ROOT_KEYS,
} from './constants.mts';
import config from './seed-schema.config.mts';
import { failConfig } from './shared/errors.mts';
import { location } from './shared/location.mts';
import type { TSchemaFragment } from './types.mts';

/** Checks the structure of the config. */
export function assertConfig(): void {
  for (const key of Object.keys(config)) {
    if (!CONFIG_KEYS.has(key)) {
      failConfig(`unknown key "${key}"; expected one of: ${[...CONFIG_KEYS].join(', ')}`);
    }
  }

  if (typeof config.output !== 'string' || config.output.length === 0) {
    failConfig('output: expected the path of the artifact, e.g. "config/profile-data.schema.yml"');
  }

  assertMapping('root', config.root);

  for (const key of Object.keys(config.root)) {
    if (!ROOT_KEYS.has(key)) {
      failConfig(`root: unknown key "${key}"; expected one of: ${[...ROOT_KEYS].join(', ')}`);
    }
  }

  assertMapping('root.version', config.root.version);
  assertMapping('root.properties', config.root.properties);

  for (const [property, defKey] of Object.entries(config.root.properties)) {
    if (typeof defKey !== 'string' || defKey.length === 0) {
      failConfig(`root.properties.${property}: expected the "$defs" key of a model`);
    }
  }

  assertOmit();

  assertMapping('definitions', config.definitions);

  for (const [name, fragment] of Object.entries(config.definitions)) {
    assertFragment(`definitions.${name}`, fragment);
  }

  assertMapping('overrides', config.overrides);

  assertDictionaries();
}

/** Checks the `dictionaries` block: model names, each with a key, a property and a tie table. */
function assertDictionaries(): void {
  if (!isMapping(config.dictionaries)) {
    failConfig('dictionaries: expected a mapping of model names to their key and tie table');
  }

  for (const [modelName, entry] of Object.entries(config.dictionaries)) {
    const place = `dictionaries.${modelName}`;

    assertKnownKeys(place, entry, DICTIONARY_KEYS);

    if (typeof entry.key !== 'string' || entry.key.length === 0) {
      failConfig(`${place}.key: expected the column that identifies a row of the dictionary`);
    }

    if (typeof entry.property !== 'string' || entry.property.length === 0) {
      failConfig(`${place}.property: expected the property of the parent that nests the dictionary`);
    }

    assertKnownKeys(`${place}.link`, entry.link, DICTIONARY_LINK_KEYS);

    for (const [key, value] of Object.entries(entry.link)) {
      if (typeof value !== 'string' || value.length === 0) {
        failConfig(`${place}.link.${key}: expected a name of the datamodel`);
      }
    }
  }
}

/**
 * Checks that a block of the config holds only the keys the generator reads.
 *
 * @param place path of the block in the config, for the message
 * @param block block to check
 * @param known keys the generator reads
 */
function assertKnownKeys(place: string, block: object, known: ReadonlySet<string>): void {
  for (const key of Object.keys(block)) {
    if (!known.has(key)) {
      failConfig(`${place}: unknown key "${key}"; expected one of: ${[...known].join(', ')}`);
    }
  }
}

/** Checks the `omit` block: an array of unique column names. */
function assertOmit(): void {
  if (!Array.isArray(config.omit)) {
    failConfig('omit: expected an array of column names');
  }

  const seen = new Set<string>();

  for (const name of config.omit) {
    if (typeof name !== 'string' || name.length === 0) {
      failConfig('omit: every entry must be a non-empty column name');
    }

    if (seen.has(name)) {
      failConfig(`omit: the field "${name}" is listed twice`);
    }

    seen.add(name);
  }
}

/**
 * Checks that a value is a mapping: `null`, an array and a scalar cannot hold a schema fragment.
 *
 * @param name path of the value in the config, for the message
 * @param value value to check
 */
function assertMapping(name: string, value: unknown): asserts value is TSchemaFragment {
  if (!isMapping(value)) {
    failConfig(`${name}: expected a mapping, got ${describeValue(value)}`);
  }
}

/**
 * Checks a schema fragment: it is a mapping, it is not empty and its keys are known JSON Schema
 * keywords.
 *
 * @param name path of the fragment in the config, for the message
 * @param fragment fragment to check
 */
export function assertFragment(
  name: string,
  fragment: unknown,
): asserts fragment is TSchemaFragment {
  assertMapping(name, fragment);

  const keys = Object.keys(fragment);

  if (keys.length === 0) {
    failConfig(`${name}: an empty fragment adds nothing, remove it`);
  }

  for (const key of keys) {
    if (!FRAGMENT_KEYWORDS.has(key)) {
      failConfig(`${name}: unknown JSON Schema keyword "${key}"`);
    }
  }
}

/** Names a value the way the config check sees it: `null`, `an array` or the type. */
function describeValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  return Array.isArray(value) ? 'an array' : typeof value;
}

/**
 * Rejects a field rule that would never reach the schema: a relation is not part of the import file,
 * and an omitted column is removed from every model.
 *
 * @param model model the field belongs to
 * @param field field of the DMMF datamodel
 * @param omitted columns the import file does not contain
 */
export function assertOverridable(
  model: DMMF.Model,
  field: DMMF.Field,
  omitted: ReadonlySet<string>,
): void {
  const key = `overrides."${location(model, field)}"`;

  if (field.kind === 'object') {
    failConfig(`${key}: a relation is not part of the import file, the row is nested under its parent`);
  }

  if (omitted.has(field.name)) {
    failConfig(`${key}: the column is omitted from the import file by "omit"`);
  }
}

/**
 * Checks that every omitted column exists somewhere in the datamodel: `omit` is a list of column
 * names applied to every model, so a name no model declares is a typo, not an empty rule.
 *
 * @param models models of the DMMF datamodel
 * @param omitted columns the import file does not contain
 */
export function assertOmittedFields(
  models: readonly DMMF.Model[],
  omitted: ReadonlySet<string>,
): void {
  const declared = new Set(models.flatMap((model) => model.fields.map((field) => field.name)));

  for (const name of omitted) {
    if (!declared.has(name)) {
      failConfig(`omit: no model of the datamodel declares the field "${name}"`);
    }
  }
}

/**
 * Checks that a shared fragment does not take the definition key of a model.
 *
 * @param models models of the DMMF datamodel
 */
export function assertDefinitionNames(models: readonly DMMF.Model[]): void {
  for (const name of Object.keys(config.definitions)) {
    const model = models.find((candidate) => delegateName(candidate.name) === name);

    if (model !== undefined) {
      failConfig(`definitions.${name}: the name is taken by the model "${model.name}"`);
    }
  }
}
