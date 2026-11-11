import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import type { IFormatEntry } from './types';

/**
 * The options are not interchangeable with the environment validator: `$data` is what resolves the
 * relative pointer of the date comparison, `verbose` is what `describeUnion` reads the alternatives
 * from, and `ajv-formats` brings both the `date` format and the comparison keyword.
 *
 * @returns the instance with the formats and the comparison keyword the data schema relies on
 */
export function createAjvInstance(): Ajv {
  const instance = new Ajv({ allErrors: true, $data: true, verbose: true });

  addFormats(instance);
  assertDateFormatCompare(instance);

  return instance;
}

/**
 * Guards the coupling between the date comparison and the registered formats: the comparison keyword
 * compares values only when the compared format defines a `compare` function, and `ajv-formats`
 * registers `date` together with it. The check runs before `compile`, so a lost registration becomes
 * one readable startup message instead of an AJV error raised while the schema is built.
 */
function assertDateFormatCompare(instance: Ajv): void {
  if (typeof compareFunctionOf(instance.formats.date) !== 'function') {
    throw new Error('ajv-formats did not register compare for date');
  }
}

/**
 * Returns the `compare` function of an AJV format entry, or `undefined` when the entry has none.
 * `formats` holds a union of the allowed shapes (`true`, a `RegExp`, a bare validator function or a
 * definition object), so the entry is narrowed to the part the check reads.
 */
function compareFunctionOf(format: unknown): unknown {
  if (typeof format !== 'object' || format === null) {
    return undefined;
  }

  const { compare } = format as IFormatEntry;

  return compare;
}
