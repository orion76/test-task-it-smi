import type { IEntity } from '../common/contracts/types';

/**
 * Arguments of one `findMany` call, as the repository builds them for every table.
 *
 * The repository is generic by design — it knows neither the models nor their columns — so it
 * cannot use the generated `*FindManyArgs` of a concrete model. This shape is what `findMany`
 * accepts for every table: a filter, an ordering and a window.
 */
export interface IFindManyArgs {
  where?: Record<string, unknown>;
  orderBy?: unknown;
  take?: number;
  skip?: number;
}

/**
 * The part of a Prisma delegate the repository calls: one query with neutral arguments.
 *
 * `prisma[type]` is a union of the generated delegates, and their `findMany` signatures are
 * incompatible — each takes its own `*FindManyArgs` — so the delegate is narrowed to this shape
 * before the call.
 */
export interface IPrismaDelegate {
  findMany(args: IFindManyArgs): Promise<IEntity[]>;
}
