import { readYaml } from './config-reader';
import { defaultDescribeErrors } from './error-formatter';
import { projectRoot } from './project-root';
import { validateDocument } from './schema-validator';
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
export function loadConfig<T>(configPath: string, options: ILoadConfigOptions): T {
  const schemaPath = validationSchemaPath(options);

  const root = projectRoot(options.searchFrom, options.searchBoundary);
  const document = readYaml(configPath, root);

  if (schemaPath !== undefined) {
    const errors = validateDocument(
      document,
      schemaPath,
      root,
      options.ajvOptions,
      options.formats,
    );

    if (errors !== null) {
      const report = options.describeErrors ?? defaultDescribeErrors;
      throw new Error(`${configPath}: ${report(errors, configPath)}`);
    }
  }

  return document as T;
}

/**
 * The schema to validate against, or `undefined` when the call does not validate the document.
 *
 * `validate: true` without `schemaPath` is a mistake of the call rather than a state of the file, so
 * it is reported here, before anything is read.
 *
 * @throws Error when `validate: true` comes without `schemaPath`
 */
function validationSchemaPath(options: ILoadConfigOptions): string | undefined {
  if (options.validate !== true) {
    return undefined;
  }

  if (options.schemaPath === undefined) {
    throw new Error('validate: true requires schemaPath');
  }

  return options.schemaPath;
}
