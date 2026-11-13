import { Inject, Injectable, Scope } from '@nestjs/common';
import DataLoader from 'dataloader';

import { referenceOf } from '../../common/config/api-fields';
import { columnOf, isThroughReference } from '../../common/contracts/entity';
import { ENTITY_QUERY_PORT } from '../../common/contracts/entity-query.port';
import type { IEntity, IEntityQueryPort } from '../../common/contracts/types';
import {
  cacheKey,
  groupIds,
  groupKey,
  groupReferences,
  groupRowsByLink,
  groupRowsByParent,
  groupThroughIds,
  throughCacheKey,
  throughGroupKey,
} from './grouping';
import type { IBatchKey, IEntityLoader, IThroughBatchKey, IThroughGroup } from './types';

/**
 * Request-scoped loaders of the nested fields: they turn the requests of one tick into one query per
 * table and cache the rows for the single request that asked for them.
 *
 * `Scope.REQUEST` is not optional: a singleton cache would serve stale rows across requests.
 */
@Injectable({ scope: Scope.REQUEST })
export class EntityLoader implements IEntityLoader {
  private readonly collections: DataLoader<IBatchKey, IEntity[], string>;

  private readonly throughCollections: DataLoader<IThroughBatchKey, IEntity[], string>;

  private readonly references: DataLoader<IBatchKey, IEntity | null, string>;

  constructor(@Inject(ENTITY_QUERY_PORT) private readonly query: IEntityQueryPort) {
    // Requests are plain objects, so the default identity cache would never hit. The key is what
    // makes two requests the same read: the table and the id inside it.
    this.collections = new DataLoader<IBatchKey, IEntity[], string>(
      (requests) => this.readCollections(requests),
      { cacheKeyFn: cacheKey },
    );

    this.throughCollections = new DataLoader<IThroughBatchKey, IEntity[], string>(
      (requests) => this.readThroughCollections(requests),
      { cacheKeyFn: throughCacheKey },
    );

    this.references = new DataLoader<IBatchKey, IEntity | null, string>(
      (requests) => this.readReferences(requests),
      { cacheKeyFn: cacheKey },
    );
  }

  /**
   * Loads one nested collection of one row; requests of the same tick share one query.
   *
   * A collection read through a tie table is answered by two batched reads — the ties of every parent
   * and the rows they name — instead of one query per parent.
   *
   * @param parent row whose collection is read
   * @param field name of the relation field, e.g. `links`
   * @throws Error naming the config file when the field is not declared as a reference
   */
  load(parent: IEntity, field: string): Promise<IEntity[]> {
    const reference = referenceOf(parent.type, field);

    if (isThroughReference(reference)) {
      return this.throughCollections.load({
        entity: reference.entity,
        through: reference.through,
        ids: [parent.id],
      });
    }

    return this.collections.load({ ...reference, ids: [parent.id] });
  }

  /**
   * Loads the single row a field points at; requests of the same tick share one query.
   *
   * The identifier is read from the column the config declares (`profileId`), so the resolver does
   * not know the foreign key and a missing value needs no query at all.
   *
   * @param row row that holds the reference
   * @param field name of the relation field, e.g. `profile`
   * @throws Error naming the config file when the field is not declared as a reference, or when the
   *   reference is a collection read through a tie table
   */
  loadOne(row: IEntity, field: string): Promise<IEntity | null> {
    const reference = referenceOf(row.type, field);

    if (isThroughReference(reference)) {
      throw new Error(
        `${row.type}.${field}: the reference is read through a tie table, so it is a collection`,
      );
    }

    const id = columnOf(row, reference.property);

    if (typeof id !== 'string') {
      return Promise.resolve(null);
    }

    return this.references.load({ ...reference, ids: [id] });
  }

  /**
   * Batch function of the collections: reads every wanted collection and groups the rows by parent.
   *
   * One query per entity is issued, no matter how many parents and fields the tick contains. A
   * parent without children stays absent from the grouping, which is turned into an empty list — the
   * loader has to answer one entry per key, and `undefined` would make DataLoader reject the batch.
   */
  private async readCollections(requests: readonly IBatchKey[]): Promise<IEntity[][]> {
    const groups = groupIds(requests);
    const rowsByGroup = new Map<string, Map<string, IEntity[]>>();

    // One query per entity. The collections are independent of each other, so they are read in
    // parallel: a serial loop would multiply the latency of a nested selection by their number.
    await Promise.all(
      [...groups].map(async ([key, { entity, ids, property }]) => {
        const rows = await this.query.find(entity, { parentIds: ids, parentProperty: property });

        rowsByGroup.set(key, groupRowsByParent(rows, property));
      }),
    );

    return requests.map(
      (request) => rowsByGroup.get(groupKey(request))?.get(request.ids[0]) ?? [],
    );
  }

  /**
   * Batch function of the through collections: one read of the ties and one of the rows they name,
   * per table and tick.
   */
  private async readThroughCollections(
    requests: readonly IThroughBatchKey[],
  ): Promise<IEntity[][]> {
    const groups = groupThroughIds(requests);
    const rowsByGroup = new Map<string, Map<string, IEntity[]>>();

    await Promise.all(
      [...groups].map(async ([key, group]) => {
        rowsByGroup.set(key, await this.readThroughGroup(group));
      }),
    );

    return requests.map(
      (request) => rowsByGroup.get(throughGroupKey(request))?.get(request.ids[0]) ?? [],
    );
  }

  /**
   * Ties of the parents, then the rows the ties name: two queries for the whole group, one when the
   * ties name no target at all.
   *
   * The rows of the collection are read by the order of the contract, so the subsequence of one parent
   * is already sorted and the grouping keeps it as is.
   */
  private async readThroughGroup(group: IThroughGroup): Promise<Map<string, IEntity[]>> {
    const links = await this.query.find(group.through.entity, {
      parentIds: group.ids,
      parentProperty: group.through.parent,
    });
    const targetIds = [
      ...new Set(
        links
          .map((link) => columnOf(link, group.through.target))
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];

    // A second read without identifiers would ask the database for nothing; the grouping is empty
    // either way, and DataLoader turns a missing parent into an empty list.
    if (targetIds.length === 0) {
      return new Map<string, IEntity[]>();
    }

    const rows = await this.query.find(group.entity, { ids: targetIds });

    return groupRowsByLink(rows, links, group.through);
  }

  /**
   * Batch function of the single references: reads every wanted row and returns it by id.
   *
   * One query per entity, as for collections. A row the database does not have is answered with
   * `null`: the reference is nullable in the schema, and DataLoader would reject a batch that mixes
   * a value with `undefined`.
   */
  private async readReferences(requests: readonly IBatchKey[]): Promise<(IEntity | null)[]> {
    const idsByEntity = groupReferences(requests);
    const rowsById = new Map<string, Map<string, IEntity>>();

    await Promise.all(
      [...idsByEntity].map(async ([entity, ids]) => {
        const rows = await this.query.find(entity, { ids });

        rowsById.set(entity, new Map(rows.map((row) => [row.id, row])));
      }),
    );

    return requests.map((request) => rowsById.get(request.entity)?.get(request.ids[0]) ?? null);
  }
}
