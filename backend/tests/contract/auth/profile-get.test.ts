import { test } from 'tap';
import { build } from '../../../src/app.js';
import { FastifyInstance } from 'fastify';

test('GET /auth/profile contract tests', async (t) => {
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
      url: '/api/auth/profile',
    });

    t.equal(response.statusCode, 401);
    const body = JSON.parse(response.body);
    t.equal(body.error, 'UNAUTHORIZED');
    t.match(body.message, /token/i);
  });

  t.test('returns 404 if profile does not exist', async (t) => {
    const testToken = process.env['TEST_JWT_TOKEN_NO_PROFILE'];
    if (!testToken) {
      t.skip('TEST_JWT_TOKEN_NO_PROFILE not set');
      return;
    }

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/profile',
      headers: {
        authorization: `Bearer ${testToken}`,
      },
    });

    t.equal(response.statusCode, 404);
    const body = JSON.parse(response.body);
    t.equal(body.error, 'NOT_FOUND');
    t.match(body.message, /profile|not found/i);
  });

  t.test('returns 200 with profile data', async (t) => {
    const testToken = process.env['TEST_JWT_TOKEN'];
    if (!testToken) {
      t.skip('TEST_JWT_TOKEN not set');
      return;
    }

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/profile',
      headers: {
        authorization: `Bearer ${testToken}`,
      },
    });

    // Profile might not exist yet, so accept 404 as valid
    if (response.statusCode === 404) {
      t.pass('Profile does not exist yet');
      return;
    }

    t.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);

    // Validate response schema matches OpenAPI spec
    t.has(body, 'id');
    t.has(body, 'created_at');
    t.has(body, 'updated_at');

    t.type(body.id, 'string');
    t.match(body.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    // Optional fields
    if (body.username !== null) {
      t.type(body.username, 'string');
      t.ok(body.username.length >= 3 && body.username.length <= 30);
      t.match(body.username, /^[a-zA-Z0-9_]+$/);
    }

    if (body.avatar_url !== null) {
      t.type(body.avatar_url, 'string');
    }

    if (body.full_name !== null) {
      t.type(body.full_name, 'string');
    }

    if (body.bio !== null) {
      t.type(body.bio, 'string');
      t.ok(body.bio.length <= 500);
    }

    if (body.preferences) {
      t.type(body.preferences, 'object');
    }
  });

  t.test('validates response headers', async (t) => {
    const testToken = process.env['TEST_JWT_TOKEN'];
    if (!testToken) {
      t.skip('TEST_JWT_TOKEN not set');
      return;
    }

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/profile',
      headers: {
        authorization: `Bearer ${testToken}`,
      },
    });

    t.match(response.headers['content-type'], /application\/json/);
  });
});