/**
 * `loadApiFields` turns `config/api-fields.yml` into the two lookups of the graphql generator: the
 * visibility allowlist (the `properties` of every model) and the description rules. The happy path
 * reads the real contract; the broken shapes need a broken file, and the reader takes no path — it
 * finds the project root from its own directory — so those cases run against a disposable copy of
 * the project in `.tmp/`, where the copy's contract is broken and the real one stays untouched.
 */
import { loadApiFields } from '@generators/nestgraphql/api-fields.reader.mts';

import { createTemporaryProject, failureOf } from '../../../support/temporary-project';
import type { ITemporaryProject } from '../../../support/types';

const HARNESS = 'harness.mts';

const HARNESS_SOURCE = `import { loadApiFields } from './prisma/generators/nestgraphql/api-fields.reader.mts';

try {
  const api = loadApiFields();
  console.log(JSON.stringify({ ok: true, value: api }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
}
`;

let project: ITemporaryProject;

beforeAll(() => {
  project = createTemporaryProject('api-fields-reader');
  project.write(HARNESS, HARNESS_SOURCE);
});

afterAll(() => {
  project.remove();
});

describe('loadApiFields', () => {
  it('collects the properties of every model into the allowlist, in contract order', () => {
    const api = loadApiFields();

    expect(api.allowedFields.Profile).toEqual(['id', 'name', 'description']);
    expect(api.allowedFields.SocialLink).toEqual(['id', 'label', 'url', 'kind']);
    expect(api.allowedFields.Skill).toEqual(['id', 'name', 'category']);
    expect(api.allowedFields.Experience).toEqual([
      'id',
      'company',
      'position',
      'startedAt',
      'endedAt',
      'finished',
      'achievements',
    ]);
    expect(api.allowedFields.Project).toEqual(['id', 'name', 'url', 'description']);
  });

  it('keeps the relations of a model out of the allowlist', () => {
    const api = loadApiFields();

    expect(api.allowedFields.Profile).not.toContain('links');
    expect(api.allowedFields.Profile).not.toContain('skills');
    expect(api.allowedFields.SocialLink).not.toContain('profile');
  });

  it('collects one description rule per documented field, in contract order', () => {
    const api = loadApiFields();

    expect(api.fieldDescriptions).toHaveLength(21);
    expect(api.fieldDescriptions[0]).toEqual({
      objectName: 'Profile',
      propertyName: 'id',
      description: 'Идентификатор',
    });
    expect(api.fieldDescriptions[20]).toEqual({
      objectName: 'Project',
      propertyName: 'description',
      description: 'Описание проекта; null — не указано',
    });
  });

  it('fails with the file name when the document has no models block', () => {
    project.write('config/api-fields.yml', 'version: 1\n');

    expect(failureOf(project.run(HARNESS, 'node'))).toBe(
      'config/api-fields.yml: "models" is required and must be a mapping of model names',
    );
  });

  it('fails with the path of a model whose properties are not a mapping', () => {
    project.write(
      'config/api-fields.yml',
      ['version: 1', 'models:', '  Profile:', '    description: Owner', ''].join('\n'),
    );

    expect(failureOf(project.run(HARNESS, 'node'))).toBe(
      'config/api-fields.yml: models.Profile.properties must be a mapping',
    );
  });

  it('fails with the file name when the YAML is broken', () => {
    project.write('config/api-fields.yml', 'version: 1\nmodels: [\n');

    const message = failureOf(project.run(HARNESS, 'node'));

    expect(message.startsWith('config/api-fields.yml: ')).toBe(true);
    expect(message).toContain('Flow sequence in block collection');
  });
});
