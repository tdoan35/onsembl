import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestServer, TestContext, authenticateTestUser, generateTestCommand } from '../../helpers/test-server';

describe('GET /commands', () => {
  let ctx: TestContext;
  let authToken: string | undefined;

  beforeAll(async () => {
    ctx = await createTestServer();
    authToken = await authenticateTestUser(ctx.supabase);

    const mockCommands = [
      generateTestCommand('agent-1', {
        id: 'cmd-1',
        status: 'completed',
        created_at: new Date().toISOString(),
      }),
      generateTestCommand('agent-2', {
        id: 'cmd-2',
        status: 'executing',
        created_at: new Date().toISOString(),
      }),
      generateTestCommand('agent-1', {
        id: 'cmd-3',
        status: 'pending',
        created_at: new Date().toISOString(),
      }),
    ];

    // Register command list route
    ctx.server.get('/commands', async (request, reply) => {
      const authHeader = request.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({
          error: 'Unauthorized',
        });
      }

      const { agentId, status } = request.query as { agentId?: string; status?: string };

      let filteredCommands = [...mockCommands];

      if (agentId) {
        filteredCommands = filteredCommands.filter(c => c.agent_id === agentId);
      }

      if (status) {
        filteredCommands = filteredCommands.filter(c => c.status === status);
      }

      return reply.code(200).send({
        commands: filteredCommands,
        total: filteredCommands.length,
      });
    });

    await ctx.server.ready();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should list all commands', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/commands',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.commands).toHaveLength(3);
    expect(body.total).toBe(3);
  });

  it('should filter commands by agent', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/commands?agentId=agent-1',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.commands).toHaveLength(2);
    expect(body.commands.every((c: any) => c.agent_id === 'agent-1')).toBe(true);
  });

  it('should filter commands by status', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/commands?status=pending',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.commands).toHaveLength(1);
    expect(body.commands[0].status).toBe('pending');
  });
});