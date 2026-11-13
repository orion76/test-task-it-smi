"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toMessage = toMessage;
/**
 * Renders an unknown thrown value as a single-line message for logs and error paths.
 */
function toMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=error-message.js.map