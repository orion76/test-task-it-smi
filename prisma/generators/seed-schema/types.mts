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

/** Config of the `prisma/generators/seed-schema/seed-schema.generator.mts` generator. */
export interface ISeedSchemaConfig {
  output: string;
  root: ISeedSchemaRoot;
  omit: string[];
  definitions: Record<string, TSchemaFragment>;
  overrides: Record<string, TSchemaFragment>;
}

/** Fragments of the config, split by what they annotate. */
export interface IOverrides {
  modelFragments: Map<string, TSchemaFragment>;
  fieldFragments: Map<string, TSchemaFragment>;
}
