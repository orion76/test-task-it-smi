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
export declare function projectRoot(searchFrom: string, searchBoundary?: string): string;
