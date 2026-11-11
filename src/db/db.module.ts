import { Global, Module } from '@nestjs/common';

import { ENTITY_QUERY_PORT } from '../common/contracts/entity-query.port';
import { EntityRepository } from './entity.repository';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Database layer: the Prisma client and the read model of the entities.
 *
 * The port is bound here and nowhere else, so consumers inject the token and never the class. The
 * module is global because the API layer may not import anything from `src/db`.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [{ provide: ENTITY_QUERY_PORT, useClass: EntityRepository }],
  exports: [ENTITY_QUERY_PORT],
})
export class DbModule {}
