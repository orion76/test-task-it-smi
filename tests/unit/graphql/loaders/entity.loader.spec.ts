import type DataLoader from 'dataloader';

import { referenceOf } from '@src/common/config/api-fields';
import { columnOf } from '@src/common/contracts/entity';
import type { IEntity, IEntityQueryPort, UEntityQuery } from '@src/common/contracts/types';
import { EntityLoader } from '@src/graphql/loaders/entity.loader';
import type { IEntityLoader, IBatchKey } from '@src/graphql/loaders/types';

/**
 * The loader is exercised without Nest and without a database: the port is the only collaborator,
 * so a double records the batches and answers from in-memory tables.
 *
 * The relations the loader resolves are not written in the spec: they come from the real
 * `config/api-fields.yml` through `referenceOf`, exactly as in the application. That is why the
 * fixtures use the entities and columns the config declares (`skill.profileId`, `socialLink.profileId`).
 */

/** Fixture row of `skill`: the columns the contract names for this table. */
interface ISkillRow extends IEntity {
  readonly profileId?: string | number;
  readonly name?: string;
}

/** Fixture row of `socialLink`: the columns the contract names for this table. */
interface ILinkRow extends IEntity {
  readonly profileId?: string | number;
  readonly label?: string;
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

const SKILL_A1: ISkillRow = { id: 'skill-a1', type: 'skill', profileId: 'profile-a', name: 'TypeScript' };
const SKILL_A2: ISkillRow = { id: 'skill-a2', type: 'skill', profileId: 'profile-a', name: 'Node.js' };
const SKILL_B1: ISkillRow = { id: 'skill-b1', type: 'skill', profileId: 'profile-b', name: 'GraphQL' };
const LINK_A1: ILinkRow = { id: 'link-a1', type: 'socialLink', profileId: 'profile-a', label: 'GitHub' };

/** Tables of the port double: the port returns them in this order, the loader must keep it. */
function tables(): Record<string, readonly IEntity[]> {
  return {
    skill: [SKILL_A2, SKILL_B1, SKILL_A1],
    socialLink: [LINK_A1],
  };
}

/** The private collection loader, so the batch key itself can be exercised. */
type TCollectionLoader = DataLoader<IBatchKey, IEntity[], string>;

function collectionsOf(loader: IEntityLoader): TCollectionLoader {
  return (loader as unknown as { collections: TCollectionLoader }).collections;
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

describe('EntityLoader', () => {
  it('reads the relations of the real api-fields config', () => {
    // The loader writes neither the table nor the column: both come from `config/api-fields.yml`
    // through `referenceOf`, so the spec pins the real contract instead of substituting the module.
    expect(referenceOf('profile', 'skills')).toEqual({ entity: 'skill', property: 'profileId' });
    expect(referenceOf('profile', 'links')).toEqual({
      entity: 'socialLink',
      property: 'profileId',
    });
    expect(referenceOf('skill', 'profile')).toEqual({ entity: 'profile', property: 'profileId' });
  });

  it('turns N nested requests of one type into a single query', async () => {
    const port = new RecordingPort(tables());
    const loader = new EntityLoader(port);

    const [a, b, c] = await Promise.all([
      loader.load(PROFILE_A, 'skills'),
      loader.load(PROFILE_B, 'skills'),
      loader.load(PROFILE_C, 'skills'),
    ]);

    expect(port.calls).toHaveLength(1);
    expect(port.calls[0].type).toBe('skill');
    expect(parentIdsOf(port.calls[0].query)).toEqual(['profile-a', 'profile-b', 'profile-c']);

    // The parent without children still gets a list: DataLoader rejects a batch that answers
    // `undefined` for a key, so the empty collection is mandatory, not cosmetic.
    expect(a).toEqual([SKILL_A2, SKILL_A1]);
    expect(b).toEqual([SKILL_B1]);
    expect(c).toEqual([]);
  });

  it('groups rows by the parent column in the order the port returned them', async () => {
    const port = new RecordingPort(tables());
    const loader = new EntityLoader(port);

    const [a, b] = await Promise.all([
      loader.load(PROFILE_A, 'skills'),
      loader.load(PROFILE_B, 'skills'),
    ]);

    expect(a?.map((row) => row.id)).toEqual(['skill-a2', 'skill-a1']);
    expect(b?.map((row) => row.id)).toEqual(['skill-b1']);
    expect(parentPropertyOf(port.calls[0].query)).toBe('profileId');
  });

  it('answers an empty list, not undefined, for a parent without children', async () => {
    const port = new RecordingPort(tables());
    const loader = new EntityLoader(port);

    const children = await loader.load(PROFILE_C, 'skills');

    expect(children).toEqual([]);
    expect(Array.isArray(children)).toBe(true);
  });

  it('keeps two entities of one tick in separate batches', async () => {
    const port = new RecordingPort(tables());
    const loader = new EntityLoader(port);

    const [skills, links] = await Promise.all([
      loader.load(PROFILE_A, 'skills'),
      loader.load(PROFILE_A, 'links'),
    ]);

    expect(port.calls).toHaveLength(2);
    expect(port.calls.map((call) => call.type).sort()).toEqual(['skill', 'socialLink']);
    expect(skills?.map((row) => row.id)).toEqual(['skill-a2', 'skill-a1']);
    expect(links).toEqual([LINK_A1]);
  });

  it('keeps one entity read through two columns in separate batches', async () => {
    // `config/api-fields.yml` declares one column per relation, so the public `load` cannot produce
    // two columns of one entity. The invariant still belongs to the loader: a batch key carries the
    // column, and a batch that mixed two columns would lose rows of the other one.
    const port = new RecordingPort(tables());
    const loader = new EntityLoader(port);
    const collections = collectionsOf(loader);

    await Promise.all([
      collections.load({ entity: 'skill', property: 'profileId', ids: ['profile-a'] }),
      collections.load({ entity: 'skill', property: 'ownerId', ids: ['profile-a'] }),
    ]);

    expect(port.calls).toHaveLength(2);
    expect(port.calls.map((call) => parentPropertyOf(call.query))).toEqual([
      'profileId',
      'ownerId',
    ]);
  });

  it('reads a single reference by the id stored in the row', async () => {
    const port = new RecordingPort({ ...tables(), profile: [PROFILE_A] });
    const loader = new EntityLoader(port);
    const skill: ISkillRow = { id: 'skill-a1', type: 'skill', profileId: 'profile-a' };

    const profile = await loader.loadOne(skill, 'profile');

    expect(profile).toEqual(PROFILE_A);
    expect(port.calls).toHaveLength(1);
    expect(port.calls[0].type).toBe('profile');
  });

  it('answers null for a missing reference without asking the port', async () => {
    const port = new RecordingPort(tables());
    const loader = new EntityLoader(port);
    const withoutParent: IEntity = { id: 'skill-orphan', type: 'skill' };
    const numericParent: ISkillRow = { id: 'skill-numeric', type: 'skill', profileId: 42 };

    await expect(loader.loadOne(withoutParent, 'profile')).resolves.toBeNull();
    await expect(loader.loadOne(numericParent, 'profile')).resolves.toBeNull();
    expect(port.calls).toHaveLength(0);
  });

  it('answers null when the referenced row does not exist', async () => {
    const port = new RecordingPort({ profile: [PROFILE_A] });
    const loader = new EntityLoader(port);
    const skill: ISkillRow = { id: 'skill-a9', type: 'skill', profileId: 'profile-missing' };

    await expect(loader.loadOne(skill, 'profile')).resolves.toBeNull();
    expect(port.calls).toHaveLength(1);
  });

  it('serves a repeated key from the cache within the same loader', async () => {
    const port = new RecordingPort(tables());
    const loader = new EntityLoader(port);

    const first = await loader.load(PROFILE_A, 'skills');
    const second = await loader.load(PROFILE_A, 'skills');

    expect(second).toBe(first);
    expect(port.calls).toHaveLength(1);

    // The same key requested twice in one tick is one request as well.
    const [third, fourth] = await Promise.all([
      loader.load(PROFILE_B, 'skills'),
      loader.load(PROFILE_B, 'skills'),
    ]);

    expect(fourth).toBe(third);
    expect(port.calls).toHaveLength(2);
  });

  it('serves a repeated reference from the cache within the same loader', async () => {
    const port = new RecordingPort({ profile: [PROFILE_A] });
    const loader = new EntityLoader(port);
    const skill: ISkillRow = { id: 'skill-a1', type: 'skill', profileId: 'profile-a' };

    const first = await loader.loadOne(skill, 'profile');
    const second = await loader.loadOne(skill, 'profile');

    expect(second).toBe(first);
    expect(port.calls).toHaveLength(1);
  });
});
