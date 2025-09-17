import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import WebSocket from 'ws';
import { createTestServer, TestContext } from '../helpers/test-server';
import { MessageType } from '@onsembl/agent-protocol';

describe('WebSocket Agent Heartbeat', () => {
  let ctx: TestContext;
  let wsUrl: string;

  beforeAll(async () => {
    ctx = await createTestServer();

    // Setup WebSocket handler with heartbeat logic
    await ctx.server.register(require('@fastify/websocket'));

    ctx.server.register(async function (fastify) {
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        let heartbeatTimer: NodeJS.Timeout;
        let missedHeartbeats = 0;
        const MAX_MISSED = 3;
        const HEARTBEAT_INTERVAL = 30000; // 30 seconds

        connection.socket.on('message', (message) => {
          const data = JSON.parse(message.toString());

          if (data.type === MessageType.AGENT_CONNECT) {
            connection.socket.send(JSON.stringify({
              type: 'CONNECTION_ACK',
              payload: { agentId: data.payload.agentId },
            }));

            // Start heartbeat monitoring
            heartbeatTimer = setInterval(() => {
              missedHeartbeats++;
              if (missedHeartbeats >= MAX_MISSED) {
                connection.socket.send(JSON.stringify({
                  type: 'CONNECTION_TIMEOUT',
                  payload: { reason: 'Heartbeat timeout' },
                }));
                connection.socket.close();
                clearInterval(heartbeatTimer);
              }
            }, HEARTBEAT_INTERVAL);
          }

          if (data.type === MessageType.AGENT_HEARTBEAT) {
            missedHeartbeats = 0;
            connection.socket.send(JSON.stringify({
              type: 'HEARTBEAT_ACK',
              payload: {
                timestamp: data.payload.timestamp,
                serverTime: new Date().toISOString(),
              },
            }));
          }
        });

        connection.socket.on('close', () => {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
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

  it('should respond to heartbeat messages', (done) => {
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      // Connect first
      ws.send(JSON.stringify({
        type: MessageType.AGENT_CONNECT,
        payload: {
          agentId: 'agent-123',
          token: 'valid-token',
        },
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === 'CONNECTION_ACK') {
        // Send heartbeat
        const timestamp = new Date().toISOString();
        ws.send(JSON.stringify({
          type: MessageType.AGENT_HEARTBEAT,
          payload: {
            timestamp,
            metrics: {
              cpuUsage: 45.2,
              memoryUsage: 67.8,
            },
          },
        }));
      }

      if (message.type === 'HEARTBEAT_ACK') {
        expect(message.payload.timestamp).toBeDefined();
        expect(message.payload.serverTime).toBeDefined();
        ws.close();
        done();
      }
    });
  });

  it('should maintain heartbeat interval', (done) => {
    const ws = new WebSocket(wsUrl);
    const heartbeats: number[] = [];
    let lastHeartbeat: number;

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: MessageType.AGENT_CONNECT,
        payload: {
          agentId: 'agent-123',
          token: 'valid-token',
        },
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === 'CONNECTION_ACK') {
        // Send multiple heartbeats
        const sendHeartbeat = () => {
          ws.send(JSON.stringify({
            type: MessageType.AGENT_HEARTBEAT,
            payload: {
              timestamp: new Date().toISOString(),
            },
          }));
        };

        // Send 3 heartbeats with 100ms interval
        sendHeartbeat();
        setTimeout(sendHeartbeat, 100);
        setTimeout(sendHeartbeat, 200);
      }

      if (message.type === 'HEARTBEAT_ACK') {
        const now = Date.now();
        if (lastHeartbeat) {
          heartbeats.push(now - lastHeartbeat);
        }
        lastHeartbeat = now;

        if (heartbeats.length === 2) {
          // Check intervals are roughly 100ms
          expect(heartbeats[0]).toBeGreaterThan(50);
          expect(heartbeats[0]).toBeLessThan(150);
          expect(heartbeats[1]).toBeGreaterThan(50);
          expect(heartbeats[1]).toBeLessThan(150);
          ws.close();
          done();
        }
      }
    });
  });
});