/**
 * Prisma generator that writes the inputs of the seed from the DMMF, so `schema.prisma` stays the
 * single source of truth about the shape of the domain: the JSON Schema of `data/profile.yml`
 * (`config/profile-data.schema.yml`) and the dictionaries with their tie tables
 * (`config/dictionaries.yml`). Everything Prisma cannot express comes from `seed-schema.config.mts`:
 * the root envelope, the service columns kept out of the import file, the shared fragments, the domain
 * rules and the dictionaries.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import generatorHelper from '@prisma/generator-helper';
import type { GeneratorManifest, GeneratorOptions } from '@prisma/generator-helper';

import { DEFAULT_OUTPUT, DICTIONARIES_FILE_NAME } from './constants.mts';
import { renderDictionaries } from './dictionaries.artifact.mts';
import { dictionarySpecs } from './dictionaries.mts';
import { render } from './document.builder.mts';
import config from './seed-schema.config.mts';

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
      prettyName: 'seed-schema',
    };
  },

  onGenerate(options: GeneratorOptions): Promise<void> {
    // Prisma resolves `output` against the schema directory before calling the generator, so the
    // value is absolute here; the fallback keeps a standalone run usable.
    const directory =
      options.generator.output?.value ?? join(dirname(options.schemaPath), DEFAULT_OUTPUT);
    const file = join(directory, basename(config.output));
    const dictionariesFile = join(directory, DICTIONARIES_FILE_NAME);
    const datamodel = options.dmmf.datamodel;

    mkdirSync(directory, { recursive: true });
    writeFileSync(file, render(datamodel), 'utf8');
    writeFileSync(
      dictionariesFile,
      renderDictionaries(dictionarySpecs(datamodel.models)),
      'utf8',
    );

    console.log(`seed-schema: ${file}`);
    console.log(`seed-schema: ${dictionariesFile}`);

    return Promise.resolve();
  },
});
