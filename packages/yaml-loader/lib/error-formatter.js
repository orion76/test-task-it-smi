"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultDescribeErrors = void 0;
/**
 * Default formatter: one line per violation, `<instancePath> <message>`, without repeats.
 *
 * Deliberately short. AJV reports every keyword it failed on, and digging into `anyOf`/`oneOf`
 * branches would multiply the text without adding a fact the config author needs. A caller that
 * wants dotted paths (`models.Profile.properties.nmae`) passes `describeErrors`.
 */
const defaultDescribeErrors = (errors) => [...new Set(errors.map(describeError))].join('\n  ');
exports.defaultDescribeErrors = defaultDescribeErrors;
/** One violation as `<instancePath> <message>`; the root document is reported as `(root)`. */
function describeError(error) {
    const path = error.instancePath.length > 0 ? error.instancePath : '(root)';
    return `${path} ${error.message ?? 'is invalid'}`;
}
//# sourceMappingURL=error-formatter.js.map