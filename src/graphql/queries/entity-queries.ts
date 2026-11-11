import { Inject, NotFoundException } from '@nestjs/common';

import { ENTITY_QUERY_PORT } from '../../common/contracts/entity-query.port';
import type { IEntity, IEntityQueryPort, IPagination } from '../../common/contracts/types';
import { assertPagination } from './pagination.check';
import type { IEntityQueries } from './types';

/**
 * Base class of the generated top-level queries: the behaviour every generated resolver inherits,
 * written once instead of being copied into each query.
 *
 * A single-row query fails with `NotFoundException` on an empty table, and a list query rejects a
 * page outside the accepted range before the database sees it.
 */
export abstract class EntityQueries implements IEntityQueries {
  constructor(@Inject(ENTITY_QUERY_PORT) protected readonly query: IEntityQueryPort) {}

  /**
   * Returns the first row of the entity, or fails when the table is empty.
   *
   * "The first row of the first page" and not a separate read path: the ordering is the one the list
   * uses, so both queries always agree on which row is "the" row.
   *
   * @param entity table to read
   * @throws NotFoundException when the table has no rows
   */
  async findOne(entity: string): Promise<IEntity> {
    const [row] = await this.query.find(entity, { page: { limit: 1, offset: 0 } });

    if (row === undefined) {
      throw new NotFoundException(
        `No ${entity} records: the database is empty. Run the seed to fill the content.`,
      );
    }

    return row;
  }

  /**
   * Returns one page of the entity in the order the contract declares.
   * @param entity table to read
   * @param page how many rows to read and how many to skip
   * @throws BadRequestException when the page is outside the accepted range
   */
  findPage(entity: string, page: IPagination): Promise<IEntity[]> {
    assertPagination(page);

    return this.query.find(entity, { page });
  }
}
