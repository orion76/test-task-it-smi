/**
 * Batch grouping of the loaders: which requests of one tick share a query, and how the rows are put
 * back together.
 *
 * DataLoader promises one entry per requested key, so a flat list of requests cannot be handed to
 * the port: it is split into groups first, and the rows are spread over the keys again.
 */
import { columnOf } from '../../common/contracts/entity';
import type { IEntity } from '../../common/contracts/types';
import type { IBatchGroup, IBatchKey } from './types';

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
