import type { SchemaObject, ValidateFunction } from 'ajv';

import type { IEntityReference, TOrderBy } from '../contracts/types';

/**
 * Режим работы приложения, вычисленный из переменной NODE_ENV. Значения совпадают с `enum`
 * переменной в `config/environment.schema.yml` — там же и проверяется допустимость.
 */
type UNodeEnvironment = 'development' | 'production' | 'test';

/**
 * Validated application configuration: what `environment.validator.ts` returns after the values
 * have been coerced and the defaults filled in.
 *
 * Written by hand: `PORT` is a `number` here although the environment supplies a string.
 */
export interface IAppEnvironment {
  /** PostgreSQL connection string; required. */
  DATABASE_URL: string;
  /** HTTP port; `3000` when the variable is not set. */
  PORT: number;
  /** Application mode; `development` when the variable is not set. */
  NODE_ENV: UNodeEnvironment;
}

/**
 * The part of a variable schema the messages read back: the numeric bounds of the range.
 * The other keywords are not read, so they are accepted as-is through the index signature.
 */
interface IVariableSchema {
  minimum?: number;
  maximum?: number;
  [keyword: string]: unknown;
}

/** The schema document as the validator reads it: the variable rules, keyed by variable name. */
export interface IEnvironmentSchema extends SchemaObject {
  properties: Record<string, IVariableSchema>;
}

/**
 * The environment schema with its compiled validator: built once per process, because the schema is
 * static and read from disk on the first validation.
 */
export interface ICompiledEnvironmentValidator {
  schema: IEnvironmentSchema;
  validate: ValidateFunction;
}

/**
 * Relations of the models, as the API contract declares them: `references` of a model keyed by the
 * field name and indexed by the entity the field belongs to.
 *
 * The only place where the server learns how a row is connected to another row, so neither the
 * loader nor the repository names a column of its own.
 */
export type TReferencesByEntity = Map<string, Map<string, IEntityReference>>;

/**
 * The contract as the process keeps it: the `references` indexed by the entity the rows carry and
 * the read order of every model that declares one.
 */
export interface IContractIndex {
  readonly references: TReferencesByEntity;
  readonly orders: ReadonlyMap<string, TOrderBy>;
}
