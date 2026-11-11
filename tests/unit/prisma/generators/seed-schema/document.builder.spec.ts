/**
 * `config/profile-data.schema.yml` is generated from the datamodel plus the generator config, and it
 * is what the seed validates `data/profile.yml` against at startup. The structure — models, nesting,
 * required columns, scalar types, enum values, lists — has to come from the DMMF, and only what
 * Prisma cannot express (`format: date`, the null alternative of the end date, URL patterns) may
 * come from the config. A mix-up would accept a data file the database cannot store, or reject a
 * correct one.
 */
import { render } from '@generators/seed-schema/document.builder.mts';
import { domainDatamodel } from '../support/datamodel';
import { asDocument, asObject, at, entryAt, keysAt, refsOf } from '../support/json';

const source = render(domainDatamodel());
const document = asDocument(source);

describe('render', () => {
  it('starts with the header of the artifact and ends with one newline', () => {
    expect(source.startsWith('# config/profile-data.schema.yml')).toBe(true);
    expect(source.endsWith('\n')).toBe(true);
    expect(source.endsWith('\n\n')).toBe(false);
  });

  it('builds the root envelope from the config', () => {
    expect(at(document, '$schema')).toBe('http://json-schema.org/draft-07/schema#');
    expect(at(document, 'title')).toBe('ProfileData');
    expect(at(document, 'type')).toBe('object');
    expect(at(document, 'additionalProperties')).toBe(false);
    expect(at(document, 'required')).toEqual(['version', 'profile']);
    expect(at(document, 'properties', 'version', 'const')).toBe(1);
    expect(at(document, 'properties', 'profile', '$ref')).toBe('#/$defs/profile');
  });

  it('derives one definition per model, keyed by the delegate name', () => {
    expect(keysAt(document, '$defs')).toEqual([
      'httpUrl',
      'profile',
      'socialLink',
      'skill',
      'experience',
      'project',
    ]);
  });

  it('maps the scalar types of Prisma to the types of JSON Schema', () => {
    expect(at(document, '$defs', 'profile', 'properties', 'name')).toEqual({
      type: 'string',
      minLength: 1,
    });
    expect(at(document, '$defs', 'socialLink', 'properties', 'label')).toEqual({
      type: 'string',
      minLength: 1,
    });
    expect(at(document, '$defs', 'skill', 'properties', 'category')).toEqual({
      type: ['string', 'null'],
      description: 'Free-form grouping: "language", "backend", "database", …',
    });
  });

  it('turns an enum column into the values the datamodel declares', () => {
    expect(at(document, '$defs', 'socialLink', 'properties', 'kind')).toEqual({
      enum: ['GITHUB', 'LINKEDIN', 'WEBSITE', 'OTHER'],
      description: 'Kind of the link: one of the `SocialKind` values.',
    });
  });

  it('turns a scalar list into an array of items', () => {
    expect(at(document, '$defs', 'experience', 'properties', 'achievements')).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('derives required from the nullability and the default of the column', () => {
    expect(at(document, '$defs', 'experience', 'required')).toEqual([
      'company',
      'position',
      'startedAt',
      'achievements',
    ]);
    expect(at(document, '$defs', 'skill', 'required')).toEqual(['name']);
    expect(at(document, '$defs', 'project', 'required')).toEqual(['name']);
    expect(at(document, '$defs', 'profile', 'required')).toEqual([
      'slug',
      'name',
      'description',
      'links',
      'skills',
      'experience',
      'projects',
    ]);
  });

  it('takes the calendar date and the null alternative from the config, not from the datamodel', () => {
    expect(at(document, '$defs', 'experience', 'properties', 'startedAt')).toMatchObject({
      type: 'string',
      format: 'date',
    });
    expect(at(document, '$defs', 'experience', 'properties', 'endedAt')).toMatchObject({
      anyOf: [
        { type: 'string', format: 'date', formatMinimum: { $data: '1/startedAt' } },
        { type: 'null' },
      ],
    });
    expect(entryAt(document, '$defs', 'experience', 'properties', 'endedAt', 'anyOf', 1)).toEqual({
      type: 'null',
    });
  });

  it('applies the override of a field and of a model', () => {
    expect(at(document, '$defs', 'profile', 'properties', 'slug')).toMatchObject({
      type: 'string',
      pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
    });
    expect(at(document, '$defs', 'skill', 'description')).toBe(
      'Skill of the business card. `name` is the natural key of the idempotent upsert ' +
        'together with the profile id.',
    );
    expect(at(document, '$defs', 'socialLink', 'properties', 'url')).toEqual({
      $ref: '#/$defs/httpUrl',
    });
    expect(at(document, '$defs', 'project', 'properties', 'url')).toEqual({
      anyOf: [{ type: 'null' }, { $ref: '#/$defs/httpUrl' }],
    });
  });

  it('carries the shared definition of the config into $defs', () => {
    expect(at(document, '$defs', 'httpUrl')).toEqual({
      description:
        'Absolute http(s) URL with a scheme and a host. Relative links, bare domains and any other ' +
        'value are rejected with the path of the offending field.',
      type: 'string',
      format: 'uri',
      pattern: '^https?://',
    });
  });

  it('nests the models through references and never back into the model itself', () => {
    expect(at(document, '$defs', 'profile', 'properties', 'links', 'items', '$ref')).toBe(
      '#/$defs/socialLink',
    );
    // A single-valued relation is the inverse side of the parent link: the foreign key is derived
    // from the nesting, so the row of a collection does not carry its parent again.
    expect(at(document, '$defs', 'socialLink', 'properties', 'profile')).toBeUndefined();
    expect(at(document, '$defs', 'experience', 'properties', 'profile')).toBeUndefined();

    for (const name of Object.keys(asObject(at(document, '$defs')))) {
      expect(refsOf(at(document, '$defs', name))).not.toContain(`#/$defs/${name}`);
    }
  });

  it('omits the service columns of the row', () => {
    const columns = keysAt(document, '$defs', 'socialLink', 'properties');

    expect(columns).toEqual(['label', 'url', 'kind']);
    expect(columns).not.toContain('profileId');
    expect(columns).not.toContain('type');
    expect(columns).not.toContain('id');
  });

  it('renders the same document twice, so the committed artifact is stable', () => {
    expect(render(domainDatamodel())).toBe(source);
  });
});
