/**
 * What the config adds to the JSON Schema: only facts the schema cannot express —
 * the column that links a row to its parent and natural keys of the idempotent writes.
 */
export interface IModelConfig {
  /** Prisma model name when the definition key in PascalCase is not the Prisma model name. */
  model?: string;
  /** Column that stores the id of the parent row. */
  foreignKey?: string;
  /** Natural key of the model: enables upsert instead of replace. */
  key?: string[];
}

export interface ISeedConfig {
  configPath: string;
  /** `defaults` means the file is missing: only the rules of the schema apply. */
  source: 'file' | 'defaults';
  schemaPath: string;
  dataPath: string;
  /** Per-model additions, keyed by the model name taken from the schema. */
  models: Record<string, IModelConfig>;
}
