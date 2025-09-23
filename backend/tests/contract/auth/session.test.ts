import { test } from 'tap';
import { build } from '../../../src/app.js';
import { FastifyInstance } from 'fastify';
import { createClient } from '@supabase/supabase-js';

test('GET /auth/session contract tests', async (t) => {
  let app: FastifyInstance;

  t.beforeEach(async () => {
    app = await build({ logger: false });
    await app.ready();
  });

  t.afterEach(async () => {
    await app.close();
  });

  t.test('returns 401 without token', async (t) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
    });

    t.equal(response.statusCode, 401);
    const body = JSON.parse(response.body);
    t.equal(body.error, 'UNAUTHORIZED');
    t.match(body.message, /token/i);
  });

  t.test('returns 401 with invalid token', async (t) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: {
        authorization: 'Bearer invalid-token',
      },
    });

    t.equal(response.statusCode, 401);
    const body = JSON.parse(response.body);
    t.equal(body.error, 'UNAUTHORIZED');
  });

  t.test('returns 200 with valid token', async (t) => {
    // Skip this test if no test token is available
    const testToken = process.env['TEST_JWT_TOKEN'];
    if (!testToken) {
      t.skip('TEST_JWT_TOKEN not set');
      return;
    }

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: {
        authorization: `Bearer ${testToken}`,
      },
    });

    t.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);

    // Validate response structure matches OpenAPI spec
    t.has(body, 'user');
    t.has(body, 'expires_at');
    t.type(body.expires_at, 'number');

    // Validate user object
    t.has(body.user, 'id');
    t.has(body.user, 'email');
    t.has(body.user, 'created_at');
    t.type(body.user.id, 'string');
    t.type(body.user.email, 'string');
  });

  t.test('returns expires_in field correctly', async (t) => {
    const testToken = process.env['TEST_JWT_TOKEN'];
    if (!testToken) {
      t.skip('TEST_JWT_TOKEN not set');
      return;
    }

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: {
        authorization: `Bearer ${testToken}`,
      },
    });

    t.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);

    if (body.expires_in !== undefined) {
      t.type(body.expires_in, 'number');
      t.ok(body.expires_in > 0, 'expires_in should be positive');
      t.ok(body.expires_in <= 3600, 'expires_in should be less than or equal to 1 hour');
    }
  });

  t.test('validates JWT signature correctly', async (t) => {
    // Create a token with invalid signature
    const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.invalid_signature';

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: {
        authorization: `Bearer ${invalidToken}`,
      },
    });

    t.equal(response.statusCode, 401);
  });
});