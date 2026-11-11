/**
 * Constants of the `prisma-nestjs-graphql` generator: the decoration rules whose value is fixed
 * rather than derived from the contract.
 */
import type { IContractRule } from './types.mts';

/**
 * Declares the only scalar list of the datamodel non-nullable.
 *
 * The generator marks a scalar list as nullable, while the column is `String[]` without nulls, and
 * the contract keeps `achievements: [String!]!`.
 */
export const NON_NULLABLE_SCALAR_LIST: IContractRule = {
  match: ({ objectName, propertyName }) =>
    objectName === 'Experience' && propertyName === 'achievements',
  decoratorArguments: { nullable: false },
};
