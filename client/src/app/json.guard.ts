/**
 * Narrowing helpers for the JSON that comes back from the API as `unknown`. They never throw:
 * a value of an unexpected shape turns into an empty string, `null` or an empty list, so the page
 * keeps rendering even when the response does not match the contract.
 */

/** True for a JSON object, false for `null`, arrays and primitives. */
export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The value as a list; anything else becomes an empty list. */
export function asJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The value as text; anything else becomes an empty string. */
export function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The value as text or `null`: JSON `null` and missing fields are the same for the view. */
export function asOptionalText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** The value as a list of JSON objects: the shape of every nested collection of the API. */
export function asJsonRecords(value: unknown): Record<string, unknown>[] {
  return asJsonArray(value).filter(isJsonRecord);
}
