/**
 * Splits the `overrides` block of the config into the fragments of models and of fields, and applies
 * a fragment over a derived rule.
 */
import type { DMMF } from '@prisma/generator-helper';

import { assertFragment, assertOverridable } from './config.validator.mts';
import config from './seed-schema.config.mts';
import { failConfig } from './shared/errors.mts';
import { location } from './shared/location.mts';
import type { IOverrides, TSchemaFragment } from './types.mts';

/**
 * Splits the `overrides` block into the fragments of models and the fragments of fields.
 *
 * Every key is checked against the datamodel: a model that does not exist, a field the model does not
 * declare, a relation or an omitted column would make the rule a no-op, so each of them is an error
 * instead of a silently lost restriction.
 *
 * @param models models of the DMMF datamodel
 * @param omitted columns the import file does not contain
 * @returns the fragments of models and of fields
 */
export function splitOverrides(
  models: readonly DMMF.Model[],
  omitted: ReadonlySet<string>,
): IOverrides {
  const modelFragments = new Map<string, TSchemaFragment>();
  const fieldFragments = new Map<string, TSchemaFragment>();

  for (const [key, fragment] of Object.entries(config.overrides)) {
    assertFragment(`overrides.${key}`, fragment);

    const parts = key.split('.');

    if (parts.length > 2 || parts.some((part) => part.length === 0)) {
      failConfig(`overrides."${key}": expected "Model" or "Model.field"`);
    }

    const model = models.find((candidate) => candidate.name === parts[0]);

    if (model === undefined) {
      failConfig(`overrides."${key}": the datamodel has no model "${parts[0]}"`);
    }

    if (parts.length === 1) {
      modelFragments.set(model.name, fragment);
      continue;
    }

    const field = model.fields.find((candidate) => candidate.name === parts[1]);

    if (field === undefined) {
      failConfig(`overrides."${key}": model "${model.name}" has no field "${parts[1]}"`);
    }

    assertOverridable(model, field, omitted);
    fieldFragments.set(location(model, field), fragment);
  }

  return { modelFragments, fieldFragments };
}

/**
 * Applies a fragment of the config over a derived rule.
 *
 * Existing keys keep their position, so a model fragment that replaces `description` does not move it
 * to the end of the definition; new keys are appended.
 *
 * @param target derived rule
 * @param fragment fragment of the config
 * @returns the target with the fragment applied
 */
export function applyFragment(
  target: TSchemaFragment,
  fragment: TSchemaFragment | undefined,
): TSchemaFragment {
  if (fragment === undefined) {
    return target;
  }

  for (const [key, value] of Object.entries(fragment)) {
    target[key] = value;
  }

  return target;
}
