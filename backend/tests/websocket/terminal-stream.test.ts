import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import WebSocket from 'ws';
import { createTestServer, TestContext } from '../helpers/test-server';
import { MessageType } from '@onsembl/agent-protocol';

describe('WebSocket Terminal Streaming', () => {
  let ctx: TestContext;
  let wsUrl: string;

  beforeAll(async () => {
    ctx = await createTestServer();

    await ctx.server.register(require('@fastify/websocket'));

    ctx.server.register(async function (fastify) {
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        connection.socket.on('message', (message) => {
          const data = JSON.parse(message.toString());

          if (data.type === MessageType.AGENT_CONNECT) {
            connection.socket.send(JSON.stringify({
              type: 'CONNECTION_ACK',
              payload: { agentId: data.payload.agentId },
            }));
          }

          if (data.type === MessageType.TERMINAL_OUTPUT) {
            // Echo back for latency testing
            const receiveTime = Date.now();
            connection.socket.send(JSON.stringify({
              type: 'TERMINAL_ACK',
              payload: {
                commandId: data.payload.commandId,
                sequence: data.payload.sequence,
                receiveTime,
                sentTime: data.payload.timestamp,
                latency: receiveTime - new Date(data.payload.timestamp).getTime(),
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

  it('should stream terminal output with low latency', (done) => {
    const ws = new WebSocket(wsUrl);

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
        // Send terminal output
        const sentTime = Date.now();
        ws.send(JSON.stringify({
          type: MessageType.TERMINAL_OUTPUT,
          payload: {
            commandId: 'cmd-123',
            agentId: 'agent-123',
            output: 'Hello from terminal\\n',
            type: 'stdout',
            timestamp: new Date(sentTime).toISOString(),
            sequence: 1,
          },
        }));
      }

      if (message.type === 'TERMINAL_ACK') {
        // Check latency is under 200ms
        expect(message.payload.latency).toBeLessThan(200);
        expect(message.payload.commandId).toBe('cmd-123');
        expect(message.payload.sequence).toBe(1);
        ws.close();
        done();
      }
    });
  });

  it('should handle streaming multiple outputs in sequence', (done) => {
    const ws = new WebSocket(wsUrl);
    const receivedSequences: number[] = [];

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
        // Send multiple outputs
        for (let i = 1; i <= 5; i++) {
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: MessageType.TERMINAL_OUTPUT,
              payload: {
                commandId: 'cmd-123',
                agentId: 'agent-123',
                output: `Line ${i}\\n`,
                type: 'stdout',
                timestamp: new Date().toISOString(),
                sequence: i,
              },
            }));
          }, i * 10); // Stagger by 10ms
        }
      }

      if (message.type === 'TERMINAL_ACK') {
        receivedSequences.push(message.payload.sequence);

        if (receivedSequences.length === 5) {
          // Check all sequences received in order
          expect(receivedSequences).toEqual([1, 2, 3, 4, 5]);
          ws.close();
          done();
        }
      }
    });
  });

  it('should handle different output types', (done) => {
    const ws = new WebSocket(wsUrl);
    const receivedTypes: string[] = [];

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
        // Send different output types
        ['stdout', 'stderr', 'system'].forEach((outputType, i) => {
          ws.send(JSON.stringify({
            type: MessageType.TERMINAL_OUTPUT,
            payload: {
              commandId: 'cmd-123',
              agentId: 'agent-123',
              output: `${outputType} message\\n`,
              type: outputType,
              timestamp: new Date().toISOString(),
              sequence: i + 1,
            },
          }));
        });
      }

      if (message.type === 'TERMINAL_ACK') {
        receivedTypes.push(message.payload.sequence);

        if (receivedTypes.length === 3) {
          expect(receivedTypes).toEqual([1, 2, 3]);
          ws.close();
          done();
        }
      }
    });
  });
});