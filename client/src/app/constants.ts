import type { IOperationState } from './types';

/** Nothing has been sent yet, so both the result and the failure are empty. */
export const INITIAL_STATE: IOperationState = { status: 'idle', result: null, failure: null };
