import { isRecord } from '../shared/record';
import type { IJsonSchema } from './types';

/** Narrowing guard for a parsed JSON Schema node: a mapping, not a scalar or an array. */
export function isJsonSchema(value: unknown): value is IJsonSchema {
  return isRecord(value);
}

/**
 * Resolves a local JSON Pointer (`#/$defs/<name>`) against the schema root.
 * References that leave the document are not resolved: the engine treats them as scalars.
 */
export function resolvePointer(root: IJsonSchema, ref: string): IJsonSchema | null {
  if (!ref.startsWith('#/')) {
    return null;
  }

  const segments = ref
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));

  let current: unknown = root;

  for (const segment of segments) {
    if (!isRecord(current)) {
      return null;
    }

    current = current[segment];
  }

  return isJsonSchema(current) ? current : null;
}

/** Name of the `$defs` entry a reference points at, or `null` for any other reference. */
export function defNameFromRef(ref: string): string | null {
  if (!ref.startsWith('#/$defs/')) {
    return null;
  }

  const name = ref.slice('#/$defs/'.length);

  if (name.length === 0 || name.includes('/')) {
    return null;
  }

  return name.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** A definition that describes an object is a model; anything else is a scalar. */
export function isObjectSchema(schema: IJsonSchema): boolean {
  return schema.type === 'object' || schema.properties !== undefined;
}

/** Alternatives of a `anyOf`/`oneOf` rule; an empty list when the schema is not a union. */
export function alternativesOf(schema: IJsonSchema): IJsonSchema[] {
  return schema.anyOf ?? schema.oneOf ?? [];
}
