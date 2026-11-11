/** A JSON Schema node: every level of the document is data, so its keys are data as well. */
export type TSchemaNode = Record<string, unknown>;

/** A JSON Schema node whose own `properties` block is known to be a mapping of subschemas. */
export interface IObjectSchema extends TSchemaNode {
  properties: Record<string, TSchemaNode>;
}
