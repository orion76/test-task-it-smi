import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import type { ApolloDriverConfig } from '@nestjs/apollo';

import { QUERY_RESOLVERS } from '../generated/graphql/resolvers/queries.resolver';
import { RELATION_RESOLVERS } from '../generated/graphql/resolvers/relations.resolver';

/**
 * Constants of the GraphQL API layer: the landing page plugins and the single list of the schema
 * resolvers the application serves.
 */

/**
 * Apollo Sandbox landing page for `GET /graphql`, served in every environment: the container runs in
 * production, where the Nest driver would otherwise hide the landing page.
 *
 * The list is narrowed explicitly: `@apollo/server` ships separate ESM and CJS type declarations.
 */
export const SANDBOX_PLUGINS = [
  ApolloServerPluginLandingPageLocalDefault({ embed: true }),
] as ApolloDriverConfig['plugins'];

/**
 * The single list of the schema resolvers this layer declares: the generated query and relation
 * declarations, plus the health resolver a feature module provides on its own.
 *
 * It is a constant rather than a spread inside the module, because the SDL parity spec builds the
 * schema from this very array — a copy there could drift from what the application serves.
 */
export const SCHEMA_RESOLVERS = [...QUERY_RESOLVERS, ...RELATION_RESOLVERS];
