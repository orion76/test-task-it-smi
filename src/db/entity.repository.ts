import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import type { IEntity, IEntityQueryPort, UEntityQuery } from '../common/contracts/types';
import { argsOf, delegateOf } from './find-args';
import { PrismaService } from './prisma/prisma.service';

/**
 * Data access for the entities of the domain: the only place in the layer that calls `prisma.*`.
 * With no fields to map, it implements the read model itself — no service sits in between.
 */
@Injectable()
export class EntityRepository implements IEntityQueryPort {
  /**
   * The client arrives by the `PrismaService` token — the provider the module registers — while its
   * type is the `PrismaClient` this layer calls: the lifecycle hooks of the Nest service are none of
   * the repository's business.
   */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  /**
   * Reads rows of one entity type: a page of root entities, a nested collection of the given
   * parents, or the rows named by their identifiers.
   *
   * The page is pushed into the SQL statement and every batch is one query, which is what keeps the
   * nested fields from becoming N+1.
   *
   * @param type table to read
   * @param query page window, the parents whose nested collection is wanted, or a list of ids
   */
  find(type: string, query: UEntityQuery = {}): Promise<IEntity[]> {
    return delegateOf(this.prisma, type).findMany(argsOf(type, query));
  }
}
