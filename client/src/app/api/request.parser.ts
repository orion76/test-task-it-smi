import { parse } from 'graphql';
import type { DocumentNode } from 'graphql';
import { toErrorMessage } from './error.message';
import { RequestInputError } from './request-input.error';
import { isJsonRecord } from '../json.guard';
import type { IOperationRequest, IPageParams } from '../types';

/**
 * Builds a request from the free-form editor. Both a broken GraphQL document and broken JSON are
 * reported as `RequestInputError` before the request is sent, so the network is never touched and
 * the page keeps working.
 */
export function parseCustomRequest(
  documentSource: string,
  variablesSource: string,
): IOperationRequest {
  return {
    document: parseDocument(documentSource),
    variables: parseVariables(variablesSource),
  };
}

/**
 * Reads `limit` and `offset` of the `profiles` preset. Only the shape is checked here: whether the
 * page fits the 1..100 range is the server's decision, and its error is exactly what the manual
 * check wants to show.
 */
export function parsePageParams(limitSource: string, offsetSource: string): IPageParams {
  const limit = parseInteger(limitSource);
  const offset = parseInteger(offsetSource);
  if (limit === null || offset === null) {
    throw new RequestInputError('limit и offset должны быть целыми числами');
  }
  return { limit, offset };
}

function parseDocument(source: string): DocumentNode {
  try {
    return parse(source);
  } catch (error) {
    throw new RequestInputError(`Документ GraphQL не разобран: ${toErrorMessage(error)}`);
  }
}

function parseVariables(source: string): Record<string, unknown> {
  if (source.trim() === '') {
    return {};
  }
  const parsed: unknown = parseJson(source);
  if (!isJsonRecord(parsed)) {
    throw new RequestInputError('Переменные должны быть JSON-объектом');
  }
  return parsed;
}

function parseJson(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new RequestInputError(`JSON переменных не разобран: ${toErrorMessage(error)}`);
  }
}

function parseInteger(source: string): number | null {
  const value = Number(source.trim());
  return Number.isInteger(value) ? value : null;
}
