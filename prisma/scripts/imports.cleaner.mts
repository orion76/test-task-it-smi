/**
 * Cleanup of the named imports of the generated `prisma-nestjs-graphql` sources: the generator
 * imports the GraphQL type of every field, including the ones it hides with `@HideField()`, and
 * `noUnusedLocals` fails the build on those imports. The module is pure — it never touches the file
 * system — so a test can feed it a source string.
 */
import { NAMED_IMPORT } from './constants.mts';
import type { IStripResult } from './types.mts';

/**
 * Removes the names a file imports but never uses.
 *
 * @param source content of one generated file
 * @returns the cleaned content and whether anything was removed
 */
export function stripUnusedImports(source: string): IStripResult {
  // Identifiers are searched in the file without its import lines, so an import does not count as
  // a usage of itself.
  const body = source.replace(NAMED_IMPORT, '');

  let changed = false;

  const cleaned = source.replace(
    NAMED_IMPORT,
    (line: string, typeKeyword: string | undefined, names: string, specifier: string): string => {
      const imported = names.split(',').map((name) => name.trim());
      const used = imported.filter((name) => new RegExp(`\\b${name}\\b`).test(body));

      if (used.length === imported.length) {
        return line;
      }

      changed = true;

      if (used.length === 0) {
        return '';
      }

      return `import ${typeKeyword ?? ''}{ ${used.join(', ')} } from ${specifier};`;
    },
  );

  return { cleaned, changed };
}
