import type { ErrorObject, Options } from 'ajv';
/**
 * Validation of a parsed document against a JSON Schema, and the only place of the package that
 * knows AJV exists. The options are a parameter, because the callers need different policies: the API
 * contract keeps values as written, the environment coerces strings, the imported data reads sibling
 * values.
 */
/**
 * Applies the schema to the document and returns what failed.
 *
 * @param document parsed config
 * @param schemaPath path of the schema, relative to the project root or absolute
 * @param root absolute path of the project root, the base of a relative schema path
 * @param ajvOptions AJV options, merged over the default `{ allErrors: true }`
 * @param formats register `ajv-formats` before compiling (uri, date, email, …)
 * @returns the violations, or `null` when the document is valid — the contract of AJV itself, so a
 *   valid document and a document without errors are never confused
 * @throws Error naming the schema when it cannot be read or parsed
 */
export declare function validateDocument(document: unknown, schemaPath: string, root: string, ajvOptions?: Options, formats?: boolean): ErrorObject[] | null;
