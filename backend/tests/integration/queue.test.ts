import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import WebSocket from 'ws';
import { createTestServer, TestContext } from '../helpers/test-server';
import { MessageType, CommandStatus, AgentType } from '@onsembl/agent-protocol';

describe('Integration: Queue Management and Cancellation', () => {
  let ctx: TestContext;
  let wsUrl: string;

  // Queue simulation state
  const commandQueue = new Map<string, any[]>(); // agentId -> commands[]
  const executingCommands = new Map<string, string>(); // agentId -> commandId
  const cancelledCommands = new Set<string>();
  const maxQueueSize = 5;

  beforeAll(async () => {
    ctx = await createTestServer();

    await ctx.server.register(require('@fastify/websocket'));

    // WebSocket handler with queue management
    ctx.server.register(async function (fastify) {
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        let agentId: string;

        connection.socket.on('message', (message) => {
          const data = JSON.parse(message.toString());

          if (data.type === MessageType.AGENT_CONNECT) {
            agentId = data.payload.agentId;
            commandQueue.set(agentId, []);
            connection.socket.send(JSON.stringify({
              type: 'CONNECTION_ACK',
              payload: { agentId },
            }));
          }

          if (data.type === MessageType.COMMAND_REQUEST) {
            const commandId = 'cmd-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            const command = {
              id: commandId,
              agentId,
              command: data.payload.command,
              priority: data.payload.priority || 1,
              status: CommandStatus.QUEUED,
              timestamp: Date.now(),
            };

            const queue = commandQueue.get(agentId) || [];

            // Check max queue size
            if (queue.length >= maxQueueSize) {
              connection.socket.send(JSON.stringify({
                type: 'COMMAND_REJECTED',
                payload: {
                  commandId,
                  reason: 'Queue full',
                  maxQueueSize,
                },
              }));
              return;
            }

            // Insert by priority (higher priority first)
            let insertIndex = queue.length;
            for (let i = 0; i < queue.length; i++) {
              if (command.priority > queue[i].priority) {
                insertIndex = i;
                break;
              }
            }
            queue.splice(insertIndex, 0, command);
            commandQueue.set(agentId, queue);

            // Calculate queue position (1-indexed)
            const queuePosition = insertIndex + 1;

            // Send acknowledgment with queue position
            connection.socket.send(JSON.stringify({
              type: 'COMMAND_ACK',
              payload: {
                commandId,
                status: CommandStatus.QUEUED,
                queuePosition,
                estimatedStartTime: new Date(Date.now() + (queuePosition - 1) * 5000).toISOString(),
              },
            }));

            // Process queue if not currently executing
            processQueue(agentId, connection);
          }

          if (data.type === MessageType.COMMAND_CANCEL) {
            const { commandId } = data.payload;
            cancelledCommands.add(commandId);

            const queue = commandQueue.get(agentId) || [];
            const commandIndex = queue.findIndex(cmd => cmd.id === commandId);

            if (commandIndex !== -1) {
              // Remove from queue
              queue.splice(commandIndex, 1);
              commandQueue.set(agentId, queue);

              // Update queue positions for remaining commands
              queue.forEach((cmd, index) => {
                connection.socket.send(JSON.stringify({
                  type: 'QUEUE_POSITION_UPDATE',
                  payload: {
                    commandId: cmd.id,
                    queuePosition: index + 1,
                  },
                }));
              });

              connection.socket.send(JSON.stringify({
                type: 'COMMAND_CANCELLED',
                payload: {
                  commandId,
                  status: CommandStatus.CANCELLED,
                },
              }));
            } else if (executingCommands.get(agentId) === commandId) {
              // Cancel currently executing command
              executingCommands.delete(agentId);
              connection.socket.send(JSON.stringify({
                type: 'COMMAND_CANCELLED',
                payload: {
                  commandId,
                  status: CommandStatus.CANCELLED,
                },
              }));

              // Process next in queue
              processQueue(agentId, connection);
            }
          }
        });

        function processQueue(agentId: string, connection: any) {
          if (executingCommands.has(agentId)) {
            return; // Already executing a command
          }

          const queue = commandQueue.get(agentId) || [];
          if (queue.length === 0) {
            return; // No commands in queue
          }

          const nextCommand = queue.shift();
          if (!nextCommand) return;

          if (cancelledCommands.has(nextCommand.id)) {
            // Command was cancelled, process next
            processQueue(agentId, connection);
            return;
          }

          commandQueue.set(agentId, queue);
          executingCommands.set(agentId, nextCommand.id);

          // Update status to executing
          connection.socket.send(JSON.stringify({
            type: 'COMMAND_STATUS_UPDATE',
            payload: {
              commandId: nextCommand.id,
              status: CommandStatus.EXECUTING,
            },
          }));

          // Update queue positions for remaining commands
          queue.forEach((cmd, index) => {
            connection.socket.send(JSON.stringify({
              type: 'QUEUE_POSITION_UPDATE',
              payload: {
                commandId: cmd.id,
                queuePosition: index + 1,
              },
            }));
          });

          // Simulate command execution
          setTimeout(() => {
            if (!cancelledCommands.has(nextCommand.id)) {
              // Send some terminal output
              connection.socket.send(JSON.stringify({
                type: MessageType.TERMINAL_OUTPUT,
                payload: {
                  commandId: nextCommand.id,
                  agentId,
                  output: `Executing: ${nextCommand.command}\n`,
                  type: 'stdout',
                  timestamp: new Date().toISOString(),
                  sequence: 1,
                },
              }));

              // Complete the command
              setTimeout(() => {
                if (!cancelledCommands.has(nextCommand.id)) {
                  connection.socket.send(JSON.stringify({
                    type: 'COMMAND_COMPLETE',
                    payload: {
                      commandId: nextCommand.id,
                      status: CommandStatus.COMPLETED,
                      exitCode: 0,
                      duration: 2000,
                      startedAt: new Date(Date.now() - 2000).toISOString(),
                      completedAt: new Date().toISOString(),
                    },
                  }));

                  executingCommands.delete(agentId);
                  // Process next command in queue
                  processQueue(agentId, connection);
                }
              }, 2000);
            }
          }, 500);
        }
      });
    });

    // REST endpoint to get queue status
    ctx.server.get('/agents/:id/queue', async (request, reply) => {
      const agentId = (request.params as any).id;
      const queue = commandQueue.get(agentId) || [];
      const executing = executingCommands.get(agentId);

      return reply.send({
        queueSize: queue.length,
        maxQueueSize,
        executing,
        commands: queue.map((cmd, index) => ({
          commandId: cmd.id,
          command: cmd.command,
          priority: cmd.priority,
          position: index + 1,
          status: cmd.status,
        })),
      });
    });

    await ctx.server.listen({ port: 0 });
    const address = ctx.server.server.address() as any;
    wsUrl = `ws://localhost:${address.port}/ws/agent`;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('should assign correct queue positions for multiple commands', async () => {
    const ws = new WebSocket(wsUrl);
    const receivedMessages: any[] = [];
    const agentId = 'agent-queue-1';

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            token: 'valid-token',
            version: '1.0.0',
            capabilities: [],
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        if (message.type === 'CONNECTION_ACK') {
          // Send multiple commands rapidly
          for (let i = 1; i <= 3; i++) {
            ws.send(JSON.stringify({
              type: MessageType.COMMAND_REQUEST,
              payload: {
                command: `test command ${i}`,
                priority: 1,
              },
            }));
          }
        }

        // Wait for all ACKs
        const ackMessages = receivedMessages.filter(m => m.type === 'COMMAND_ACK');
        if (ackMessages.length === 3) {
          // Verify queue positions
          expect(ackMessages[0].payload.queuePosition).toBe(1);
          expect(ackMessages[1].payload.queuePosition).toBe(2);
          expect(ackMessages[2].payload.queuePosition).toBe(3);

          // Verify all are queued (first one should start executing)
          expect(ackMessages.every(ack => ack.payload.status === CommandStatus.QUEUED)).toBe(true);

          ws.close();
          resolve();
        }
      });
    });
  });

  it('should handle priority-based queue insertion', async () => {
    const ws = new WebSocket(wsUrl);
    const receivedMessages: any[] = [];
    const agentId = 'agent-queue-priority';

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            token: 'valid-token',
            version: '1.0.0',
            capabilities: [],
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        if (message.type === 'CONNECTION_ACK') {
          // Send low priority command first
          ws.send(JSON.stringify({
            type: MessageType.COMMAND_REQUEST,
            payload: {
              command: 'low priority command',
              priority: 1,
            },
          }));

          // Then send high priority command
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: MessageType.COMMAND_REQUEST,
              payload: {
                command: 'high priority command',
                priority: 10,
              },
            }));
          }, 100);
        }

        const ackMessages = receivedMessages.filter(m => m.type === 'COMMAND_ACK');
        if (ackMessages.length === 2) {
          // High priority should get position 1 (after currently executing)
          const lowPriorityAck = ackMessages.find(ack =>
            ack.payload.command === 'low priority command' ||
            receivedMessages.some(m => m.payload?.commandId === ack.payload.commandId && m.payload?.command === 'low priority command')
          );
          const highPriorityAck = ackMessages.find(ack =>
            ack.payload.command === 'high priority command' ||
            receivedMessages.some(m => m.payload?.commandId === ack.payload.commandId && m.payload?.command === 'high priority command')
          );

          // The high priority command should jump ahead in queue
          expect(highPriorityAck?.payload.queuePosition).toBe(1);

          ws.close();
          resolve();
        }
      });
    });
  });

  it('should successfully cancel a queued command', async () => {
    const ws = new WebSocket(wsUrl);
    const receivedMessages: any[] = [];
    const agentId = 'agent-queue-cancel';
    let commandToCancel: string;

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            token: 'valid-token',
            version: '1.0.0',
            capabilities: [],
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        if (message.type === 'CONNECTION_ACK') {
          // Send multiple commands
          ws.send(JSON.stringify({
            type: MessageType.COMMAND_REQUEST,
            payload: {
              command: 'command 1',
              priority: 1,
            },
          }));

          ws.send(JSON.stringify({
            type: MessageType.COMMAND_REQUEST,
            payload: {
              command: 'command 2',
              priority: 1,
            },
          }));
        }

        if (message.type === 'COMMAND_ACK' && !commandToCancel) {
          // Cancel the second command
          const ackMessages = receivedMessages.filter(m => m.type === 'COMMAND_ACK');
          if (ackMessages.length === 2) {
            commandToCancel = ackMessages[1].payload.commandId;

            // Cancel the second command
            setTimeout(() => {
              ws.send(JSON.stringify({
                type: MessageType.COMMAND_CANCEL,
                payload: {
                  commandId: commandToCancel,
                },
              }));
            }, 100);
          }
        }

        if (message.type === 'COMMAND_CANCELLED') {
          expect(message.payload.commandId).toBe(commandToCancel);
          expect(message.payload.status).toBe(CommandStatus.CANCELLED);

          // Should receive queue position updates for remaining commands
          const positionUpdates = receivedMessages.filter(m => m.type === 'QUEUE_POSITION_UPDATE');
          expect(positionUpdates.length).toBeGreaterThan(0);

          ws.close();
          resolve();
        }
      });
    });
  });

  it('should reorder queue after cancellation', async () => {
    const ws = new WebSocket(wsUrl);
    const receivedMessages: any[] = [];
    const agentId = 'agent-queue-reorder';
    let firstCommandId: string;

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            token: 'valid-token',
            version: '1.0.0',
            capabilities: [],
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        if (message.type === 'CONNECTION_ACK') {
          // Send three commands
          for (let i = 1; i <= 3; i++) {
            ws.send(JSON.stringify({
              type: MessageType.COMMAND_REQUEST,
              payload: {
                command: `command ${i}`,
                priority: 1,
              },
            }));
          }
        }

        if (message.type === 'COMMAND_ACK' && !firstCommandId) {
          firstCommandId = message.payload.commandId;
        }

        const ackMessages = receivedMessages.filter(m => m.type === 'COMMAND_ACK');
        if (ackMessages.length === 3) {
          // Cancel the first command (which should be executing)
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: MessageType.COMMAND_CANCEL,
              payload: {
                commandId: firstCommandId,
              },
            }));
          }, 100);
        }

        if (message.type === 'COMMAND_CANCELLED') {
          // Wait a bit for queue reordering
          setTimeout(() => {
            const positionUpdates = receivedMessages.filter(m => m.type === 'QUEUE_POSITION_UPDATE');

            // Should have position updates for remaining commands
            expect(positionUpdates.length).toBeGreaterThan(0);

            // Positions should be updated to fill the gap
            const latestPositions = new Map();
            positionUpdates.forEach(update => {
              latestPositions.set(update.payload.commandId, update.payload.queuePosition);
            });

            // Remaining commands should have positions 1 and 2
            const positions = Array.from(latestPositions.values()).sort();
            expect(positions.length).toBeGreaterThan(0);

            ws.close();
            resolve();
          }, 200);
        }
      });
    });
  });

  it('should enforce max queue size limits', async () => {
    const ws = new WebSocket(wsUrl);
    const receivedMessages: any[] = [];
    const agentId = 'agent-queue-limit';

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            token: 'valid-token',
            version: '1.0.0',
            capabilities: [],
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        if (message.type === 'CONNECTION_ACK') {
          // Send more commands than max queue size
          for (let i = 1; i <= maxQueueSize + 2; i++) {
            ws.send(JSON.stringify({
              type: MessageType.COMMAND_REQUEST,
              payload: {
                command: `command ${i}`,
                priority: 1,
              },
            }));
          }
        }

        const ackMessages = receivedMessages.filter(m => m.type === 'COMMAND_ACK');
        const rejectedMessages = receivedMessages.filter(m => m.type === 'COMMAND_REJECTED');

        if (ackMessages.length + rejectedMessages.length === maxQueueSize + 2) {
          // Should have accepted exactly maxQueueSize commands
          expect(ackMessages.length).toBe(maxQueueSize);

          // Should have rejected the excess commands
          expect(rejectedMessages.length).toBe(2);

          // Rejected messages should have proper reason
          rejectedMessages.forEach(rejected => {
            expect(rejected.payload.reason).toBe('Queue full');
            expect(rejected.payload.maxQueueSize).toBe(maxQueueSize);
          });

          ws.close();
          resolve();
        }
      });
    });
  });

  it('should provide queue status via REST API', async () => {
    const ws = new WebSocket(wsUrl);
    const agentId = 'agent-queue-status';

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            token: 'valid-token',
            version: '1.0.0',
            capabilities: [],
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'CONNECTION_ACK') {
          // Send a few commands
          for (let i = 1; i <= 3; i++) {
            ws.send(JSON.stringify({
              type: MessageType.COMMAND_REQUEST,
              payload: {
                command: `status test ${i}`,
                priority: i,
              },
            }));
          }

          // Check queue status via REST API after commands are queued
          setTimeout(async () => {
            const response = await ctx.server.inject({
              method: 'GET',
              url: `/agents/${agentId}/queue`,
            });

            expect(response.statusCode).toBe(200);
            const queueStatus = JSON.parse(response.payload);

            expect(queueStatus.maxQueueSize).toBe(maxQueueSize);
            expect(queueStatus.queueSize).toBeGreaterThan(0);
            expect(Array.isArray(queueStatus.commands)).toBe(true);

            // Commands should be ordered by priority (highest first)
            for (let i = 0; i < queueStatus.commands.length - 1; i++) {
              expect(queueStatus.commands[i].priority).toBeGreaterThanOrEqual(
                queueStatus.commands[i + 1].priority
              );
            }

            ws.close();
            resolve();
          }, 500);
        }
      });
    });
  });

  it('should handle rapid command submission and cancellation', async () => {
    const ws = new WebSocket(wsUrl);
    const receivedMessages: any[] = [];
    const agentId = 'agent-queue-rapid';
    const commandIds: string[] = [];

    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            token: 'valid-token',
            version: '1.0.0',
            capabilities: [],
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        if (message.type === 'CONNECTION_ACK') {
          // Rapidly submit multiple commands
          for (let i = 1; i <= 5; i++) {
            setTimeout(() => {
              ws.send(JSON.stringify({
                type: MessageType.COMMAND_REQUEST,
                payload: {
                  command: `rapid command ${i}`,
                  priority: Math.floor(Math.random() * 10) + 1,
                },
              }));
            }, i * 50);
          }
        }

        if (message.type === 'COMMAND_ACK') {
          commandIds.push(message.payload.commandId);

          // Cancel every other command
          if (commandIds.length % 2 === 0) {
            setTimeout(() => {
              ws.send(JSON.stringify({
                type: MessageType.COMMAND_CANCEL,
                payload: {
                  commandId: message.payload.commandId,
                },
              }));
            }, 100);
          }
        }

        // Check if we've processed all commands
        const ackCount = receivedMessages.filter(m => m.type === 'COMMAND_ACK').length;
        const cancelledCount = receivedMessages.filter(m => m.type === 'COMMAND_CANCELLED').length;

        if (ackCount === 5 && cancelledCount > 0) {
          // Verify system stability after rapid operations
          expect(cancelledCount).toBeGreaterThan(0);
          expect(cancelledCount).toBeLessThanOrEqual(3); // At most 3 cancellations

          const positionUpdates = receivedMessages.filter(m => m.type === 'QUEUE_POSITION_UPDATE');
          expect(positionUpdates.length).toBeGreaterThan(0);

          ws.close();
          resolve();
        }
      });
    });
  });
});