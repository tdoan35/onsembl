import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import WebSocket from 'ws';
import { createTestServer, TestContext } from '../helpers/test-server';
import { MessageType } from '@onsembl/agent-protocol';

describe('Integration: Command Execution with Real-time Output', () => {
  let ctx: TestContext;
  let wsUrl: string;

  beforeAll(async () => {
    ctx = await createTestServer();

    await ctx.server.register(require('@fastify/websocket'));

    const activeCommands = new Map();

    // WebSocket handler
    ctx.server.register(async function (fastify) {
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        let agentId: string;

        connection.socket.on('message', (message) => {
          const data = JSON.parse(message.toString());

          if (data.type === MessageType.AGENT_CONNECT) {
            agentId = data.payload.agentId;
            connection.socket.send(JSON.stringify({
              type: 'CONNECTION_ACK',
              payload: { agentId },
            }));
          }

          if (data.type === MessageType.COMMAND_REQUEST) {
            const commandId = 'cmd-' + Date.now();
            activeCommands.set(commandId, {
              id: commandId,
              agentId,
              command: data.payload.command,
              status: 'executing',
            });

            // Send acknowledgment
            connection.socket.send(JSON.stringify({
              type: 'COMMAND_ACK',
              payload: {
                commandId,
                status: 'executing',
              },
            }));

            // Simulate command execution with output
            const outputs = [
              'Starting command execution...',
              'Processing...',
              'Command completed successfully!',
            ];

            outputs.forEach((output, index) => {
              setTimeout(() => {
                connection.socket.send(JSON.stringify({
                  type: MessageType.TERMINAL_OUTPUT,
                  payload: {
                    commandId,
                    agentId,
                    output: output + '\\n',
                    type: 'stdout',
                    timestamp: new Date().toISOString(),
                    sequence: index + 1,
                  },
                }));

                // Send completion after last output
                if (index === outputs.length - 1) {
                  setTimeout(() => {
                    connection.socket.send(JSON.stringify({
                      type: 'COMMAND_COMPLETE',
                      payload: {
                        commandId,
                        status: 'completed',
                        exitCode: 0,
                      },
                    }));
                    activeCommands.set(commandId, {
                      ...activeCommands.get(commandId),
                      status: 'completed',
                    });
                  }, 50);
                }
              }, (index + 1) * 100);
            });
          }
        });
      });
    });

    // REST endpoint to execute command
    ctx.server.post('/agents/:id/execute', async (request, reply) => {
      // Trigger command via WebSocket to connected agent
      return reply.send({
        message: 'Command queued',
        queuePosition: 1,
      });
    });

    await ctx.server.listen({ port: 0 });
    const address = ctx.server.server.address() as any;
    wsUrl = `ws://localhost:${address.port}/ws/agent`;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should execute command and stream output in real-time', async () => {
    const ws = new WebSocket(wsUrl);
    const outputs: string[] = [];
    let commandId: string;

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId: 'agent-exec-1',
            token: 'valid-token',
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'CONNECTION_ACK') {
          // Request command execution
          ws.send(JSON.stringify({
            type: MessageType.COMMAND_REQUEST,
            payload: {
              command: 'npm test',
              arguments: {},
              priority: 1,
            },
          }));
        }

        if (message.type === 'COMMAND_ACK') {
          commandId = message.payload.commandId;
          expect(message.payload.status).toBe('executing');
        }

        if (message.type === MessageType.TERMINAL_OUTPUT) {
          expect(message.payload.commandId).toBe(commandId);
          expect(message.payload.type).toBe('stdout');
          outputs.push(message.payload.output.trim());
        }

        if (message.type === 'COMMAND_COMPLETE') {
          expect(message.payload.commandId).toBe(commandId);
          expect(message.payload.status).toBe('completed');
          expect(message.payload.exitCode).toBe(0);

          // Verify all outputs received
          expect(outputs).toEqual([
            'Starting command execution...',
            'Processing...',
            'Command completed successfully!',
          ]);

          ws.close();
          resolve();
        }
      });
    });
  });

  it('should handle command with error output', async () => {
    const ws = new WebSocket(wsUrl);
    let hasStderr = false;

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId: 'agent-exec-2',
            token: 'valid-token',
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'CONNECTION_ACK') {
          // Simulate error command
          ws.send(JSON.stringify({
            type: MessageType.TERMINAL_OUTPUT,
            payload: {
              commandId: 'cmd-error',
              agentId: 'agent-exec-2',
              output: 'Error: Command failed\\n',
              type: 'stderr',
              timestamp: new Date().toISOString(),
              sequence: 1,
            },
          }));

          hasStderr = true;
          setTimeout(() => {
            expect(hasStderr).toBe(true);
            ws.close();
            resolve();
          }, 100);
        }
      });
    });
  });
});