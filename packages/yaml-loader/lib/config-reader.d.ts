/**
 * Reads a YAML document of the project and parses it: the only place of the package that catches an
 * I/O or parser failure. A relative path is resolved from the project root, an absolute one is taken
 * as is — a generated schema lives next to the compiled code, where only the `__dirname` of the
 * caller can name it.
 *
 * @param path path from the project root, e.g. `config/api-fields.yml`, or an absolute path
 * @param root absolute path of the project root, the base of a relative path
 * @returns the parsed document; the shape is not checked here
 * @throws Error naming the file when it cannot be read or parsed
 */
export declare function readYaml(path: string, root: string): unknown;
