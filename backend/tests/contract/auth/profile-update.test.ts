import { test } from 'tap';
import { build } from '../../../src/app.js';
import { FastifyInstance } from 'fastify';

test('PUT /auth/profile contract tests', async (t) => {
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
      method: 'PUT',
      url: '/api/auth/profile',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'testuser',
      }),
    });

    t.equal(response.statusCode, 401);
    const body = JSON.parse(response.body);
    t.equal(body.error, 'UNAUTHORIZED');
  });

  t.test('validates username format', async (t) => {
    const testToken = process.env['TEST_JWT_TOKEN'];
    if (!testToken) {
      t.skip('TEST_JWT_TOKEN not set');
      return;
    }

    // Test invalid username formats
    const invalidUsernames = [
      'ab', // too short
      'a'.repeat(31), // too long
      'user name', // contains space
      'user@name', // contains @
      'user-name', // contains hyphen
      '123user!', // contains special char
    ];

    for (const username of invalidUsernames) {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: {
          authorization: `Bearer ${testToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });

      t.equal(response.statusCode, 400, `Username "${username}" should be invalid`);
      const body = JSON.parse(response.body);
      t.equal(body.error, 'BAD_REQUEST');
    }
  });

  t.test('accepts valid username format', async (t) => {
    const testToken = process.env['TEST_JWT_TOKEN'];
    if (!testToken) {
      t.skip('TEST_JWT_TOKEN not set');
      return;
    }

    const validUsernames = [
      'abc', // minimum length
      'user_123', // with underscore and numbers
      'JohnDoe', // mixed case
      'a'.repeat(30), // maximum length
    ];

    for (const username of validUsernames) {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: {
          authorization: `Bearer ${testToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });

      // Accept 200 or 409 (duplicate username) as valid responses
      t.ok(
        response.statusCode === 200 || response.statusCode === 409,
        `Username "${username}" should be valid format`
      );
    }
  });

  t.test('updates profile successfully', async (t) => {
    const testToken = process.env['TEST_JWT_TOKEN'];
    if (!testToken) {
      t.skip('TEST_JWT_TOKEN not set');
      return;
    }

    const profileData = {
      username: `user_${Date.now()}`, // Unique username
      full_name: 'Test User',
      bio: 'This is a test bio',
      avatar_url: 'https://example.com/avatar.jpg',
      preferences: {
        theme: 'dark',
        notifications: true,
      },
    };

    const response = await app.inject({
      method: 'PUT',
      url: '/api/auth/profile',
      headers: {
        authorization: `Bearer ${testToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(profileData),
    });

    t.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);

    // Validate response structure
    t.has(body, 'id');
    t.has(body, 'created_at');
    t.has(body, 'updated_at');

    // Validate updated fields
    t.equal(body.username, profileData.username);
    t.equal(body.full_name, profileData.full_name);
    t.equal(body.bio, profileData.bio);
    t.equal(body.avatar_url, profileData.avatar_url);
    t.same(body.preferences, profileData.preferences);
  });

  t.test('handles duplicate username error', async (t) => {
    const testToken = process.env['TEST_JWT_TOKEN'];
    const testToken2 = process.env['TEST_JWT_TOKEN_2'];
    if (!testToken || !testToken2) {
      t.skip('TEST_JWT_TOKEN or TEST_JWT_TOKEN_2 not set');
      return;
    }

    const duplicateUsername = `duplicate_${Date.now()}`;

    // First user sets the username
    const response1 = await app.inject({
      method: 'PUT',
      url: '/api/auth/profile',
      headers: {
        authorization: `Bearer ${testToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ username: duplicateUsername }),
    });

    if (response1.statusCode === 200) {
      // Second user tries to use the same username
      const response2 = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: {
          authorization: `Bearer ${testToken2}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ username: duplicateUsername }),
      });

      t.equal(response2.statusCode, 409);
      const body = JSON.parse(response2.body);
      t.match(body.message, /username|already|exists|taken/i);
    }
  });

  t.test('validates bio length', async (t) => {
    const testToken = process.env['TEST_JWT_TOKEN'];
    if (!testToken) {
      t.skip('TEST_JWT_TOKEN not set');
      return;
    }

    const longBio = 'a'.repeat(501); // Over 500 char limit

    const response = await app.inject({
      method: 'PUT',
      url: '/api/auth/profile',
      headers: {
        authorization: `Bearer ${testToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ bio: longBio }),
    });

    t.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    t.equal(body.error, 'BAD_REQUEST');
  });

  t.test('accepts partial updates', async (t) => {
    const testToken = process.env['TEST_JWT_TOKEN'];
    if (!testToken) {
      t.skip('TEST_JWT_TOKEN not set');
      return;
    }

    // Update only bio
    const response = await app.inject({
      method: 'PUT',
      url: '/api/auth/profile',
      headers: {
        authorization: `Bearer ${testToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ bio: 'Updated bio only' }),
    });

    t.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    t.equal(body.bio, 'Updated bio only');
  });
});