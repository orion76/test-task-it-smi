import type { ErrorObject } from 'ajv';

import type { TDescribeErrors } from './types';

/**
 * Default formatter: one line per violation, `<instancePath> <message>`, without repeats.
 *
 * Deliberately short. AJV reports every keyword it failed on, and digging into `anyOf`/`oneOf`
 * branches would multiply the text without adding a fact the config author needs. A caller that
 * wants dotted paths (`models.Profile.properties.nmae`) passes `describeErrors`.
 */
export const defaultDescribeErrors: TDescribeErrors = (errors) =>
  [...new Set(errors.map(describeError))].join('\n  ');

/** One violation as `<instancePath> <message>`; the root document is reported as `(root)`. */
function describeError(error: ErrorObject): string {
  const path = error.instancePath.length > 0 ? error.instancePath : '(root)';

  return `${path} ${error.message ?? 'is invalid'}`;
}
