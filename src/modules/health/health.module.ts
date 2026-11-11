import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { HealthResolver } from './health.resolver';

/**
 * Healthcheck module: HTTP `GET /health` for the container and `Query.health` in GraphQL.
 *
 * The resolver is provided here rather than added to `SCHEMA_RESOLVERS`: the graphql layer may
 * import `common` only, so it cannot pull a resolver out of a feature module.
 */
@Module({
  controllers: [HealthController],
  providers: [HealthResolver],
})
export class HealthModule {}
