import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'yaml';

import { assertExperiencePeriods } from '@seed/data/experience-periods.check';
import { SeedError } from '@seed/shared/seed.error';

/**
 * The check owns the one rule the JSON Schema cannot state: the relation between `finished` and
 * `endedAt` of an employment record. The spec feeds it the real `data/profile.yml` and breaks one
 * field at a time, so a failure points at the mutation and not at a hand-written fixture: companies
 * and positions belong to the author and are never asserted.
 *
 * A record of a current job carries neither the flag nor the date; a record of a finished job
 * carries both. The periods of two records may overlap, so the check never compares records.
 */

const PROJECT_ROOT = resolve(__dirname, '..', '..', '..', '..');
const DATA_PATH = resolve(PROJECT_ROOT, 'data', 'profile.yml');

const realDocument: unknown = parse(readFileSync(DATA_PATH, 'utf8'));

/** One employment record of the real document, with the fields the check reads. */
type TExperienceRecord = Record<string, unknown>;

/** The real document, copied so a test can break one field. */
interface IDocument {
  version: number;
  profile: { experience: TExperienceRecord[] };
}

/** Copies the real document, so a test mutates its own instance and not the shared one. */
function copyOfRealDocument(): IDocument {
  return structuredClone(realDocument) as IDocument;
}

/** Runs the check on a mutation of the real document and returns the message of the violation. */
function violationOf(mutate: (document: IDocument) => void): string {
  const document = copyOfRealDocument();
  mutate(document);

  try {
    assertExperiencePeriods(document);
  } catch (error) {
    if (error instanceof SeedError) {
      return error.message;
    }

    throw error;
  }

  throw new Error('expected the document to be rejected');
}

/** Message of a record that is flagged as over but holds no end date. */
function messageOfFinishedWithoutDate(path: string): string {
  return (
    `${path} — finished is true, so endedAt has to hold the end date: ` +
    'add the date or remove the flag of a current job'
  );
}

/** Message of a record that holds an end date without being flagged as over. */
function messageOfDateWithoutFinished(path: string): string {
  return (
    `${path} — endedAt is set, so the employment is over: ` +
    'add "finished: true" or remove the date of a current job'
  );
}

/** Whether the record holds an end date: a missing key and `null` both mean there is none. */
function hasEndDate(record: TExperienceRecord): boolean {
  return record.endedAt !== undefined && record.endedAt !== null;
}

describe('assertExperiencePeriods', () => {
  it('accepts the real data/profile.yml', () => {
    const document = copyOfRealDocument();

    // The real content has to exercise the rule, otherwise the acceptance proves nothing: it holds
    // more than one record, and every record that is flagged as over carries the end date.
    const records = document.profile.experience;
    expect(records.length).toBeGreaterThan(1);

    const finished = records.filter((record) => record.finished === true);
    expect(finished.length).toBeGreaterThan(0);
    expect(finished.every(hasEndDate)).toBe(true);

    expect(() => assertExperiencePeriods(document)).not.toThrow();
  });

  it('reports a finished job without an end date with the path of the record', () => {
    const message = violationOf((document) => {
      document.profile.experience[0].finished = true;
      delete document.profile.experience[0].endedAt;
    });

    expect(message).toBe(messageOfFinishedWithoutDate('profile.experience[0]'));
  });

  it('reports a finished job whose end date is null', () => {
    const message = violationOf((document) => {
      document.profile.experience[0].finished = true;
      document.profile.experience[0].endedAt = null;
    });

    expect(message).toBe(messageOfFinishedWithoutDate('profile.experience[0]'));
  });

  it('reports an end date on a record that carries no flag', () => {
    const message = violationOf((document) => {
      delete document.profile.experience[0].finished;
    });

    expect(message).toBe(messageOfDateWithoutFinished('profile.experience[0]'));
  });

  it('reports an end date on a record that is not flagged as finished', () => {
    const message = violationOf((document) => {
      document.profile.experience[0].finished = false;
    });

    expect(message).toBe(messageOfDateWithoutFinished('profile.experience[0]'));
  });

  it('accepts a current job that holds neither the flag nor the date', () => {
    const document = copyOfRealDocument();
    delete document.profile.experience[0].finished;
    delete document.profile.experience[0].endedAt;

    expect(() => assertExperiencePeriods(document)).not.toThrow();
  });

  it('names the index of the broken record, not the index of the first one', () => {
    const message = violationOf((document) => {
      document.profile.experience[2].finished = true;
      delete document.profile.experience[2].endedAt;
    });

    expect(message).toBe(messageOfFinishedWithoutDate('profile.experience[2]'));
  });

  it('says nothing about a document of an unexpected shape', () => {
    // The shape is the business of the schema: it names the violation first, and the rule only
    // reads the parts that are present.
    const documents: unknown[] = [
      null,
      [],
      'profile',
      {},
      { version: 1 },
      { version: 1, profile: null },
      { version: 1, profile: { experience: 'Vutlan' } },
      { version: 1, profile: { experience: [null] } },
    ];

    for (const document of documents) {
      expect(() => assertExperiencePeriods(document)).not.toThrow();
    }
  });
});
