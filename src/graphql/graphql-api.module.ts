import { Module } from '@nestjs/common';

import { SCHEMA_RESOLVERS } from './constants';
import { EntityLoader } from './loaders/entity.loader';

/**
 * GraphQL API layer: the request-scoped loaders of the nested relations and the generated
 * declarations of the queries and fields.
 *
 * Nothing here is imported from `src/db`: the layer sees the port only, and the binding is provided
 * application-wide by the global `DbModule`.
 */
@Module({
  providers: [EntityLoader, ...SCHEMA_RESOLVERS],
})
export class GraphqlApiModule {}
