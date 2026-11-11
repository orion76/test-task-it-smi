/**
 * `queries.resolver.ts` declares one `@Query` per entry of the contract: the name is the GraphQL
 * field, the entity chooses the table, and `kind` chooses the shape — a page takes `limit`/`offset`,
 * a single row takes no arguments. The behaviour lives in `EntityQueries`, so the spec checks the
 * declaration, which is the only thing the generator owns.
 */
import type { TContractNode } from '@generators/graphql/types.mts';
import { renderQueries } from '@generators/graphql/queries.renderer.mts';
import { domainDatamodel } from '../support/datamodel';

const models = domainDatamodel().models;

/** The `queries` block of the real contract, plus one query of another entity. */
const QUERIES: Record<string, TContractNode> = {
  profile: {
    description: 'The business-card profile.',
    entity: 'profile',
    kind: 'one',
  },
  profiles: {
    description: 'One page of business-card profiles.',
    entity: 'profile',
    kind: 'page',
  },
  socialLink: {
    description: 'One link of the profile owner.',
    entity: 'socialLink',
    kind: 'one',
  },
};

describe('renderQueries', () => {
  it('renders a page with the limit and offset arguments', () => {
    const source = renderQueries(models, QUERIES);

    expect(source).toContain(
      "@Query(() => [Profile], { description: 'One page of business-card profiles.' })",
    );
    expect(source).toContain('  profiles(');
    expect(source).toContain("    @Args('limit', PAGE_LIMIT_ARG) limit: number,");
    expect(source).toContain("    @Args('offset', PAGE_OFFSET_ARG) offset: number,");
    expect(source).toContain('  ): Promise<IEntity[]> {');
    expect(source).toContain("return this.findPage('profile', { limit, offset });");
  });

  it('renders a single row without arguments', () => {
    const source = renderQueries(models, QUERIES);

    expect(source).toContain(
      [
        "  @Query(() => Profile, { description: 'The business-card profile.' })",
        '  profile(): Promise<IEntity> {',
        "    return this.findOne('profile');",
        '  }',
      ].join('\n'),
    );
    expect(source).not.toContain('findOne(\'profile\',');
  });

  it('reads the table the contract names through its delegate name', () => {
    const source = renderQueries(models, QUERIES);

    expect(source).toContain('export class SocialLinkQueriesResolver extends EntityQueries {');
    expect(source).toContain("return this.findOne('socialLink');");
    expect(source).toContain('@Query(() => SocialLink, {');
  });

  it('skips a query over an entity no model declares', () => {
    const source = renderQueries(models, {
      ...QUERIES,
      ghost: { description: 'Nobody.', entity: 'ghost', kind: 'one' },
    });

    expect(source).not.toContain('ghost');
    expect(source).not.toContain('findOne(\'ghost\')');
  });

  it('groups the queries of one entity into one class ordered by query name', () => {
    const source = renderQueries(models, QUERIES);
    const classes = [...source.matchAll(/export class (\w+)/g)].map((match) => match[1]);

    expect(classes).toEqual(['ProfileQueriesResolver', 'SocialLinkQueriesResolver']);
    expect(source.indexOf('  profile(')).toBeLessThan(source.indexOf('  profiles('));
  });

  it('does not depend on the order of the input, so the artifact is identical everywhere', () => {
    const straight = renderQueries(models, QUERIES);
    const reversed = renderQueries([...models].reverse(), Object.fromEntries(
      Object.entries(QUERIES).reverse(),
    ));

    expect(reversed).toBe(straight);
  });

  it('escapes the description of a query', () => {
    const source = renderQueries(models, {
      profile: { description: "owner's profile \\ card", entity: 'profile', kind: 'one' },
    });

    expect(source).toContain("description: 'owner\\'s profile \\\\ card'");
  });

  it('registers the classes under the list name and ends the file with a newline', () => {
    const source = renderQueries(models, QUERIES);

    expect(source).toContain('config/api-fields.yml');
    expect(source).toContain('export const QUERY_RESOLVERS = [');
    expect(source).toContain('ProfileQueriesResolver');
    expect(source.endsWith('\n')).toBe(true);
  });
});
