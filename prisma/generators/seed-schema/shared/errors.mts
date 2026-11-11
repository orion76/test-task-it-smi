/**
 * Failures of the `seedSchema` generator: a message names the artifact it came from, so a broken
 * config or datamodel points at the file that has to be fixed.
 */
import { CONFIG_FILE } from '../constants.mts';

/**
 * Fails for one column of the datamodel.
 *
 * The rule of a column is derived from the column alone — the model is not part of it — so the
 * message carries only what the derivation knows. The location of the column is added once by the
 * caller that knows the model (`buildProperty`), which turns the failure into a generator message.
 */
export function fail(message: string): never {
  throw new Error(message);
}

/** Fails with the path of the config: the reader has to know which file to fix. */
export function failConfig(message: string): never {
  throw new Error(`${CONFIG_FILE}: ${message}`);
}
