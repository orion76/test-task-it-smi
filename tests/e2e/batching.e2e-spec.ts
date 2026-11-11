import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import type { IEntity, IEntityQueryPort, UEntityQuery } from '@src/common/contracts/types';
import { EntityRepository } from '@src/db/entity.repository';
import { PrismaService } from '@src/db/prisma/prisma.service';
import { graphql, startApp } from './support/app';
import { TEST_DATABASE_URL } from './support/environment';
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

/** @returns the number of reads per entity type. */
function countByType(calls: readonly IPortCall[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const call of calls) {
    counts[call.type] = (counts[call.type] ?? 0) + 1;
  }

  return counts;
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

  /**
   * Runs the nested query and returns the profiles with the reads they caused.
   * @returns the response rows and the port calls of the request
   */
  async function readNested(): Promise<{ profiles: INestedProfile[]; calls: IPortCall[] }> {
    counting.reset();

    const response = await graphql<INestedData>(app, NESTED_QUERY);
    const profiles = response.data?.profiles;

    if (profiles === undefined || profiles === null) {
      throw new Error(`the nested query failed: ${JSON.stringify(response.errors)}`);
    }

    return { profiles, calls: counting.snapshot() };
  }

  it('reads every table once for a single profile', async () => {
    const { profiles, calls } = await readNested();

    expect(profiles).toHaveLength(1);
    // The seeded profile has many skills and several rows in every other collection; a per-row
    // read would already be visible here.
    expect(profiles[0].skills.length).toBeGreaterThan(1);

    // One page read plus one read per collection: five statements for the whole selection set.
    expect(calls).toHaveLength(5);
    expect(countByType(calls)).toEqual({
      profile: 1,
      experience: 1,
      project: 1,
      skill: 1,
      socialLink: 1,
    });
  });

  it('reads every table once for three profiles', async () => {
    await insertProfileFixture(prisma, 'batch-one', { current: false });
    await insertProfileFixture(prisma, 'batch-two', { current: false });

    const { profiles, calls } = await readNested();

    expect(profiles).toHaveLength(3);

    // The number of reads per table does not grow with the number of parents: the loaders collect
    // the requests of the whole tick into one batch per table.
    expect(calls).toHaveLength(5);
    expect(countByType(calls)).toEqual({
      profile: 1,
      experience: 1,
      project: 1,
      skill: 1,
      socialLink: 1,
    });

    const skillCall = calls.find((call) => call.type === 'skill');
    const skillQuery = skillCall?.query;

    if (skillQuery === undefined || !('parentIds' in skillQuery)) {
      throw new Error('the collection read did not carry the parent ids');
    }

    // All three parents travel in one query, which is what makes the read a batch and not N+1.
    expect(skillQuery.parentIds).toHaveLength(3);
    expect([...skillQuery.parentIds].sort()).toEqual(profiles.map((profile) => profile.id).sort());
  });
});
