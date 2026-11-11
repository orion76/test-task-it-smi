/**
 * Visibility and decoration rules of the `prisma-nestjs-graphql` generator: the API contract decides
 * what reaches GraphQL, and these are the pure functions that apply it. They live outside the config
 * literal, so evaluating a single predicate does not load the contract from disk.
 */
import { NON_NULLABLE_SCALAR_LIST } from './constants.mts';
import type {
  IApiFieldDescription,
  IApiFields,
  IContractRule,
  TContractField,
} from './types.mts';

/**
 * Whether the generator must hide the field. Only `properties` of the contract reach the API; a
 * relation is hidden, because it is resolved by a field resolver and not read from the row.
 *
 * @param field generated field, i.e. one property of one model type
 * @param allowedFields columns of the contract, keyed by model name
 * @returns `true` when the field is outside the allowlist
 */
export function shouldHideField(
  field: TContractField,
  allowedFields: Record<string, string[]>,
): boolean {
  const { objectName, propertyName } = field;
  const allowed = allowedFields[objectName];

  return !allowed?.includes(propertyName);
}

/**
 * Rules that shape the `@Field()` arguments of the generated model types.
 *
 * The generator merges the matching rules in order, so a later rule overrides an earlier one per
 * argument. Descriptions come last: they only add an argument nothing else sets.
 *
 * @param apiFields contract lookups: the visibility allowlist and the descriptions
 * @returns the rules of the `fieldDecoratorArguments` option
 */
export function buildDecoratorRules(apiFields: IApiFields): IContractRule[] {
  const { allowedFields, fieldDescriptions } = apiFields;

  return [
    dropDefaultValues(allowedFields),
    NON_NULLABLE_SCALAR_LIST,
    ...descriptionRules(fieldDescriptions),
  ];
}

/**
 * Drops the default value of a column from the `@Field()` options of a model type: the generator
 * copies a column default there, but on an output field it is noise — the option belongs to
 * arguments and input values only. `undefined` removes the key, `JSON5.stringify` omits it.
 *
 * @param allowedFields models of the contract
 * @returns the rule
 */
function dropDefaultValues(allowedFields: Record<string, string[]>): IContractRule {
  return {
    match: ({ objectName }) => Object.hasOwn(allowedFields, objectName),
    decoratorArguments: { defaultValue: undefined },
  };
}

/**
 * Builds one rule per documented field: a rule matches a single field, so the descriptions cannot
 * be merged into one rule.
 *
 * @param fieldDescriptions descriptions read from the contract
 * @returns the rules, in contract order
 */
function descriptionRules(fieldDescriptions: readonly IApiFieldDescription[]): IContractRule[] {
  return fieldDescriptions.map(({ objectName, propertyName, description }) => ({
    match: (field) => field.objectName === objectName && field.propertyName === propertyName,
    decoratorArguments: { description },
  }));
}
