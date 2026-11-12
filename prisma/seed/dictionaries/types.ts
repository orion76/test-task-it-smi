/**
 * Tie table of a dictionary: the model that stores the pair, and the columns of the two identifiers.
 */
export interface IDictionaryLink {
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
