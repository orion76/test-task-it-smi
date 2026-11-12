import type { IEntity, IThroughReference, UEntityReference } from './types';

/**
 * Name a row of a model carries in its `type` column: the name of the Prisma client delegate,
 * `SocialLink` → `socialLink`. It is the same spelling the schema, the client and the `references`
 * block of `config/api-fields.yml` use, so one value describes a table everywhere.
 */
export function entityNameOf(modelName: string): string {
  return modelName.replace(/^./, (first) => first.toLowerCase());
}

/**
 * Whether the reference reads a tie table instead of a column of one of the two rows.
 *
 * @param reference reference of `config/api-fields.yml`
 */
export function isThroughReference(
  reference: UEntityReference,
): reference is IThroughReference {
  return 'through' in reference;
}

/**
 * Value of one column of a row, read by the name the API contract declares.
 *
 * The server declares no fields of an entity, so a column the contract names is reached through the
 * row itself; this is the only place a row is cast to a plain record.
 *
 * @param column name of the column, taken from `references` of `config/api-fields.yml`
 * @returns the value, or `undefined` when the row has no such column
 */
export function columnOf(row: IEntity, column: string): unknown {
  return (row as unknown as Record<string, unknown>)[column];
}
