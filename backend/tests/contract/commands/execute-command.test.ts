import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestServer, TestContext, authenticateTestUser, generateTestCommand } from '../../helpers/test-server';

describe('POST /agents/:id/execute', () => {
  let ctx: TestContext;
  let authToken: string | undefined;

  beforeAll(async () => {
    ctx = await createTestServer();
    authToken = await authenticateTestUser(ctx.supabase);

    // Register command execution route
    ctx.server.post('/agents/:id/execute', async (request, reply) => {
      const authHeader = request.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({
          error: 'Unauthorized',
        });
      }

      const { id } = request.params as { id: string };
      const { command, arguments: args, priority } = request.body as {
        command: string;
        arguments?: Record<string, any>;
        priority?: number;
      };

      if (!command) {
        return reply.code(400).send({
          error: 'Command is required',
        });
      }

      if (id !== 'agent-123') {
        return reply.code(404).send({
          error: 'Agent not found',
        });
      }

      // Mock command creation
      const commandData = generateTestCommand(id, {
        id: 'cmd-' + Date.now(),
        command,
        arguments: args || {},
        priority: priority || 1,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      return reply.code(201).send(commandData);
    });

    await ctx.server.ready();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should execute command on agent', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/agents/agent-123/execute',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
      payload: {
        command: 'npm test',
        arguments: { verbose: true },
        priority: 5,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.command).toBe('npm test');
    expect(body.arguments.verbose).toBe(true);
    expect(body.priority).toBe(5);
    expect(body.status).toBe('pending');
  });

  it('should reject command without required field', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/agents/agent-123/execute',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
      payload: {
        arguments: { verbose: true },
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Command is required');
  });

  it('should return 404 for non-existent agent', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/agents/non-existent/execute',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
      payload: {
        command: 'npm test',
      },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Agent not found');
  });
});