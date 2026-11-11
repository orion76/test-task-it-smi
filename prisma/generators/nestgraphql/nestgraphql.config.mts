/**
 * Configuration of the `prisma-nestjs-graphql` generator (see `generator nestgraphql` in
 * `schema.prisma`): the GraphQL types follow the Prisma models, and the API contract decides what
 * reaches the schema. A column added to the schema is therefore not published by accident, and the
 * config is validated against the JSON Schema of the same datamodel.
 */
import type { ExternalConfig } from 'prisma-nestjs-graphql';

import { loadApiFields } from './api-fields.reader.mts';
import { buildDecoratorRules, shouldHideField } from './visibility.rules.mts';

// Read once: the allowlist drives both the visibility predicate and the decorator rules.
const apiFields = loadApiFields();

const config: ExternalConfig = {
  // Relative to this config file (`prisma/generators/nestgraphql`), i.e.
  // `src/generated/graphql/entities`: the artifacts of the generators share one root, next to the
  // resolvers that consume them.
  output: '../../../src/generated/graphql/entities',
  // The API is read-only: resolvers and the repository are hand-written, so the generator emits only
  // the `@ObjectType` classes — inputs, args and filter types would describe mutations nothing
  // implements. The `models` block still pulls the datamodel enums (`SocialKind`); the
  // `*ScalarFieldEnum` helpers are not emitted, nothing outside the generated barrel references them.
  emitBlocks: ['models'],
  // `_count` aggregates belong to Prisma reads, not to the API.
  omitModelsCount: true,
  // One barrel file: `entities.ts` re-exports the models without knowing the folder layout.
  reExport: 'Single',
  // Visibility and decoration rules live in `visibility.rules.mts`: the config only binds them to
  // the contract read above.
  shouldHideField: (field) => shouldHideField(field, apiFields.allowedFields),
  fieldDecoratorArguments: buildDecoratorRules(apiFields),
};

export default config;
