/**
 * Converts a validated calendar date (`YYYY-MM-DD`, schema `format: "date"`) to the `Date` stored by
 * Prisma. The date has no time zone: it is parsed as midnight UTC, so the stored timestamp does not
 * depend on the container time zone.
 */
export function parseDateValue(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
