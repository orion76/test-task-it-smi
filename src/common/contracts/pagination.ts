/** Page size used when a client omits `limit`. */
export const PAGE_SIZE_DEFAULT = 10;

/**
 * Largest page a client may request.
 * A list is unbounded in the database, so a response has to be bounded explicitly: 100 records keep
 * the payload small while still allowing a client to read every row in a few pages.
 */
export const PAGE_SIZE_MAX = 100;

/** Offset used when a client omits `offset`. */
export const OFFSET_DEFAULT = 0;
