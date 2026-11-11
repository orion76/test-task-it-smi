import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Global database module.
 * PrismaService is exported for repositories only: services and resolvers must not
 * depend on it, which keeps `prisma.*` calls inside the data-access layer.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
