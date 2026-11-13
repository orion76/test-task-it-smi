import { Field, ObjectType } from '@nestjs/graphql';

import type { UHealthStatus } from './types';

/**
 * GraphQL health status, mirroring the HTTP `GET /health` endpoint: both answer with the same
 * `UHealthStatus`, so the literal cannot drift between them.
 *
 * No interface: it would repeat the `@Field` decorators, and the SDL already declares the shape.
 */
@ObjectType({ description: 'Состояние работоспособности приложения.' })
export class Health {
  @Field(() => String, { description: 'Состояние приложения; ok — приложение работает.' })
  status!: UHealthStatus;
}
