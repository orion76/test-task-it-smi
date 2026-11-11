/**
 * Constants shared by the generators of `prisma/generators`.
 *
 * Two generators read the same file — the API contract: the `graphql` one renders the declarations
 * of its relations and queries, the `nestgraphql` one decides which columns reach the schema. The
 * path is written here once, so the two cannot drift apart.
 */

/** The contract, relative to the project root: the same file the API validator checks. */
export const API_FIELDS_FILE = 'config/api-fields.yml';
