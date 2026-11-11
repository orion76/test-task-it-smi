import type { TOrderBy } from '../common/contracts/types';

/**
 * Ordering of a table the contract does not name: the primary key.
 *
 * The port accepts any table name, so an unknown one is a case to answer rather than to let the
 * database return rows in whatever order it finds them. This is a guard against an unknown name,
 * not a domain fact: every table of the domain declares its read order in `config/api-fields.yml`.
 */
export const ID_ORDER: TOrderBy = [{ id: 'asc' }];
