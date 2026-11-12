/** A JSON Schema node: every level of the document is data, so its keys are data as well. */
export type TSchemaNode = Record<string, unknown>;

/** A JSON Schema node whose own `properties` block is known to be a mapping of subschemas. */
export interface IObjectSchema extends TSchemaNode {
  properties: Record<string, TSchemaNode>;
}

/** Tie table of a collection: the model that stores the pair and the columns of the two identifiers. */
export interface IThroughLink {
  model: string;
  parent: string;
  target: string;
}

/** A collection a model publishes through a tie table, with the entity its rows hold. */
export interface IThroughCollection {
  entity: string;
  link: IThroughLink;
}
