/**
 * Batch grouping of the loaders: which requests of one tick share a query, and how the rows are put
 * back together.
 *
 * DataLoader promises one entry per requested key, so a flat list of requests cannot be handed to
 * the port: it is split into groups first, and the rows are spread over the keys again.
 */
import { columnOf } from '../../common/contracts/entity';
import type { IEntity, IThroughLink } from '../../common/contracts/types';
import type { IBatchGroup, IBatchKey, IThroughBatchKey, IThroughGroup } from './types';

/**
 * Key of one batch group: the entity and the column it is read through.
 *
 * The column is part of the key because one entity may be read through different ones; a batch that
 * mixed them would have to filter by either column and lose rows.
 */
export function groupKey(request: IBatchKey): string {
  return `${request.entity}:${request.property}`;
}

/** Cache key of one batch request: the group and the single id it is read for. */
export function cacheKey(request: IBatchKey): string {
  return `${groupKey(request)}:${request.ids[0]}`;
}

/**
 * Key of one through group: the entity the collection holds and the tie table it is read through.
 * Two collections of one entity through two different tables are two groups.
 */
export function throughGroupKey(request: IThroughBatchKey): string {
  const { entity, parent, target } = request.through;

  return `${request.entity}:${entity}:${parent}:${target}`;
}

/** Cache key of one through request: the group and the single parent it is read for. */
export function throughCacheKey(request: IThroughBatchKey): string {
  return `${throughGroupKey(request)}:${request.ids[0]}`;
}

/**
 * Parent ids of the collections grouped by entity and column.
 *
 * DataLoader already dropped duplicate requests, so the ids of one group are unique here and the
 * `in (…)` clause carries no repeats. The column comes from the config with the request, so one
 * entity read through two different columns stays two batches.
 */
export function groupIds(requests: readonly IBatchKey[]): Map<string, IBatchGroup> {
  const grouped = groupBy(requests, groupKey);

  return new Map(
    [...grouped].map(([key, group]) => {
      const [{ entity, property }] = group;

      return [key, { entity, ids: group.map((request) => request.ids[0]), property }];
    }),
  );
}

/** Ids of the single references grouped by entity: one query per table. */
export function groupReferences(requests: readonly IBatchKey[]): Map<string, string[]> {
  const grouped = groupBy(requests, (request) => request.entity);

  return new Map(
    [...grouped].map(([entity, group]) => [entity, group.map((request) => request.ids[0])]),
  );
}

/**
 * Parent ids of the through collections grouped by the tables they are read through.
 *
 * One group is one tie table and one column of its parent, so the batch is a single `in (…)` on that
 * column, no matter how many parents and fields the tick contains.
 */
export function groupThroughIds(
  requests: readonly IThroughBatchKey[],
): Map<string, IThroughGroup> {
  const grouped = groupBy(requests, throughGroupKey);

  return new Map(
    [...grouped].map(([key, group]) => {
      const [{ entity, through }] = group;

      return [key, { entity, through, ids: group.map((request) => request.ids[0]) }];
    }),
  );
}

/**
 * Rows grouped by the parent they name, in the order the port returned them.
 *
 * A row that names no parent is dropped: only collection rows reach a nested field, so attaching it
 * to an arbitrary parent would hide a contract violation instead of reporting it.
 */
export function groupRowsByParent(
  rows: readonly IEntity[],
  property: string,
): Map<string, IEntity[]> {
  const parentRows = rows.filter((row) => typeof columnOf(row, property) === 'string');

  return groupBy(parentRows, (row) => String(columnOf(row, property)));
}

/**
 * Rows of a collection read through a tie table, grouped by the parent the tie names, in the order
 * they arrived. The tie rows carry the membership and the collection rows are read by the order of
 * the contract, so the subsequence of one parent is already sorted: nothing is sorted here and a
 * parent is never asked for its own query. A tie that names no parent or row is dropped.
 *
 * @param rows rows of the collection, in the order of the second query
 * @param links rows of the tie table
 * @param through the tie table and the columns that name the parent and the held row
 * @returns the rows of every parent
 */
export function groupRowsByLink(
  rows: readonly IEntity[],
  links: readonly IEntity[],
  through: IThroughLink,
): Map<string, IEntity[]> {
  const parentsByTarget = new Map<string, string[]>();

  for (const link of links) {
    const target = columnOf(link, through.target);
    const parent = columnOf(link, through.parent);

    if (typeof target !== 'string' || typeof parent !== 'string') {
      continue;
    }

    const parents = parentsByTarget.get(target);

    if (parents === undefined) {
      parentsByTarget.set(target, [parent]);
      continue;
    }

    parents.push(parent);
  }

  const grouped = new Map<string, IEntity[]>();

  for (const row of rows) {
    for (const parent of parentsByTarget.get(row.id) ?? []) {
      const group = grouped.get(parent);

      if (group === undefined) {
        grouped.set(parent, [row]);
        continue;
      }

      group.push(row);
    }
  }

  return grouped;
}

/**
 * Groups the items by a key of the item, keeping the order in which they arrived.
 *
 * The three groupings above differ only in what they take as a key and what they collect from the
 * group, so the loop itself is written once: a new grouping is a key function, not a fourth copy of
 * the same `get`/`set`/`push` sequence.
 */
function groupBy<TItem>(
  items: readonly TItem[],
  keyOf: (item: TItem) => string,
): Map<string, TItem[]> {
  const grouped = new Map<string, TItem[]>();

  for (const item of items) {
    const key = keyOf(item);
    const group = grouped.get(key);

    if (group === undefined) {
      grouped.set(key, [item]);
      continue;
    }

    group.push(item);
  }

  return grouped;
}
