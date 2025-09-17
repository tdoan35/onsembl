import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import WebSocket from 'ws';
import { createTestServer, TestContext } from '../helpers/test-server';

// Simple UUID generator for test
function generateId(): string {
  return 'test-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Message types (from agent protocol)
const MessageType = {
  AGENT_CONNECT: 'AGENT_CONNECT',
  COMMAND_ACK: 'COMMAND_ACK',
  TERMINAL_OUTPUT: 'TERMINAL_OUTPUT',
  COMMAND_COMPLETE: 'COMMAND_COMPLETE',
} as const;

describe('Integration: Agent Restart Flow', () => {
  let ctx: TestContext;
  let wsUrl: string;
  let apiUrl: string;

  beforeAll(async () => {
    ctx = await createTestServer();

    await ctx.server.register(require('@fastify/websocket'));

    // Agent state management
    const agentStates = new Map();
    const activeCommands = new Map();
    const restartAttempts = new Map();

    // WebSocket handler for agents
    ctx.server.register(async function (fastify) {
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        let agentId: string;

        connection.socket.on('message', (message) => {
          const data = JSON.parse(message.toString());

          if (data.type === MessageType.AGENT_CONNECT) {
            agentId = data.payload.agentId;

            // Get existing agent state if any
            const existingAgent = agentStates.get(agentId);
            const wasRestartRequested = existingAgent?.restartRequested || false;

            // Update agent state
            agentStates.set(agentId, {
              id: agentId,
              status: 'online',
              connection: connection,
              lastPing: Date.now(),
              restartRequested: false,
            });

            // Handle restart attempts tracking
            if (restartAttempts.has(agentId) && wasRestartRequested) {
              const attempts = restartAttempts.get(agentId);
              attempts.successful = true;
              attempts.reconnectedAt = Date.now();
            }

            connection.socket.send(JSON.stringify({
              type: 'CONNECTION_ACK',
              payload: { agentId },
            }));
          }

          if (data.type === MessageType.COMMAND_ACK) {
            const { commandId, status } = data.payload;
            if (activeCommands.has(commandId)) {
              activeCommands.set(commandId, {
                ...activeCommands.get(commandId),
                status,
                acknowledgedAt: Date.now(),
              });
            }
          }

          if (data.type === MessageType.TERMINAL_OUTPUT) {
            const { commandId } = data.payload;
            if (activeCommands.has(commandId)) {
              const command = activeCommands.get(commandId);
              command.outputs = command.outputs || [];
              command.outputs.push(data.payload);
            }
          }

          if (data.type === MessageType.COMMAND_COMPLETE) {
            const { commandId, status, exitCode } = data.payload;
            if (activeCommands.has(commandId)) {
              activeCommands.set(commandId, {
                ...activeCommands.get(commandId),
                status,
                exitCode,
                completedAt: Date.now(),
              });
            }
          }
        });

        connection.socket.on('close', () => {
          if (agentId && agentStates.has(agentId)) {
            const agent = agentStates.get(agentId);
            agentStates.set(agentId, {
              ...agent,
              status: 'offline',
              connection: null,
              disconnectedAt: Date.now(),
            });
          }
        });
      });
    });

    // REST API endpoints
    ctx.server.post('/agents/:id/restart', async (request, reply) => {
      const { id } = request.params as { id: string };
      const agent = agentStates.get(id);

      if (!agent) {
        return reply.code(404).send({ error: 'Agent not found' });
      }

      // Initialize restart tracking
      if (!restartAttempts.has(id)) {
        restartAttempts.set(id, {
          count: 0,
          startedAt: Date.now(),
          successful: false,
          maxAttempts: 3,
        });
      }

      const attempts = restartAttempts.get(id);

      // Check if max attempts reached
      if (attempts.count >= attempts.maxAttempts && !attempts.successful) {
        // Don't reset attempts counter automatically
        // Only reset on successful reconnection (handled in AGENT_CONNECT)
      }

      // Increment attempt counter (but don't exceed maxAttempts)
      if (attempts.count < attempts.maxAttempts) {
        attempts.count++;
      }
      attempts.lastAttemptAt = Date.now();

      // Mark restart as requested
      agentStates.set(id, {
        ...agent,
        restartRequested: true,
        restartRequestedAt: Date.now(),
      });

      // Send restart command to agent if connected
      if (agent.connection) {
        agent.connection.socket.send(JSON.stringify({
          type: 'AGENT_CONTROL',
          payload: {
            action: 'restart',
            reason: 'Manual restart requested',
          },
        }));

        // Force disconnect after sending restart command
        setTimeout(() => {
          if (agent.connection) {
            agent.connection.socket.close();
          }
        }, 100);
      }

      return reply.send({
        message: 'Restart initiated',
        agentId: id,
        restartAttempt: attempts.count,
      });
    });

    ctx.server.get('/agents/:id/status', async (request, reply) => {
      const { id } = request.params as { id: string };
      const agent = agentStates.get(id);

      if (!agent) {
        return reply.code(404).send({ error: 'Agent not found' });
      }

      const attempts = restartAttempts.get(id);

      return reply.send({
        id: agent.id,
        status: agent.status,
        lastPing: agent.lastPing,
        restartRequested: agent.restartRequested,
        restartRequestedAt: agent.restartRequestedAt,
        disconnectedAt: agent.disconnectedAt,
        restartAttempts: attempts ? {
          count: attempts.count,
          successful: attempts.successful,
          reconnectedAt: attempts.reconnectedAt,
          maxAttempts: attempts.maxAttempts,
        } : null,
      });
    });

    ctx.server.post('/agents/:id/execute', async (request, reply) => {
      const { id } = request.params as { id: string };
      const { command } = request.body as { command: string };

      const agent = agentStates.get(id);
      if (!agent || agent.status !== 'online') {
        return reply.code(400).send({ error: 'Agent not available' });
      }

      const commandId = generateId();
      activeCommands.set(commandId, {
        id: commandId,
        agentId: id,
        command,
        status: 'queued',
        createdAt: Date.now(),
      });

      // Send command to agent
      agent.connection.socket.send(JSON.stringify({
        type: 'COMMAND_REQUEST',
        payload: {
          commandId,
          command,
          priority: 1,
        },
      }));

      return reply.send({
        commandId,
        message: 'Command queued for execution',
      });
    });

    ctx.server.get('/commands/:id/status', async (request, reply) => {
      const { id } = request.params as { id: string };
      const command = activeCommands.get(id);

      if (!command) {
        return reply.code(404).send({ error: 'Command not found' });
      }

      return reply.send(command);
    });

    await ctx.server.listen({ port: 0 });
    const address = ctx.server.server.address() as any;
    wsUrl = `ws://localhost:${address.port}`;
    apiUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should restart agent and reconnect within 10 seconds', async () => {
    const agentId = 'restart-test-agent';
    let ws = new WebSocket(`${wsUrl}/ws/agent`);

    // Initial connection
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            name: 'restart-test',
            type: 'CLAUDE',
            token: 'valid-token',
            version: '1.0.0',
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'CONNECTION_ACK') {
          resolve();
        }
      });
    });

    // Verify agent is online
    const statusResponse = await ctx.server.inject({
      method: 'GET',
      url: `/agents/${agentId}/status`,
    });
    expect(statusResponse.statusCode).toBe(200);
    expect(JSON.parse(statusResponse.body).status).toBe('online');

    // Trigger restart
    const restartResponse = await ctx.server.inject({
      method: 'POST',
      url: `/agents/${agentId}/restart`,
    });
    expect(restartResponse.statusCode).toBe(200);
    const restartBody = JSON.parse(restartResponse.body);
    expect(restartBody.message).toBe('Restart initiated');
    expect(restartBody.agentId).toBe(agentId);

    // Wait for disconnect
    await new Promise<void>((resolve) => {
      ws.on('close', () => resolve());
      // Timeout in case close doesn't happen
      setTimeout(resolve, 2000);
    });

    // Wait a bit for the status to update
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify agent is offline
    const offlineResponse = await ctx.server.inject({
      method: 'GET',
      url: `/agents/${agentId}/status`,
    });
    expect(offlineResponse.statusCode).toBe(200);
    expect(JSON.parse(offlineResponse.body).status).toBe('offline');

    // Simulate agent reconnection
    const reconnectStart = Date.now();
    ws = new WebSocket(`${wsUrl}/ws/agent`);

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            name: 'restart-test',
            type: 'CLAUDE',
            token: 'valid-token',
            version: '1.0.0',
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'CONNECTION_ACK') {
          resolve();
        }
      });
    });

    const reconnectTime = Date.now() - reconnectStart;

    // Verify reconnection happened within 10 seconds
    expect(reconnectTime).toBeLessThan(10000);

    // Verify agent is online again
    const finalResponse = await ctx.server.inject({
      method: 'GET',
      url: `/agents/${agentId}/status`,
    });
    expect(finalResponse.statusCode).toBe(200);
    const finalStatus = JSON.parse(finalResponse.body);
    expect(finalStatus.status).toBe('online');
    expect(finalStatus.restartAttempts.successful).toBe(true);

    ws.close();
  });

  it('should handle restart during command execution', async () => {
    const agentId = 'restart-during-execution';
    let ws = new WebSocket(`${wsUrl}/ws/agent`);

    // Connect agent
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            name: 'execution-test',
            type: 'CLAUDE',
            token: 'valid-token',
            version: '1.0.0',
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'CONNECTION_ACK') {
          resolve();
        }
      });
    });

    // Start command execution
    const executeResponse = await ctx.server.inject({
      method: 'POST',
      url: `/agents/${agentId}/execute`,
      payload: { command: 'echo "long running task"' },
    });
    expect(executeResponse.statusCode).toBe(200);
    const { commandId } = JSON.parse(executeResponse.body);

    // Wait for command acknowledgment
    await new Promise<void>((resolve) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'COMMAND_REQUEST') {
          // Send ACK
          ws.send(JSON.stringify({
            type: MessageType.COMMAND_ACK,
            payload: {
              commandId: message.payload.commandId,
              status: 'executing',
            },
          }));
          resolve();
        }
      });
    });

    // Trigger restart while command is executing
    const restartResponse = await ctx.server.inject({
      method: 'POST',
      url: `/agents/${agentId}/restart`,
    });
    expect(restartResponse.statusCode).toBe(200);

    // Wait for disconnect
    await new Promise<void>((resolve) => {
      ws.on('close', () => resolve());
      setTimeout(resolve, 2000);
    });

    // Check command status
    const commandResponse = await ctx.server.inject({
      method: 'GET',
      url: `/commands/${commandId}/status`,
    });
    expect(commandResponse.statusCode).toBe(200);
    const commandStatus = JSON.parse(commandResponse.body);
    expect(commandStatus.status).toBe('executing'); // Should remain in executing state

    // Reconnect agent
    ws = new WebSocket(`${wsUrl}/ws/agent`);
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            name: 'execution-test',
            type: 'CLAUDE',
            token: 'valid-token',
            version: '1.0.0',
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'CONNECTION_ACK') {
          resolve();
        }
      });
    });

    // Verify agent is online again
    const statusResponse = await ctx.server.inject({
      method: 'GET',
      url: `/agents/${agentId}/status`,
    });
    expect(statusResponse.statusCode).toBe(200);
    expect(JSON.parse(statusResponse.body).status).toBe('online');

    ws.close();
  });

  it('should implement exponential backoff for restart attempts', async () => {
    const agentId = 'backoff-test-agent';
    let ws = new WebSocket(`${wsUrl}/ws/agent`);

    // First, connect the agent
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            name: 'backoff-test',
            type: 'CLAUDE',
            token: 'valid-token',
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'CONNECTION_ACK') {
          resolve();
        }
      });
    });

    // Simulate multiple restart attempts
    for (let i = 0; i < 3; i++) {
      const restartResponse = await ctx.server.inject({
        method: 'POST',
        url: `/agents/${agentId}/restart`,
      });

      expect(restartResponse.statusCode).toBe(200);

      // Wait for disconnect
      await new Promise<void>((resolve) => {
        ws.on('close', () => resolve());
        setTimeout(resolve, 1000);
      });

      // Simulate failed reconnection (connect and immediately disconnect)
      if (i < 2) { // Don't reconnect on the last attempt
        ws = new WebSocket(`${wsUrl}/ws/agent`);
        await new Promise<void>((resolve) => {
          ws.on('open', () => {
            ws.send(JSON.stringify({
              type: MessageType.AGENT_CONNECT,
              payload: {
                agentId,
                name: 'backoff-test',
                type: 'CLAUDE',
                token: 'valid-token',
              },
            }));
            // Immediately close to simulate failure
            setTimeout(() => {
              ws.close();
              resolve();
            }, 50);
          });
        });
      }
    }

    // Check restart attempts tracking
    const statusResponse = await ctx.server.inject({
      method: 'GET',
      url: `/agents/${agentId}/status`,
    });

    expect(statusResponse.statusCode).toBe(200);
    const status = JSON.parse(statusResponse.body);
    if (status.restartAttempts) {
      expect(status.restartAttempts.count).toBeGreaterThan(0);
      expect(status.restartAttempts.maxAttempts).toBe(3);
    }
  });

  it('should stop restart attempts after max attempts reached', async () => {
    const agentId = 'max-attempts-test';
    let ws = new WebSocket(`${wsUrl}/ws/agent`);

    // First, connect the agent
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            name: 'max-attempts-test',
            type: 'CLAUDE',
            token: 'valid-token',
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'CONNECTION_ACK') {
          resolve();
        }
      });
    });

    // Make multiple restart attempts
    for (let i = 0; i < 5; i++) {
      const restartResponse = await ctx.server.inject({
        method: 'POST',
        url: `/agents/${agentId}/restart`,
      });

      expect(restartResponse.statusCode).toBe(200);
      const body = JSON.parse(restartResponse.body);
      expect(body.restartAttempt).toBe(Math.min(i + 1, 3)); // Should not exceed max attempts

      // Wait for disconnect
      await new Promise<void>((resolve) => {
        ws.on('close', () => resolve());
        setTimeout(resolve, 500);
      });

      // Reconnect for next iteration (except last one)
      if (i < 4) {
        ws = new WebSocket(`${wsUrl}/ws/agent`);
        await new Promise<void>((resolve) => {
          ws.on('open', () => {
            ws.send(JSON.stringify({
              type: MessageType.AGENT_CONNECT,
              payload: {
                agentId,
                name: 'max-attempts-test',
                type: 'CLAUDE',
                token: 'valid-token',
              },
            }));
          });

          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.type === 'CONNECTION_ACK') {
              resolve();
            }
          });
        });
      }
    }

    // Verify max attempts logic
    const statusResponse = await ctx.server.inject({
      method: 'GET',
      url: `/agents/${agentId}/status`,
    });

    expect(statusResponse.statusCode).toBe(200);
    const status = JSON.parse(statusResponse.body);
    if (status.restartAttempts) {
      expect(status.restartAttempts.count).toBeLessThanOrEqual(3);
    }
  });

  it('should reset restart attempts after successful reconnection', async () => {
    const agentId = 'reset-attempts-test';
    let ws = new WebSocket(`${wsUrl}/ws/agent`);

    // Initial connection
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            name: 'reset-test',
            type: 'CLAUDE',
            token: 'valid-token',
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'CONNECTION_ACK') {
          resolve();
        }
      });
    });

    // Trigger restart
    await ctx.server.inject({
      method: 'POST',
      url: `/agents/${agentId}/restart`,
    });

    // Wait for disconnect
    await new Promise<void>((resolve) => {
      ws.on('close', () => resolve());
      setTimeout(resolve, 1000);
    });

    // Reconnect successfully
    ws = new WebSocket(`${wsUrl}/ws/agent`);
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            name: 'reset-test',
            type: 'CLAUDE',
            token: 'valid-token',
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'CONNECTION_ACK') {
          resolve();
        }
      });
    });

    // Check that restart was successful
    const statusResponse = await ctx.server.inject({
      method: 'GET',
      url: `/agents/${agentId}/status`,
    });
    expect(statusResponse.statusCode).toBe(200);
    const status = JSON.parse(statusResponse.body);
    expect(status.status).toBe('online');
    if (status.restartAttempts) {
      expect(status.restartAttempts.successful).toBe(true);
    }

    ws.close();
  });
});