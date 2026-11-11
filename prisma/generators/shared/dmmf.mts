/**
 * Helpers over the names of the datamodel and their order, shared by the generators.
 *
 * Prisma names a model `SocialLink` and its client delegate `socialLink`; both spellings appear in
 * the artifacts and in the configs, so the mapping lives in one place. The order is shared as well:
 * every generated file is committed, so it must be identical on every machine.
 */

/**
 * Name of the Prisma client delegate of a model: `SocialLink` → `socialLink`.
 * The same spelling is used by the `type` column of a row and by the contracts of the generators.
 */
export function delegateName(modelName: string): string {
  return modelName.replace(/^./, (first) => first.toLowerCase());
}

/** Locale-independent ordering: the generated files must be identical on every machine. */
export function compare(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
