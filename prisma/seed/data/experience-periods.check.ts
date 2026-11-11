import { formatPath } from '../shared/path';
import { isRecord } from '../shared/record';
import { SeedError } from '../shared/seed.error';
import { ENDED_AT, EXPERIENCE, FINISHED, PROFILE } from './experience-periods.constants';

/**
 * Checks the `finished`/`endedAt` pair of every employment record: `finished: true` requires the end
 * date, and a date in `endedAt` requires `finished: true`. A job lasting to this day carries neither,
 * so both are optional in the file. A document of an unexpected shape is not reported here — the
 * schema has already named the violation, and this rule only reads the parts that are present.
 *
 * @param source parsed content of `data/profile.yml`
 * @throws SeedError naming the path of the record inside the file and what has to be fixed
 */
export function assertExperiencePeriods(source: unknown): void {
  const records = experienceRecordsOf(source);

  for (const [index, record] of records.entries()) {
    if (!isRecord(record)) {
      continue;
    }

    // The path of the record is composed here, next to the index it comes from, and the file path is
    // added by the caller (`prisma/seed/main.ts`): every path appears once and no argument is threaded
    // down for the sake of a message.
    const path = formatPath([PROFILE, EXPERIENCE, String(index)]);
    const endedAt = record[ENDED_AT];
    const finished = record[FINISHED];
    const closed = endedAt !== undefined && endedAt !== null;

    if (finished === true && !closed) {
      throw new SeedError(
        `${path} — finished is true, so ${ENDED_AT} has to hold the end date: ` +
          'add the date or remove the flag of a current job',
      );
    }

    if (finished !== true && closed) {
      throw new SeedError(
        `${path} — ${ENDED_AT} is set, so the employment is over: ` +
          'add "finished: true" or remove the date of a current job',
      );
    }
  }
}

/** Employment records of the document, or an empty list when the document does not hold them. */
function experienceRecordsOf(source: unknown): unknown[] {
  if (!isRecord(source)) {
    return [];
  }

  const profile = source[PROFILE];

  if (!isRecord(profile)) {
    return [];
  }

  const records = profile[EXPERIENCE];

  return Array.isArray(records) ? records : [];
}
