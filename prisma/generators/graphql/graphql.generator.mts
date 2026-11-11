/**
 * Prisma generator that writes the GraphQL declarations of the API: the `@ResolveField` of every
 * relation and the `@Query` of every query the contract publishes. Behaviour stays in code
 * (`EntityLoader`, `EntityQueries`); here only names, types, arguments and descriptions are
 * rendered, and they all come from the datamodel and the contract.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import generatorHelper from '@prisma/generator-helper';
import type { GeneratorManifest, GeneratorOptions } from '@prisma/generator-helper';

import { DEFAULT_OUTPUT, QUERIES_FILE_NAME, RELATIONS_FILE_NAME } from './constants.mts';
import { readContract } from './contract.reader.mts';
import { renderQueries } from './queries.renderer.mts';
import { renderRelations } from './relations.renderer.mts';

/**
 * `@prisma/generator-helper` is a CommonJS package, so the default import is its `module.exports`
 * and the handler is taken from it. A named import would rely on Node's static analysis of the
 * bundled CommonJS wrapper, while this works regardless of how the package is built.
 */
const { generatorHandler } = generatorHelper;

generatorHandler({
  onManifest(): GeneratorManifest {
    return {
      defaultOutput: DEFAULT_OUTPUT,
      prettyName: 'graphql',
    };
  },

  onGenerate(options: GeneratorOptions): Promise<void> {
    // Prisma resolves `output` against the schema directory before calling the generator, so the
    // value is absolute here; the fallback keeps a standalone run usable.
    const output =
      options.generator.output?.value ?? join(dirname(options.schemaPath), DEFAULT_OUTPUT);
    const models = options.dmmf.datamodel.models;
    const { references, queries } = readContract();

    mkdirSync(output, { recursive: true });

    const files: ReadonlyArray<readonly [string, string]> = [
      [RELATIONS_FILE_NAME, renderRelations(models, references)],
      [QUERIES_FILE_NAME, renderQueries(models, queries)],
    ];

    for (const [name, source] of files) {
      writeFileSync(join(output, name), source, 'utf8');
      console.log(`graphql: ${join(output, name)}`);
    }

    return Promise.resolve();
  },
});
