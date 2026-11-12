/**
 * Derivation of the `dictionaries` block against the datamodel.
 *
 * A dictionary is a model whose rows are shared between parents: the import file nests the values
 * under the parent, and the engine writes one row per key value plus one row of the tie table per
 * parent. The config names the model, its key and the tie table; every name is checked here, so a typo
 * fails the generation instead of producing a file the engine cannot write.
 */
import type { DMMF } from '@prisma/generator-helper';

import { compare } from '../shared/dmmf.mts';
import config from './seed-schema.config.mts';
import { failConfig } from './shared/errors.mts';
import type { IDictionaryEntry, IDictionaryLink, IDictionarySpec } from './types.mts';

/**
 * Dictionaries of the config, resolved against the datamodel.
 *
 * @param models models of the DMMF datamodel
 * @returns the dictionaries in model-name order
 */
export function dictionarySpecs(models: readonly DMMF.Model[]): IDictionarySpec[] {
  const specs = Object.entries(config.dictionaries).map(([modelName, entry]) =>
    dictionaryOf(modelName, entry, models),
  );

  return specs.sort((left, right) => compare(left.model, right.model));
}

/**
 * Names of the tie tables: the engine writes them from the nesting, so they are not models of the
 * import file and their inverse collections are not properties of it.
 *
 * @param specs dictionaries of the config
 * @returns the model names of the tie tables
 */
export function linkModelNames(specs: readonly IDictionarySpec[]): ReadonlySet<string> {
  return new Set(specs.map((spec) => spec.link.model));
}

/**
 * One dictionary of the config, checked against the datamodel.
 *
 * @param modelName key of the `dictionaries` block, i.e. the model name
 * @param entry `dictionaries` entry of the config
 * @param models models of the DMMF datamodel
 * @returns the dictionary with the names the datamodel declares
 */
function dictionaryOf(
  modelName: string,
  entry: IDictionaryEntry,
  models: readonly DMMF.Model[],
): IDictionarySpec {
  const model = models.find((candidate) => candidate.name === modelName);

  if (model === undefined) {
    failConfig(`dictionaries.${modelName}: the datamodel has no model "${modelName}"`);
  }

  assertKey(model, entry.key);

  return { model: modelName, key: entry.key, link: linkOf(model, entry.link, models) };
}

/**
 * Checks that the key of a dictionary is a value column: a relation is not part of the import file.
 *
 * @param model dictionary model
 * @param key column the file names a row by
 */
function assertKey(model: DMMF.Model, key: string): void {
  const field = model.fields.find((candidate) => candidate.name === key);

  if (field === undefined) {
    failConfig(`dictionaries.${model.name}.key: the model "${model.name}" has no field "${key}"`);
  }

  if (field.kind === 'object') {
    failConfig(`dictionaries.${model.name}.key: "${key}" is a relation, the key is a value column`);
  }
}

/**
 * Tie table of one dictionary, with the inverse collections both sides have to declare.
 *
 * @param dictionary dictionary model
 * @param entry `link` block of the config
 * @param models models of the DMMF datamodel
 * @returns the tie table with the columns the datamodel declares
 */
function linkOf(
  dictionary: DMMF.Model,
  entry: IDictionaryLink,
  models: readonly DMMF.Model[],
): IDictionaryLink {
  const link = models.find((candidate) => candidate.name === entry.model);

  if (link === undefined) {
    failConfig(
      `dictionaries.${dictionary.name}.link.model: the datamodel has no model "${entry.model}"`,
    );
  }

  const parent = relationOf(link, entry.parent, dictionary.name, 'parent');
  const target = relationOf(link, entry.target, dictionary.name, 'target');

  if (target.type !== dictionary.name) {
    failConfig(
      `dictionaries.${dictionary.name}.link.target: "${entry.target}" points at "${target.type}", ` +
        'not at the dictionary',
    );
  }

  assertListRelation(dictionary, link.name, `dictionaries.${dictionary.name}`);
  assertParentInverse(parent.type, dictionary.name, models, entry);

  return { model: link.name, parent: entry.parent, target: entry.target };
}

/**
 * Relation of the tie table that stores one of the two identifiers.
 *
 * @param link tie table
 * @param column column named by the config
 * @param dictionary dictionary the tie table belongs to, for the message
 * @param side `parent` or `target`, for the message
 * @returns the relation the column belongs to
 */
function relationOf(
  link: DMMF.Model,
  column: string,
  dictionary: string,
  side: string,
): DMMF.Field {
  const field = link.fields.find(
    (candidate) => candidate.kind === 'object' && (candidate.relationFromFields ?? []).includes(column),
  );

  if (field === undefined) {
    failConfig(
      `dictionaries.${dictionary}.link.${side}: the model "${link.name}" has no relation ` +
        `through the column "${column}"`,
    );
  }

  return field;
}

/**
 * Checks that a model declares the inverse collection of the tie table: without it the tie is not
 * reachable from that side, and Prisma would not accept the relation at all.
 *
 * @param model model that has to declare the collection
 * @param link name of the tie table
 * @param place path of the config entry, for the message
 */
function assertListRelation(model: DMMF.Model, link: string, place: string): void {
  const relation = model.fields.find(
    (field) => field.kind === 'object' && field.isList && field.type === link,
  );

  if (relation === undefined) {
    failConfig(`${place}: the model "${model.name}" has no list relation to "${link}"`);
  }
}

/**
 * Checks that the model the parent column points at declares the inverse of the tie table: the file
 * nests the values under that model, and Prisma needs the relation from both sides.
 *
 * @param parentName model the parent column points at
 * @param dictionary name of the dictionary model, for the message
 * @param models models of the DMMF datamodel
 * @param entry `link` block of the config, for the message
 */
function assertParentInverse(
  parentName: string,
  dictionary: string,
  models: readonly DMMF.Model[],
  entry: IDictionaryLink,
): void {
  const parent = models.find((candidate) => candidate.name === parentName);
  const place = `dictionaries.${dictionary}.link.parent`;

  if (parent === undefined) {
    failConfig(`${place}: the datamodel has no model "${parentName}"`);
  }

  const inverse = parent.fields.find(
    (field) => field.kind === 'object' && field.isList && field.type === entry.model,
  );

  if (inverse === undefined) {
    failConfig(
      `${place}: "${entry.parent}" points at "${parentName}", which has no list relation to ` +
        `"${entry.model}" — the tie table has no inverse side`,
    );
  }
}
