import type { DocumentNode } from 'graphql';

/**
 * Operation selectable in the panel: the three presets of the contract and the free-form mode.
 */
export type UOperationName = 'health' | 'profile' | 'profiles' | 'custom';

/** State of the current run; `idle` means nothing has been sent yet. */
export type UOperationStatus = 'idle' | 'loading' | 'success' | 'error';

/** One GraphQL error of the response, flattened for display. */
export interface IOperationError {
  message: string;
  /** Dotted path of the field that failed; empty when the server sent none. */
  path: string;
}

/**
 * Unified outcome of a request. The response payload stays `unknown` on purpose: a hand-written
 * copy of the contract would drift away from `config/api-fields.yml`, and the panel shows the
 * answer as JSON.
 */
export interface IOperationResult {
  data: unknown;
  errors: IOperationError[];
  networkError: string | null;
  durationMs: number;
}

/** A document with its variables, ready to be sent. */
export interface IOperationRequest {
  document: DocumentNode;
  variables: Record<string, unknown>;
}

/** Values of the `profiles` preset. */
export interface IPageParams {
  limit: number;
  offset: number;
}

/** Everything the page needs to render the current run. */
export interface IOperationState {
  status: UOperationStatus;
  result: IOperationResult | null;
  /** Message of a failure detected before the request was sent. */
  failure: string | null;
}

/**
 * Contract of a rejected input: an `Error` whose `name` tells the panel which failure it renders, so
 * the check of the request does not have to name the class.
 */
export interface IRequestInputError extends Error {
  readonly name: 'RequestInputError';
}
