/**
 * The single spelling of the Prisma delegate name inside the seed engine: Prisma names a model
 * `SocialLink` and its client delegate `socialLink`, and the writer addresses a table through the
 * delegate. The rule lives here once, so a message and a lookup cannot disagree about it.
 */

/** Name of the Prisma client delegate of a model: `SocialLink` → `socialLink`. */
export function delegateName(modelName: string): string {
  return modelName.replace(/^./, (first) => first.toLowerCase());
}
