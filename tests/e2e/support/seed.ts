import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

import type { ISeedDocument, ISeedProfile } from './types';

/** The data file is the source of truth of the content, so the expectations are read from it. */
const SEED_DATA_PATH = join(__dirname, '..', '..', '..', 'data', 'profile.yml');

/**
 * Reads the seeded content the API is expected to return.
 *
 * The specs compare the response with this file instead of hard-coding names or counts: the content
 * belongs to the author, and a change of `data/profile.yml` must update the expectations without
 * touching the tests.
 *
 * @returns the profile block of `data/profile.yml`
 */
export function readSeedProfile(): ISeedProfile {
  const document = parse(readFileSync(SEED_DATA_PATH, 'utf8')) as ISeedDocument;

  return document.profile;
}
