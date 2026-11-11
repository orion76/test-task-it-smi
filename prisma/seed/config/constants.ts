/**
 * Defaults used when the environment does not override the paths, and the keys a model entry may
 * contain. The configs live in `config/` at the project root and are read by `yaml-loader`, which
 * resolves a relative path from the project root and takes an absolute one as is.
 */

/** Seed config of the image: model names, service columns and natural keys. */
export const DEFAULT_CONFIG_PATH = 'config/seed.config.yml';

/** JSON Schema of the content file. */
export const DEFAULT_SCHEMA_PATH = 'config/profile-data.schema.yml';

/** Content file of the image (`/app/data`): resolved from the project root as well. */
export const DEFAULT_DATA_PATH = 'data/profile.yml';

/** Keys one entry of `models` may contain: anything else is a typo, not an ignored option. */
export const MODEL_KEYS = ['model', 'foreignKey', 'key'];
