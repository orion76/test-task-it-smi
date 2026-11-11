/**
 * Message of an unknown thrown value: `catch` receives `unknown`, while the panel has to show text.
 * The value is read exactly where it is caught, so no context has to be threaded into helpers.
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Неизвестная ошибка';
}
