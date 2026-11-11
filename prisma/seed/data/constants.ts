/**
 * Constants of the seed data module: the AJV instance the validator compiles the schema with, the
 * depth limit of a nested alternative description and the primary key column of a model.
 */
import { createAjvInstance } from './ajv.setup';

/** Validator of the data file: the options and their reasoning live in `ajv.setup.ts`. */
export const AJV = createAjvInstance();

/** Depth limit of a nested alternative description: the schema is a document, not a puzzle. */
export const MAX_DESCRIPTION_DEPTH = 4;

/** Primary key of a model. Prisma models of the project use a single `id` column. */
export const ID_COLUMN = 'id';
