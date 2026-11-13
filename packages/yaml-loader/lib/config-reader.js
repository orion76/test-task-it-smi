"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readYaml = readYaml;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const yaml_1 = require("yaml");
const error_message_1 = require("./error-message");
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
function readYaml(path, root) {
    const file = (0, node_path_1.isAbsolute)(path) ? path : (0, node_path_1.join)(root, path);
    try {
        return (0, yaml_1.parse)((0, node_fs_1.readFileSync)(file, 'utf8'));
    }
    catch (error) {
        throw new Error(`${path}: ${(0, error_message_1.toMessage)(error)}`, { cause: error });
    }
}
//# sourceMappingURL=config-reader.js.map