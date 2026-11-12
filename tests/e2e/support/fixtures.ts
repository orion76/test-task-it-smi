import type { PrismaClient } from '@prisma/client';

import type { IFixtureOptions, IFixtureProfile } from './types';

/**
 * Slug prefix of every row the specs add to the database.
 *
 * The prefix is what makes the cleanup independent of the test order: one `deleteMany` by slug
 * removes every fixture, and no other row of the seeded content matches it.
 */
const FIXTURE_SLUG_PREFIX = 'e2e-fixture-';

/**
 * Inserts one profile with a child of every collection, so a nested query has something to batch.
 *
 * The rows are written through the Prisma client of the test, not through the API: the API is
 * read-only by design, and the fixture only exists to give the read path more than one parent.
 * A skill and a link are dictionaries shared between profiles, so the fixture writes the dictionary
 * row and the tie of this profile in one nested create: that is the shape the seed produces too.
 *
 * @param prisma client of the test database
 * @param key unique suffix of the slug
 * @param options shape of the employment record
 * @returns identifiers of the inserted profile
 */
export async function insertProfileFixture(
  prisma: PrismaClient,
  key: string,
  options: IFixtureOptions,
): Promise<IFixtureProfile> {
  return prisma.profile.create({
    data: {
      slug: `${FIXTURE_SLUG_PREFIX}${key}`,
      name: `Fixture ${key}`,
      description: `Temporary profile of the e2e suite (${key}).`,
      profileSocialLinks: {
        create: {
          socialLink: {
            create: { label: 'GitHub', url: `https://example.com/${key}`, kind: 'GITHUB' },
          },
        },
      },
      profileSkills: {
        create: { skill: { create: { name: `Fixture skill ${key}` } } },
      },
      experience: {
        create: [
          {
            company: `Fixture company ${key}`,
            position: 'Engineer',
            startedAt: new Date('2020-01-01'),
            endedAt: options.current ? null : new Date('2021-01-01'),
            finished: !options.current,
            achievements: [`Fixture achievement ${key}`],
          },
        ],
      },
      projects: { create: [{ name: `Fixture project ${key}` }] },
    },
    select: { id: true, slug: true },
  });
}

/**
 * Removes every fixture profile of the suite; the rows of the tie tables go with it through the
 * relation cascade. The dictionary rows of the fixtures are not children of the profile, so they
 * are removed by the same run: a dictionary row no profile lists any more belongs to nobody, while
 * the seeded rows keep their tie to the seeded profile.
 *
 * @param prisma client of the test database
 */
export async function deleteProfileFixtures(prisma: PrismaClient): Promise<void> {
  await prisma.profile.deleteMany({ where: { slug: { startsWith: FIXTURE_SLUG_PREFIX } } });
  await prisma.skill.deleteMany({ where: { profileSkills: { none: {} } } });
  await prisma.socialLink.deleteMany({ where: { profileSocialLinks: { none: {} } } });
}
