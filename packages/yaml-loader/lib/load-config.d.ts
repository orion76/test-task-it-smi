import type { ILoadConfigOptions } from './types';
/**
 * Reads `configPath` from the project root, parses it as YAML and validates it when `validate: true`
 * is passed; `validate: true` without `schemaPath` throws before any file is read.
 *
 * A missing file is an error, so an absent volume is never mistaken for an intentional absence.
 *
 * @param configPath path from the project root, e.g. `config/api-fields.yml`
 * @param options search start, optional boundary, `validate` with its `schemaPath` and the AJV
 *   options the validation needs
 * @returns the parsed document, typed by the caller
 * @throws Error naming the file when it cannot be read, parsed or validated
 */
export declare function loadConfig<T>(configPath: string, options: ILoadConfigOptions): T;
