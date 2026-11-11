import { CombinedGraphQLErrors, ServerError } from '@apollo/client';
import type { ErrorLike } from '@apollo/client';
import type { Apollo } from 'apollo-angular';
import type { DocumentNode, GraphQLFormattedError } from 'graphql';
import { firstValueFrom } from 'rxjs';
import { toErrorMessage } from './error.message';
import type { IOperationError, IOperationResult } from '../types';

/**
 * Runs one request and never throws: a GraphQL error, an unreachable backend and a broken response
 * all come back as fields of the result, so the panel always has something to show and the page
 * never gets stuck in the loading state.
 *
 * The duration covers the whole call, network round trip included — that is what the check measures.
 */
export async function runOperation(
  apollo: Apollo,
  document: DocumentNode,
  variables: Record<string, unknown>,
): Promise<IOperationResult> {
  const startedAt = performance.now();
  try {
    const response = await firstValueFrom(
      apollo.query<unknown, Record<string, unknown>>({
        query: document,
        variables,
        // The cache is already off in `defaultOptions`; the option is repeated here because this
        // function is the only place that must not read a previous answer.
        fetchPolicy: 'network-only',
      }),
    );
    const durationMs = performance.now() - startedAt;
    const error = response.error;
    if (error === undefined) {
      return { data: response.data ?? null, errors: [], networkError: null, durationMs };
    }
    return toFailureFromResult(error, response.data, durationMs);
  } catch (error) {
    return toFailure(error, performance.now() - startedAt);
  }
}

/**
 * With `errorPolicy: 'all'` the server answer is not thrown: the GraphQL errors arrive as the
 * `error` field of an otherwise successful result, which keeps the partial data available.
 */
function toFailureFromResult(
  error: ErrorLike,
  data: unknown,
  durationMs: number,
): IOperationResult {
  if (CombinedGraphQLErrors.is(error)) {
    return {
      data: error.data ?? data ?? null,
      errors: error.errors.map(toOperationError),
      networkError: null,
      durationMs,
    };
  }
  return toFailure(error, durationMs);
}

function toFailure(error: unknown, durationMs: number): IOperationResult {
  // The server answered with the `errors` field: the request itself worked, the data is missing.
  if (CombinedGraphQLErrors.is(error)) {
    return {
      data: error.data ?? null,
      errors: error.errors.map(toOperationError),
      networkError: null,
      durationMs,
    };
  }
  // A non-200 answer: the body is not a GraphQL response, so the status code is the useful part.
  if (ServerError.is(error)) {
    return {
      data: null,
      errors: [],
      networkError: `${error.message} (HTTP ${error.statusCode})`,
      durationMs,
    };
  }
  // Everything else comes from the link chain: an unreachable backend, a DNS failure, an aborted
  // request. The message of the thrown value is the whole story the user can act on.
  return { data: null, errors: [], networkError: toErrorMessage(error), durationMs };
}

function toOperationError(error: GraphQLFormattedError): IOperationError {
  return {
    message: error.message,
    path: error.path === undefined ? '' : error.path.map(String).join('.'),
  };
}
