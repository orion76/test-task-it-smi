import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import type { IEntity, IEntityQueryPort, UEntityQuery } from '@src/common/contracts/types';
import { EntityRepository } from '@src/db/entity.repository';
import { PrismaService } from '@src/db/prisma/prisma.service';
import { graphql, startApp } from './support/app';
import { EMPTY_DATABASE_URL, TEST_DATABASE_URL } from './support/environment';
import { deleteProfileFixtures, insertProfileFixture } from './support/fixtures';

/** One read the port was asked for, as the spy saw it. */
interface IPortCall {
  type: string;
  query?: UEntityQuery;
}

/** What the spec observes of the spy: the port contract plus the calls of one request. */
interface ICountingQueryPort extends IEntityQueryPort {
  /** @returns the reads since the last {@link reset}, in call order. */
  snapshot(): IPortCall[];

  /** Starts a new observation window. */
  reset(): void;
}

/**
 * The real data-access port with a call log.
 *
 * The spy wraps the production repository instead of replacing it: the nested fields are resolved
 * from real rows, while the number of reads is observable. It is injected through
 * `overrideProvider` in the test module, so the application code knows nothing about the check.
 */
class CountingQueryPort implements ICountingQueryPort {
  private readonly calls: IPortCall[] = [];
  private readonly target: IEntityQueryPort;

  constructor(target: IEntityQueryPort) {
    this.target = target;
  }

  find(type: string, query?: UEntityQuery): Promise<IEntity[]> {
    this.calls.push({ type, query });

    return this.target.find(type, query);
  }

  snapshot(): IPortCall[] {
    return [...this.calls];
  }

  reset(): void {
    this.calls.length = 0;
  }
}

/** Every collection of a profile in one request: the shape the DataLoaders have to batch. */
const NESTED_QUERY = `query {
  profiles {
    id
    links { label }
    skills { name }
    experience { company }
    projects { name }
  }
}`;

interface INestedProfile {
  id: string;
  links: { label: string }[];
  skills: { name: string }[];
  experience: { company: string }[];
  projects: { name: string }[];
}

interface INestedData {
  profiles: INestedProfile[];
}

/**
 * Slug of the profile the empty-collection spec inserts into the unseeded database. It is not the
 * prefix of `support/fixtures`, because that cleanup runs against the seeded database.
 */
const BARE_PROFILE_SLUG = 'e2e-bare-profile';

/** @returns the number of reads per entity type. */
function countByType(calls: readonly IPortCall[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const call of calls) {
    counts[call.type] = (counts[call.type] ?? 0) + 1;
  }

  return counts;
}

/**
 * Runs the nested query and returns the profiles with the reads they caused.
 * @param app application under test, started against the database the spec works on
 * @param counting port spy the app was started with
 * @returns the response rows and the port calls of the request
 */
async function readNested(
  app: INestApplication,
  counting: ICountingQueryPort,
): Promise<{ profiles: INestedProfile[]; calls: IPortCall[] }> {
  counting.reset();

  const response = await graphql<INestedData>(app, NESTED_QUERY);
  const profiles = response.data?.profiles;

  if (profiles === undefined || profiles === null) {
    throw new Error(`the nested query failed: ${JSON.stringify(response.errors)}`);
  }

  return { profiles, calls: counting.snapshot() };
}

describe('nested fields of one request', () => {
  let app: INestApplication;
  let counting: ICountingQueryPort;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    counting = new CountingQueryPort(new EntityRepository(prisma));

    app = await startApp({ databaseUrl: TEST_DATABASE_URL, queryPort: counting });
  });

  afterEach(async () => {
    await deleteProfileFixtures(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('reads every table once for a single profile', async () => {
    const { profiles, calls } = await readNested(app, counting);

    expect(profiles).toHaveLength(1);
    // The seeded profile has many skills and several rows in every other collection; a per-row
    // read would already be visible here.
    expect(profiles[0].skills.length).toBeGreaterThan(1);

    // One page read, one read per one-hop collection and two reads per dictionary collection: the
    // ties and the rows they name. Seven statements for the whole selection set, no matter how many
    // rows every collection has.
    expect(calls).toHaveLength(7);
    expect(countByType(calls)).toEqual({
      profile: 1,
      experience: 1,
      project: 1,
      profileSkill: 1,
      skill: 1,
      profileSocialLink: 1,
      socialLink: 1,
    });
  });

  it('reads every table once for three profiles', async () => {
    await insertProfileFixture(prisma, 'batch-one', { current: false });
    await insertProfileFixture(prisma, 'batch-two', { current: false });

    const { profiles, calls } = await readNested(app, counting);

    expect(profiles).toHaveLength(3);

    // The number of reads per table does not grow with the number of parents: the loaders collect
    // the requests of the whole tick into one batch per table, and a dictionary collection is still
    // two statements — the ties and the rows — whatever the number of profiles.
    expect(calls).toHaveLength(7);
    expect(countByType(calls)).toEqual({
      profile: 1,
      experience: 1,
      project: 1,
      profileSkill: 1,
      skill: 1,
      profileSocialLink: 1,
      socialLink: 1,
    });

    const tieCall = calls.find((call) => call.type === 'profileSkill');
    const tieQuery = tieCall?.query;

    if (tieQuery === undefined || !('parentIds' in tieQuery)) {
      throw new Error('the tie read did not carry the parent ids');
    }

    // All three parents travel in one query of the tie table, which is what makes the read a batch
    // and not N+1.
    expect(tieQuery.parentIds).toHaveLength(3);
    expect([...tieQuery.parentIds].sort()).toEqual(profiles.map((profile) => profile.id).sort());

    const skillCall = calls.find((call) => call.type === 'skill');
    const skillQuery = skillCall?.query;

    if (skillQuery === undefined || !('ids' in skillQuery)) {
      throw new Error('the dictionary read did not carry the ids of the ties');
    }

    // The second read is one query for every dictionary row the ties name, without repeats.
    expect(skillQuery.ids.length).toBeGreaterThan(3);
    expect(new Set(skillQuery.ids).size).toBe(skillQuery.ids.length);
  });
});

/**
 * The seeded content always lists skills and links, so the empty dictionary collection is observed on
 * the database that holds no seed: a profile of its own is inserted there and removed afterwards.
 */
describe('nested fields of a profile without dictionaries', () => {
  let app: INestApplication;
  let counting: ICountingQueryPort;
  let prisma: PrismaClient;
  let previousDatabaseUrl: string | undefined;

  beforeAll(async () => {
    // `startApp` writes the connection string for the module graph and the client it creates, so the
    // environment is prepared here as well: the client of the spec has to be constructed against the
    // database it works on. The previous value is restored at the end, because the specs of this
    // process share `process.env`.
    previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = EMPTY_DATABASE_URL;

    prisma = new PrismaService();
    await prisma.$connect();
    counting = new CountingQueryPort(new EntityRepository(prisma));

    app = await startApp({ databaseUrl: EMPTY_DATABASE_URL, queryPort: counting });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
    process.env.DATABASE_URL = previousDatabaseUrl;
  });

  afterEach(async () => {
    await prisma.profile.deleteMany({ where: { slug: BARE_PROFILE_SLUG } });
  });

  it('reads nothing twice for a profile whose skills and links are empty', async () => {
    await prisma.profile.create({
      data: {
        slug: BARE_PROFILE_SLUG,
        name: 'Profile without dictionaries',
        description: 'Temporary profile of the e2e suite: no skills and no links.',
      },
    });

    const { profiles, calls } = await readNested(app, counting);

    expect(profiles).toHaveLength(1);
    // The empty collections answer empty lists, as they did when the second read was issued.
    expect(profiles[0].skills).toEqual([]);
    expect(profiles[0].links).toEqual([]);

    // The ties of the whole group are empty, so the rows they would name are not read at all: five
    // statements instead of seven — one page read, one read per one-hop collection and one read of
    // each tie table.
    expect(calls).toHaveLength(5);
    expect(countByType(calls)).toEqual({
      profile: 1,
      experience: 1,
      project: 1,
      profileSkill: 1,
      profileSocialLink: 1,
    });
  });
});
