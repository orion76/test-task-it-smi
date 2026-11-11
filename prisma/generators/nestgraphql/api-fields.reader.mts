/**
 * Reads the API contract for the `prisma-nestjs-graphql` generator.
 *
 * A broken file fails here with its own name and the reason: the generic "Failed to load config file"
 * of the generator hides what is wrong inside, and a missing field would only show up as a silently
 * absent API field.
 */
import { loadConfig } from 'yaml-loader';

import { API_FIELDS_FILE } from '../shared/constants.mts';
import { isMapping } from '../shared/mapping.mts';
import type { IApiFieldDescription, IApiFields } from './types.mts';

/**
 * Turns the API contract into the two lookups the generator needs: which fields are visible and what
 * each of them means. Only `properties` reach GraphQL — a relation is hidden and resolved by a field
 * resolver through a DataLoader instead.
 *
 * @returns the visibility allowlist and the description rules, both keyed by model name
 */
export function loadApiFields(): IApiFields {
  const models = readModels();
  const allowedFields: Record<string, string[]> = {};
  const fieldDescriptions: IApiFieldDescription[] = [];

  for (const [objectName, model] of Object.entries(models)) {
    const properties = isMapping(model) ? model.properties : undefined;

    if (!isMapping(properties)) {
      throw new Error(`${API_FIELDS_FILE}: models.${objectName}.properties must be a mapping`);
    }

    allowedFields[objectName] = Object.keys(properties);

    for (const [propertyName, property] of Object.entries(properties)) {
      const description = isMapping(property) ? property.description : undefined;

      // Validating the descriptions is the job of the AJV step; here a field without one simply
      // gets no rule, so the generator still runs on a partially broken file.
      if (typeof description === 'string') {
        fieldDescriptions.push({ objectName, propertyName, description });
      }
    }
  }

  return { allowedFields, fieldDescriptions };
}

/** Reads the `models` block of the contract; `yaml-loader` reads and parses the file. */
function readModels(): Record<string, unknown> {
  const document = loadConfig<unknown>(API_FIELDS_FILE, { searchFrom: import.meta.dirname });
  const models = isMapping(document) ? document.models : undefined;

  if (!isMapping(models)) {
    throw new Error(
      `${API_FIELDS_FILE}: "models" is required and must be a mapping of model names`,
    );
  }

  return models;
}
