import type { IEntity, IThroughLink } from '../../common/contracts/types';

/**
 * Contract of the loader as a field resolver sees it: a nested field is answered by one of the two
 * methods, and nothing about the port, the config or the batching leaks into the resolver.
 */
export interface IEntityLoader {
  /**
   * Loads one nested collection of one row; requests of the same tick share one query.
   * @param parent row whose collection is read
   * @param field name of the relation field, e.g. `links`
   */
  load(parent: IEntity, field: string): Promise<IEntity[]>;

  /**
   * Loads the single row a field points at; requests of the same tick share one query.
   * @param row row that holds the reference
   * @param field name of the relation field, e.g. `profile`
   */
  loadOne(row: IEntity, field: string): Promise<IEntity | null>;
}

/** Key of a batch read: which table to read, by which column, and the ids involved. */
export interface IBatchKey {
  /** Entity to read, as `references` of the config names it (`socialLink`, `profile`, …). */
  readonly entity: string;
  /**
   * Column that holds the identifier of the related row. A collection is selected by it (it points
   * back at the parents); a single reference reads its value from the row itself.
   */
  readonly property: string;
  /** Ids of the rows that are wanted: parents of a collection, or the referenced rows themselves. */
  readonly ids: readonly string[];
}

/** Batch of collection requests that one query answers: one table, one column, the parent ids. */
export interface IBatchGroup {
  entity: string;
  /** Ids of the parents; they stay unique within a group because DataLoader drops duplicates. */
  ids: string[];
  property: string;
}

/**
 * Key of a collection read through a tie table: the two tables, the columns that name the parent and
 * the held row, and the parent ids.
 */
export interface IThroughBatchKey {
  /** Entity the collection holds, as `references` of the config names it (`skill`, …). */
  readonly entity: string;
  /** Tie table of the collection and the columns it stores. */
  readonly through: IThroughLink;
  /** Ids of the parents the collection is read for. */
  readonly ids: readonly string[];
}

/** Batch of through-collection requests that one pair of queries answers. */
export interface IThroughGroup {
  entity: string;
  through: IThroughLink;
  /** Ids of the parents; they stay unique within a group because DataLoader drops duplicates. */
  ids: string[];
}
