import { test } from 'tap';
import { build } from '../../../src/app.js';
import { FastifyInstance } from 'fastify';

test('POST /auth/validate contract tests', async (t) => {
  let app: FastifyInstance;

  t.beforeEach(async () => {
    app = await build({ logger: false });
    await app.ready();
  });

  t.afterEach(async () => {
    await app.close();
  });

  t.test('returns 401 for missing token', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/validate',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    t.equal(response.statusCode, 401);
    const body = JSON.parse(response.body);
    t.equal(body.error, 'UNAUTHORIZED');
  });

  t.test('returns 401 for invalid token', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/validate',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token: 'invalid-token',
      }),
    });

    t.equal(response.statusCode, 401);
    const body = JSON.parse(response.body);
    t.equal(body.error, 'UNAUTHORIZED');
    t.match(body.message, /invalid|expired/i);
  });

  t.test('returns 200 for valid token', async (t) => {
    const testToken = process.env['TEST_JWT_TOKEN'];
    if (!testToken) {
      t.skip('TEST_JWT_TOKEN not set');
      return;
    }

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/validate',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token: testToken,
      }),
    });

    t.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);

    // Validate response structure
    t.has(body, 'valid');
    t.has(body, 'user_id');

    t.equal(body.valid, true);
    t.type(body.user_id, 'string');
    t.match(body.user_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    // Optional fields
    if (body.email) {
      t.type(body.email, 'string');
      t.match(body.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/); // Basic email format
    }

    if (body.expires_at) {
      t.type(body.expires_at, 'number');
      t.ok(body.expires_at > Date.now() / 1000, 'Token should not be expired');
    }
  });

  t.test('handles expired tokens correctly', async (t) => {
    // This is a valid JWT but expired (exp claim in the past)
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiZXhwIjoxNTE2MjM5MDIyfQ.4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzzht-KQ';

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/validate',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token: expiredToken,
      }),
    });

    t.equal(response.statusCode, 401);
    const body = JSON.parse(response.body);
    t.equal(body.error, 'UNAUTHORIZED');
    t.match(body.message, /expired/i);
  });

  t.test('validates malformed JWT correctly', async (t) => {
    const malformedTokens = [
      'not.a.jwt', // Wrong format
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', // Missing parts
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.', // Missing signature
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..signature', // Missing payload
    ];

    for (const token of malformedTokens) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/validate',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      t.equal(response.statusCode, 401, `Token "${token}" should be invalid`);
      const body = JSON.parse(response.body);
      t.equal(body.error, 'UNAUTHORIZED');
    }
  });

  t.test('validates token with invalid signature', async (t) => {
    // Valid structure but wrong signature
    const invalidSigToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.wrong_signature';

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/validate',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token: invalidSigToken,
      }),
    });

    t.equal(response.statusCode, 401);
    const body = JSON.parse(response.body);
    t.equal(body.error, 'UNAUTHORIZED');
  });

  t.test('returns user email when available', async (t) => {
    const testToken = process.env['TEST_JWT_TOKEN'];
    if (!testToken) {
      t.skip('TEST_JWT_TOKEN not set');
      return;
    }

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/validate',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token: testToken,
      }),
    });

    t.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);

    if (body.email) {
      t.type(body.email, 'string');
      t.ok(body.email.includes('@'), 'Email should contain @');
    }
  });
});