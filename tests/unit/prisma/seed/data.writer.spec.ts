import type { PrismaClient } from '@prisma/client';

import { DataWriter } from '@seed/data/data.writer';
import type { IDelegate, TRow } from '@seed/data/types';
import type { IDataModel, IModelSpec } from '@seed/schema/types';
import { delegateName } from '@seed/shared/delegate-name';

/**
 * The writer is tested against a model tree of its own and fake Prisma delegates: the checks are
 * about the walk (what is emptied, in which order, and how a collection is written), not about the
 * domain, so a live database is not needed. The tree keeps the shapes the real schema produces —
 * the root, a collection without nested models and a collection whose rows have children — while
 * the names stay short enough for a failure to be read at a glance.
 *
 * Every fake table keeps its rows in memory, so the same check covers both the calls the writer
 * makes and the state the database would end up in after a repeated run.
 */

const PROFILE: IModelSpec = {
  name: 'Profile',
  defName: 'profile',
  fields: [{ name: 'name', required: true, date: false }],
  children: [
    { property: 'links', model: 'SocialLink', required: false, collection: true },
    { property: 'experience', model: 'Experience', required: false, collection: true },
  ],
};

const SOCIAL_LINK: IModelSpec = {
  name: 'SocialLink',
  defName: 'socialLink',
  fields: [{ name: 'url', required: true, date: false }],
  children: [],
};

const EXPERIENCE: IModelSpec = {
  name: 'Experience',
  defName: 'experience',
  fields: [
    { name: 'company', required: true, date: false },
    { name: 'startedAt', required: true, date: true },
  ],
  children: [{ property: 'achievements', model: 'Achievement', required: false, collection: true }],
};

const ACHIEVEMENT: IModelSpec = {
  name: 'Achievement',
  defName: 'achievement',
  fields: [{ name: 'text', required: true, date: false }],
  children: [],
};

/** Root first, then the models in the order they are written. */
const DATA_MODEL: IDataModel = {
  property: 'profile',
  root: PROFILE,
  models: [PROFILE, SOCIAL_LINK, EXPERIENCE, ACHIEVEMENT],
};

/** The document the writer applies: one root row, two links and two periods, two achievements. */
const SOURCE = {
  profile: {
    name: 'Owner',
    links: [{ url: 'https://example.com/one' }, { url: 'https://example.com/two' }],
    experience: [
      {
        company: 'First',
        startedAt: '2020-01-01',
        achievements: [{ text: 'first' }, { text: 'second' }],
      },
      { company: 'Second', startedAt: '2022-01-01' },
    ],
  },
};

/** Fake delegate: the part the writer uses plus the methods a write-only engine must never call. */
interface IFakeDelegate extends IDelegate {
  create: jest.Mock<Promise<TRow>, [{ data: TRow }]>;
  createMany: jest.Mock<Promise<{ count: number }>, [{ data: TRow[] }]>;
  deleteMany: jest.Mock<Promise<{ count: number }>, [{ where: TRow }]>;
  upsert: jest.Mock;
  update: jest.Mock;
  /** Rows of the fake table, kept between calls the way the database keeps them. */
  readonly rows: TRow[];
}

/** Prisma client replaced by the fake delegates, with the call log the order checks read. */
interface IWriterHarness {
  readonly prisma: PrismaClient;
  /** `deleteMany:<Model>`, `create:<Model>` and `createMany:<Model>` in the order they happened. */
  readonly calls: string[];
  readonly transaction: jest.Mock;
  delegateOf(model: string): IFakeDelegate;
}

/** Fake table of one model: rows live in memory, ids grow across runs like a sequence would. */
function createDelegate(model: string, calls: string[]): IFakeDelegate {
  const rows: TRow[] = [];
  let lastId = 0;

  return {
    rows,
    create: jest.fn(({ data }: { data: TRow }) => {
      calls.push(`create:${model}`);
      lastId += 1;
      const row: TRow = { id: lastId, ...data };

      rows.push(row);

      return Promise.resolve(row);
    }),
    createMany: jest.fn(({ data }: { data: TRow[] }) => {
      calls.push(`createMany:${model}`);

      for (const item of data) {
        lastId += 1;
        rows.push({ id: lastId, ...item });
      }

      return Promise.resolve({ count: data.length });
    }),
    deleteMany: jest.fn((_args: { where: TRow }) => {
      calls.push(`deleteMany:${model}`);

      const count = rows.length;

      rows.length = 0;

      return Promise.resolve({ count });
    }),
    upsert: jest.fn(),
    update: jest.fn(),
  };
}

/** Writer over the fake client of the given model tree. */
function createHarness(dataModel: IDataModel): IWriterHarness {
  const calls: string[] = [];
  const delegates: Record<string, IFakeDelegate> = {};

  for (const spec of dataModel.models) {
    delegates[delegateName(spec.name)] = createDelegate(spec.name, calls);
  }

  const transaction = jest.fn((callback: (client: unknown) => Promise<unknown>) =>
    callback(delegates));

  return {
    prisma: { $transaction: transaction } as unknown as PrismaClient,
    calls,
    transaction,
    delegateOf: (model: string) => delegates[delegateName(model)],
  };
}

/** Column that carries identity: the row id itself or a link to the id of a parent row. */
function isIdentityColumn(name: string): boolean {
  return name === 'id' || name.endsWith('Id');
}

/**
 * Rows without their identity columns: what the data file put into the table. The identity is left
 * out on purpose, because a run creates the rows again — the ids move on, the content does not.
 */
function contentOf(rows: TRow[]): TRow[] {
  return rows.map((row) => {
    const content: TRow = {};

    for (const [name, value] of Object.entries(row)) {
      if (!isIdentityColumn(name)) {
        content[name] = value;
      }
    }

    return content;
  });
}

describe('DataWriter', () => {
  it('empties every table before the first insert, children first', async () => {
    const harness = createHarness(DATA_MODEL);
    const writer = new DataWriter(harness.prisma, DATA_MODEL);

    await writer.write(SOURCE);

    const removed = harness.calls.filter((call) => call.startsWith('deleteMany:'));

    expect(removed).toEqual([
      'deleteMany:Achievement',
      'deleteMany:Experience',
      'deleteMany:SocialLink',
      'deleteMany:Profile',
    ]);
    expect(harness.calls[removed.length]).toBe('create:Profile');
    expect(harness.transaction).toHaveBeenCalledTimes(1);
  });

  it('writes a collection without nested models in a single createMany', async () => {
    const harness = createHarness(DATA_MODEL);
    const writer = new DataWriter(harness.prisma, DATA_MODEL);

    await writer.write(SOURCE);

    const links = harness.delegateOf('SocialLink');

    expect(links.create).not.toHaveBeenCalled();
    expect(links.createMany).toHaveBeenCalledTimes(1);
    expect(links.rows).toHaveLength(2);
    expect(links.rows.every((row) => row.profileId === 1)).toBe(true);
  });

  it('writes a collection with nested models row by row, so every child knows its parent', async () => {
    const harness = createHarness(DATA_MODEL);
    const writer = new DataWriter(harness.prisma, DATA_MODEL);

    await writer.write(SOURCE);

    const periods = harness.delegateOf('Experience');
    const achievements = harness.delegateOf('Achievement');

    expect(periods.createMany).not.toHaveBeenCalled();
    expect(periods.create).toHaveBeenCalledTimes(2);
    expect(periods.rows.every((row) => row.profileId === 1)).toBe(true);
    // The second period has no achievements: the walk skips the absent collection instead of
    // writing an empty one.
    expect(achievements.rows).toHaveLength(2);
    expect(achievements.rows.every((row) => row.experienceId === periods.rows[0].id)).toBe(true);
  });

  it('counts the rows of every model in the summary', async () => {
    const harness = createHarness(DATA_MODEL);
    const writer = new DataWriter(harness.prisma, DATA_MODEL);

    const summary = await writer.write(SOURCE);

    expect(summary.models).toEqual([
      { model: 'Profile', written: 1 },
      { model: 'SocialLink', written: 2 },
      { model: 'Experience', written: 2 },
      { model: 'Achievement', written: 2 },
    ]);
  });

  it('leaves one copy of the content after a second run and never updates a row', async () => {
    const harness = createHarness(DATA_MODEL);
    const writer = new DataWriter(harness.prisma, DATA_MODEL);

    await writer.write(SOURCE);

    const before = DATA_MODEL.models.map((spec) => ({
      model: spec.name,
      content: contentOf(harness.delegateOf(spec.name).rows),
      ids: harness.delegateOf(spec.name).rows.map((row) => row.id),
    }));

    await writer.write(SOURCE);

    const profileId = harness.delegateOf('Profile').rows[0].id;

    for (const [index, spec] of DATA_MODEL.models.entries()) {
      const delegate = harness.delegateOf(spec.name);

      expect(delegate.deleteMany).toHaveBeenCalledTimes(2);
      expect(contentOf(delegate.rows)).toEqual(before[index].content);
      expect(delegate.upsert).not.toHaveBeenCalled();
      expect(delegate.update).not.toHaveBeenCalled();
    }

    // The rows were created again, so their ids moved on: the content is stable, the identity is not.
    expect(harness.delegateOf('Profile').rows[0].id).not.toBe(before[0].ids[0]);
    // The links were rebuilt as well, so they point at the row of this run and not at the previous one.
    expect(
      harness.delegateOf('SocialLink').rows.every((row) => row.profileId === profileId),
    ).toBe(true);
  });
});
