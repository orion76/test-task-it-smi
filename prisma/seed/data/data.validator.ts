import type { ErrorObject, ValidateFunction } from 'ajv';

import type { IJsonSchema } from '../schema/types';
import { toErrorMessage } from '../shared/error-message';
import { formatPath } from '../shared/path';
import { SeedError } from '../shared/seed.error';
import { AJV } from './constants';
import type { IDataValidator } from './types';
import { describeError, errorSegments, selectErrors } from './violation.messages';

/**
 * Validates the parsed data file against the JSON Schema read from disk; every message names the path
 * of the offending field, so a broken file fails the container start with an actionable message. The
 * file itself is named by the caller (`prisma/seed/main.ts`), which holds both paths.
 */
export class DataValidator implements IDataValidator {
  private readonly validateDocument: ValidateFunction;

  constructor(private readonly schema: IJsonSchema) {
    try {
      this.validateDocument = AJV.compile(schema);
    } catch (error) {
      throw new SeedError(`cannot compile the JSON Schema — ${toErrorMessage(error)}`, {
        cause: error,
      });
    }
  }

  /**
   * Validates the raw document.
   * @throws SeedError when the document does not match the schema.
   */
  validate(source: unknown): void {
    if (this.validateDocument(source)) {
      return;
    }

    throw new SeedError(this.buildErrorMessage(this.validateDocument.errors ?? []));
  }

  private buildErrorMessage(errors: ErrorObject[]): string {
    const violations = selectErrors(errors).map(
      (error) => `${formatPath(errorSegments(error))} — ${this.describe(error, errors)}`,
    );

    // The same field may be reported through nested alternatives; identical lines say nothing new,
    // so they are collapsed.
    return [...new Set(violations)].join('\n');
  }

  private describe(error: ErrorObject, errors: ErrorObject[]): string {
    return describeError(error, errors, this.schema);
  }
}
