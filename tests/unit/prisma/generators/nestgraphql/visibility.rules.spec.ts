/**
 * The `prisma-nestjs-graphql` generator publishes exactly the columns `config/api-fields.yml` lists
 * under `properties`: a listed column becomes a visible `@Field()`, anything else — service columns,
 * the `profileId` foreign keys, all `references` — is hidden with `@HideField()`. The rules are pure
 * functions of the contract, so the spec drives `shouldHideField` and `buildDecoratorRules` directly.
 *
 * The config module is not imported here on purpose: it reads the contract from the disk when its
 * module is evaluated, and the predicate must be testable without that side effect.
 */
import {
  buildDecoratorRules,
  shouldHideField,
} from '@generators/nestgraphql/visibility.rules.mts';
import { loadApiFields } from '@generators/nestgraphql/api-fields.reader.mts';
import type { IApiFields } from '@generators/nestgraphql/types.mts';

/** A field of one model type, as `prisma-nestjs-graphql` reports it to the predicate. */
interface IContractField {
  objectName: string;
  propertyName: string;
}

function field(objectName: string, propertyName: string): IContractField {
  return { objectName, propertyName };
}

describe('shouldHideField', () => {
  it('keeps a column listed in properties visible and hides everything else', () => {
    const allowedFields: Record<string, string[]> = {
      Profile: ['id', 'name', 'description'],
      Experience: ['achievements'],
    };

    expect(shouldHideField(field('Profile', 'name'), allowedFields)).toBe(false);
    expect(shouldHideField(field('Experience', 'achievements'), allowedFields)).toBe(false);
    // `links` is a relation of the `references` block, not a column: it must stay hidden.
    expect(shouldHideField(field('Profile', 'links'), allowedFields)).toBe(true);
  });

  it('hides a column of a model the contract does not list at all', () => {
    expect(
      shouldHideField(field('Ghost', 'name'), { Profile: ['name'] }),
    ).toBe(true);
  });

  it('hides the service columns the contract never publishes', () => {
    // The real allowlist comes from `properties` of the contract: the loader reads it as the
    // generator would, so the hidden set is the fact about the current contract, not a hand list.
    const { allowedFields } = loadApiFields();

    expect(shouldHideField(field('Profile', 'type'), allowedFields)).toBe(true);
    expect(shouldHideField(field('Profile', 'slug'), allowedFields)).toBe(true);
    expect(shouldHideField(field('Profile', 'createdAt'), allowedFields)).toBe(true);
    expect(shouldHideField(field('Profile', 'updatedAt'), allowedFields)).toBe(true);
    expect(shouldHideField(field('SocialLink', 'profileId'), allowedFields)).toBe(true);
    expect(shouldHideField(field('SocialLink', 'type'), allowedFields)).toBe(true);
    // The published columns of the same model are the opposite: visible.
    expect(shouldHideField(field('Profile', 'description'), allowedFields)).toBe(false);
    expect(shouldHideField(field('SocialLink', 'kind'), allowedFields)).toBe(false);
  });

  it('exposes only the properties of a model, never its references', () => {
    const { allowedFields } = loadApiFields();

    expect(allowedFields.Profile).toEqual(['id', 'name', 'description']);
    expect(allowedFields.Profile).not.toContain('links');
    expect(allowedFields.Profile).not.toContain('skills');
    for (const reference of ['links', 'skills', 'experience', 'projects']) {
      expect(shouldHideField(field('Profile', reference), allowedFields)).toBe(true);
    }
  });
});

describe('buildDecoratorRules', () => {
  const apiFields: IApiFields = {
    allowedFields: { Experience: ['company', 'achievements'], Profile: ['name'] },
    fieldDescriptions: [
      { objectName: 'Experience', propertyName: 'company', description: 'Компания' },
      { objectName: 'Experience', propertyName: 'achievements', description: 'Достижения' },
      { objectName: 'Profile', propertyName: 'name', description: 'Имя' },
    ],
  };

  it('starts with the default-drop rule for the models of the contract', () => {
    const [rule] = buildDecoratorRules(apiFields);

    expect(rule.match(field('Experience', 'type'))).toBe(true);
    expect(rule.match(field('Profile', 'name'))).toBe(true);
    expect(rule.match(field('Ghost', 'name'))).toBe(false);
    expect(rule.decoratorArguments).toEqual({ defaultValue: undefined });
  });

  it('declares the achievements list non-nullable', () => {
    const rules = buildDecoratorRules(apiFields);
    const scalarList = rules[1];

    expect(scalarList.match(field('Experience', 'achievements'))).toBe(true);
    expect(scalarList.match(field('Experience', 'company'))).toBe(false);
    expect(scalarList.decoratorArguments).toEqual({ nullable: false });
  });

  it('adds one description rule per documented field of the contract', () => {
    const rules = buildDecoratorRules(apiFields);
    const descriptions = rules.slice(2);

    expect(descriptions).toHaveLength(3);
    expect(descriptions[0]).toMatchObject({ decoratorArguments: { description: 'Компания' } });
    expect(descriptions[1]).toMatchObject({ decoratorArguments: { description: 'Достижения' } });
    expect(descriptions[2]).toMatchObject({ decoratorArguments: { description: 'Имя' } });
  });

  it('matches a description rule to a single field only', () => {
    const rules = buildDecoratorRules(apiFields);
    const company = rules[2];

    expect(company.match(field('Experience', 'company'))).toBe(true);
    expect(company.match(field('Experience', 'achievements'))).toBe(false);
    expect(company.match(field('Profile', 'name'))).toBe(false);
  });

  it('declares the rules in the same order for the same contract', () => {
    const first = buildDecoratorRules(apiFields);
    const second = buildDecoratorRules(apiFields);

    expect(second).toHaveLength(first.length);
    for (let index = 0; index < first.length; index += 1) {
      expect(second[index].decoratorArguments).toEqual(first[index].decoratorArguments);
    }
  });
});
