/**
 * Narrowing guard for plain objects coming from YAML: arrays and `null` are not mappings.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
