import { BadRequestException, NotFoundException } from '@nestjs/common';

import {
  OFFSET_DEFAULT,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
} from '@src/common/contracts/pagination';
import type {
  IEntity,
  IEntityQueryPort,
  IPagination,
  UEntityQuery,
} from '@src/common/contracts/types';
import { PAGE_LIMIT_ARG, PAGE_OFFSET_ARG } from '@src/graphql/queries/args';
import { EntityQueries } from '@src/graphql/queries/entity-queries';

/**
 * The behaviour of the generated queries is tested through a minimal subclass: `findOne` and
 * `findPage` are `protected`, so the generated public resolver is not needed. The port is a double,
 * so the spec observes exactly what the query layer sends to the data layer — including the case
 * where nothing must be sent at all.
 */

/** Fixture row of `profile`: the columns the contract names for this table. */
interface IProfileRow extends IEntity {
  readonly name?: string;
}

/** One call the port recorded: the table and the query shape it was asked for. */
interface IPortCall {
  readonly type: string;
  readonly query: UEntityQuery;
}

/** What the spec observes of the double: the port contract plus the calls it recorded. */
interface IRecordingPort extends IEntityQueryPort {
  readonly calls: IPortCall[];
}

/**
 * The query layer as the spec drives it: the subclass only widens the two protected methods, so
 * these are the only members the assertions reach.
 */
interface ITestQueries {
  findOneOf(entity: string): Promise<IEntity>;
  findPageOf(entity: string, page: IPagination): Promise<IEntity[]>;
}

/** Port double: records the queries and answers with the rows it was given. */
class RecordingPort implements IRecordingPort {
  readonly calls: IPortCall[] = [];

  constructor(private readonly rows: readonly IEntity[] = []) {}

  find(type: string, query: UEntityQuery = {}): Promise<IEntity[]> {
    this.calls.push({ type, query });

    return Promise.resolve([...this.rows]);
  }
}

/** The smallest subclass the generated resolver adds on top of `EntityQueries`. */
class TestQueries extends EntityQueries implements ITestQueries {
  findOneOf(entity: string): Promise<IEntity> {
    return this.findOne(entity);
  }

  findPageOf(entity: string, page: IPagination): Promise<IEntity[]> {
    return this.findPage(entity, page);
  }
}

function queriesOver(rows: readonly IEntity[] = []): {
  queries: ITestQueries;
  port: IRecordingPort;
} {
  const port = new RecordingPort(rows);

  return { queries: new TestQueries(port), port };
}

/**
 * Runs the call and returns what it failed with. `findPage` rejects a bad page before it returns a
 * promise, so the sync throw is turned into a value the same way a rejection is.
 */
function failureOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return run().catch((error: unknown) => error);
  } catch (error) {
    return Promise.resolve(error);
  }
}

/** The page window a call reached the port with; fails the test for another query shape. */
function pageOf(query: UEntityQuery): IPagination {
  if (!('page' in query) || query.page === undefined) {
    throw new Error('expected the port to be called with a page query');
  }

  return query.page;
}

const PROFILE: IProfileRow = { id: 'profile-1', type: 'profile', name: 'Card owner' };

describe('EntityQueries', () => {
  it('answers NotFoundException naming the entity and the seed when the table is empty', async () => {
    const { queries, port } = queriesOver();

    const error = await failureOf(() => queries.findOneOf('profile'));

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toContain('No profile records');
    expect((error as NotFoundException).message).toContain('seed');
    expect(port.calls).toHaveLength(1);
  });

  it('reads the first row of the first page for a single-row query', async () => {
    const { queries, port } = queriesOver([PROFILE]);

    await expect(queries.findOneOf('profile')).resolves.toEqual(PROFILE);
    expect(pageOf(port.calls[0].query)).toEqual({ limit: 1, offset: 0 });
  });
});

describe('EntityQueries.findPage', () => {
  it('declares the default page in the GraphQL arguments', () => {
    // The defaults are part of the schema, so a list query without arguments never reaches
    // `findPage` with an undefined window.
    expect(PAGE_LIMIT_ARG.defaultValue).toBe(10);
    expect(PAGE_OFFSET_ARG.defaultValue).toBe(0);
    expect(PAGE_SIZE_DEFAULT).toBe(10);
    expect(OFFSET_DEFAULT).toBe(0);
  });

  it('forwards the default window to the port unchanged', async () => {
    const { queries, port } = queriesOver([PROFILE]);

    await queries.findPageOf('profile', { limit: PAGE_SIZE_DEFAULT, offset: OFFSET_DEFAULT });

    expect(pageOf(port.calls[0].query)).toEqual({ limit: 10, offset: 0 });
  });

  it('forwards an explicit window to the port unchanged', async () => {
    const { queries, port } = queriesOver([PROFILE]);

    await queries.findPageOf('profile', { limit: 25, offset: 50 });

    expect(port.calls[0].type).toBe('profile');
    expect(pageOf(port.calls[0].query)).toEqual({ limit: 25, offset: 50 });
  });

  it('rejects a limit above the maximum with the accepted range', async () => {
    const { queries, port } = queriesOver([PROFILE]);

    const error = await failureOf(() =>
      queries.findPageOf('profile', { limit: PAGE_SIZE_MAX + 1, offset: 0 }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain('limit');
    expect((error as BadRequestException).message).toContain('1 and 100');
    expect(port.calls).toHaveLength(0);
  });

  it('rejects a limit below the minimum with the accepted range', async () => {
    const { queries, port } = queriesOver([PROFILE]);

    const error = await failureOf(() => queries.findPageOf('profile', { limit: 0, offset: 0 }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain('limit');
    expect((error as BadRequestException).message).toContain('1 and 100');
    expect(port.calls).toHaveLength(0);
  });

  it('rejects a fractional limit as a non-integer', async () => {
    const { queries, port } = queriesOver([PROFILE]);

    const error = await failureOf(() =>
      queries.findPageOf('profile', { limit: 10.5, offset: 0 }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain('limit must be an integer');
    expect(port.calls).toHaveLength(0);
  });

  it('rejects a negative offset as a non-negative integer', async () => {
    const { queries, port } = queriesOver([PROFILE]);

    const error = await failureOf(() =>
      queries.findPageOf('profile', { limit: PAGE_SIZE_DEFAULT, offset: -1 }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain('offset');
    expect((error as BadRequestException).message).toContain('non-negative integer');
    expect(port.calls).toHaveLength(0);
  });

  it('rejects a fractional offset as a non-integer', async () => {
    const { queries, port } = queriesOver([PROFILE]);

    const error = await failureOf(() =>
      queries.findPageOf('profile', { limit: PAGE_SIZE_DEFAULT, offset: 2.5 }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain(
      'offset must be a non-negative integer',
    );
    expect(port.calls).toHaveLength(0);
  });

  it('accepts the boundary page and returns the rows of the port', async () => {
    const { queries } = queriesOver([PROFILE]);

    await expect(
      queries.findPageOf('profile', { limit: PAGE_SIZE_MAX, offset: 0 }),
    ).resolves.toEqual([PROFILE]);
  });
});
