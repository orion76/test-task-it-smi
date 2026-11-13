"use strict";
/**
 * `yaml-loader` loads a YAML config by a path relative to the project root and optionally validates it
 * against a JSON Schema. A relative value is resolved from the project root and an absolute one is
 * taken as is; JSON is a subset of YAML 1.2, so `.json` and `.yml` are read by the same parser.
 *
 * This barrel is the whole public API: a consumer imports `yaml-loader`, never an internal path.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectRoot = exports.loadConfig = void 0;
var load_config_1 = require("./load-config");
Object.defineProperty(exports, "loadConfig", { enumerable: true, get: function () { return load_config_1.loadConfig; } });
var project_root_1 = require("./project-root");
Object.defineProperty(exports, "projectRoot", { enumerable: true, get: function () { return project_root_1.projectRoot; } });
//# sourceMappingURL=index.js.map