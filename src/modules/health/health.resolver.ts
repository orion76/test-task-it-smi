import { Query, Resolver } from '@nestjs/graphql';

import { Health } from './health.model';
import type { IHealthResolver, IHealthStatus } from './types';

/**
 * GraphQL healthcheck used by clients that already talk to `/graphql`.
 * The HTTP controller stays in place: the container healthcheck relies on it.
 */
@Resolver(() => Health)
export class HealthResolver implements IHealthResolver {
  @Query(() => Health, { description: 'Application health status.' })
  health(): IHealthStatus {
    return { status: 'ok' };
  }
}
