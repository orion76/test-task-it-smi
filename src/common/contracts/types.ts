/** Window of a list query: how many rows to read and how many to skip. */
export interface IPagination {
  readonly limit: number;
  readonly offset: number;
}

/**
 * One row of any table: the identifier and the discriminant of the row. The other columns stay
 * opaque: a column is read by name (`columnOf`), and no layer declares the fields of an entity.
 *
 * `type` holds the name of the Prisma delegate the row comes from (`profile`, `socialLink`, …).
 */
export interface IEntity {
  readonly id: string;
  readonly type: string;
}

/**
 * One reference of `config/api-fields.yml`: the entity a relation points at and the column that
 * holds the identifier of that entity.
 */
export interface IEntityReference {
  /** Entity the relation points at, named as the Prisma delegate is (`socialLink`, `profile`, …). */
  readonly entity: string;
  /** Column of the row that stores the identifier of the related entity (`profileId`). */
  readonly property: string;
}

/**
 * What to read: a page of root entities, the nested collection of given parents, or the rows named
 * by their identifiers. All three are one query to one table, so the options are the only difference.
 */
export type UEntityQuery = IRootQuery | ICollectionQuery | IIdsQuery;

/** Window of a list of root entities: how many rows to read and how many to skip. */
interface IRootQuery {
  page?: IPagination;
}

/**
 * Nested collection of the given parents. The column that stores the parent id comes from the
 * `references` block of the config, so the query names no field of its own.
 */
interface ICollectionQuery {
  parentIds: readonly string[];
  parentProperty: string;
}

/**
 * Rows by their primary key: what a relation to a single entity is resolved with (`Skill.profile`).
 * The identifiers come from the foreign key of the rows being resolved, so this is the same batch
 * shape as a collection — one query per referenced table and tick, not per row.
 */
interface IIdsQuery {
  ids: readonly string[];
}

/** Direction of one sort key. */
type USortDirection = 'asc' | 'desc';

/**
 * One sort key of a read: a column with its direction, or the full form that also places the rows
 * whose value is `null`.
 */
export type USortKey = USortDirection | { sort: USortDirection; nulls: 'first' | 'last' };

/** Ordering of a read: the columns from the most significant key to the least significant one. */
export type TOrderBy = readonly Record<string, USortKey>[];

/**
 * Read model of the aggregate: every entity is read by its type.
 *
 * The only thing `db` and `graphql` share: the repository implements it, the field resolvers inject
 * it by the `ENTITY_QUERY_PORT` token, so neither layer imports the other.
 */
export interface IEntityQueryPort {
  /**
   * Reads rows of one entity type.
   * @param type table to read, named as the Prisma delegate is (`profile`, `skill`, …)
   * @param query page window, the parents whose nested collection is wanted, or a list of ids
   */
  find(type: string, query?: UEntityQuery): Promise<IEntity[]>;
}
