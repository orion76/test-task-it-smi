import type { INestApplication } from '@nestjs/common';

import { graphql, startApp } from './support/app';
import { EMPTY_DATABASE_URL } from './support/environment';

interface IEmptyProfileData {
  profile: { id: string };
}

interface IProfilesPageData {
  profiles: { id: string }[];
}

describe('API errors on an empty database', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await startApp({ databaseUrl: EMPTY_DATABASE_URL });
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the empty profile table as a not-found error with a readable message', async () => {
    const response = await graphql<IEmptyProfileData>(app, 'query { profile { id } }');
    const error = response.errors?.[0];

    expect(error).toBeDefined();
    // No row is an error of the request, not an empty object and not a masked null: the message
    // says what is wrong and what to do about it.
    expect(error?.message).toContain('No profile records');
    expect(error?.message).toContain('seed');
    // The GraphQL transport keeps HTTP 200 for field errors; the 404 of `NotFoundException` travels
    // in the error extensions, so a client still receives the not-found status it can act on.
    expect(error?.extensions?.status).toBe(404);
    expect(response.data).toBeNull();
  });

  it('rejects a page limit above the maximum instead of returning an empty list', async () => {
    const response = await graphql<IProfilesPageData>(app, 'query { profiles(limit: 101) { id } }');
    const error = response.errors?.[0];

    expect(error).toBeDefined();
    expect(error?.message).toBe('limit must be an integer between 1 and 100, received 101.');
    expect(error?.extensions?.code).toBe('BAD_REQUEST');
    // The list query answers an error, not `[]`: an out-of-range page is a client mistake, and an
    // empty page would hide it.
    expect(response.data).toBeNull();
  });

  it('returns an empty page for a valid page on an empty table', async () => {
    const response = await graphql<IProfilesPageData>(app, 'query { profiles { id } }');

    expect(response.errors).toBeUndefined();
    expect(response.data?.profiles).toEqual([]);
  });
});
