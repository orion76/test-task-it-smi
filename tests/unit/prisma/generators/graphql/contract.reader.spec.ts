/**
 * `readContract` is the only reader of `config/api-fields.yml` for the renderers: it turns the file
 * into the `references` of every model and the top-level `queries`. A missing block would silently
 * render no relations or no queries at all, so every broken shape must fail and name the file — the
 * error message is what tells the author which file to fix.
 *
 * The error cases need a broken contract, and the reader takes no path: it reads the project root
 * found from its own location. The spec therefore runs a copy of the project in `.tmp/` and breaks
 * the contract there, which leaves the real one untouched for the other specs of the run.
 */
import { readContract } from '@generators/graphql/contract.reader.mts';

import { createTemporaryProject, failureOf } from '../../../support/temporary-project';
import type { ITemporaryProject } from '../../../support/types';

const HARNESS = 'harness.mts';

const HARNESS_SOURCE = `import { readContract } from './prisma/generators/graphql/contract.reader.mts';

try {
  const contract = readContract();
  console.log(JSON.stringify({ ok: true, value: [...contract.references.keys()] }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
}
`;

let project: ITemporaryProject;

beforeAll(() => {
  project = createTemporaryProject('contract-reader');
  project.write(HARNESS, HARNESS_SOURCE);
});

afterAll(() => {
  project.remove();
});

describe('readContract', () => {
  it('reads the references of every model that declares them', () => {
    const contract = readContract();

    expect([...contract.references.keys()]).toEqual(['Profile', 'Experience', 'Project']);
    expect(Object.keys(contract.references.get('Profile') ?? {})).toEqual([
      'links',
      'skills',
      'experience',
      'projects',
    ]);
    // The reader hands the rule to the renderer as the YAML parser returned it: the shape of the
    // reference is the business of the build step, not of the renderer.
    expect(contract.references.get('Profile')?.links).toEqual({
      description: 'Ссылки владельца визитки',
      entity: 'socialLink',
      through: {
        entity: 'profileSocialLink',
        parent: 'profileId',
        target: 'socialLinkId',
      },
    });
    expect(contract.references.get('Experience')?.profile).toEqual({
      description: 'Владелец визитки, которому принадлежит место работы',
      entity: 'profile',
      property: 'profileId',
    });
  });

  it('reads the top-level queries with the fields the renderer uses', () => {
    const contract = readContract();

    expect(Object.keys(contract.queries)).toEqual(['profile', 'profiles']);
    expect(contract.queries.profile).toEqual({
      description: 'The business-card profile.',
      entity: 'profile',
      kind: 'one',
    });
    expect(contract.queries.profiles.kind).toBe('page');
  });

  it('leaves a model without a references block out of the lookup', () => {
    project.write(
      'config/api-fields.yml',
      ['version: 1', 'models:', '  Profile:', '    description: Owner', ''].join('\n'),
    );

    const result = project.run(HARNESS, 'node');

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual([]);
  });

  it('fails with the file name when the document has no models block', () => {
    project.write('config/api-fields.yml', 'version: 1\n');

    expect(failureOf(project.run(HARNESS, 'node'))).toBe(
      'config/api-fields.yml: "models" is required and must be a mapping of model names',
    );
  });

  it('fails with the file name when the YAML is broken', () => {
    project.write('config/api-fields.yml', 'version: 1\nmodels: [\n');

    const message = failureOf(project.run(HARNESS, 'node'));

    expect(message.startsWith('config/api-fields.yml: ')).toBe(true);
    expect(message).toContain('Flow sequence in block collection');
  });

  it('fails with the path of a references block that is not a mapping', () => {
    project.write(
      'config/api-fields.yml',
      ['version: 1', 'models:', '  Profile:', '    description: Owner', '    references: owner', ''].join(
        '\n',
      ),
    );

    expect(failureOf(project.run(HARNESS, 'node'))).toBe(
      'config/api-fields.yml: models.Profile.references must be a mapping',
    );
  });

  it('fails with the path of a query that is not a mapping', () => {
    project.write(
      'config/api-fields.yml',
      ['version: 1', 'queries:', '  profile: owner', 'models: {}', ''].join('\n'),
    );

    expect(failureOf(project.run(HARNESS, 'node'))).toBe(
      'config/api-fields.yml: queries.profile must be a mapping',
    );
  });
});
