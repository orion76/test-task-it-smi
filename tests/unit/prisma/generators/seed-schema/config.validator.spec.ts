/**
 * Structural checks of the seed-schema config: a typo in the name of a model or a field, `null`
 * instead of a fragment and an unknown JSON Schema keyword are failures of the generation, because a
 * silently lost restriction is worse than a crash. The `assert*` functions take the datamodel or the
 * value they check, so the spec drives them directly; `assertConfig` runs against the real config of
 * the generator.
 */
import type { DMMF } from '@prisma/generator-helper';

import {
  assertConfig,
  assertDefinitionNames,
  assertFragment,
  assertOmittedFields,
  assertOverridable,
} from '@generators/seed-schema/config.validator.mts';
import {
  domainDatamodel,
  field,
  model,
  profileModel,
  socialLinkModel,
} from '../support/datamodel';

const CONFIG_FILE = 'prisma/generators/seed-schema/seed-schema.config.mts';
const datamodel = domainDatamodel();

/** The instance of one model, by name. */
function modelOf(name: string): DMMF.Model {
  const found = datamodel.models.find((entry) => entry.name === name);

  if (found === undefined) {
    throw new Error(`the fixture datamodel has no model ${name}`);
  }

  return found;
}

/** One field of one model, by name. */
function fieldOf(name: string, fieldName: string): DMMF.Field {
  const found = modelOf(name).fields.find((entry) => entry.name === fieldName);

  if (found === undefined) {
    throw new Error(`the model ${name} has no field ${fieldName}`);
  }

  return found;
}

describe('assertFragment', () => {
  it('accepts a well-formed fragment', () => {
    expect(() => assertFragment('definitions.httpUrl', { type: 'string' })).not.toThrow();
  });

  it('rejects null, an array and a scalar in the place of a fragment', () => {
    expect(() => assertFragment('definitions.httpUrl', null)).toThrow(
      `${CONFIG_FILE}: definitions.httpUrl: expected a mapping, got null`,
    );
    expect(() => assertFragment('definitions.httpUrl', ['string'])).toThrow(
      `${CONFIG_FILE}: definitions.httpUrl: expected a mapping, got an array`,
    );
    expect(() => assertFragment('definitions.httpUrl', 'string')).toThrow(
      `${CONFIG_FILE}: definitions.httpUrl: expected a mapping, got string`,
    );
  });

  it('rejects an empty fragment, which would add nothing', () => {
    expect(() => assertFragment('definitions.empty', {})).toThrow(
      `${CONFIG_FILE}: definitions.empty: an empty fragment adds nothing, remove it`,
    );
  });

  it('rejects an unknown JSON Schema keyword of a fragment', () => {
    expect(() => assertFragment('definitions.httpUrl', { typo: 'x' })).toThrow(
      `${CONFIG_FILE}: definitions.httpUrl: unknown JSON Schema keyword "typo"`,
    );
  });
});

describe('assertOverridable', () => {
  it('rejects a rule for a relation, which the import file never carries', () => {
    expect(() =>
      assertOverridable(modelOf('Experience'), fieldOf('Experience', 'profile'), new Set()),
    ).toThrow(
      `${CONFIG_FILE}: overrides."Experience.profile": a relation is not part of the import file, the row is nested under its parent`,
    );
  });

  it('rejects a rule for a column the omit list removes from every model', () => {
    expect(() =>
      assertOverridable(modelOf('Profile'), fieldOf('Profile', 'name'), new Set(['name'])),
    ).toThrow(
      `${CONFIG_FILE}: overrides."Profile.name": the column is omitted from the import file by "omit"`,
    );
  });

  it('accepts a rule for a plain column that is not omitted', () => {
    expect(() =>
      assertOverridable(modelOf('Profile'), fieldOf('Profile', 'name'), new Set()),
    ).not.toThrow();
  });
});

describe('assertOmittedFields', () => {
  it('rejects an omitted column no model of the datamodel declares', () => {
    expect(() => assertOmittedFields(datamodel.models, new Set(['ghost']))).toThrow(
      `${CONFIG_FILE}: omit: no model of the datamodel declares the field "ghost"`,
    );
  });

  it('accepts an omitted column that some model declares', () => {
    expect(() => assertOmittedFields(datamodel.models, new Set(['name']))).not.toThrow();
    expect(() => assertOmittedFields(datamodel.models, new Set(['id', 'type']))).not.toThrow();
  });
});

describe('assertDefinitionNames', () => {
  it('accepts shared definitions that take no delegate name of a model', () => {
    expect(() => assertDefinitionNames(datamodel.models)).not.toThrow();
  });

  it('rejects a shared definition that collides with the delegate name of a model', () => {
    // The config declares `definitions.httpUrl`; a model named `HttpUrl` would be the same
    // `$defs` key.
    const withHttpUrl = model('HttpUrl', [field({ name: 'url', type: 'String' })]);
    const models = [...datamodel.models, withHttpUrl];

    expect(() => assertDefinitionNames(models)).toThrow(
      `${CONFIG_FILE}: definitions.httpUrl: the name is taken by the model "HttpUrl"`,
    );
  });
});

describe('assertConfig', () => {
  it('accepts the real config of the generator', () => {
    expect(() => assertConfig()).not.toThrow();
  });
});

describe('auxiliary models of the fixture', () => {
  it('builds models and fields the assert functions can be driven with', () => {
    expect(profileModel().fields.length).toBeGreaterThan(0);
    expect(socialLinkModel().fields.length).toBeGreaterThan(0);
    expect(field({ name: 'x', type: 'String' }).kind).toBe('scalar');
  });
});
