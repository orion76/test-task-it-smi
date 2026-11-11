import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { graphql, serverOf, startApp } from './support/app';
import { TEST_DATABASE_URL } from './support/environment';

// The container runs with `NODE_ENV=production`, which is where Apollo would drop introspection
// and the landing page by default. The application enables both explicitly, so the specs check the
// same mode the deployment uses.
process.env.NODE_ENV = 'production';

interface IIntrospectionData {
  __schema: { queryType: { name: string }; types: { name: string }[] };
}

describe('application surface', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await startApp({ databaseUrl: TEST_DATABASE_URL });
  });

  afterAll(async () => {
    await app.close();
    process.env.NODE_ENV = 'test';
  });

  it('serves the Apollo Sandbox page on GET /graphql', async () => {
    const response = await request(serverOf(app))
      .get('/graphql')
      .set('Accept', 'text/html');
    const body = String(response.text);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    // The embedded Sandbox is the landing page the assignment asks for; GraphiQL is switched off
    // in the driver config, so its own marker must not be the one that renders.
    expect(body).toContain('embeddableSandbox');
    expect(body).toContain('embeddable-sandbox');
  });

  it('answers the healthcheck with the ok status', async () => {
    const response = await request(serverOf(app)).get('/health');
    const body = response.body as { status: string };

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(body).toEqual({ status: 'ok' });
  });

  it('keeps introspection available in production', async () => {
    const response = await graphql<IIntrospectionData>(
      app,
      'query { __schema { queryType { name } types { name } } }',
    );

    expect(response.status).toBe(200);
    expect(response.errors).toBeUndefined();
    expect(response.data?.__schema.queryType.name).toBe('Query');
    expect(response.data?.__schema.types.map((type) => type.name)).toEqual(
      expect.arrayContaining(['Profile', 'Experience', 'Skill', 'Project', 'SocialLink']),
    );
  });
});
