import type { PrismaClient } from '@prisma/client';

import { DataWriter } from '@seed/data/data.writer';
import type { IDelegate, TRow } from '@seed/data/types';
import type { IDictionarySpec } from '@seed/dictionaries/types';
import type { IDataModel, IModelSpec } from '@seed/schema/types';
import { delegateName } from '@seed/shared/delegate-name';
import { SeedError } from '@seed/shared/seed.error';

/**
 * The writer is tested against a model tree of its own and fake Prisma delegates: the checks are
 * about the walk (what is emptied, in which order, how a collection is written and how a dictionary
 * becomes two tables), not about the domain, so a live database is not needed. The tree keeps the
 * shapes the real schema produces — the root, a collection without nested models, a collection
 * whose rows have children, and two dictionaries read through their tie tables — while the names
 * stay short enough for a failure to be read at a glance.
 *
 * Every fake table keeps its rows in memory, so the same check covers both the calls the writer
 * makes and the state the database would end up in after a repeated run.
 */

const PROFILE: IModelSpec = {
  name: 'Profile',
  defName: 'profile',
  fields: [{ name: 'name', required: true, date: false }],
  children: [
    { property: 'projects', model: 'Project', required: false, collection: true },
    { property: 'experience', model: 'Experience', required: false, collection: true },
    { property: 'skills', model: 'Skill', required: false, collection: true },
    { property: 'links', model: 'SocialLink', required: false, collection: true },
  ],
};

const PROJECT: IModelSpec = {
  name: 'Project',
  defName: 'project',
  fields: [{ name: 'name', required: true, date: false }],
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

const SKILL: IModelSpec = {
  name: 'Skill',
  defName: 'skill',
  fields: [
    { name: 'name', required: true, date: false },
    { name: 'category', required: false, date: false },
  ],
  children: [],
};

const SOCIAL_LINK: IModelSpec = {
  name: 'SocialLink',
  defName: 'socialLink',
  fields: [
    { name: 'label', required: true, date: false },
    { name: 'url', required: true, date: false },
  ],
  children: [],
};

/**
 * Root first, then the models in the order they are written. The tie tables are not models of the
 * import file: their rows are derived from the nesting, so the tree does not list them.
 */
const DATA_MODEL: IDataModel = {
  property: 'profile',
  root: PROFILE,
  models: [PROFILE, PROJECT, EXPERIENCE, ACHIEVEMENT, SKILL, SOCIAL_LINK],
};

/** The dictionaries of the file: the key the file names a row by and the tie table of the pair. */
const DICTIONARIES: readonly IDictionarySpec[] = [
  {
    model: 'Skill',
    key: 'name',
    link: { model: 'ProfileSkill', parent: 'profileId', target: 'skillId' },
  },
  {
    model: 'SocialLink',
    key: 'url',
    link: { model: 'ProfileSocialLink', parent: 'profileId', target: 'socialLinkId' },
  },
];

/** The document the writer applies: one root row with every collection filled. */
const SOURCE = {
  profile: {
    name: 'Owner',
    projects: [{ name: 'First project' }],
    experience: [
      {
        company: 'First',
        startedAt: '2020-01-01',
        achievements: [{ text: 'first' }, { text: 'second' }],
      },
    ],
    skills: [
      { name: 'TypeScript', category: 'language' },
      { name: 'Node.js', category: 'backend' },
    ],
    links: [
      { label: 'GitHub', url: 'https://github.com/owner' },
      { label: 'Site', url: 'https://example.com' },
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
  const models = [
    ...dataModel.models.map((spec) => spec.name),
    ...DICTIONARIES.map((spec) => spec.link.model),
  ];

  for (const name of models) {
    delegates[delegateName(name)] = createDelegate(name, calls);
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

/** Ids of the dictionary rows, keyed by the value the file names them by. */
function dictionaryIds(rows: TRow[], key: string): Map<string, unknown> {
  return new Map(rows.map((row) => [String(row[key]), row.id]));
}

describe('DataWriter', () => {
  it('empties the tie tables first, then the tree children before their parents', async () => {
    const harness = createHarness(DATA_MODEL);
    const writer = new DataWriter(harness.prisma, DATA_MODEL, DICTIONARIES);

    await writer.write(SOURCE);

    const removed = harness.calls.filter((call) => call.startsWith('deleteMany:'));

    expect(removed).toEqual([
      'deleteMany:ProfileSkill',
      'deleteMany:ProfileSocialLink',
      'deleteMany:SocialLink',
      'deleteMany:Skill',
      'deleteMany:Achievement',
      'deleteMany:Experience',
      'deleteMany:Project',
      'deleteMany:Profile',
    ]);
    expect(harness.calls[removed.length]).toBe('create:Profile');
    expect(harness.transaction).toHaveBeenCalledTimes(1);
  });

  it('writes a collection without nested models in a single createMany', async () => {
    const harness = createHarness(DATA_MODEL);
    const writer = new DataWriter(harness.prisma, DATA_MODEL, DICTIONARIES);

    await writer.write(SOURCE);

    const projects = harness.delegateOf('Project');

    expect(projects.create).not.toHaveBeenCalled();
    expect(projects.createMany).toHaveBeenCalledTimes(1);
    expect(projects.rows).toHaveLength(1);
    expect(projects.rows.every((row) => row.profileId === 1)).toBe(true);
  });

  it('writes a collection with nested models row by row, so every child knows its parent', async () => {
    const harness = createHarness(DATA_MODEL);
    const writer = new DataWriter(harness.prisma, DATA_MODEL, DICTIONARIES);

    await writer.write(SOURCE);

    const periods = harness.delegateOf('Experience');
    const achievements = harness.delegateOf('Achievement');

    expect(periods.createMany).not.toHaveBeenCalled();
    expect(periods.create).toHaveBeenCalledTimes(1);
    expect(periods.rows.every((row) => row.profileId === 1)).toBe(true);
    expect(achievements.rows).toHaveLength(2);
    expect(achievements.rows.every((row) => row.experienceId === periods.rows[0].id)).toBe(true);
  });

  it('inserts one dictionary row per key value, not one per element', async () => {
    const harness = createHarness(DATA_MODEL);
    const writer = new DataWriter(harness.prisma, DATA_MODEL, DICTIONARIES);

    await writer.write(SOURCE);

    const skills = harness.delegateOf('Skill');
    const links = harness.delegateOf('SocialLink');

    expect(skills.create).toHaveBeenCalledTimes(2);
    expect(skills.rows.map((row) => row.name)).toEqual(['TypeScript', 'Node.js']);
    expect(links.create).toHaveBeenCalledTimes(2);
    expect(links.rows.map((row) => row.url)).toEqual([
      'https://github.com/owner',
      'https://example.com',
    ]);
  });

  it('writes the tie rows with the id of the dictionary row the file named', async () => {
    const harness = createHarness(DATA_MODEL);
    const writer = new DataWriter(harness.prisma, DATA_MODEL, DICTIONARIES);

    await writer.write(SOURCE);

    const skillIds = dictionaryIds(harness.delegateOf('Skill').rows, 'name');
    const linkIds = dictionaryIds(harness.delegateOf('SocialLink').rows, 'url');
    const skillTies = harness.delegateOf('ProfileSkill').rows;
    const linkTies = harness.delegateOf('ProfileSocialLink').rows;

    expect(skillTies).toHaveLength(2);
    expect(skillTies.map((row) => row.skillId)).toEqual([
      skillIds.get('TypeScript'),
      skillIds.get('Node.js'),
    ]);
    expect(skillTies.every((row) => row.profileId === 1)).toBe(true);

    expect(linkTies).toHaveLength(2);
    expect(linkTies.map((row) => row.socialLinkId)).toEqual([
      linkIds.get('https://github.com/owner'),
      linkIds.get('https://example.com'),
    ]);
    expect(linkTies.every((row) => row.profileId === 1)).toBe(true);
  });

  it('writes the dictionary rows before the tie rows of the same collection', async () => {
    const harness = createHarness(DATA_MODEL);
    const writer = new DataWriter(harness.prisma, DATA_MODEL, DICTIONARIES);

    await writer.write(SOURCE);

    expect(harness.calls.indexOf('create:Skill')).toBeLessThan(
      harness.calls.indexOf('create:ProfileSkill'),
    );
    expect(harness.calls.indexOf('create:SocialLink')).toBeLessThan(
      harness.calls.indexOf('create:ProfileSocialLink'),
    );
    // The last dictionary row is still written before the first tie of its collection.
    expect(harness.calls.lastIndexOf('create:Skill')).toBeLessThan(
      harness.calls.indexOf('create:ProfileSkill'),
    );
  });

  it('fails with the path inside the data file when a key repeats within one parent', async () => {
    const harness = createHarness(DATA_MODEL);
    const writer = new DataWriter(harness.prisma, DATA_MODEL, DICTIONARIES);
    const source = structuredClone(SOURCE);

    source.profile.skills.push({ name: 'TypeScript', category: 'language' });

    const failure = await writer.write(source).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SeedError);
    expect((failure as SeedError).message).toBe(
      'profile.skills[2]: duplicate name "TypeScript": the same Skill is already listed at ' +
        'profile.skills[0]',
    );
    // The keys of the whole collection are checked before its first insert, so neither a dictionary
    // row nor a tie of the collection is written.
    expect(harness.delegateOf('Skill').create).not.toHaveBeenCalled();
    expect(harness.delegateOf('ProfileSkill').create).not.toHaveBeenCalled();
  });

  it('fails with the path inside the data file when a link repeats within one parent', async () => {
    const harness = createHarness(DATA_MODEL);
    const writer = new DataWriter(harness.prisma, DATA_MODEL, DICTIONARIES);
    const source = structuredClone(SOURCE);

    source.profile.links[1].url = 'https://github.com/owner';

    const failure = await writer.write(source).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SeedError);
    expect((failure as SeedError).message).toBe(
      'profile.links[1]: duplicate url "https://github.com/owner": the same SocialLink is ' +
        'already listed at profile.links[0]',
    );
    expect(harness.delegateOf('SocialLink').create).not.toHaveBeenCalled();
    expect(harness.delegateOf('ProfileSocialLink').create).not.toHaveBeenCalled();
  });

  it('counts the rows of every model in the summary', async () => {
    const harness = createHarness(DATA_MODEL);
    const writer = new DataWriter(harness.prisma, DATA_MODEL, DICTIONARIES);

    const summary = await writer.write(SOURCE);

    expect(summary.models).toEqual([
      { model: 'Profile', written: 1 },
      { model: 'Project', written: 1 },
      { model: 'Experience', written: 1 },
      { model: 'Achievement', written: 2 },
      { model: 'Skill', written: 2 },
      { model: 'ProfileSkill', written: 2 },
      { model: 'SocialLink', written: 2 },
      { model: 'ProfileSocialLink', written: 2 },
    ]);
  });

  it('leaves one copy of the content after a second run and never updates a row', async () => {
    const harness = createHarness(DATA_MODEL);
    const writer = new DataWriter(harness.prisma, DATA_MODEL, DICTIONARIES);
    const models = [
      ...DATA_MODEL.models.map((spec) => spec.name),
      ...DICTIONARIES.map((spec) => spec.link.model),
    ];

    await writer.write(SOURCE);

    const before = models.map((name) => ({
      model: name,
      content: contentOf(harness.delegateOf(name).rows),
      ids: harness.delegateOf(name).rows.map((row) => row.id),
    }));

    await writer.write(SOURCE);

    const profileId = harness.delegateOf('Profile').rows[0].id;

    for (const [index, name] of models.entries()) {
      const delegate = harness.delegateOf(name);

      expect(delegate.deleteMany).toHaveBeenCalledTimes(2);
      expect(contentOf(delegate.rows)).toEqual(before[index].content);
      expect(delegate.upsert).not.toHaveBeenCalled();
      expect(delegate.update).not.toHaveBeenCalled();
    }

    // The rows were created again, so their ids moved on: the content is stable, the identity is not.
    expect(harness.delegateOf('Profile').rows[0].id).not.toBe(before[0].ids[0]);
    // The ties were rebuilt as well, so they point at the rows of this run and not at the previous one.
    const skillIds = dictionaryIds(harness.delegateOf('Skill').rows, 'name');

    expect(
      harness.delegateOf('ProfileSkill').rows.map((row) => row.skillId),
    ).toEqual([skillIds.get('TypeScript'), skillIds.get('Node.js')]);
    expect(
      harness
        .delegateOf('ProfileSocialLink')
        .rows.every((row) => row.profileId === profileId),
    ).toBe(true);
  });
});
