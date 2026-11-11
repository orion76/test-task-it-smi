/**
 * Prisma generator that writes the JSON Schema of the API contract (`config/api-fields.schema.yml`)
 * from the DMMF, so the list of model and field names the config may mention follows
 * `schema.prisma`.
 *
 * The artifact describes the config, not the rows: `additionalProperties: false` on each level
 * turns a typo into a build error instead of a field that silently disappears from the API.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import generatorHelper from '@prisma/generator-helper';
import type { GeneratorManifest, GeneratorOptions } from '@prisma/generator-helper';
import { stringify } from 'yaml';

import { DEFAULT_OUTPUT, HEADER, SCHEMA_FILE_NAME } from './constants.mts';
import { buildSchema } from './schema.builder.mts';

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
      prettyName: 'api-fields',
    };
  },

  onGenerate(options: GeneratorOptions): Promise<void> {
    // Prisma resolves `output` against the schema directory before calling the generator, so the
    // value is absolute here; the fallback keeps a standalone run usable.
    const output =
      options.generator.output?.value ?? join(dirname(options.schemaPath), DEFAULT_OUTPUT);
    const file = join(output, SCHEMA_FILE_NAME);
    const document = buildSchema(options.dmmf.datamodel.models);
    const content = `${HEADER}\n\n${stringify(document, { lineWidth: 0, singleQuote: true })}`;

    mkdirSync(output, { recursive: true });
    writeFileSync(file, content, 'utf8');

    console.log(`api-fields: ${file}`);

    return Promise.resolve();
  },
});
