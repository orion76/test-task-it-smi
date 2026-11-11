/**
 * Renders an unknown thrown value as a single-line message for logs and error paths.
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
