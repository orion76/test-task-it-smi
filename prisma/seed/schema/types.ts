/**
 * A JSON Schema document or one of its subschemas, limited to the keywords the seed engine reads.
 * The rest of the document is ignored on purpose: validation belongs to AJV, the engine only needs
 * the structure (properties, nesting, dates).
 */
export interface IJsonSchema {
  $ref?: string;
  $defs?: Record<string, IJsonSchema>;
  properties?: Record<string, IJsonSchema>;
  required?: string[];
  items?: IJsonSchema;
  anyOf?: IJsonSchema[];
  oneOf?: IJsonSchema[];
  type?: string | string[];
  format?: string;
  pattern?: string;
  const?: unknown;
  enum?: unknown[];
}

/** Scalar property of a model: written as-is, or as a `Date` when the schema declares a date. */
interface IFieldSpec {
  name: string;
  /** Listed in the `required` array of the model definition. */
  required: boolean;
  /** `format: "date"`: a calendar date stored as a `Date` at midnight UTC. */
  date: boolean;
}

/** Property that holds another model: a nested object or a collection of them. */
export interface IChildSpec {
  property: string;
  /** Model name of the referenced definition. */
  model: string;
  required: boolean;
  /** `items.$ref`: the property is an array of the child model. */
  collection: boolean;
}

export interface IModelSpec {
  /** Model name derived from the definition key: `socialLink` → `SocialLink`. */
  name: string;
  defName: string;
  fields: IFieldSpec[];
  children: IChildSpec[];
}

/** Definition another property points at: what the property holds, not the model it becomes. */
export interface IModelRef {
  defName: string;
  /** `items.$ref`: the property is an array of the child model. */
  collection: boolean;
}

export interface IDataModel {
  /** Root property of the data file that holds the root model, e.g. `profile`. */
  property: string;
  root: IModelSpec;
  /** Root first, then the rest in the order they have to be written. */
  models: IModelSpec[];
}

/**
 * Contract of the builder: the walk records the models it reaches and builds one of them by the name
 * of its definition, which is all that `buildDataModel` needs.
 */
export interface IModelBuilder {
  readonly models: IModelSpec[];

  build(defName: string, trail: string[]): IModelSpec;
}
