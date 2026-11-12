import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { graphql, startApp } from './support/app';
import { TEST_DATABASE_URL } from './support/environment';
import { deleteProfileFixtures, insertProfileFixture } from './support/fixtures';
import { readSeedProfile } from './support/seed';
import type {
  IFixtureProfile,
  ISeedExperience,
  ISeedLink,
  ISeedProject,
  ISeedProfile,
  ISeedSkill,
} from './support/types';

/** The query of `TZ/TZ.md` verbatim, including the selection set the assignment asks for. */
const TZ_QUERY = `query {
  profile {
    name
    description
    skills {
      name
    }
    experience {
      company
      position
    }
    projects {
      name
    }
  }
}`;

interface ITzProfile {
  name: string;
  description: string;
  skills: { name: string }[];
  experience: { company: string; position: string }[];
  projects: { name: string }[];
}

interface ITzData {
  profile: ITzProfile;
}

interface ILinksData {
  profile: { links: { kind: string; label: string; url: string }[] };
}

interface IEmploymentData {
  profile: { experience: { company: string; endedAt: string | null }[] };
}

interface IProfilesData {
  profiles: { id: string; experience: { endedAt: string | null; finished: boolean }[] }[];
}

interface ISkillsData {
  profiles: { id: string; skills: { category: string | null; name: string }[] }[];
}

/**
 * Ordering the API applies to a nested collection, as the read layer defines it: the natural keys
 * of the table, with `id` as the last key so two rows with equal keys do not swap between reads.
 *
 * | collection | order                                                                    |
 * |------------|--------------------------------------------------------------------------|
 * | links      | `kind` in the declaration order of `SocialKind`, then `label`             |
 * | skills     | `category` with an empty one last, then `name`                            |
 * | experience | `startedAt`, the latest job first                                         |
 * | projects   | `name`                                                                   |
 *
 * The expected lists are sorted here instead of being taken in file order: `data/profile.yml`
 * groups its arrays by meaning, and the API no longer keeps that order.
 *
 * The textual comparison follows the collation of the database — `en_US.utf8` in the compose image
 * — which `Intl.Collator('en')` reproduces at the primary level: punctuation is ignored there, so
 * `@orion76/ng-plugin` comes before `@orion76/plugin` and `GitHub Actions` after `Git`.
 */
const collator = new Intl.Collator('en');

/** `kind` values in the order the enum declares them, which is the order the database sorts them. */
const KIND_ORDER = ['GITHUB', 'LINKEDIN', 'WEBSITE', 'OTHER'];

/**
 * Rank of one social kind.
 *
 * @param kind value of the `kind` column
 * @throws Error when the enum declares a value the spec does not know: it would sort last silently
 */
function kindRank(kind: string): number {
  const rank = KIND_ORDER.indexOf(kind);

  if (rank === -1) {
    throw new Error(`SocialKind has no value ${kind}: update KIND_ORDER of the spec`);
  }

  return rank;
}

/**
 * Compares two skill categories; an empty one is a value of its own and goes last.
 *
 * @param left category of the first skill
 * @param right category of the second skill
 * @returns the comparison result `ORDER BY category` gives
 */
function compareCategories(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return collator.compare(left, right);
}

/** @returns the links of the response as `kind | label | url`, in the order the API returns them */
function expectedLinks(links: readonly ISeedLink[]): string[] {
  return [...links]
    .sort(
      (left, right) =>
        kindRank(left.kind) - kindRank(right.kind) || collator.compare(left.label, right.label),
    )
    .map((link) => `${link.kind} | ${link.label} | ${link.url}`);
}

/** @returns the names of the skills in the order the API returns them */
function expectedSkillNames(skills: readonly ISeedSkill[]): string[] {
  return [...skills]
    .sort(
      (left, right) =>
        compareCategories(left.category, right.category) || collator.compare(left.name, right.name),
    )
    .map((skill) => skill.name);
}

/** @returns the employment records as `company | position`, the latest job first */
function expectedEmployment(experience: readonly ISeedExperience[]): string[] {
  return [...experience]
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .map((job) => `${job.company} | ${job.position}`);
}

/** @returns the project names in the order the API returns them */
function expectedProjectNames(projects: readonly ISeedProject[]): string[] {
  return [...projects]
    .sort((left, right) => collator.compare(left.name, right.name))
    .map((project) => project.name);
}

describe('profile query from the assignment', () => {
  let app: INestApplication;
  let seed: ISeedProfile;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    seed = readSeedProfile();
    app = await startApp({ databaseUrl: TEST_DATABASE_URL });
  });

  afterEach(async () => {
    await deleteProfileFixtures(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('returns the profile with its skills, experience and projects', async () => {
    const response = await graphql<ITzData>(app, TZ_QUERY);
    const profile = response.data?.profile;

    if (profile === undefined || profile === null) {
      throw new Error(`the query from the assignment failed: ${JSON.stringify(response.errors)}`);
    }

    expect(response.status).toBe(200);
    expect(response.errors).toBeUndefined();

    // The content belongs to `data/profile.yml`; the counts below say the three collections are
    // complete, and the ordered lists say the API sorts them by their natural keys instead of
    // keeping the order of the file.
    expect(profile.name).toBe(seed.name);
    expect(profile.description).toBe(seed.description);

    expect(profile.skills).toHaveLength(seed.skills.length);
    expect(profile.skills.map((skill) => skill.name)).toEqual(expectedSkillNames(seed.skills));

    expect(profile.experience).toHaveLength(seed.experience.length);
    expect(profile.experience.map((job) => `${job.company} | ${job.position}`)).toEqual(
      expectedEmployment(seed.experience),
    );

    expect(profile.projects).toHaveLength(seed.projects.length);
    expect(profile.projects.map((project) => project.name)).toEqual(
      expectedProjectNames(seed.projects),
    );
  });

  it('returns every link of the profile', async () => {
    const response = await graphql<ILinksData>(
      app,
      'query { profile { links { kind label url } } }',
    );
    const links = response.data?.profile.links;

    if (links === undefined) {
      throw new Error(`the links query failed: ${JSON.stringify(response.errors)}`);
    }

    expect(links).toHaveLength(seed.links.length);
    expect(links.map((link) => `${link.kind} | ${link.label} | ${link.url}`)).toEqual(
      expectedLinks(seed.links),
    );
  });

  it('sorts a skill without a category after every categorized skill of the profile', async () => {
    const fixture: IFixtureProfile = await insertProfileFixture(prisma, 'sorting', {
      current: false,
    });

    // The fixture of `insertProfileFixture` carries a skill without a category and a name that
    // sorts before `Zeta`, so an empty category placed first would show up as the wrong head of the
    // list rather than as a shuffle nobody notices. The skill is a dictionary row, so it is written
    // with the tie of this profile in one nested create.
    await prisma.profileSkill.create({
      data: {
        profile: { connect: { id: fixture.id } },
        skill: { create: { name: 'Zeta', category: 'cms' } },
      },
    });

    const response = await graphql<ISkillsData>(
      app,
      'query { profiles { id skills { category name } } }',
    );
    const profiles = response.data?.profiles;

    if (profiles === undefined || profiles === null) {
      throw new Error(`the skills query failed: ${JSON.stringify(response.errors)}`);
    }

    const found = profiles.find((profile) => profile.id === fixture.id);

    if (found === undefined) {
      throw new Error(`the fixture profile ${fixture.id} is missing from the response`);
    }

    expect(found.skills.map((skill) => skill.name)).toEqual([
      'Zeta',
      'Fixture skill sorting',
    ]);
    // The root list stays `createdAt asc`: the row created by the test is the last one.
    expect(profiles.at(-1)?.id).toBe(fixture.id);
  });

  it('reports endedAt as null for the current employment', async () => {
    const fixture: IFixtureProfile = await insertProfileFixture(prisma, 'current-job', {
      current: true,
    });

    const response = await graphql<IProfilesData>(
      app,
      'query { profiles { id experience { endedAt finished } } }',
    );
    const profiles = response.data?.profiles;

    if (profiles === undefined || profiles === null) {
      throw new Error(`the profiles query failed: ${JSON.stringify(response.errors)}`);
    }

    const found = profiles.find((profile) => profile.id === fixture.id);

    if (found === undefined) {
      throw new Error(`the fixture profile ${fixture.id} is missing from the response`);
    }

    // A current job is the pair `finished: false`, `endedAt: null`; the date is the only closed
    // half of the pair, so a wrong mapping shows up here and not in a later format comparison.
    expect(found.experience).toHaveLength(1);
    expect(found.experience[0].finished).toBe(false);
    expect(found.experience[0].endedAt).toBeNull();
  });

  it('returns the employment period of every seeded record', async () => {
    const response = await graphql<IEmploymentData>(
      app,
      'query { profile { experience { company endedAt } } }',
    );
    const experience = response.data?.profile.experience;

    if (experience === undefined) {
      throw new Error(`the employment query failed: ${JSON.stringify(response.errors)}`);
    }

    expect(experience).toHaveLength(seed.experience.length);

    // The response is ordered by `startedAt`, not by the file, so the expectations are matched by
    // the company of the record instead of by its position.
    const endedAtOf = new Map(
      seed.experience.map((job) => [job.company, job.endedAt ?? null] as const),
    );

    experience.forEach((job) => {
      if (!endedAtOf.has(job.company)) {
        throw new Error(`the response carries a job the file does not: ${job.company}`);
      }

      const expected = endedAtOf.get(job.company) as string | null;

      if (expected === null) {
        expect(job.endedAt).toBeNull();
        return;
      }

      // The date column is calendar-only: the response is a timestamp and only its date part has
      // to match the file.
      expect(new Date(String(job.endedAt)).toISOString().slice(0, 10)).toBe(expected);
    });
  });
});
