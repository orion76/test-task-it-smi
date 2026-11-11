/**
 * Reader of the API contract for the renderers: it turns the YAML document into the `references` and
 * the `queries` the generated resolvers are built from, and fails with the path of a broken entry
 * instead of rendering nothing.
 */
import { loadConfig } from 'yaml-loader';

import { API_FIELDS_FILE } from '../shared/constants.mts';
import { isMapping } from '../shared/mapping.mts';
import type { IContract, TContractNode, TReferenceRules } from './types.mts';

/**
 * Reads the `references` of every model and the top-level `queries`, and nothing else: `entity` and
 * `property` of a reference are the loader's business and are checked by the build step.
 *
 * @returns the `references` and the `queries` of the contract
 */
export function readContract(): IContract {
  const document = loadConfig<unknown>(API_FIELDS_FILE, { searchFrom: import.meta.dirname });
  const models = isMapping(document) ? document.models : undefined;

  if (!isMapping(models)) {
    throw new Error(`${API_FIELDS_FILE}: "models" is required and must be a mapping of model names`);
  }

  const references = new Map<string, TReferenceRules>();

  for (const [modelName, model] of Object.entries(models)) {
    const block = isMapping(model) ? model.references : undefined;

    if (block === undefined) {
      continue;
    }

    if (!isMapping(block)) {
      throw new Error(`${API_FIELDS_FILE}: models.${modelName}.references must be a mapping`);
    }

    // The shape of a single rule is checked by the AJV step; here only `description` is read. An
    // entry that is not a mapping still fails here: the renderer reads a property off every rule, so
    // a scalar in its place is a broken contract rather than an empty relation.
    const rules: TReferenceRules = {};

    for (const [field, rule] of Object.entries(block)) {
      if (!isMapping(rule)) {
        throw new Error(
          `${API_FIELDS_FILE}: models.${modelName}.references.${field} must be a mapping`,
        );
      }

      rules[field] = rule;
    }

    references.set(modelName, rules);
  }

  const queries = isMapping(document) ? document.queries : undefined;
  const queryNodes: Record<string, TContractNode> = {};

  if (isMapping(queries)) {
    // Every query is a mapping of its own: the renderer reads `entity`, `kind` and `description` off
    // it, so anything else is a broken contract and must fail instead of rendering no queries.
    for (const [name, query] of Object.entries(queries)) {
      if (!isMapping(query)) {
        throw new Error(`${API_FIELDS_FILE}: queries.${name} must be a mapping`);
      }

      queryNodes[name] = query;
    }
  }

  return { references, queries: queryNodes };
}
