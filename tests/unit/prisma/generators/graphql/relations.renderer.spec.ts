/**
 * `relations.resolver.ts` is generated from the datamodel plus the `references` block of the API
 * contract: a collection is answered by the batched `load`, a single relation by `loadOne`, and a
 * relation the contract does not publish is not rendered at all. The spec fixes those three facts,
 * because a wrong method or a missing filter would still compile and would only show up as N+1
 * queries or a leaked relation in the API.
 *
 * A collection of a dictionary has no field of its own in the schema: it is declared in the contract
 * under the name the API publishes and read through a tie table, so the renderer takes the shape of
 * the relation from the contract and not from the model.
 */
import type { DMMF } from '@prisma/generator-helper';

import { renderRelations } from '@generators/graphql/relations.renderer.mts';
import type { TReferenceRules } from '@generators/graphql/types.mts';
import { domainDatamodel, experienceModel, profileModel } from '../support/datamodel';

/** One rule of the contract, as the renderer reads it. */
type TRule = Record<string, unknown>;

/** `Model.field` → rule of the relation, as the contract writes it. */
type TContract = Record<string, Record<string, TRule>>;

/** The `references` of the real contract, reduced to what the renderer reads. */
const CONTRACT: TContract = {
  Profile: {
    links: {
      description: 'Ссылки владельца визитки',
      entity: 'socialLink',
      through: { entity: 'profileSocialLink', parent: 'profileId', target: 'socialLinkId' },
    },
    skills: {
      description: 'Навыки владельца визитки',
      entity: 'skill',
      through: { entity: 'profileSkill', parent: 'profileId', target: 'skillId' },
    },
    experience: {
      description: 'Места работы владельца визитки',
      entity: 'experience',
      property: 'profileId',
    },
    projects: {
      description: 'Проекты владельца визитки',
      entity: 'project',
      property: 'profileId',
    },
  },
  Experience: {
    profile: {
      description: 'Владелец визитки, которому принадлежит место работы',
      entity: 'profile',
      property: 'profileId',
    },
  },
  Project: {
    profile: {
      description: 'Владелец визитки, которому принадлежит проект',
      entity: 'profile',
      property: 'profileId',
    },
  },
};

/** Turns the contract fixture into the lookup the renderer takes. */
function referencesOf(contract: TContract): Map<string, TReferenceRules> {
  const references = new Map<string, TReferenceRules>();

  for (const [model, fields] of Object.entries(contract)) {
    references.set(model, { ...fields });
  }

  return references;
}

const models: ReadonlyArray<DMMF.Model> = domainDatamodel().models;
const references = referencesOf(CONTRACT);

describe('renderRelations', () => {
  it('renders a collection with load and a single relation with loadOne', () => {
    const source = renderRelations(models, references);

    expect(source).toContain(
      "@ResolveField(() => [SocialLink], { description: 'Ссылки владельца визитки' })",
    );
    expect(source).toContain('links(@Parent() row: IEntity): Promise<IEntity[]> {');
    expect(source).toContain("return this.loader.load(row, 'links');");
    expect(source).toContain(
      'profile(@Parent() row: IEntity): Promise<IEntity | null> {',
    );
    expect(source).toContain("return this.loader.loadOne(row, 'profile');");
  });

  it('reads the shape of a dictionary collection from the through-form of the contract', () => {
    const source = renderRelations(models, references);

    expect(source).toContain('@ResolveField(() => [Skill], {');
    expect(source).toContain('skills(@Parent() row: IEntity): Promise<IEntity[]> {');
    expect(source).not.toContain("this.loader.loadOne(row, 'skills')");
  });

  it('matches the return type to the shape of the relation, not to the target model', () => {
    const source = renderRelations(
      [experienceModel(), profileModel()],
      referencesOf({ Experience: CONTRACT.Experience }),
    );

    expect(source).toContain('@ResolveField(() => Profile, {');
    expect(source).toContain('Promise<IEntity | null>');
    expect(source).not.toContain('Promise<IEntity[]>');
    expect(source).not.toContain('this.loader.load(');
  });

  it('does not render a relation the contract does not publish', () => {
    const partial = referencesOf({
      Profile: { links: CONTRACT.Profile.links, projects: CONTRACT.Profile.projects },
    });
    const source = renderRelations(models, partial);

    expect(source).toContain('links(@Parent()');
    expect(source).toContain('projects(@Parent()');
    expect(source).not.toContain('skills(@Parent()');
    expect(source).not.toContain('experience(@Parent()');
  });

  it('leaves out a model whose relations are all unpublished', () => {
    const partial = referencesOf({
      Profile: { links: CONTRACT.Profile.links },
      Experience: { profile: CONTRACT.Experience.profile },
    });
    const source = renderRelations(models, partial);

    expect(source).toContain('export class ProfileRelationsResolver');
    expect(source).toContain('export class ExperienceRelationsResolver');
    expect(source).not.toContain('export class SkillRelationsResolver');
    expect(source).not.toContain('export class SocialLinkRelationsResolver');
    expect(source).not.toContain('export class ProjectRelationsResolver');
  });

  it('renders classes in model order and methods in field order', () => {
    const source = renderRelations(models, references);
    const classes = [...source.matchAll(/export class (\w+)/g)].map((match) => match[1]);

    expect(classes).toEqual([
      'ExperienceRelationsResolver',
      'ProfileRelationsResolver',
      'ProjectRelationsResolver',
    ]);
    expect(source.indexOf('experience(@Parent()')).toBeLessThan(
      source.indexOf('links(@Parent()'),
    );
    expect(source.indexOf('links(@Parent()')).toBeLessThan(
      source.indexOf('projects(@Parent()'),
    );
    expect(source.indexOf('projects(@Parent()')).toBeLessThan(
      source.indexOf('skills(@Parent()'),
    );
  });

  it('does not depend on the order of the input, so the artifact is identical everywhere', () => {
    const straight = renderRelations(models, references);
    const reversedModels = [...models].reverse();
    const reversedContract = referencesOf(
      Object.fromEntries(Object.entries(CONTRACT).reverse()),
    );

    expect(renderRelations(reversedModels, references)).toBe(straight);
    expect(renderRelations(models, reversedContract)).toBe(straight);
  });

  it('imports every model the resolvers mention once, in name order', () => {
    const source = renderRelations(models, references);

    expect(source).toContain(
      "import { Experience, Profile, Project, Skill, SocialLink } from '../entities';",
    );
  });

  it('names the classes in the registration list and the file in the header', () => {
    const source = renderRelations(models, references);

    expect(source).toContain('config/api-fields.yml');
    expect(source).toContain('export const RELATION_RESOLVERS = [');
    expect(source.endsWith('\n')).toBe(true);
  });

  it('escapes the description of a relation', () => {
    const quoted = referencesOf({
      Experience: {
        profile: { description: "owner's profile \\ link", entity: 'profile', property: 'profileId' },
      },
    });
    const source = renderRelations([experienceModel(), profileModel()], quoted);

    expect(source).toContain("description: 'owner\\'s profile \\\\ link'");
  });
});
