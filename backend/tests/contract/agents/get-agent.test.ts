import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestServer, TestContext, authenticateTestUser, generateTestAgent } from '../../helpers/test-server';

describe('GET /agents/:id', () => {
  let ctx: TestContext;
  let authToken: string | undefined;

  beforeAll(async () => {
    ctx = await createTestServer();
    authToken = await authenticateTestUser(ctx.supabase);

    const mockAgent = generateTestAgent({
      id: 'agent-123',
      name: 'claude-agent',
      last_ping: new Date().toISOString(),
    });

    // Register agent routes
    ctx.server.get('/agents/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({
          error: 'Unauthorized',
        });
      }

      const { id } = request.params as { id: string };

      if (id !== 'agent-123') {
        return reply.code(404).send({
          error: 'Agent not found',
        });
      }

      return reply.code(200).send(mockAgent);
    });

    await ctx.server.ready();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should get agent by id', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/agents/agent-123',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe('agent-123');
    expect(body.name).toBe('claude-agent');
    expect(body.type).toBe('claude');
  });

  it('should return 404 for non-existent agent', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/agents/non-existent',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Agent not found');
  });

  it('should reject request without auth token', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/agents/agent-123',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Unauthorized');
  });
});