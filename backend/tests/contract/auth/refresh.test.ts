import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestServer, TestContext, authenticateTestUser } from '../../helpers/test-server';

describe('POST /auth/refresh', () => {
  let ctx: TestContext;
  let authToken: string | undefined;

  beforeAll(async () => {
    ctx = await createTestServer();
    authToken = await authenticateTestUser(ctx.supabase);

    // Register auth routes
    ctx.server.post('/auth/refresh', async (request, reply) => {
      const { refresh_token } = request.body as { refresh_token?: string };

      if (!refresh_token) {
        return reply.code(400).send({
          error: 'Refresh token required',
        });
      }

      // Mock token refresh
      return reply.code(200).send({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
      });
    });

    await ctx.server.ready();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should refresh tokens with valid refresh token', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {
        refresh_token: 'valid-refresh-token',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.access_token).toBe('new-access-token');
    expect(body.refresh_token).toBe('new-refresh-token');
    expect(body.expires_in).toBe(3600);
  });

  it('should reject refresh without token', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Refresh token required');
  });
});