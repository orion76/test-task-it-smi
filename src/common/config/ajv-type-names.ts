/**
 * Readable names of JSON Schema types, used by every AJV violation message of the application: AJV
 * reports the raw keyword value (`["string","null"]`), while a message reads better as a noun phrase
 * (`a string or null`).
 */
import { TYPE_NAMES } from './constants';

/** Names a JSON Schema type for a message: `string` becomes `a string`, `null` stays `null`. */
export function typeName(type: string): string {
  return TYPE_NAMES[type] ?? type;
}

/** Joins the allowed type names as `a string`, `a string or null`, `a string, a number or null`. */
export function joinTypeNames(names: string[]): string {
  if (names.length <= 1) {
    return names.join('');
  }

  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}
