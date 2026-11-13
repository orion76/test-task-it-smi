/** One fragment of JSON Schema: its keys are the JSON Schema keywords the generator checks. */
export type TSchemaFragment = Record<string, unknown>;

/** Root envelope of the artifact: the format version and the properties of the top-level file. */
interface ISeedSchemaRoot {
  $schema: string;
  $id: string;
  title: string;
  description: string;
  version: TSchemaFragment;
  properties: Record<string, string>;
}

/**
 * Link table of a dictionary: the model that ties a dictionary row to the parent that lists it, and
 * the columns of the two identifiers.
 */
export interface IDictionaryLink {
  model: string;
  parent: string;
  target: string;
}

/**
 * One entry of the `dictionaries` block of the config: a model whose rows are shared between parents,
 * the column that identifies a row, the property of the parent that nests it, and the table that ties
 * the two rows.
 */
export interface IDictionaryConfig {
  key: string;
  property: string;
  link: IDictionaryLink;
}

/**
 * A dictionary resolved against the datamodel: the model name, the parent model and the entry of the
 * config.
 */
export interface IDictionarySpec extends IDictionaryConfig {
  model: string;
  parent: string;
}

/** One entry of the `src/generated/config/dictionaries.yml` artifact: the part the seed reads. */
export interface IDictionaryEntry {
  key: string;
  link: IDictionaryLink;
}

/** Tie table of a dictionary resolved against the datamodel, with the model that lists it. */
export interface IResolvedLink {
  parent: string;
  link: IDictionaryLink;
}

/** Config of the `prisma/generators/seed-schema/seed-schema.generator.mts` generator. */
export interface ISeedSchemaConfig {
  output: string;
  root: ISeedSchemaRoot;
  omit: string[];
  definitions: Record<string, TSchemaFragment>;
  overrides: Record<string, TSchemaFragment>;
  dictionaries: Record<string, IDictionaryConfig>;
}

/** Fragments of the config, split by what they annotate. */
export interface IOverrides {
  modelFragments: Map<string, TSchemaFragment>;
  fieldFragments: Map<string, TSchemaFragment>;
}
