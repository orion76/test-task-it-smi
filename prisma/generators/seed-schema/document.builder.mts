/**
 * Builds the schema document of the import file: the root envelope, the shared fragments and the
 * definitions of the models, and serializes it with its header.
 *
 * The structure comes from the DMMF; everything Prisma cannot express comes from the generator
 * config. The output is deterministic, so a repeated `prisma generate` rewrites the same bytes.
 */
import type { DMMF } from '@prisma/generator-helper';
import { stringify } from 'yaml';

import { delegateName } from '../shared/dmmf.mts';
import { assertConfig, assertDefinitionNames, assertOmittedFields } from './config.validator.mts';
import { HEADER, ROOT_PASSTHROUGH_KEYS } from './constants.mts';
import { dictionarySpecs, linkModelNames } from './dictionaries.mts';
import { applyFragment, splitOverrides } from './overrides.mts';
import { buildProperty, isRequiredInFile, referenceTo } from './property.builder.mts';
import config from './seed-schema.config.mts';
import { failConfig } from './shared/errors.mts';
import type { IOverrides, TSchemaFragment } from './types.mts';

/**
 * Renders the whole artifact: the header comment and the schema itself.
 *
 * `lineWidth: 0` stops the serializer from folding a long description over several lines, and
 * `singleQuote` keeps the style of the rest of the configuration. The trailing newline comes from
 * the serializer, so the committed file ends with one.
 *
 * @param datamodel `options.dmmf.datamodel`
 * @returns the content of `config/profile-data.schema.yml`
 */
export function render(datamodel: DMMF.Datamodel): string {
  assertConfig();
  const document = buildDocument(datamodel);

  return `${HEADER}\n\n${stringify(document, { lineWidth: 0, singleQuote: true })}`;
}

/**
 * Builds the schema document: the root envelope, the shared fragments and the models.
 *
 * @param datamodel `options.dmmf.datamodel`
 * @returns the document, ready to be serialized
 */
function buildDocument(datamodel: DMMF.Datamodel): TSchemaFragment {
  const pairs: ReadonlyArray<readonly [string, string[]]> = datamodel.enums.map((entry) => [
    entry.name,
    entry.values.map((value) => value.name),
  ]);
  const enums = new Map(pairs);
  const models = datamodel.models;
  const linkModels = linkModelNames(dictionarySpecs(models));

  assertDefinitionNames(models);

  return buildRoot(models, {
    ...config.definitions,
    ...buildModelDefinitions(models, enums, linkModels),
  });
}

/**
 * Builds `$defs` for every model, keyed by the delegate name of the model (`SocialLink` →
 * `socialLink`): the same spelling the Prisma client uses for the model names. A tie table of a
 * dictionary is not a model of the import file: the engine writes its rows from the nesting.
 *
 * @param models models of the DMMF datamodel
 * @param enums values of every enum, keyed by the enum name
 * @param linkModels tie tables of the dictionaries
 * @returns the model definitions
 */
function buildModelDefinitions(
  models: readonly DMMF.Model[],
  enums: ReadonlyMap<string, string[]>,
  linkModels: ReadonlySet<string>,
): Record<string, TSchemaFragment> {
  const omitted = new Set(config.omit);
  const overrides = splitOverrides(models, omitted);
  const definitions: Record<string, TSchemaFragment> = {};

  assertOmittedFields(models, omitted);

  for (const model of models) {
    if (linkModels.has(model.name)) {
      continue;
    }

    definitions[delegateName(model.name)] = buildModelDefinition(
      model,
      enums,
      omitted,
      overrides,
      linkModels,
    );
  }

  return definitions;
}

/**
 * Builds the definition of one model: an omitted column never reaches the schema, and a single-valued
 * relation is skipped as well, because it is the inverse side of the parent link. A list relation
 * becomes an array of references to the target model, unless the target is a tie table: a dictionary
 * row is nested as a value, and its ties are written by the engine.
 *
 * @param model model of the DMMF datamodel
 * @param enums values of every enum
 * @param omitted columns the import file does not contain
 * @param overrides fragments of the config, split by what they annotate
 * @param linkModels tie tables of the dictionaries
 * @returns the definition of the model
 */
function buildModelDefinition(
  model: DMMF.Model,
  enums: ReadonlyMap<string, string[]>,
  omitted: ReadonlySet<string>,
  overrides: IOverrides,
  linkModels: ReadonlySet<string>,
): TSchemaFragment {
  const definition: TSchemaFragment = { type: 'object' };

  if (model.documentation !== undefined) {
    definition.description = model.documentation;
  }

  definition.additionalProperties = false;

  const properties: Record<string, TSchemaFragment> = {};
  const required: string[] = [];

  for (const field of model.fields) {
    if (omitted.has(field.name)) {
      continue;
    }

    const property = buildProperty(model, field, enums, overrides.fieldFragments, linkModels);

    if (property === null) {
      continue;
    }

    properties[field.name] = property;

    if (isRequiredInFile(field, property)) {
      required.push(field.name);
    }
  }

  definition.required = required;
  definition.properties = properties;

  return applyFragment(definition, overrides.modelFragments.get(model.name));
}

/**
 * Builds the root of the document: the envelope of the format and the top-level properties of the
 * import file.
 *
 * `version` comes first and is always required; every property of `root.properties` is required as
 * well, because a file without the business card is not a valid import.
 *
 * @param models models of the DMMF datamodel
 * @param definitions the `$defs` block
 * @returns the document
 */
function buildRoot(models: readonly DMMF.Model[], definitions: TSchemaFragment): TSchemaFragment {
  const properties: Record<string, TSchemaFragment> = { version: { ...config.root.version } };
  const required: string[] = ['version'];

  for (const [property, defKey] of Object.entries(config.root.properties)) {
    if (property === 'version') {
      failConfig('root.properties: "version" is the envelope of the format, declare it in root.version');
    }

    const model = models.find((candidate) => delegateName(candidate.name) === defKey);

    if (model === undefined) {
      failConfig(`root.properties.${property}: "${defKey}" is not a model of the datamodel`);
    }

    properties[property] = { $ref: referenceTo(defKey) };
    required.push(property);
  }

  const document: TSchemaFragment = {};
  const root: TSchemaFragment = config.root;

  for (const key of ROOT_PASSTHROUGH_KEYS) {
    const value = root[key];

    if (value !== undefined) {
      document[key] = value;
    }
  }

  document.type = 'object';
  document.additionalProperties = false;
  document.required = required;
  document.properties = properties;
  document.$defs = definitions;

  return document;
}
