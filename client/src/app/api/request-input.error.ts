import type { IRequestInputError } from '../types';

/** Input that cannot become a request: the message is shown before anything is sent. */
export class RequestInputError extends Error implements IRequestInputError {
  override readonly name = 'RequestInputError' as const;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, RequestInputError.prototype);
  }
}
