import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import WebSocket from 'ws';
import { createTestServer, TestContext } from '../helpers/test-server';
import { MessageType } from '@onsembl/agent-protocol';

describe('Integration: Agent Connection and Status Display', () => {
  let ctx: TestContext;
  let wsUrl: string;
  let apiUrl: string;

  beforeAll(async () => {
    ctx = await createTestServer();

    // Setup WebSocket
    await ctx.server.register(require('@fastify/websocket'));

    // Agent status tracking
    const agentStatuses = new Map();

    // WebSocket handler
    ctx.server.register(async function (fastify) {
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        connection.socket.on('message', (message) => {
          const data = JSON.parse(message.toString());

          if (data.type === MessageType.AGENT_CONNECT) {
            const agentId = data.payload.agentId;

            // Update agent status
            agentStatuses.set(agentId, {
              id: agentId,
              status: 'online',
              lastPing: new Date().toISOString(),
              connection: connection,
            });

            connection.socket.send(JSON.stringify({
              type: 'CONNECTION_ACK',
              payload: { agentId },
            }));
          }
        });

        connection.socket.on('close', () => {
          // Update status to offline
          for (const [id, agent] of agentStatuses.entries()) {
            if (agent.connection === connection) {
              agentStatuses.set(id, { ...agent, status: 'offline' });
            }
          }
        });
      });
    });

    // REST API endpoint
    ctx.server.get('/agents/:id/status', async (request, reply) => {
      const { id } = request.params as { id: string };
      const agent = agentStatuses.get(id);

      if (!agent) {
        return reply.code(404).send({ error: 'Agent not found' });
      }

      return reply.send({
        id: agent.id,
        status: agent.status,
        lastPing: agent.lastPing,
      });
    });

    await ctx.server.listen({ port: 0 });
    const address = ctx.server.server.address() as any;
    wsUrl = `ws://localhost:${address.port}/ws/agent`;
    apiUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should show agent as ONLINE when connected', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId: 'agent-test-1',
            token: 'valid-token',
            version: '1.0.0',
          },
        }));
      });

      ws.on('message', async (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'CONNECTION_ACK') {
          // Check status via API
          const response = await ctx.server.inject({
            method: 'GET',
            url: '/agents/agent-test-1/status',
          });

          expect(response.statusCode).toBe(200);
          const body = JSON.parse(response.body);
          expect(body.status).toBe('online');
          expect(body.id).toBe('agent-test-1');
          expect(body.lastPing).toBeDefined();

          ws.close();
          resolve();
        }
      });
    });
  });

  it('should show agent as OFFLINE when disconnected', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId: 'agent-test-2',
            token: 'valid-token',
          },
        }));
      });

      ws.on('message', async (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'CONNECTION_ACK') {
          // Close connection
          ws.close();

          // Wait a bit for close to process
          setTimeout(async () => {
            const response = await ctx.server.inject({
              method: 'GET',
              url: '/agents/agent-test-2/status',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.status).toBe('offline');
            resolve();
          }, 100);
        }
      });
    });
  });

  it('should handle multiple agents with different statuses', async () => {
    const ws1 = new WebSocket(wsUrl);
    const ws2 = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => {
      let connected = 0;

      const checkComplete = () => {
        connected++;
        if (connected === 2) {
          // Both connected, close one
          ws1.close();

          setTimeout(async () => {
            // Check agent-1 is offline
            const response1 = await ctx.server.inject({
              method: 'GET',
              url: '/agents/agent-multi-1/status',
            });
            expect(JSON.parse(response1.body).status).toBe('offline');

            // Check agent-2 is still online
            const response2 = await ctx.server.inject({
              method: 'GET',
              url: '/agents/agent-multi-2/status',
            });
            expect(JSON.parse(response2.body).status).toBe('online');

            ws2.close();
            resolve();
          }, 100);
        }
      };

      ws1.on('open', () => {
        ws1.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: { agentId: 'agent-multi-1', token: 'token' },
        }));
      });

      ws1.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'CONNECTION_ACK') checkComplete();
      });

      ws2.on('open', () => {
        ws2.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: { agentId: 'agent-multi-2', token: 'token' },
        }));
      });

      ws2.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'CONNECTION_ACK') checkComplete();
      });
    });
  });
});