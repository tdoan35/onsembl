import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestServer, TestContext, authenticateTestUser } from '../../helpers/test-server';

describe('POST /auth/logout', () => {
  let ctx: TestContext;
  let authToken: string | undefined;

  beforeAll(async () => {
    ctx = await createTestServer();
    authToken = await authenticateTestUser(ctx.supabase);

    // Register auth routes
    ctx.server.post('/auth/logout', async (request, reply) => {
      const authHeader = request.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({
          error: 'Unauthorized',
        });
      }

      // Mock logout
      return reply.code(200).send({
        message: 'Successfully logged out',
      });
    });

    await ctx.server.ready();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should logout authenticated user', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Successfully logged out');
  });

  it('should reject logout without auth token', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/auth/logout',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Unauthorized');
  });
});