/**
 * The project root shared by the specs and the helpers of `tests/unit/`.
 *
 * The import goes to the package source (`@lib`) rather than to the built `packages/yaml-loader/lib`:
 * a spec must not depend on a build step, and `ts-jest` compiles the source anyway. The declaration
 * lives in its own module because `structure/` and `support/` both need it, and `projectRoot` is used
 * instead of a chain of `'..'`: the number of segments depends on the depth of the file and silently
 * changes the root when a spec moves.
 */
import { projectRoot } from '@lib';

/** Absolute path of the project root, found from this module rather than from the working directory. */
export const PROJECT_ROOT = projectRoot(__dirname);
