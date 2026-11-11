/**
 * The part of the tree the structural invariants read and the way they read it.
 *
 * The invariants of `tests/unit/structure/` — where a type may be declared, how many categories of
 * declarations one file may hold, how long a comment may be — must agree on what counts as a source:
 * a tree they scan differently would let a file pass one rule and disappear from another. The scope,
 * the exemptions and the listing of a directory therefore live here, and a spec keeps its detection.
 *
 * The scope is the one of the audit these specs replace (`.opencode/review/audit-structure.py`).
 */
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/** Absolute path of the project root, found from this module rather than from the working directory. */
export const PROJECT_ROOT = resolve(__dirname, '..', '..', '..', '..');

/**
 * Directory prefixes that are not hand-written modules: the generated artifacts, the build output
 * of the local library and the installed packages.
 */
export const GENERATED_PREFIXES = ['src/generated/', 'packages/yaml-loader/lib/'] as const;

/** Directories of the source scope, relative to the project root. The specs are not among them. */
export const SCOPE_ROOTS = ['src', 'prisma', 'packages/yaml-loader/src', 'client/src'] as const;

/** Name of the file a project-relative path ends with. */
export function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Whether the file is a spec: its types are test doubles, not the API of a module. */
export function isSpec(path: string): boolean {
  const name = fileNameOf(path);

  return name.endsWith('.spec.ts') || name.endsWith('-spec.ts');
}

/** Whether no rule applies to the file: an artifact, an ambient declaration, the bootstrap or a spec. */
export function isExempt(path: string): boolean {
  return (
    path.includes('node_modules/') ||
    GENERATED_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    path.endsWith('.d.ts') ||
    isSpec(path) ||
    fileNameOf(path) === 'main.ts'
  );
}

/** Source files under `directory`, relative to `root` and separated by `/`, in a stable order. */
export function sourceFilesOf(root: string, directory: string): string[] {
  const files = readdirSync(join(root, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .map((path) => path.split(sep).join('/'))
    .filter((path) => path.endsWith('.ts') || path.endsWith('.mts'));

  return files.sort();
}

/** Every module the invariants cover, relative to the project root. */
export function filesInScope(root: string): string[] {
  return SCOPE_ROOTS.flatMap((directory) => sourceFilesOf(root, directory)).filter(
    (path) => !isExempt(path),
  );
}
