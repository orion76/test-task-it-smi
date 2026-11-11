import type { PrismaClient } from '@prisma/client';

import { orderOf } from '@src/common/config/api-fields';
import type { IEntity, IEntityQueryPort } from '@src/common/contracts/types';
import { EntityRepository } from '@src/db/entity.repository';
import type { IFindManyArgs } from '@src/db/types';

/**
 * The repository is tested on a substituted Prisma client: the spec asserts the arguments the
 * repository builds, which is the whole of its behaviour, and no database is needed for that.
 *
 * Only the delegate methods the repository calls are implemented (`findMany`), so the double also
 * proves that the data access of one read is a single query rather than a chain of calls.
 */

/** Fixture row of `profile`: the columns the contract names for this table. */
interface IProfileRow extends IEntity {
  readonly name?: string;
}

/** The delegate of one table, narrowed to the call the repository makes. */
interface IRecordingDelegate {
  findMany: (args: IFindManyArgs) => Promise<IEntity[]>;
}

/** Records the arguments of every read and answers with the rows it was given. */
interface IRecorder {
  readonly calls: IFindManyArgs[];
}

function recordingDelegate(recorder: IRecorder, rows: readonly IEntity[] = []): IRecordingDelegate {
  return {
    findMany: (args: IFindManyArgs): Promise<IEntity[]> => {
      recorder.calls.push(args);

      return Promise.resolve([...rows]);
    },
  };
}

const PROFILE: IProfileRow = { id: 'profile-1', type: 'profile', name: 'Card owner' };

/**
 * Tables whose nested collection the domain reads. The read order of every one of them is declared
 * in `config/api-fields.yml`, so the expectation is taken from the contract instead of being
 * repeated here: the spec checks that the repository passes the declared order through.
 */
const COLLECTION_TYPES = ['socialLink', 'skill', 'experience', 'project'] as const;

/** The repository over a fake client with the delegates the domain reads. */
function repositoryOver(): {
  repository: IEntityQueryPort;
  recorder: IRecorder;
  rows: readonly IEntity[];
} {
  const recorder: IRecorder = { calls: [] };
  const rows: readonly IEntity[] = [PROFILE];
  const prisma = {
    profile: recordingDelegate(recorder, rows),
    skill: recordingDelegate(recorder, rows),
    socialLink: recordingDelegate(recorder, rows),
    experience: recordingDelegate(recorder, rows),
    project: recordingDelegate(recorder, rows),
    ghost: recordingDelegate(recorder, rows),
  } as unknown as PrismaClient;

  return { repository: new EntityRepository(prisma), recorder, rows };
}

describe('EntityRepository', () => {
  it('reads a page ordered by createdAt with take and skip of the request', async () => {
    const { repository, recorder } = repositoryOver();

    await repository.find('profile', { page: { limit: 10, offset: 20 } });

    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]).toEqual({
      orderBy: [{ createdAt: 'asc' }],
      take: 10,
      skip: 20,
    });
  });

  it('reads without a window when the query names none', async () => {
    const { repository, recorder } = repositoryOver();

    await repository.find('profile');

    expect(recorder.calls[0].take).toBeUndefined();
    expect(recorder.calls[0].skip).toBeUndefined();
    expect('where' in recorder.calls[0]).toBe(false);
    expect(recorder.calls[0].orderBy).toEqual([{ createdAt: 'asc' }]);
  });

  it('filters a nested collection by the parent column of the request', async () => {
    const { repository, recorder } = repositoryOver();

    await repository.find('skill', { parentIds: ['profile-a', 'profile-b'], parentProperty: 'profileId' });

    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0].where).toEqual({ profileId: { in: ['profile-a', 'profile-b'] } });
    // An empty category goes last by an explicit rule of the contract, not by the default of the
    // database.
    expect(recorder.calls[0].orderBy).toEqual([
      { category: { sort: 'asc', nulls: 'last' } },
      { name: 'asc' },
      { id: 'asc' },
    ]);
    expect(recorder.calls[0].take).toBeUndefined();
    expect(recorder.calls[0].skip).toBeUndefined();
  });

  it.each(COLLECTION_TYPES)(
    'orders a nested collection of %s by the order the contract declares',
    async (type: string) => {
      const { repository, recorder } = repositoryOver();

      await repository.find(type, { parentIds: ['parent-a'], parentProperty: 'profileId' });

      expect(recorder.calls).toHaveLength(1);
      expect(orderOf(type)).toBeDefined();
      expect(recorder.calls[0].orderBy).toEqual(orderOf(type));
    },
  );

  it('orders a table the contract does not name by its primary key', async () => {
    // The port accepts any table name, so an unknown one is answered by the primary key instead of
    // being left to the order the database happens to return.
    const { repository, recorder } = repositoryOver();

    await repository.find('ghost', { parentIds: ['parent-a'], parentProperty: 'profileId' });

    expect(recorder.calls[0].orderBy).toEqual([{ id: 'asc' }]);
  });

  it('takes the collection column from the request, not from the model', async () => {
    const { repository, recorder } = repositoryOver();

    await repository.find('skill', { parentIds: ['owner-a'], parentProperty: 'ownerId' });

    expect(recorder.calls[0].where).toEqual({ ownerId: { in: ['owner-a'] } });
  });

  it('filters a list of ids by the primary key', async () => {
    const { repository, recorder } = repositoryOver();

    await repository.find('profile', { ids: ['profile-1', 'profile-2'] });

    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0].where).toEqual({ id: { in: ['profile-1', 'profile-2'] } });
    expect(recorder.calls[0].orderBy).toEqual([{ createdAt: 'asc' }]);
  });

  it('reads the delegate named by the type', async () => {
    const { repository, recorder } = repositoryOver();

    await repository.find('socialLink', { ids: ['link-1'] });

    expect(recorder.calls).toHaveLength(1);
  });

  it('builds the same arguments for the same query shape of different types', async () => {
    const { repository, recorder } = repositoryOver();

    await repository.find('profile', { page: { limit: 5, offset: 0 } });
    await repository.find('skill', { page: { limit: 5, offset: 0 } });

    expect(recorder.calls).toHaveLength(2);

    const [profileCall, skillCall] = recorder.calls;

    // The ordering is the only part of the arguments that belongs to the entity: it comes from the
    // contract, so the rest of the shape is shared by both types.
    expect(profileCall.take).toBe(skillCall.take);
    expect(profileCall.skip).toBe(skillCall.skip);
    expect('where' in profileCall).toBe('where' in skillCall);
    expect(profileCall.orderBy).toEqual(orderOf('profile'));
    expect(skillCall.orderBy).toEqual(orderOf('skill'));
  });

  it('returns the rows of the delegate untouched', async () => {
    const { repository } = repositoryOver();

    await expect(repository.find('profile', { ids: ['profile-1'] })).resolves.toEqual([PROFILE]);
  });

  it('copies the ids of the request, so a later mutation of the array does not reach the query', async () => {
    const { repository, recorder } = repositoryOver();
    const ids: string[] = ['profile-1'];

    await repository.find('profile', { ids });
    ids.push('profile-2');

    expect(recorder.calls[0].where).toEqual({ id: { in: ['profile-1'] } });
  });
});
