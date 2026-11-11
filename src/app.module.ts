import { ApolloDriver } from '@nestjs/apollo';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';

import { AppConfigModule } from './common/config/app-config.module';
import { DbModule } from './db/db.module';
import { PrismaModule } from './db/prisma/prisma.module';
import { SANDBOX_PLUGINS } from './graphql/constants';
import { GraphqlApiModule } from './graphql/graphql-api.module';
import { HealthModule } from './modules/health/health.module';

/**
 * Root module: configuration, database, GraphQL API and healthcheck.
 *
 * It is also the composition root of the two layers: it is the only place that imports both
 * `DbModule` and `GraphqlApiModule`, which keeps `db` and `graphql` independent of each other.
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    DbModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // The schema is built in memory on boot, so the application never writes `src/schema.gql`
      // (and the container never writes into its own image). The committed SDL is produced by the
      // parity spec alone: `SCHEMA_UPDATE=1 npx jest tests/unit/graphql/schema.spec.ts`. One
      // writer of the file means a stale SDL fails the spec instead of being rewritten silently.
      autoSchemaFile: true,
      sortSchema: true,
      // Apollo Server enables introspection only outside production, so it is set
      // explicitly: the container runs with NODE_ENV=production and must keep the
      // Sandbox and introspection available.
      introspection: true,
      // In `@nestjs/apollo` 14 the landing page is controlled by `graphiql` (`playground`
      // is only its deprecated alias) and it serves GraphiQL, not Apollo Sandbox. It is
      // disabled here so that the Sandbox plugin is the only landing page.
      graphiql: false,
      plugins: SANDBOX_PLUGINS,
    }),
    HealthModule,
    GraphqlApiModule,
  ],
})
export class AppModule {}
