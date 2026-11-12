/**
 * Collections read through a tie table, and the tie tables themselves.
 *
 * A tie table is a model that stores nothing of its own: its columns are the key, the discriminant and
 * the two identifiers its relations own (`ProfileSkill` ties `Profile` to `Skill`). A collection of
 * `Skill` has no column on the profile row, so it is published through such a table, and the contract
 * names the table instead of a column. Everything is derived from the datamodel: a new tie table needs
 * no change here.
 */
import type { DMMF } from '@prisma/generator-helper';

import { compare, delegateName } from '../shared/dmmf.mts';
import { SERVICE_COLUMNS } from './constants.mts';
import type { IThroughCollection } from './types.mts';

/**
 * Collections one model publishes through a tie table.
 *
 * @param model model whose collections are described
 * @param models models of the DMMF datamodel
 * @returns the collections, sorted by the entity they hold
 */
export function throughCollectionsOf(
  model: DMMF.Model,
  models: readonly DMMF.Model[],
): IThroughCollection[] {
  const collections: IThroughCollection[] = [];

  for (const candidate of models) {
    const relations = tieRelationsOf(candidate);

    if (relations === null) {
      continue;
    }

    for (const parent of relations) {
      if (parent.type !== model.name) {
        continue;
      }

      const target = relations.find((relation) => relation !== parent);

      if (target === undefined) {
        continue;
      }

      collections.push({
        entity: delegateName(target.type),
        link: { model: candidate.name, parent: columnOf(parent), target: columnOf(target) },
      });
    }
  }

  return collections.sort((left, right) => compare(left.entity, right.entity));
}

/**
 * Names of the tie tables of the datamodel: their rows are read through the collections that point at
 * them, so the tables themselves are not entities of the API.
 *
 * @param models models of the DMMF datamodel
 * @returns the model names of the tie tables
 */
export function linkModelsOf(models: readonly DMMF.Model[]): ReadonlySet<string> {
  return new Set(
    models.filter((model) => tieRelationsOf(model) !== null).map((model) => model.name),
  );
}

/**
 * The two relations of a tie table, or `null` when the model is not one.
 *
 * @param model model to check
 * @returns the relations, parent first in schema order
 */
function tieRelationsOf(model: DMMF.Model): readonly [DMMF.Field, DMMF.Field] | null {
  const relations = model.fields.filter((field) => field.kind === 'object');
  const tied =
    relations.length === 2 &&
    relations.every((field) => !field.isList && (field.relationFromFields?.length ?? 0) === 1);

  if (!tied) {
    return null;
  }

  const columns = new Set(relations.flatMap((field) => field.relationFromFields ?? []));
  const own = model.fields.filter(
    (field) => field.kind !== 'object' && !SERVICE_COLUMNS.has(field.name),
  );

  if (own.some((field) => !columns.has(field.name))) {
    return null;
  }

  const [first, second] = relations;

  return [first, second];
}

/** Column that holds the identifier of the related row of a single-valued relation. */
function columnOf(field: DMMF.Field): string {
  const [column] = field.relationFromFields ?? [];

  return String(column);
}
