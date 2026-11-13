/**
 * Paths of the project configuration: the YAML a human edits lives in `config/` at the project root,
 * the artifacts of `prisma generate` — under `src/generated/`, the single root of the generated tree.
 *
 * A path is relative to the project root, not to the working directory: `yaml-loader` resolves it
 * from the root it finds by walking up from the `searchFrom` of the call.
 */

/** API contract: the fields that reach GraphQL, their relations and the read order. */
export const API_FIELDS_CONFIG_PATH = 'config/api-fields.yml';

/**
 * JSON Schema of the contract, written by the `apiFields` generator of `prisma generate`: an artifact
 * belongs to the generated tree (`src/generated/`), not to `config/`, which holds what a human edits.
 */
export const API_FIELDS_SCHEMA_PATH = 'src/generated/config/api-fields.schema.yml';

/** JSON Schema of the environment variables, read by `environment.validator.ts`. */
export const ENVIRONMENT_SCHEMA_PATH = 'config/environment.schema.yml';
