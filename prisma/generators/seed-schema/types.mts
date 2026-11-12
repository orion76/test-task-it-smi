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
 * the column that identifies a row, and the table that ties it to the parent.
 */
export interface IDictionaryEntry {
  key: string;
  link: IDictionaryLink;
}

/** A dictionary resolved against the datamodel: the model name and the entry of the config. */
export interface IDictionarySpec extends IDictionaryEntry {
  model: string;
}

/** Config of the `prisma/generators/seed-schema/seed-schema.generator.mts` generator. */
export interface ISeedSchemaConfig {
  output: string;
  root: ISeedSchemaRoot;
  omit: string[];
  definitions: Record<string, TSchemaFragment>;
  overrides: Record<string, TSchemaFragment>;
  dictionaries: Record<string, IDictionaryEntry>;
}

/** Fragments of the config, split by what they annotate. */
export interface IOverrides {
  modelFragments: Map<string, TSchemaFragment>;
  fieldFragments: Map<string, TSchemaFragment>;
}
