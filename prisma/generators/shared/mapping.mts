/**
 * Check of the shape of a value read from a document: the generators read YAML and JSON, where a
 * key may hold anything.
 */

/** `null`, arrays and scalars are not mappings, and reading a property off them is meaningless. */
export function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
