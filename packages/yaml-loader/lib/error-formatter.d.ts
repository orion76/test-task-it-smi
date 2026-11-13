import type { TDescribeErrors } from './types';
/**
 * Default formatter: one line per violation, `<instancePath> <message>`, without repeats.
 *
 * Deliberately short. AJV reports every keyword it failed on, and digging into `anyOf`/`oneOf`
 * branches would multiply the text without adding a fact the config author needs. A caller that
 * wants dotted paths (`models.Profile.properties.nmae`) passes `describeErrors`.
 */
export declare const defaultDescribeErrors: TDescribeErrors;
