/**
 * Tie table of a dictionary: the model that stores the pair, and the columns of the two identifiers.
 */
interface IDictionaryLink {
  model: string;
  parent: string;
  target: string;
}

/**
 * A dictionary of the import file: the model whose rows are shared between parents, the column that
 * identifies a row, and the tie table that points at it.
 */
export interface IDictionarySpec {
  model: string;
  key: string;
  link: IDictionaryLink;
}

/** One entry of the dictionaries artifact: the key column of a dictionary and its tie table. */
interface IDictionaryEntry {
  key: string;
  link: IDictionaryLink;
}

/** Document of the dictionaries artifact, as the schema the generator writes describes it. */
export interface IDictionariesDocument {
  version: number;
  dictionaries: Record<string, IDictionaryEntry>;
}
