/**
 * Types of the e2e harness: the application started against a real database, the fixtures written
 * into it and the seeded content the API is expected to return.
 *
 * The helpers themselves (`app.ts`, `fixtures.ts`, `seed.ts`) hold only functions, so the shapes
 * they exchange live here, next to each other: a spec reads a type and a helper from the same
 * module path.
 */
import type { IEntityQueryPort } from '@src/common/contracts/types';

/** One error of a GraphQL response, in the shape Apollo sends it. */
interface IGraphqlErrorPayload {
  message: string;
  extensions?: Record<string, unknown>;
}

/** What a spec needs from a GraphQL HTTP response: the transport status and the body. */
export interface IGraphqlResponse<TData> {
  status: number;
  data?: TData | null;
  errors?: IGraphqlErrorPayload[];
}

/** How to start the application under test. */
export interface IAppOptions {
  /** Connection string of the database the app has to read. */
  databaseUrl: string;
  /** Replacement of the data-access port, used to count the reads of one request. */
  queryPort?: IEntityQueryPort;
}

/** A fixture row as the spec needs to find it back in the API response. */
export interface IFixtureProfile {
  id: string;
  slug: string;
}

/** What the fixture employment record should look like. */
export interface IFixtureOptions {
  /** `true` makes the fixture the current job (`finished: false`, no `endedAt`). */
  current: boolean;
}

/** One link of `data/profile.yml`. */
export interface ISeedLink {
  kind: string;
  label: string;
  url: string;
}

/** One skill of `data/profile.yml`. */
export interface ISeedSkill {
  name: string;
  category: string | null;
}

/** One employment record of `data/profile.yml`. */
export interface ISeedExperience {
  company: string;
  position: string;
  startedAt: string;
  endedAt?: string | null;
  finished?: boolean;
  achievements: string[];
}

/** One project of `data/profile.yml`. */
export interface ISeedProject {
  name: string;
  url?: string | null;
  description?: string | null;
}

/** The profile block of `data/profile.yml`. */
export interface ISeedProfile {
  slug: string;
  name: string;
  description: string;
  links: ISeedLink[];
  skills: ISeedSkill[];
  experience: ISeedExperience[];
  projects: ISeedProject[];
}

/** Envelope of the data file. */
export interface ISeedDocument {
  version: number;
  profile: ISeedProfile;
}
