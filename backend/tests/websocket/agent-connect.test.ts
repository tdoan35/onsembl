import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import WebSocket from 'ws';
import { createTestServer, TestContext } from '../helpers/test-server';
import { MessageType } from '@onsembl/agent-protocol';

describe('WebSocket Agent Connection Flow', () => {
  let ctx: TestContext;
  let wsUrl: string;

  beforeAll(async () => {
    ctx = await createTestServer();

    // Setup WebSocket handler
    await ctx.server.register(require('@fastify/websocket'));

    ctx.server.register(async function (fastify) {
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        connection.socket.on('message', (message) => {
          const data = JSON.parse(message.toString());

          if (data.type === MessageType.AGENT_CONNECT) {
            // Validate agent connection message
            if (!data.payload.agentId || !data.payload.token) {
              connection.socket.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: 'Invalid connection parameters' },
              }));
              connection.socket.close();
              return;
            }

            // Send connection acknowledgment
            connection.socket.send(JSON.stringify({
              type: 'CONNECTION_ACK',
              payload: {
                agentId: data.payload.agentId,
                connectionId: 'conn-' + Date.now(),
              },
            }));
          }
        });
      });
    });

    await ctx.server.listen({ port: 0 });
    const address = ctx.server.server.address() as any;
    wsUrl = `ws://localhost:${address.port}/ws/agent`;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should connect agent with valid credentials', (done) => {
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: MessageType.AGENT_CONNECT,
        payload: {
          agentId: 'agent-123',
          token: 'valid-token',
          version: '1.0.0',
          capabilities: ['code_execution'],
        },
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      expect(message.type).toBe('CONNECTION_ACK');
      expect(message.payload.agentId).toBe('agent-123');
      expect(message.payload.connectionId).toBeDefined();
      ws.close();
      done();
    });
  });

  it('should reject connection with invalid credentials', (done) => {
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: MessageType.AGENT_CONNECT,
        payload: {
          // Missing required fields
          version: '1.0.0',
        },
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      expect(message.type).toBe('ERROR');
      expect(message.payload.message).toBe('Invalid connection parameters');
    });

    ws.on('close', () => {
      done();
    });
  });

  it('should handle reconnection', (done) => {
    const ws1 = new WebSocket(wsUrl);
    let connectionId1: string;

    ws1.on('open', () => {
      ws1.send(JSON.stringify({
        type: MessageType.AGENT_CONNECT,
        payload: {
          agentId: 'agent-123',
          token: 'valid-token',
          version: '1.0.0',
        },
      }));
    });

    ws1.on('message', (data) => {
      const message = JSON.parse(data.toString());
      connectionId1 = message.payload.connectionId;
      ws1.close();

      // Reconnect
      const ws2 = new WebSocket(wsUrl);
      ws2.on('open', () => {
        ws2.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId: 'agent-123',
            token: 'valid-token',
            version: '1.0.0',
            reconnecting: true,
          },
        }));
      });

      ws2.on('message', (data) => {
        const message = JSON.parse(data.toString());
        expect(message.type).toBe('CONNECTION_ACK');
        expect(message.payload.agentId).toBe('agent-123');
        // New connection ID should be generated
        expect(message.payload.connectionId).not.toBe(connectionId1);
        ws2.close();
        done();
      });
    });
  });
});