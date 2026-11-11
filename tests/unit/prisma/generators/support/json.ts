/**
 * Reading helpers for the JSON-shaped artifacts of the generators.
 *
 * A generator returns a JSON Schema document, and the document is typed on `Record<string,
 * unknown>` on purpose: it is data, so every level is unknown until a spec narrows it. These helpers
 * read a path and fail loudly when the expected level is not an object, which keeps an assertion to
 * one line instead of a chain of casts.
 */
import { parse } from 'yaml';

import type { TJsonObject } from './types';

/** Narrows a value to a JSON object, or fails with the type it actually had. */
export function asObject(value: unknown): TJsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`expected an object, got ${value === null ? 'null' : typeof value}`);
  }

  return value as TJsonObject;
}

/** Parses a YAML or JSON document into an unknown value: the shape is narrowed by the caller. */
export function asDocument(content: string): unknown {
  return parseYaml(content);
}

/** Value at the given path of a document; a number indexes an array. */
export function entryAt(document: unknown, ...keys: Array<string | number>): unknown {
  return keys.reduce<unknown>(
    (current, key) => (typeof key === 'number' ? asArray(current)[key] : asObject(current)[key]),
    document,
  );
}

/** Value at the given path of a document whose elements are objects. */
export function at(document: unknown, ...keys: string[]): unknown {
  return entryAt(document, ...keys);
}

/** Narrows a value to an array, or fails with what it actually was. */
function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`expected an array, got ${typeof value}`);
  }

  return value;
}

/** Keys of the object at the given path, in document order. */
export function keysAt(document: unknown, ...keys: string[]): string[] {
  return Object.keys(asObject(at(document, ...keys)));
}

/** Every `$ref` string found anywhere under a document, in document order. */
export function refsOf(document: unknown): string[] {
  if (Array.isArray(document)) {
    return document.flatMap((entry) => refsOf(entry));
  }

  if (typeof document !== 'object' || document === null) {
    return [];
  }

  return Object.entries(document).flatMap(([key, value]) =>
    key === '$ref' && typeof value === 'string' ? [value] : refsOf(value),
  );
}

function parseYaml(content: string): unknown {
  return parse(content);
}
