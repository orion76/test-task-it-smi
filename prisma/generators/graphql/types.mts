/** A node of the parsed contract: every level is data, so its keys are data as well. */
export type TContractNode = Record<string, unknown>;

/** `references` block of one model: field name → the rule of that relation. */
export type TReferenceRules = Record<string, TContractNode>;

/** One relation the contract publishes, as the renderer needs it. */
export interface IRelation {
  field: string;
  target: string;
  list: boolean;
  description: string;
}

/** One class of a generated file: its source, its name and the models it mentions. */
export interface IRenderedBlock {
  text: string;
  className: string;
  targets: string[];
}

/** One query of the contract with the name it is declared under. */
export interface IQueryEntry extends TContractNode {
  name: string;
}

/** What the renderers read from the API contract. */
export interface IContract {
  references: Map<string, TReferenceRules>;
  queries: Record<string, TContractNode>;
}
