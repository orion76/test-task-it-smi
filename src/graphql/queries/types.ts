import type { IEntity, IPagination } from '../../common/contracts/types';

/**
 * Contract of a top-level query: the behaviour a generated resolver relies on.
 *
 * The declarations are generated per entity; this is the behaviour behind them, implemented by
 * `EntityQueries` and consumed by nobody else.
 */
export interface IEntityQueries {
  /**
   * Returns the first row of the entity, or fails when the table is empty.
   * @param entity table to read
   * @throws NotFoundException when the table has no rows
   */
  findOne(entity: string): Promise<IEntity>;

  /**
   * Returns one page of the entity in the order the contract declares.
   * @param entity table to read
   * @param page how many rows to read and how many to skip
   * @throws BadRequestException when the page is outside the accepted range
   */
  findPage(entity: string, page: IPagination): Promise<IEntity[]>;
}
