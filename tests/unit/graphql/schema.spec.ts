import 'reflect-metadata';

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { lexicographicSortSchema, printSchema } from 'graphql';

import { SCHEMA_RESOLVERS } from '@src/graphql/constants';
import { HealthResolver } from '@src/features/health/health.resolver';

/**
 * The committed SDL is a build artifact of the resolvers alone: the application no longer writes it
 * (`autoSchemaFile: true` in `app.module.ts`), so nothing else would notice a field that exists in
 * the model yet is missing from the document. This spec closes that gap by building the schema the
 * same way Nest does on boot — no HTTP server, no database, no Docker — and comparing the printed
 * result with the file byte for byte.
 *
 * Three details repeat `@nestjs/graphql`'s own writer
 * (`GraphQLSchemaBuilder` in `graphql-schema.builder.js`), and omitting any of them makes the
 * comparison fail for a reason unrelated to the schema: the header of three comment lines and a
 * blank line, `lexicographicSortSchema` (the module sets `sortSchema: true`) and the absence of a
 * trailing newline (`addNewlineAtEnd` is off).
 *
 * The resolver list is not copied here. `SCHEMA_RESOLVERS` is the array `GraphqlApiModule` provides,
 * and `HealthResolver` is added from its own file, exactly as `HealthModule` provides it: a copy of
 * the list would let the check stay green on a schema the application does not serve.
 */

const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');
const SDL_PATH = resolve(PROJECT_ROOT, 'src', 'schema.gql');

/** The file header Nest writes; the blank line after it is part of it. */
const SDL_HEADER =
  '# ------------------------------------------------------\n' +
  '# THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT MODIFY)\n' +
  '# ------------------------------------------------------\n\n';

const UPDATE_HINT =
  'Run `npm run schema:update` (or `SCHEMA_UPDATE=1 npx jest ' +
  'tests/unit/graphql/schema.spec.ts`) and commit `src/schema.gql`.';

/**
 * Explains a mismatch as a readable line diff instead of dumping two 3 KB documents: the first
 * differing line is what a stale SDL most often has, so it is reported with the line number.
 */
function differenceOf(built: string, committed: string): string | null {
  if (built === committed) {
    return null;
  }

  const shared = Math.min(built.length, committed.length);
  let index = 0;

  while (index < shared && built[index] === committed[index]) {
    index += 1;
  }

  const builtLines = built.split('\n');
  const committedLines = committed.split('\n');
  const line = built.slice(0, index).split('\n').length;

  return [
    '`src/schema.gql` is stale: it does not match the schema built from the resolvers.',
    `First difference at line ${line}:`,
    `  committed: ${JSON.stringify(committedLines[line - 1] ?? '<end of file>')}`,
    `  built:     ${JSON.stringify(builtLines[line - 1] ?? '<end of file>')}`,
    `Committed ${committed.length} characters, built ${built.length}.`,
    UPDATE_HINT,
  ].join('\n');
}

describe('GraphQL SDL', () => {
  let context: INestApplicationContext;
  let built: string;

  beforeAll(async () => {
    context = await NestFactory.createApplicationContext(GraphQLSchemaBuilderModule, {
      logger: false,
    });

    const schema = await context.get(GraphQLSchemaFactory).create([
      ...SCHEMA_RESOLVERS,
      HealthResolver,
    ]);

    built = SDL_HEADER + printSchema(lexicographicSortSchema(schema));
  });

  afterAll(async () => {
    await context.close();
  });

  it('matches the committed src/schema.gql byte for byte', () => {
    if (process.env.SCHEMA_UPDATE === '1') {
      writeFileSync(SDL_PATH, built);

      return;
    }

    expect(differenceOf(built, readFileSync(SDL_PATH, 'utf8'))).toBeNull();
  });
});
