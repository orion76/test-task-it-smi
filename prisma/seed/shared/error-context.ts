import { toErrorMessage } from './error-message';
import { SeedError } from './seed.error';
import type { ISeedError } from './types';

/**
 * Adds the place of a failure to a message that was raised without it: the file (`config/x.yml`), the
 * element of the data file (`profile.skills[0]`) or the field of the config (`models.Skill.key`).
 *
 * The context is added once, by the caller that owns the path, so no path is carried down the call
 * chain for the sake of a message. The rest of the original error is kept as `cause`.
 */
export function withContext(context: string, error: unknown): ISeedError {
  const [head, ...rest] = toErrorMessage(error).split('\n');
  const lines = [`${context}: ${head}`, ...rest.map((line) => `  ${line}`)];

  return new SeedError(lines.join('\n'), { cause: error });
}
