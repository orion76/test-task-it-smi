import type { ErrorObject, Options } from 'ajv';

/**
 * Formats AJV errors into the text of the thrown error.
 *
 * `file` is the config path exactly as the caller spelled it. The default implementation formats the
 * paths only (`/name must be string`); `loadConfig` adds the `file: ` prefix itself, so a custom
 * formatter must not repeat it.
 */
export type TDescribeErrors = (errors: ErrorObject[], file: string) => string;

/**
 * Options of a `loadConfig` call: where the search for the project root starts, how far it may go,
 * whether the document is validated and whether a missing file is an error.
 */
export interface ILoadConfigOptions {
  /**
   * Directory where the search for the project root starts: `__dirname` in CJS,
   * `import.meta.dirname` in ESM. Required, because the library cannot learn it on its own.
   */
  searchFrom: string;
  /**
   * Optional upper limit of the search: the search never goes above this directory. There is no
   * default, deliberately: `os.homedir()` works for a local checkout and breaks in a container where
   * the project lives in `/app` while `HOME` is `/home/node`. The case is spelled out in
   * `project-root.ts`.
   */
  searchBoundary?: string;
  /**
   * Path of the schema to validate against: relative to the project root, or absolute when the
   * schema is a build artifact named from the `__dirname` of the calling module.
   *
   * Names the schema only: validation runs when `validate: true` is passed as well, so a schema path
   * without the flag leaves the document unchecked. Details in `schema-validator.ts`.
   */
  schemaPath?: string;
  /**
   * Turns validation on: the document is checked against `schemaPath`.
   *
   * Requires `schemaPath`; the pair is checked at runtime, so `validate: true` without a schema
   * throws before the file is read.
   */
  validate?: boolean;
  /** AJV options, merged over the default `{ allErrors: true }`; used by validation only. */
  ajvOptions?: Options;
  /** Register `ajv-formats` before compiling (uri, date, email, …); used by validation only. */
  formats?: boolean;
  /** Replaces the default message; receives the AJV errors and the file name. */
  describeErrors?: TDescribeErrors;
  /**
   * Treats a missing file as a normal state instead of an error: the call then returns `undefined`.
   *
   * The seed config is the case the mode exists for — `config/seed.config.yml` may be absent, and the
   * seed engine then follows the JSON Schema alone. Only a missing file (`ENOENT`) is swallowed; a
   * file that exists but cannot be read or parsed is still an error.
   */
  optional?: boolean;
}
