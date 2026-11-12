import { loadConfig } from 'yaml-loader';

import { SeedError } from '../shared/seed.error';
import { toDisplayPath } from '../shared/path';
import { isJsonSchema } from './json-schema';
import type { IJsonSchema } from './types';

/**
 * Reads the JSON Schema from disk. The file is YAML, like every project config; the path is the
 * constant of the seed (`SCHEMA_FILE`), not an import.
 *
 * `yaml-loader` reads and parses the file (and names it in its errors); the shape is checked here,
 * because "a JSON Schema is an object" is a rule about the content, not about YAML.
 */
export function readSchema(filePath: string): IJsonSchema {
  const displayPath = toDisplayPath(filePath);
  const document = loadConfig<unknown>(filePath, { searchFrom: __dirname });

  if (!isJsonSchema(document)) {
    throw new SeedError(`${displayPath}: the JSON Schema must be an object`);
  }

  return document;
}
