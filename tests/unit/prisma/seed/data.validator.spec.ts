import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'yaml';

import { DataValidator } from '@seed/data/data.validator';
import type { IJsonSchema } from '@seed/schema/types';
import { SeedError } from '@seed/shared/seed.error';

import { PROJECT_ROOT } from '../../support/project-root';

/**
 * The validator is fed the real files: the schema is a YAML document (`config/profile-data.schema.yml`)
 * and the content is `data/profile.yml`, which is the single source of the expected structure. The
 * spec therefore never invents a document from scratch — it takes the real one and breaks one field,
 * so a failure points at the mutation and not at a hand-written fixture.
 *
 * Names, companies and links are not asserted: `data/profile.yml` is content the author replaces, so
 * the checks are about structure, paths of violations and the accepted alternatives.
 */

const SCHEMA_PATH = resolve(PROJECT_ROOT, 'config', 'profile-data.schema.yml');
const DATA_PATH = resolve(PROJECT_ROOT, 'data', 'profile.yml');

const schema = parse(readFileSync(SCHEMA_PATH, 'utf8')) as IJsonSchema;
const realDocument: unknown = parse(readFileSync(DATA_PATH, 'utf8'));
const validator = new DataValidator(schema);

/** The profile part of the real document, copied so a test can break one field. */
interface IProfile {
  name: string;
  description: string;
  links: Record<string, unknown>[];
  skills: Record<string, unknown>[];
  experience: Record<string, unknown>[];
  projects: Record<string, unknown>[];
}

interface IDocument {
  version: number;
  profile: IProfile;
}

/** Copies the real document, so a test mutates its own instance and not the shared one. */
function copyOfRealDocument(): IDocument {
  return structuredClone(realDocument) as IDocument;
}

/** Validates a mutation of the real document and returns the message of the violation. */
function violationOf(mutate: (document: IDocument) => void): string {
  const document = copyOfRealDocument();
  mutate(document);

  try {
    validator.validate(document);
  } catch (error) {
    if (error instanceof SeedError) {
      return error.message;
    }

    throw error;
  }

  throw new Error('expected the document to be rejected');
}

describe('DataValidator', () => {
  it('accepts the real data/profile.yml', () => {
    expect(() => validator.validate(copyOfRealDocument())).not.toThrow();
  });

  it('keeps the real content inside the structure the schema declares', () => {
    // The check is derived from both files: the schema names the required and the allowed properties
    // of an item, the data file supplies the items. Names and values are never asserted, because the
    // content belongs to the author.
    const document = copyOfRealDocument();
    const definitions = schema.$defs ?? {};

    for (const [collection, definitionName] of Object.entries(DEFINITION_OF)) {
      const definition = definitions[definitionName];
      const items = document.profile[collection as TCollectionName];

      expect(items.length).toBeGreaterThan(0);

      for (const item of items) {
        for (const required of definition.required ?? []) {
          expect(Object.keys(item)).toContain(required);
        }

        for (const key of Object.keys(item)) {
          expect(Object.keys(definition.properties ?? {})).toContain(key);
        }
      }
    }
  });

  it('reports an empty name with the path of the field', () => {
    const message = violationOf((document) => {
      document.profile.name = '';
    });

    expect(message).toBe('profile.name — must not be empty');
  });

  it('reports a URL that is not http(s) with the path of the field', () => {
    const message = violationOf((document) => {
      document.profile.links[0].url = 'ftp://example.com/card';
    });

    expect(message).toContain('profile.links[0].url');
    expect(message).toContain('^https?://');
  });

  it('reports a bare domain without a scheme with the path of the field', () => {
    const message = violationOf((document) => {
      document.profile.links[0].url = 'example.com/card';
    });

    expect(message).toContain('profile.links[0].url');
    expect(message).toContain('uri');
  });

  it('reports a period that ends before it starts', () => {
    const document = copyOfRealDocument();
    const startedAt = document.profile.experience[1].startedAt;
    const message = violationOf((draft) => {
      draft.profile.experience[1].endedAt = '2000-01-01';
    });

    expect(message).toBe(
      `profile.experience[1].endedAt — must not be earlier than ${String(startedAt)}`,
    );
  });

  it('accepts endedAt null, because the schema allows an open period', () => {
    const document = copyOfRealDocument();
    document.profile.experience[0].endedAt = null;

    expect(() => validator.validate(document)).not.toThrow();
  });

  it('accepts a record without endedAt', () => {
    const document = copyOfRealDocument();
    delete document.profile.experience[0].endedAt;

    expect(() => validator.validate(document)).not.toThrow();
  });

  it('reports a string that is not a calendar date with the path of the field', () => {
    // The value is rejected by the form alone: the message names the date alternative and the
    // `null` alternative of `endedAt`, so a validator that accepted any string would fail here.
    const message = violationOf((document) => {
      document.profile.experience[0].endedAt = '31.12.2020';
    });

    expect(message).toBe(
      'profile.experience[0].endedAt — must match one of: ' +
        'must be a string in the "date" format or must be null',
    );
  });

  it('reports an unknown kind of a link', () => {
    const message = violationOf((document) => {
      document.profile.links[0].kind = 'TWITTER';
    });

    expect(message).toBe(
      'profile.links[0].kind — must be one of: GITHUB, LINKEDIN, WEBSITE, OTHER',
    );
  });

  it('reports an unknown version of the format', () => {
    const message = violationOf((document) => {
      document.version = 2;
    });

    expect(message).toBe('version — must be equal to 1');
  });

  it('reports an unexpected property by its full path', () => {
    expect(
      violationOf((document) => {
        document.profile.links[0].isCurrent = true;
      }),
    ).toBe('profile.links[0].isCurrent — unexpected property "isCurrent"');
  });

  it('reports a missing required property by its full path', () => {
    expect(
      violationOf((document) => {
        delete document.profile.projects[0].name;
      }),
    ).toBe('profile.projects[0].name — missing required property "name"');
  });

  it('accepts the optional fields of a project', () => {
    const document = copyOfRealDocument();
    document.profile.projects[0].url = null;
    document.profile.projects[0].description = null;

    expect(() => validator.validate(document)).not.toThrow();
  });

  it('accepts a skill without a category', () => {
    const document = copyOfRealDocument();
    delete document.profile.skills[0].category;

    expect(() => validator.validate(document)).not.toThrow();
  });
});

/** `$defs` entry that describes one item of each collection of `profile`. */
const DEFINITION_OF = {
  links: 'socialLink',
  skills: 'skill',
  experience: 'experience',
  projects: 'project',
} as const;

/** Collection of `profile` whose items are described by one `$defs` entry. */
type TCollectionName = keyof typeof DEFINITION_OF;
