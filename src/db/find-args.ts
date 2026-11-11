/**
 * Translation of a query of the port into the call the repository makes.
 *
 * The repository knows neither the models nor their columns: the read order comes from the API
 * contract, and the arguments of a read and the delegate of a table are built here.
 */
import type { PrismaClient } from '@prisma/client';

import { orderOf } from '../common/config/api-fields';
import type { UEntityQuery } from '../common/contracts/types';
import { ID_ORDER } from './constants';
import type { IFindManyArgs, IPrismaDelegate } from './types';

/**
 * Prisma arguments of one read, built from the query shape. The shapes are listed in the same order
 * as the union in the port, so a new shape is a compile error here as well.
 */
export function argsOf(type: string, query: UEntityQuery = {}): IFindManyArgs {
  const orderBy = orderOf(type) ?? ID_ORDER;

  if ('parentIds' in query) {
    return {
      where: { [query.parentProperty]: { in: [...query.parentIds] } },
      orderBy,
    };
  }

  if ('ids' in query) {
    return { where: { id: { in: [...query.ids] } }, orderBy };
  }

  return { orderBy, take: query.page?.limit, skip: query.page?.offset };
}

/**
 * Prisma client of one entity type, narrowed to the shape this layer calls: the generated delegates
 * have incompatible `findMany` signatures, so the union of them has to be cast.
 */
export function delegateOf(prisma: PrismaClient, type: string): IPrismaDelegate {
  return (prisma as unknown as Record<string, IPrismaDelegate>)[type];
}
