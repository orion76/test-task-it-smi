import type { ISeedError } from './types';

/**
 * Error raised by the seed engine: an unreadable, broken or inconsistent config, schema or data
 * file. The message names the location inside the input and a failed container start points at the
 * exact thing to fix; the file itself is named by the caller that holds its path, because the code
 * that noticed the problem knows only the place inside the document.
 */
export class SeedError extends Error implements ISeedError {
  override readonly name = 'SeedError' as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    Object.setPrototypeOf(this, SeedError.prototype);
  }
}
