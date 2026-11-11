import type { IOperationResult, UOperationStatus } from './types';

/**
 * Status of a finished run. The runner never throws: any error is part of the result, so `success`
 * means a clean answer.
 */
export function toStatus(result: IOperationResult): UOperationStatus {
  return result.networkError !== null || result.errors.length > 0 ? 'error' : 'success';
}
