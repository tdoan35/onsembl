import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestServer, TestContext, authenticateTestUser, generateTestAgent } from '../../helpers/test-server';

describe('GET /agents', () => {
  let ctx: TestContext;
  let authToken: string | undefined;

  beforeAll(async () => {
    ctx = await createTestServer();
    authToken = await authenticateTestUser(ctx.supabase);

    // Mock agents data
    const mockAgents = [
      generateTestAgent({ id: '1', name: 'claude-agent' }),
      generateTestAgent({ id: '2', name: 'gemini-agent', type: 'gemini' }),
      generateTestAgent({ id: '3', name: 'codex-agent', type: 'codex', status: 'offline' }),
    ];

    // Register agent routes
    ctx.server.get('/agents', async (request, reply) => {
      const authHeader = request.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({
          error: 'Unauthorized',
        });
      }

      const { status, type } = request.query as { status?: string; type?: string };

      let filteredAgents = [...mockAgents];

      if (status) {
        filteredAgents = filteredAgents.filter(a => a.status === status);
      }

      if (type) {
        filteredAgents = filteredAgents.filter(a => a.type === type);
      }

      return reply.code(200).send({
        agents: filteredAgents,
        total: filteredAgents.length,
      });
    });

    await ctx.server.ready();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should list all agents', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/agents',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.agents).toHaveLength(3);
    expect(body.total).toBe(3);
  });

  it('should filter agents by status', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/agents?status=online',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.agents).toHaveLength(2);
    expect(body.agents.every((a: any) => a.status === 'online')).toBe(true);
  });

  it('should filter agents by type', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/agents?type=claude',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.agents).toHaveLength(1);
    expect(body.agents[0].type).toBe('claude');
  });

  it('should reject request without auth token', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/agents',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Unauthorized');
  });
});