import { loadConfig } from 'yaml-loader';

import { withContext } from '../shared/error-context';
import { isRecord } from '../shared/record';
import { SeedError } from '../shared/seed.error';
import {
  DEFAULT_CONFIG_PATH,
  DEFAULT_DATA_PATH,
  DEFAULT_SCHEMA_PATH,
  MODEL_KEYS,
} from './constants';
import type { IModelConfig, ISeedConfig } from './types';

/**
 * Reads the seed config: `SEED_CONFIG`, `SEED_SCHEMA` and `PROFILE_DATA_FILE` override the paths and
 * the `data` entry. A missing config is not an error (`optional: true`): the engine then follows the
 * schema alone and derives the service columns from the model names.
 */
export function loadSeedConfig(env: NodeJS.ProcessEnv = process.env): ISeedConfig {
  const configPath = env.SEED_CONFIG ?? DEFAULT_CONFIG_PATH;
  const schemaPath = env.SEED_SCHEMA ?? DEFAULT_SCHEMA_PATH;
  const document = loadConfig<unknown>(configPath, { searchFrom: __dirname, optional: true });

  if (document === undefined) {
    return {
      configPath,
      source: 'defaults',
      schemaPath,
      dataPath: env.PROFILE_DATA_FILE ?? DEFAULT_DATA_PATH,
      models: {},
    };
  }

  try {
    const config = parseConfig(document);
    const data = config.data;

    if (typeof data !== 'string' || data.length === 0) {
      throw new SeedError('"data" is required and must be a non-empty path');
    }

    return {
      configPath,
      source: 'file',
      schemaPath,
      dataPath: env.PROFILE_DATA_FILE ?? data,
      models: parseModels(config.models),
    };
  } catch (error) {
    throw withContext(configPath, error);
  }
}

/** Checks the shape of the parsed document; parsing and I/O already happened in `loadConfig`. */
function parseConfig(document: unknown): Record<string, unknown> {
  if (document === null || document === undefined) {
    return {};
  }

  if (!isRecord(document)) {
    throw new SeedError('the seed config must be a mapping');
  }

  return document;
}

function parseModels(value: unknown): Record<string, IModelConfig> {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new SeedError('"models" must be a mapping of model names');
  }

  const models: Record<string, IModelConfig> = {};

  for (const [name, entry] of Object.entries(value)) {
    if (!isRecord(entry)) {
      throw new SeedError(`models.${name} must be a mapping`);
    }

    for (const key of Object.keys(entry)) {
      if (!MODEL_KEYS.includes(key)) {
        throw new SeedError(
          `models.${name} has an unknown key "${key}"; allowed keys: ${MODEL_KEYS.join(', ')}`,
        );
      }
    }

    models[name] = {
      model: readField(`models.${name}.model`, () => optionalString(entry.model)),
      foreignKey: readField(`models.${name}.foreignKey`, () => optionalString(entry.foreignKey)),
      key: readField(`models.${name}.key`, () => optionalKey(entry.key)),
    };
  }

  return models;
}

/** Reads one field of a model entry, naming the field when the value is rejected. */
function readField<T>(context: string, read: () => T): T {
  try {
    return read();
  } catch (error) {
    throw withContext(context, error);
  }
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || value.length === 0) {
    throw new SeedError('must be a non-empty string');
  }

  return value;
}

function optionalKey(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new SeedError('must be a non-empty list of column names');
  }

  const columns = value.map((column) => {
    if (typeof column !== 'string' || column.length === 0) {
      throw new SeedError('must contain non-empty column names');
    }

    return column;
  });

  return columns;
}
