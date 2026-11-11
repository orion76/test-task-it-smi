/**
 * Narrowing guard for plain objects coming from YAML: arrays and `null` are not mappings.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Row without the given columns: an upsert must not rewrite the columns it matches on. */
export function omit(
  row: Record<string, unknown>,
  columns: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([name]) => !columns.includes(name)));
}
