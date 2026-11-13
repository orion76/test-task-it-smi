"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectRoot = projectRoot;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/**
 * Walks up from `searchFrom` to the first directory that holds a `package.json`, and returns it.
 *
 * `searchFrom` is required and checked at runtime, because the library cannot learn where the calling
 * module lies: its own `__dirname` points at `node_modules`, and the working directory is not the
 * project when the process starts elsewhere.
 *
 * @param searchFrom directory where the search starts (`__dirname` in CJS, `import.meta.dirname` in
 *   ESM)
 * @param searchBoundary optional upper limit of the search: it never goes above this directory
 * @returns absolute path of the project root
 * @throws Error when `searchFrom` is missing or lies outside `searchBoundary`, and when the search
 *   reaches the boundary or the file system root without a `package.json`
 */
function projectRoot(searchFrom, searchBoundary) {
    if (typeof searchFrom !== 'string' || searchFrom.trim().length === 0) {
        throw new Error('yaml-loader: searchFrom is required — pass the directory where the search for the project ' +
            'root starts (__dirname in CJS, import.meta.dirname in ESM)');
    }
    if (searchBoundary !== undefined && searchBoundary.trim().length === 0) {
        throw new Error('yaml-loader: searchBoundary must be a directory path — omit it to let the search go up ' +
            `to the file system root, or pass a directory above ${searchFrom}`);
    }
    const start = (0, node_path_1.resolve)(searchFrom);
    const boundary = searchBoundary === undefined ? undefined : (0, node_path_1.resolve)(searchBoundary);
    if (boundary !== undefined && !isWithin(start, boundary)) {
        throw new Error(`yaml-loader: searchFrom ${start} is outside searchBoundary ${boundary} — the search never ` +
            'goes above the boundary, so no project root can be found; pass a boundary above the start ' +
            'directory or omit it');
    }
    let directory = start;
    for (;;) {
        if ((0, node_fs_1.existsSync)((0, node_path_1.join)(directory, 'package.json'))) {
            return directory;
        }
        if (boundary !== undefined && directory === boundary) {
            throw new Error(`yaml-loader: no package.json between ${start} and searchBoundary ${boundary} — the ` +
                'project root lies above the boundary; raise it or omit it');
        }
        const parent = (0, node_path_1.dirname)(directory);
        if (parent === directory) {
            throw new Error(`yaml-loader: no package.json above ${start} — the search reached the file system root ` +
                'without searchBoundary; pass the directory of the calling module as searchFrom, not the ' +
                'working directory');
        }
        directory = parent;
    }
}
/**
 * Whether `directory` lies inside `boundary`, compared path-wise rather than by string prefix.
 *
 * `relative` answers with an empty string for the boundary itself (inside), with `..` or `../…` for
 * an ancestor directory (outside), and with an absolute path when the two share no common root
 * (outside). Hence `/app` is not inside `/application`, although `/application` starts with `/app`.
 */
function isWithin(directory, boundary) {
    const distance = (0, node_path_1.relative)(boundary, directory);
    if (distance === '') {
        return true;
    }
    return distance !== '..' && !distance.startsWith(`..${node_path_1.sep}`) && !(0, node_path_1.isAbsolute)(distance);
}
//# sourceMappingURL=project-root.js.map