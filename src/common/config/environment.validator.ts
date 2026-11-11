import type { ErrorObject } from 'ajv';
import { loadConfig } from 'yaml-loader';

import { joinTypeNames, typeName } from './ajv-type-names';
import { ENVIRONMENT_SCHEMA_PATH } from './config-paths';
import { AJV } from './constants';
import type {
  IAppEnvironment,
  ICompiledEnvironmentValidator,
  IEnvironmentSchema,
} from './types';

/**
 * Compiled validator of the environment, cached for the process: the schema is static and read from
 * disk on the first validation, while the AJV instance lives in `constants.ts`.
 */
let validator: ICompiledEnvironmentValidator | null = null;

/**
 * Validates the variables read from `.env` and the process environment (fail-fast).
 *
 * Runs inside `ConfigModule.forRoot({ validate })`, that is before the database connection is
 * opened: a broken configuration stops the start with a readable message instead of failing later
 * with `connection refused` from Prisma.
 *
 * @throws Error naming every broken variable, one line per violation.
 */
export function validateEnvironment(config: Record<string, unknown>): IAppEnvironment {
  const { schema, validate } = environmentValidator();

  if (!validate(config)) {
    throw new Error(buildErrorMessage(validate.errors ?? [], schema));
  }

  // AJV coerced the values in place (`PORT` is a number now) and filled in the defaults, so the
  // object that was validated is the configuration the application reads.
  // The cast is doubled because an `interface` has no implicit index signature, so the validated
  // `Record<string, unknown>` does not overlap with `IAppEnvironment` on its own.
  return config as unknown as IAppEnvironment;
}

/**
 * Reads and compiles `config/environment.schema.yml` on the first call. Reading is deferred on
 * purpose: the file is part of the project configuration, so a missing or broken file fails the
 * startup inside `bootstrap()`, where the error is logged, instead of failing the module import.
 */
function environmentValidator(): ICompiledEnvironmentValidator {
  if (validator === null) {
    const schema = readSchema();
    validator = { schema, validate: AJV.compile(schema) };
  }

  return validator;
}

/** Reads the YAML schema: reading, parsing and the error text are the loader's business. */
function readSchema(): IEnvironmentSchema {
  return loadConfig<IEnvironmentSchema>(ENVIRONMENT_SCHEMA_PATH, { searchFrom: __dirname });
}

/** Joins the violations into one line, dropping repeats: one violation reads as one message. */
function buildErrorMessage(errors: ErrorObject[], schema: IEnvironmentSchema): string {
  const messages = errors.map((error) => describeError(error, schema));

  return [...new Set(messages)].join('; ');
}

/** Turns an AJV error into a message that names the variable and what it expects. */
function describeError(error: ErrorObject, schema: IEnvironmentSchema): string {
  const name = variableName(error);
  const params = error.params as Record<string, unknown>;

  switch (error.keyword) {
    case 'required':
      return `${name} is required`;
    case 'minLength':
      // `DATABASE_URL: minLength 1` is the only such rule in the schema: an empty connection
      // string is as unusable as a missing one, so it reads the same as a missing variable.
      return `${name} is required`;
    case 'type':
      return `${name} must be ${joinTypeNames(typesOf(params).map(typeName))}${rangeSuffix(name, schema)}`;
    case 'minimum':
      return `${name} must be greater than or equal to ${String(params.limit)}`;
    case 'maximum':
      return `${name} must be less than or equal to ${String(params.limit)}`;
    case 'enum':
      return `${name} must be one of: ${(params.allowedValues as unknown[]).join(', ')}`;
    default:
      return `${name} ${error.message ?? 'is invalid'}`;
  }
}

/**
 * Names the variable a violation belongs to. `required` points at the parent object, so the key
 * comes from the keyword parameters; every other keyword points at the variable itself
 * (`/PORT` → `PORT`).
 */
function variableName(error: ErrorObject): string {
  if (error.keyword === 'required') {
    return String((error.params as Record<string, unknown>).missingProperty);
  }

  return error.instancePath.slice(1);
}

/**
 * Spells out the accepted range in a `type` message (`PORT must be an integer between 1 and
 * 65535`): a value that is not a number at all is checked against the range next, so the whole
 * constraint is reported at once.
 */
function rangeSuffix(name: string, document: IEnvironmentSchema): string {
  const schema = document.properties[name];

  if (schema?.minimum === undefined || schema.maximum === undefined) {
    return '';
  }

  return ` between ${String(schema.minimum)} and ${String(schema.maximum)}`;
}

/**
 * Types an AJV `type` violation rejected. The keyword parameter is a plain string for a single
 * type and an array for a union, so both shapes are normalized.
 */
function typesOf(params: Record<string, unknown>): string[] {
  const { type } = params;

  return (Array.isArray(type) ? type : [type]).map((item) => String(item));
}
