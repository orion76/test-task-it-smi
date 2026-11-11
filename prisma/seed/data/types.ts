/** Rows written by one seed run for one model. */
export interface IModelReport {
  /** Model name from the schema. */
  model: string;
  /** How the model was written: matched by its natural key, or replaced as a whole. */
  strategy: 'upsert' | 'replace';
  written: number;
}

export interface ISeedSummary {
  models: IModelReport[];
}

/** One row of a model, as the engine builds it before the write. */
export type TRow = Record<string, unknown>;

/** Relation of a child model to the row of its parent. */
export interface IParentRef {
  model: string;
  id: unknown;
}

/** Element of the data file prepared for the write: the value itself and the row built from it. */
export interface IPreparedItem {
  value: unknown;
  row: TRow;
}

/** Element written by one step of the walk: the row it produced and the value it came from. */
export interface IWrittenElement {
  item: IPreparedItem;
  saved: TRow;
}

/**
 * How a model is written. A model without a natural key is always replaced, never appended:
 * the engine keeps row counts stable between runs, which matters when the container restarts.
 */
export type UWriteStrategy = 'upsert' | 'replace';

/** The part of a Prisma model delegate the engine uses. */
export interface IDelegate {
  create(args: { data: TRow }): Promise<TRow>;
  createMany(args: { data: TRow[] }): Promise<{ count: number }>;
  upsert(args: { where: TRow; create: TRow; update: TRow }): Promise<TRow>;
  deleteMany(args: { where: TRow }): Promise<{ count: number }>;
}

/**
 * Format entry of AJV, narrowed to the part the validator reads: the `compare` function of `date`
 * is registered by `ajv-formats`, and the startup check looks for it.
 */
export interface IFormatEntry {
  compare?: unknown;
}

/**
 * What the entry point needs from the reader: the document and the path it came from, which is what
 * every diagnostic of the run names.
 */
export interface IDataReader {
  /** Path of the data file as it appears in diagnostics, e.g. `data/profile.yml`. */
  readonly path: string;

  /** Reads and parses the file; a missing file or broken YAML fails with the file path. */
  read(): unknown;
}

/**
 * Contract of the validator: the entry point hands it the parsed document and knows nothing about
 * AJV, the compiled schema or the wording of a message.
 */
export interface IDataValidator {
  /**
   * Validates the raw document.
   * @throws SeedError when the document does not match the schema.
   */
  validate(source: unknown): void;
}

/**
 * Contract of the writer: the entry point applies the document and reads back the report of what was
 * written, without knowing the strategies or the model tree behind them.
 */
export interface IDataWriter {
  /**
   * Applies the data file in a single transaction. Safe to run on every container start:
   * a second run on an existing volume neither duplicates rows nor fails. The root row without a
   * natural key is replaced, so a restart cannot append another one.
   */
  write(source: unknown): Promise<ISeedSummary>;
}
