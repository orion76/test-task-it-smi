"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const config_reader_1 = require("./config-reader");
const error_formatter_1 = require("./error-formatter");
const project_root_1 = require("./project-root");
const schema_validator_1 = require("./schema-validator");
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
function loadConfig(configPath, options) {
    const schemaPath = validationSchemaPath(options);
    const root = (0, project_root_1.projectRoot)(options.searchFrom, options.searchBoundary);
    const document = (0, config_reader_1.readYaml)(configPath, root);
    if (schemaPath !== undefined) {
        const errors = (0, schema_validator_1.validateDocument)(document, schemaPath, root, options.ajvOptions, options.formats);
        if (errors !== null) {
            const report = options.describeErrors ?? error_formatter_1.defaultDescribeErrors;
            throw new Error(`${configPath}: ${report(errors, configPath)}`);
        }
    }
    return document;
}
/**
 * The schema to validate against, or `undefined` when the call does not validate the document.
 *
 * `validate: true` without `schemaPath` is a mistake of the call rather than a state of the file, so
 * it is reported here, before anything is read.
 *
 * @throws Error when `validate: true` comes without `schemaPath`
 */
function validationSchemaPath(options) {
    if (options.validate !== true) {
        return undefined;
    }
    if (options.schemaPath === undefined) {
        throw new Error('validate: true requires schemaPath');
    }
    return options.schemaPath;
}
//# sourceMappingURL=load-config.js.map