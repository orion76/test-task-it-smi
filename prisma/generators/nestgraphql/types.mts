import type { FieldDecoratorArguments, FieldInfo } from 'prisma-nestjs-graphql';

/** One description rule: the contract entry the generator decorates with a GraphQL description. */
export interface IApiFieldDescription {
  objectName: string;
  propertyName: string;
  description: string;
}

/** The two lookups the generator needs from the contract, both keyed by model name. */
export interface IApiFields {
  allowedFields: Record<string, string[]>;
  fieldDescriptions: IApiFieldDescription[];
}

/** The part of the generator field info the rules read. */
export type TContractField = Pick<FieldInfo, 'objectName' | 'propertyName'>;

/** One `@Field()` argument rule, typed by the fields the contract knows. */
export interface IContractRule {
  match: (field: TContractField) => boolean;
  decoratorArguments: FieldDecoratorArguments;
}
