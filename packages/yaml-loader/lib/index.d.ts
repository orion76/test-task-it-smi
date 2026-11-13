/**
 * `yaml-loader` loads a YAML config by a path relative to the project root and optionally validates it
 * against a JSON Schema. A relative value is resolved from the project root and an absolute one is
 * taken as is; JSON is a subset of YAML 1.2, so `.json` and `.yml` are read by the same parser.
 *
 * This barrel is the whole public API: a consumer imports `yaml-loader`, never an internal path.
 */
export { loadConfig } from './load-config';
export { projectRoot } from './project-root';
export type { ILoadConfigOptions, TDescribeErrors } from './types';
