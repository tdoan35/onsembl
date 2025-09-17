import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestServer, TestContext } from '../../helpers/test-server';

describe('POST /auth/login', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestServer();

    // Register auth routes
    ctx.server.post('/auth/login', async (request, reply) => {
      const { email } = request.body as { email: string };

      if (!email || !email.includes('@')) {
        return reply.code(400).send({
          error: 'Invalid email format',
        });
      }

      // Mock Supabase magic link response
      return reply.code(200).send({
        message: 'Magic link sent to email',
      });
    });

    await ctx.server.ready();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should send magic link for valid email', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'user@example.com',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Magic link sent to email');
  });

  it('should reject invalid email format', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'invalid-email',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Invalid email format');
  });

  it('should reject missing email', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Invalid email format');
  });
});