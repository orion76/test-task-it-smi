/**
 * Location of a column in the messages of the `seedSchema` generator: `Model.field`, the key of a
 * field fragment of the config.
 */
import type { DMMF } from '@prisma/generator-helper';

/** `Model.field` of a column: the key of a field fragment and the anchor of every message. */
export function location(model: DMMF.Model, field: DMMF.Field): string {
  return `${model.name}.${field.name}`;
}
