import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@src/app.module';
import { ENTITY_QUERY_PORT } from '@src/common/contracts/entity-query.port';

import type { IAppOptions, IGraphqlResponse } from './types';

/**
 * Starts the real application module against a real database.
 *
 * The app runs in the test process instead of a container: the database is the only part that has
 * to be prepared from outside, and the module graph is exactly the one `src/main.ts` builds, so the
 * specs exercise the production wiring (GraphQL driver, resolvers, loaders, repository) rather than
 * a hand-assembled one.
 *
 * The connection string is written to `process.env` before the module is compiled: `AppConfigModule`
 * reads the environment at instantiation, and `PrismaClient` reads the variable when it is created,
 * so both have to see the test database, not the development one from `.env`.
 *
 * @param options connection string and an optional port replacement
 * @returns the initialised Nest application
 */
export async function startApp(options: IAppOptions): Promise<INestApplication> {
  process.env.DATABASE_URL = options.databaseUrl;

  const builder = Test.createTestingModule({ imports: [AppModule] });

  if (options.queryPort !== undefined) {
    builder.overrideProvider(ENTITY_QUERY_PORT).useValue(options.queryPort);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();

  await app.init();

  return app;
}

/**
 * HTTP server of the running app, typed the way supertest accepts it: Nest erases the type of
 * `getHttpServer()` to `any`, and the specs must not pass that through.
 * @param app application under test
 * @returns the Node HTTP server the app listens on
 */
export function serverOf(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

/**
 * Sends one GraphQL document to the `/graphql` endpoint of the running app.
 *
 * @param app application under test
 * @param query GraphQL document
 * @returns HTTP status and the parsed body
 */
export async function graphql<TData>(
  app: INestApplication,
  query: string,
): Promise<IGraphqlResponse<TData>> {
  const response = await request(serverOf(app)).post('/graphql').send({ query });
  const body = response.body as IGraphqlResponse<TData>;

  return { ...body, status: response.status };
}
