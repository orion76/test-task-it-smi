import type DataLoader from 'dataloader';

import { referenceOf } from '@src/common/config/api-fields';
import { columnOf } from '@src/common/contracts/entity';
import type { IEntity, IEntityQueryPort, UEntityQuery } from '@src/common/contracts/types';
import { EntityLoader } from '@src/graphql/loaders/entity.loader';
import type { IEntityLoader, IThroughBatchKey } from '@src/graphql/loaders/types';

/**
 * The loader is exercised without Nest and without a database: the port is the only collaborator,
 * so a double records the batches and answers from in-memory tables.
 *
 * The relations the loader resolves are not written in the spec: they come from the real
 * `config/api-fields.yml` through `referenceOf`, exactly as in the application. A dictionary
 * collection is read through a tie table, so the fixtures keep two tables per collection — the ties
 * and the rows they name — and the spec counts the reads of both.
 */

/** Fixture row of `skill`: a dictionary row, shared between profiles. */
interface ISkillRow extends IEntity {
  readonly name?: string;
}

/** Fixture row of `socialLink`: a dictionary row, shared between profiles. */
interface ILinkRow extends IEntity {
  readonly label?: string;
}

/** Fixture row of `profileSkill`: the tie of one profile to one skill. */
interface ISkillTieRow extends IEntity {
  readonly profileId?: string;
  readonly skillId?: string;
}

/** Fixture row of `profileSocialLink`: the tie of one profile to one link. */
interface ILinkTieRow extends IEntity {
  readonly profileId?: string;
  readonly socialLinkId?: string;
}

/** One call the port recorded: the table and the query shape it was asked for. */
interface IFindCall {
  readonly type: string;
  readonly query: UEntityQuery;
}

/** Port double: records every batch and answers from the tables it was given. */
class RecordingPort implements IEntityQueryPort {
  readonly calls: IFindCall[] = [];

  constructor(private readonly tables: Readonly<Record<string, readonly IEntity[]>>) {}

  find(type: string, query: UEntityQuery = {}): Promise<IEntity[]> {
    this.calls.push({ type, query });

    const rows = this.tables[type] ?? [];

    if ('parentIds' in query) {
      return Promise.resolve(
        rows.filter((row) => query.parentIds.includes(String(columnOf(row, query.parentProperty)))),
      );
    }

    if ('ids' in query) {
      return Promise.resolve(rows.filter((row) => query.ids.includes(row.id)));
    }

    return Promise.resolve([...rows]);
  }
}

const PROFILE_A: IEntity = { id: 'profile-a', type: 'profile' };
const PROFILE_B: IEntity = { id: 'profile-b', type: 'profile' };
const PROFILE_C: IEntity = { id: 'profile-c', type: 'profile' };

const SKILL_NODE: ISkillRow = { id: 'skill-node', type: 'skill', name: 'Node.js' };
const SKILL_TS: ISkillRow = { id: 'skill-ts', type: 'skill', name: 'TypeScript' };
const SKILL_GQL: ISkillRow = { id: 'skill-gql', type: 'skill', name: 'GraphQL' };

const SKILL_TIE_A1: ISkillTieRow = {
  id: 'tie-a1',
  type: 'profileSkill',
  profileId: 'profile-a',
  skillId: 'skill-ts',
};
const SKILL_TIE_A2: ISkillTieRow = {
  id: 'tie-a2',
  type: 'profileSkill',
  profileId: 'profile-a',
  skillId: 'skill-node',
};
const SKILL_TIE_B1: ISkillTieRow = {
  id: 'tie-b1',
  type: 'profileSkill',
  profileId: 'profile-b',
  skillId: 'skill-gql',
};

const LINK_GITHUB: ILinkRow = { id: 'link-github', type: 'socialLink', label: 'GitHub' };
const LINK_TIE_A1: ILinkTieRow = {
  id: 'link-tie-a1',
  type: 'profileSocialLink',
  profileId: 'profile-a',
  socialLinkId: 'link-github',
};

/**
 * Tables of the port double: the port returns them in this order, the loader must keep it. The
 * skills come back in the order the second query sorts them, which is what the API publishes.
 */
function tables(): Record<string, readonly IEntity[]> {
  return {
    skill: [SKILL_NODE, SKILL_GQL, SKILL_TS],
    socialLink: [LINK_GITHUB],
    profileSkill: [SKILL_TIE_A1, SKILL_TIE_B1, SKILL_TIE_A2],
    profileSocialLink: [LINK_TIE_A1],
  };
}

/** The private through loader, so the batch key itself can be exercised. */
type TThroughLoader = DataLoader<IThroughBatchKey, IEntity[], string>;

function throughCollectionsOf(loader: IEntityLoader): TThroughLoader {
  return (loader as unknown as { throughCollections: TThroughLoader }).throughCollections;
}

/** Reads the column a batch was issued through, failing the test when the query is another shape. */
function parentPropertyOf(query: UEntityQuery): string {
  if (!('parentIds' in query)) {
    throw new Error('expected the port to be called with a collection query');
  }

  return query.parentProperty;
}

/** Ids of a collection request, so the batch composition can be asserted. */
function parentIdsOf(query: UEntityQuery): readonly string[] {
  if (!('parentIds' in query)) {
    throw new Error('expected the port to be called with a collection query');
  }

  return query.parentIds;
}

/** Ids of a reference request, so the second read of a through collection can be asserted. */
function idsOf(query: UEntityQuery): readonly string[] {
  if (!('ids' in query)) {
    throw new Error('expected the port to be called with an ids query');
  }

  return query.ids;
}

describe('EntityLoader', () => {
  it('reads the relations of the real api-fields config', () => {
    // The loader writes neither the table nor the column: both come from `config/api-fields.yml`
    // through `referenceOf`, so the spec pins the real contract instead of substituting the module.
    expect(referenceOf('profile', 'skills')).toEqual({
      entity: 'skill',
      through: { entity: 'profileSkill', parent: 'profileId', target: 'skillId' },
    });
    expect(referenceOf('profile', 'links')).toEqual({
      entity: 'socialLink',
      through: { entity: 'profileSocialLink', parent: 'profileId', target: 'socialLinkId' },
    });
    expect(referenceOf('experience', 'profile')).toEqual({
      entity: 'profile',
      property: 'profileId',
    });
  });

  it('turns N nested requests of one type into two queries: the ties and the rows', async () => {
    const port = new RecordingPort(tables());
    const loader = new EntityLoader(port);

    const [a, b, c] = await Promise.all([
      loader.load(PROFILE_A, 'skills'),
      loader.load(PROFILE_B, 'skills'),
      loader.load(PROFILE_C, 'skills'),
    ]);

    expect(port.calls).toHaveLength(2);
    expect(port.calls[0].type).toBe('profileSkill');
    expect(parentIdsOf(port.calls[0].query)).toEqual(['profile-a', 'profile-b', 'profile-c']);
    expect(port.calls[1].type).toBe('skill');
    // Every target id of the batch travels in one query, without repeats.
    expect([...idsOf(port.calls[1].query)].sort()).toEqual(['skill-gql', 'skill-node', 'skill-ts']);

    // The parent without ties still gets a list: DataLoader rejects a batch that answers
    // `undefined` for a key, so the empty collection is mandatory, not cosmetic.
    expect(a.map((row) => row.id)).toEqual(['skill-node', 'skill-ts']);
    expect(b.map((row) => row.id)).toEqual(['skill-gql']);
    expect(c).toEqual([]);
  });

  it('groups rows by the parent of the tie in the order the second query returned them', async () => {
    const port = new RecordingPort(tables());
    const loader = new EntityLoader(port);

    const [a, b] = await Promise.all([
      loader.load(PROFILE_A, 'skills'),
      loader.load(PROFILE_B, 'skills'),
    ]);

    // The skills table comes back as `node, gql, ts`, and the subsequence of one parent keeps
    // that order: nothing is sorted in memory.
    expect(a.map((row) => row.id)).toEqual(['skill-node', 'skill-ts']);
    expect(b.map((row) => row.id)).toEqual(['skill-gql']);
    expect(parentPropertyOf(port.calls[0].query)).toBe('profileId');
  });

  it('answers an empty list, not undefined, for a parent without a tie', async () => {
    const port = new RecordingPort(tables());
    const loader = new EntityLoader(port);

    const children = await loader.load(PROFILE_C, 'skills');

    expect(children).toEqual([]);
    expect(Array.isArray(children)).toBe(true);
  });

  it('keeps two collections of one tick in separate batches', async () => {
    const port = new RecordingPort(tables());
    const loader = new EntityLoader(port);

    const [skills, links] = await Promise.all([
      loader.load(PROFILE_A, 'skills'),
      loader.load(PROFILE_A, 'links'),
    ]);

    expect(port.calls.map((call) => call.type).sort()).toEqual([
      'profileSkill',
      'profileSocialLink',
      'skill',
      'socialLink',
    ]);
    expect(skills.map((row) => row.id)).toEqual(['skill-node', 'skill-ts']);
    expect(links).toEqual([LINK_GITHUB]);
  });

  it('keeps one entity read through two tie tables in separate batches', async () => {
    // A dictionary row is reached through the tie table of the collection that names it; a batch
    // that mixed two tables would read the wrong columns.
    const port = new RecordingPort(tables());
    const loader = new EntityLoader(port);
    const through = throughCollectionsOf(loader);
    const throughSkill = { entity: 'profileSkill', parent: 'profileId', target: 'skillId' };
    const throughOwner = { entity: 'profileSkill', parent: 'skillId', target: 'profileId' };

    await Promise.all([
      through.load({ entity: 'skill', through: throughSkill, ids: ['profile-a'] }),
      through.load({ entity: 'profile', through: throughOwner, ids: ['skill-ts'] }),
    ]);

    expect(port.calls).toHaveLength(4);
    expect(port.calls.map((call) => call.type).sort()).toEqual([
      'profile',
      'profileSkill',
      'profileSkill',
      'skill',
    ]);
  });

  it('reads a single reference by the id stored in the row', async () => {
    const port = new RecordingPort({ ...tables(), profile: [PROFILE_A] });
    const loader = new EntityLoader(port);
    const experience: IEntity = { id: 'experience-a1', type: 'experience' };
    const row: IEntity = { ...experience, profileId: 'profile-a' } as IEntity;

    const profile = await loader.loadOne(row, 'profile');

    expect(profile).toEqual(PROFILE_A);
    expect(port.calls).toHaveLength(1);
    expect(port.calls[0].type).toBe('profile');
  });

  it('answers null for a missing reference without asking the port', async () => {
    const port = new RecordingPort(tables());
    const loader = new EntityLoader(port);
    const withoutParent: IEntity = { id: 'experience-orphan', type: 'experience' };
    const numericParent = {
      id: 'experience-numeric',
      type: 'experience',
      profileId: 42,
    } as unknown as IEntity;

    await expect(loader.loadOne(withoutParent, 'profile')).resolves.toBeNull();
    await expect(loader.loadOne(numericParent, 'profile')).resolves.toBeNull();
    expect(port.calls).toHaveLength(0);
  });

  it('answers null when the referenced row does not exist', async () => {
    const port = new RecordingPort({ profile: [PROFILE_A] });
    const loader = new EntityLoader(port);
    const row = {
      id: 'experience-a9',
      type: 'experience',
      profileId: 'profile-missing',
    } as unknown as IEntity;

    await expect(loader.loadOne(row, 'profile')).resolves.toBeNull();
    expect(port.calls).toHaveLength(1);
  });

  it('rejects a single reference declared through a tie table', () => {
    const port = new RecordingPort(tables());
    const loader = new EntityLoader(port);

    expect(() => loader.loadOne(PROFILE_A, 'skills')).toThrow(
      'profile.skills: the reference is read through a tie table, so it is a collection',
    );
    expect(port.calls).toHaveLength(0);
  });

  it('serves a repeated key from the cache within the same loader', async () => {
    const port = new RecordingPort(tables());
    const loader = new EntityLoader(port);

    const first = await loader.load(PROFILE_A, 'skills');
    const second = await loader.load(PROFILE_A, 'skills');

    expect(second).toBe(first);
    expect(port.calls).toHaveLength(2);

    // The same key requested twice in one tick is one request as well.
    const [third, fourth] = await Promise.all([
      loader.load(PROFILE_B, 'skills'),
      loader.load(PROFILE_B, 'skills'),
    ]);

    expect(fourth).toBe(third);
    expect(port.calls).toHaveLength(4);
  });

  it('serves a repeated reference from the cache within the same loader', async () => {
    const port = new RecordingPort({ profile: [PROFILE_A] });
    const loader = new EntityLoader(port);
    const row = {
      id: 'experience-a1',
      type: 'experience',
      profileId: 'profile-a',
    } as unknown as IEntity;

    const first = await loader.loadOne(row, 'profile');
    const second = await loader.loadOne(row, 'profile');

    expect(second).toBe(first);
    expect(port.calls).toHaveLength(1);
  });
});
