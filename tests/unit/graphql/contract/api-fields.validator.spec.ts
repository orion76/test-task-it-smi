/**
 * `validateApiFields` checks `config/api-fields.yml` against the schema generated from
 * `schema.prisma` (`config/api-fields.schema.yml`): a model, a field, a column or an order key the
 * schema does not declare fails the build with the path inside the config, so a typo never silently
 * drops a field from the API.
 *
 * The happy path reads the real contract and schema in this process; every broken shape needs a
 * broken contract, which lives in a disposable copy of the project run by a harness in a child
 * process, so the real `config/api-fields.yml` is never edited.
 */
import { stringify } from 'yaml';

import { validateApiFields } from '@src/graphql/contract/api-fields.validator';

import { contractOf, createTemporaryProject, failureOf } from '../../support/temporary-project';
import type { ITemporaryProject } from '../../support/types';

const HARNESS = 'harness.ts';

const HARNESS_SOURCE = `import { validateApiFields } from './src/graphql/contract/api-fields.validator';

try {
  validateApiFields();
  console.log(JSON.stringify({ ok: true, value: null }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
}
`;

let project: ITemporaryProject;
let originalContract: Record<string, unknown>;

beforeAll(() => {
  project = createTemporaryProject('api-fields-validator');
  project.write(HARNESS, HARNESS_SOURCE);
  originalContract = JSON.parse(JSON.stringify(contractOf(project))) as Record<string, unknown>;
});

afterAll(() => {
  project.remove();
});

/** Writes a variant of the copy's contract: the original one with one object mutated. */
function writeContract(mutate: (document: Record<string, unknown>) => void): void {
  const document = JSON.parse(JSON.stringify(originalContract)) as Record<string, unknown>;

  mutate(document);
  project.write('config/api-fields.yml', yamlStringify(document));
}

/** The models of the contract as a mutable mapping, throwing when the shape is unexpected. */
function modelsOf(document: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const models = document.models;

  if (typeof models !== 'object' || models === null || Array.isArray(models)) {
    throw new Error('the fixture contract has no models block');
  }

  return models as Record<string, Record<string, unknown>>;
}

describe('validateApiFields', () => {
  it('accepts the valid contract', () => {
    expect(() => validateApiFields()).not.toThrow();
  });

  it('fails with the path of a misspelled field of a model', () => {
    writeContract((document) => {
      const profile = modelsOf(document).Profile;
      const properties = profile.properties;

      if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
        throw new Error('Profile has no properties block');
      }

      delete (properties as Record<string, unknown>).name;
      (properties as Record<string, unknown>).nmae = { description: 'Имя' };
    });

    const message = failureOf(project.run(HARNESS, 'ts-node'));

    expect(message.startsWith('config/api-fields.yml: ')).toBe(true);
    expect(message).toContain('models.Profile.properties.nmae');
  });

  it('fails with the path of a misspelled model name', () => {
    writeContract((document) => {
      const models = modelsOf(document);

      models.SocialLinkX = models.SocialLink;
      delete models.SocialLink;
    });

    const message = failureOf(project.run(HARNESS, 'ts-node'));

    expect(message).toContain('models.SocialLinkX');
  });

  it('fails with the path of a misspelled reference column', () => {
    writeContract((document) => {
      const references = modelsOf(document).Profile.references;

      if (typeof references !== 'object' || references === null) {
        throw new Error('Profile has no references block');
      }

      const links = (references as Record<string, unknown>).links;

      if (typeof links !== 'object' || links === null) {
        throw new Error('Profile has no links reference');
      }

      (links as Record<string, unknown>).property = 'profleId';
    });

    const message = failureOf(project.run(HARNESS, 'ts-node'));

    expect(message).toContain('models.Profile.references.links.property');
  });

  it('fails with the path of a misspelled order column', () => {
    writeContract((document) => {
      const order = modelsOf(document).Skill.order;

      if (!Array.isArray(order)) {
        throw new Error('Skill has no order block');
      }

      order[0] = { categry: 'asc' };
    });

    const message = failureOf(project.run(HARNESS, 'ts-node'));

    expect(message).toContain('models.Skill.order');
  });

  it('fails with the path of a query over an unknown table', () => {
    writeContract((document) => {
      const queries = document.queries;

      if (typeof queries !== 'object' || queries === null) {
        throw new Error('the fixture contract has no queries block');
      }

      (queries as Record<string, unknown>).ghost = {
        description: 'Nobody.',
        entity: 'ghost',
        kind: 'one',
      };
    });

    const message = failureOf(project.run(HARNESS, 'ts-node'));

    expect(message).toContain('queries.ghost');
  });

  it('fails with the file name when the contract has no models block', () => {
    project.write('config/api-fields.yml', 'version: 1\n');

    const message = failureOf(project.run(HARNESS, 'ts-node'));

    expect(message.startsWith('config/api-fields.yml: ')).toBe(true);
    expect(message).toContain('models');
  });

  it('fails with the file name when the YAML is broken', () => {
    project.write('config/api-fields.yml', 'version: 1\nmodels: [\n');

    const message = failureOf(project.run(HARNESS, 'ts-node'));

    expect(message.startsWith('config/api-fields.yml: ')).toBe(true);
    expect(message).toContain('Flow sequence in block collection');
  });
});

/** Serializes a document back to YAML; the loader parses the config, so the writer is symmetric. */
function yamlStringify(document: Record<string, unknown>): string {
  return stringify(document);
}
