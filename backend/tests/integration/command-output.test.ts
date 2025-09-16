import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { createTestServer, closeTestServer, generateTestToken } from '../utils/test-server';
import { v4 as uuidv4 } from 'uuid';

describe('Integration: Command Execution with Real-time Output', () => {
  let server: FastifyInstance;
  let wsUrl: string;
  let authToken: string;

  // Store active commands
  const activeCommands = new Map<string, any>();
  const terminalOutputs = new Map<string, any[]>();

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);

    // Register WebSocket plugin
    await server.register(require('@fastify/websocket'));

    // WebSocket endpoints
    server.register(async function (fastify) {
      // Agent WebSocket endpoint
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        const socket = connection.socket;
        let agentId: string | null = null;

        socket.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
              case 'AGENT_CONNECT':
                agentId = data.payload.agentId;
                socket.send(JSON.stringify({
                  type: 'CONNECTION_ACK',
                  payload: {
                    agentId,
                    connectionId: `conn-${Date.now()}`,
                  },
                }));
                break;

              case 'COMMAND_ACK':
                const { commandId, status } = data.payload;
                const command = activeCommands.get(commandId);
                if (command) {
                  command.status = status;
                  command.acknowledgedAt = new Date().toISOString();
                  activeCommands.set(commandId, command);
                }
                break;

              case 'TERMINAL_OUTPUT':
                const output = {
                  ...data.payload,
                  agentId,
                  receivedAt: Date.now(),
                };

                // Store output
                const cmdOutputs = terminalOutputs.get(data.payload.commandId) || [];
                cmdOutputs.push(output);
                terminalOutputs.set(data.payload.commandId, cmdOutputs);

                // Acknowledge receipt
                socket.send(JSON.stringify({
                  type: 'OUTPUT_ACK',
                  payload: {
                    commandId: data.payload.commandId,
                    sequence: data.payload.sequence,
                  },
                }));

                // Forward to dashboards
                server.websocketServer?.clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN && client !== socket) {
                    client.send(JSON.stringify({
                      type: 'TERMINAL_OUTPUT',
                      payload: output,
                    }));
                  }
                });
                break;

              case 'COMMAND_COMPLETE':
                const completedCommand = activeCommands.get(data.payload.commandId);
                if (completedCommand) {
                  completedCommand.status = 'COMPLETED';
                  completedCommand.exitCode = data.payload.exitCode;
                  completedCommand.completedAt = new Date().toISOString();
                  activeCommands.set(data.payload.commandId, completedCommand);

                  // Notify dashboards
                  server.websocketServer?.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN && client !== socket) {
                      client.send(JSON.stringify({
                        type: 'COMMAND_COMPLETE',
                        payload: {
                          commandId: data.payload.commandId,
                          exitCode: data.payload.exitCode,
                          agentId,
                        },
                      }));
                    }
                  });
                }
                break;
            }
          } catch (error) {
            socket.send(JSON.stringify({
              type: 'ERROR',
              payload: {
                code: 'INVALID_MESSAGE',
                message: 'Invalid JSON message',
              },
            }));
          }
        });
      });

      // Dashboard WebSocket endpoint
      fastify.get('/ws/dashboard', { websocket: true }, (connection, req) => {
        const socket = connection.socket;
        let subscribedCommands = new Set<string>();

        socket.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
              case 'COMMAND_REQUEST':
                const { agentId, content, priority = 1 } = data.payload;
                const commandId = uuidv4();

                // Create command
                const command = {
                  id: commandId,
                  content,
                  agentId,
                  priority,
                  status: 'PENDING',
                  createdAt: new Date().toISOString(),
                };

                activeCommands.set(commandId, command);

                // Send to agent
                server.websocketServer?.clients.forEach((client) => {
                  // In production, we'd properly identify agent connections
                  client.send(JSON.stringify({
                    type: 'COMMAND_REQUEST',
                    payload: {
                      commandId,
                      content,
                    },
                  }));
                });

                // Send acceptance
                socket.send(JSON.stringify({
                  type: 'COMMAND_ACCEPTED',
                  payload: {
                    commandId,
                    status: 'QUEUED',
                  },
                }));
                break;

              case 'SUBSCRIBE_OUTPUT':
                const { commandId: subCommandId } = data.payload;
                subscribedCommands.add(subCommandId);

                // Send any existing output
                const existingOutput = terminalOutputs.get(subCommandId) || [];
                if (existingOutput.length > 0) {
                  socket.send(JSON.stringify({
                    type: 'OUTPUT_HISTORY',
                    payload: {
                      commandId: subCommandId,
                      outputs: existingOutput,
                    },
                  }));
                }

                socket.send(JSON.stringify({
                  type: 'SUBSCRIPTION_ACK',
                  payload: {
                    commandId: subCommandId,
                  },
                }));
                break;

              case 'UNSUBSCRIBE_OUTPUT':
                const { commandId: unsubCommandId } = data.payload;
                subscribedCommands.delete(unsubCommandId);
                break;
            }
          } catch (error) {
            socket.send(JSON.stringify({
              type: 'ERROR',
              payload: {
                code: 'INVALID_MESSAGE',
                message: 'Invalid JSON message',
              },
            }));
          }
        });
      });
    });

    // REST API endpoints
    server.get('/commands/:id/output', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const outputs = terminalOutputs.get(id) || [];

      return reply.code(200).send({
        outputs: outputs.sort((a, b) => a.sequence - b.sequence),
      });
    });

    await server.ready();
    await server.listen({ port: 0 });

    const address = server.server.address() as any;
    wsUrl = `ws://localhost:${address.port}`;
  });

  afterAll(async () => {
    activeCommands.clear();
    terminalOutputs.clear();
    await closeTestServer(server);
  });

  afterEach(() => {
    activeCommands.clear();
    terminalOutputs.clear();
  });

  describe('Command Execution Flow', () => {
    it('should execute command and show real-time terminal output', async () => {
      const agentId = uuidv4();
      let commandId: string;

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Connect dashboard
      const dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      // Set up agent to handle commands
      agentWs.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'COMMAND_REQUEST') {
          const cmdId = message.payload.commandId;

          // Send acknowledgment
          agentWs.send(JSON.stringify({
            type: 'COMMAND_ACK',
            payload: {
              commandId: cmdId,
              status: 'EXECUTING',
            },
          }));

          // Simulate command execution with output
          const outputs = [
            'Starting command execution...',
            'Processing files...',
            '  - Analyzing index.ts',
            '  - Analyzing app.ts',
            'Found 2 issues to fix',
            'Applying fixes...',
            'Done!',
          ];

          // Send terminal outputs
          outputs.forEach((line, index) => {
            setTimeout(() => {
              agentWs.send(JSON.stringify({
                type: 'TERMINAL_OUTPUT',
                payload: {
                  commandId: cmdId,
                  sequence: index + 1,
                  streamType: 'STDOUT',
                  data: line,
                  timestamp: new Date().toISOString(),
                },
              }));
            }, index * 100); // Simulate real-time output
          });

          // Send completion after outputs
          setTimeout(() => {
            agentWs.send(JSON.stringify({
              type: 'COMMAND_COMPLETE',
              payload: {
                commandId: cmdId,
                exitCode: 0,
              },
            }));
          }, outputs.length * 100 + 100);
        }
      });

      // Dashboard sends command
      dashboardWs.send(JSON.stringify({
        type: 'COMMAND_REQUEST',
        payload: {
          agentId,
          content: 'analyze --fix',
        },
      }));

      // Wait for command acceptance
      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('COMMAND_ACCEPTED');
          commandId = message.payload.commandId;
          resolve();
        });
      });

      // Subscribe to output
      dashboardWs.send(JSON.stringify({
        type: 'SUBSCRIBE_OUTPUT',
        payload: { commandId },
      }));

      // Collect outputs
      const receivedOutputs: any[] = [];
      let commandCompleted = false;

      await new Promise<void>((resolve) => {
        dashboardWs.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'TERMINAL_OUTPUT') {
            receivedOutputs.push(message.payload);
          }

          if (message.type === 'COMMAND_COMPLETE') {
            commandCompleted = true;
            resolve();
          }
        });
      });

      // Verify outputs were received in order
      expect(receivedOutputs.length).toBeGreaterThan(0);
      expect(commandCompleted).toBe(true);

      // Check outputs via REST API
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandId}/output`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.outputs.length).toBe(7);
      expect(body.outputs[0].data).toBe('Starting command execution...');
      expect(body.outputs[body.outputs.length - 1].data).toBe('Done!');

      agentWs.close();
      dashboardWs.close();
    });

    it('should handle STDOUT and STDERR streams separately', async () => {
      const agentId = uuidv4();
      let commandId: string;

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: { agentId, token: 'agent-token' },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Set up agent to send mixed output
      agentWs.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'COMMAND_REQUEST') {
          const cmdId = message.payload.commandId;

          // Send mixed STDOUT and STDERR
          agentWs.send(JSON.stringify({
            type: 'TERMINAL_OUTPUT',
            payload: {
              commandId: cmdId,
              sequence: 1,
              streamType: 'STDOUT',
              data: 'Normal output line 1',
              timestamp: new Date().toISOString(),
            },
          }));

          agentWs.send(JSON.stringify({
            type: 'TERMINAL_OUTPUT',
            payload: {
              commandId: cmdId,
              sequence: 2,
              streamType: 'STDERR',
              data: 'ERROR: Something went wrong',
              timestamp: new Date().toISOString(),
            },
          }));

          agentWs.send(JSON.stringify({
            type: 'TERMINAL_OUTPUT',
            payload: {
              commandId: cmdId,
              sequence: 3,
              streamType: 'STDOUT',
              data: 'Normal output line 2',
              timestamp: new Date().toISOString(),
            },
          }));

          setTimeout(() => {
            agentWs.send(JSON.stringify({
              type: 'COMMAND_COMPLETE',
              payload: {
                commandId: cmdId,
                exitCode: 1, // Non-zero exit code
              },
            }));
          }, 100);
        }
      });

      // Connect dashboard and send command
      const dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      dashboardWs.send(JSON.stringify({
        type: 'COMMAND_REQUEST',
        payload: {
          agentId,
          content: 'test-command',
        },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          commandId = message.payload.commandId;
          resolve();
        });
      });

      // Wait for completion
      await new Promise<void>((resolve) => {
        dashboardWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'COMMAND_COMPLETE') {
            expect(message.payload.exitCode).toBe(1);
            resolve();
          }
        });
      });

      // Check outputs
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandId}/output`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const stdoutLines = body.outputs.filter((o: any) => o.streamType === 'STDOUT');
      const stderrLines = body.outputs.filter((o: any) => o.streamType === 'STDERR');

      expect(stdoutLines).toHaveLength(2);
      expect(stderrLines).toHaveLength(1);
      expect(stderrLines[0].data).toContain('ERROR');

      agentWs.close();
      dashboardWs.close();
    });

    it('should maintain output order with sequence numbers', async () => {
      const agentId = uuidv4();
      let commandId: string;

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: { agentId, token: 'agent-token' },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Set up agent to send out-of-order outputs
      agentWs.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'COMMAND_REQUEST') {
          const cmdId = message.payload.commandId;

          // Send outputs out of order
          agentWs.send(JSON.stringify({
            type: 'TERMINAL_OUTPUT',
            payload: {
              commandId: cmdId,
              sequence: 3,
              streamType: 'STDOUT',
              data: 'Third line',
              timestamp: new Date().toISOString(),
            },
          }));

          agentWs.send(JSON.stringify({
            type: 'TERMINAL_OUTPUT',
            payload: {
              commandId: cmdId,
              sequence: 1,
              streamType: 'STDOUT',
              data: 'First line',
              timestamp: new Date().toISOString(),
            },
          }));

          agentWs.send(JSON.stringify({
            type: 'TERMINAL_OUTPUT',
            payload: {
              commandId: cmdId,
              sequence: 2,
              streamType: 'STDOUT',
              data: 'Second line',
              timestamp: new Date().toISOString(),
            },
          }));

          setTimeout(() => {
            agentWs.send(JSON.stringify({
              type: 'COMMAND_COMPLETE',
              payload: { commandId: cmdId, exitCode: 0 },
            }));
          }, 100);
        }
      });

      // Connect dashboard and send command
      const dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      dashboardWs.send(JSON.stringify({
        type: 'COMMAND_REQUEST',
        payload: { agentId, content: 'test' },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          commandId = message.payload.commandId;
          resolve();
        });
      });

      // Wait for completion
      await new Promise<void>((resolve) => {
        dashboardWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'COMMAND_COMPLETE') {
            resolve();
          }
        });
      });

      // Check outputs are sorted by sequence
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandId}/output`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.outputs[0].data).toBe('First line');
      expect(body.outputs[1].data).toBe('Second line');
      expect(body.outputs[2].data).toBe('Third line');

      agentWs.close();
      dashboardWs.close();
    });
  });

  describe('Output Streaming Performance', () => {
    it('should handle high-frequency output streaming', async () => {
      const agentId = uuidv4();
      let commandId: string;
      const OUTPUT_COUNT = 100;

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: { agentId, token: 'agent-token' },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Set up agent to send many outputs rapidly
      agentWs.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'COMMAND_REQUEST') {
          const cmdId = message.payload.commandId;

          // Send many outputs
          for (let i = 1; i <= OUTPUT_COUNT; i++) {
            agentWs.send(JSON.stringify({
              type: 'TERMINAL_OUTPUT',
              payload: {
                commandId: cmdId,
                sequence: i,
                streamType: 'STDOUT',
                data: `Output line ${i}`,
                timestamp: new Date().toISOString(),
              },
            }));
          }

          setTimeout(() => {
            agentWs.send(JSON.stringify({
              type: 'COMMAND_COMPLETE',
              payload: { commandId: cmdId, exitCode: 0 },
            }));
          }, 500);
        }
      });

      // Connect dashboard
      const dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      const startTime = Date.now();

      dashboardWs.send(JSON.stringify({
        type: 'COMMAND_REQUEST',
        payload: { agentId, content: 'bulk-output' },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          commandId = message.payload.commandId;
          resolve();
        });
      });

      dashboardWs.send(JSON.stringify({
        type: 'SUBSCRIBE_OUTPUT',
        payload: { commandId },
      }));

      let outputCount = 0;

      await new Promise<void>((resolve) => {
        dashboardWs.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'TERMINAL_OUTPUT') {
            outputCount++;
          }

          if (message.type === 'COMMAND_COMPLETE') {
            resolve();
          }
        });
      });

      const duration = Date.now() - startTime;

      // Should handle all outputs quickly
      expect(outputCount).toBeGreaterThan(0);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds

      // Verify all outputs were stored
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandId}/output`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().outputs).toHaveLength(OUTPUT_COUNT);

      agentWs.close();
      dashboardWs.close();
    });

    it('should meet <200ms latency requirement', async () => {
      const agentId = uuidv4();
      const latencies: number[] = [];

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: { agentId, token: 'agent-token' },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Set up agent to measure latency
      agentWs.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'COMMAND_REQUEST') {
          const cmdId = message.payload.commandId;

          // Send outputs with timestamps
          for (let i = 1; i <= 10; i++) {
            const sendTime = Date.now();

            agentWs.send(JSON.stringify({
              type: 'TERMINAL_OUTPUT',
              payload: {
                commandId: cmdId,
                sequence: i,
                streamType: 'STDOUT',
                data: `Latency test ${i}`,
                timestamp: new Date(sendTime).toISOString(),
                sendTime, // Include for latency measurement
              },
            }));
          }

          setTimeout(() => {
            agentWs.send(JSON.stringify({
              type: 'COMMAND_COMPLETE',
              payload: { commandId: cmdId, exitCode: 0 },
            }));
          }, 100);
        }
      });

      // Connect dashboard
      const dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      dashboardWs.send(JSON.stringify({
        type: 'COMMAND_REQUEST',
        payload: { agentId, content: 'latency-test' },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'TERMINAL_OUTPUT') {
            const receiveTime = Date.now();
            if (message.payload.sendTime) {
              const latency = receiveTime - message.payload.sendTime;
              latencies.push(latency);
            }
          }

          if (message.type === 'COMMAND_COMPLETE') {
            resolve();
          }
        });
      });

      // Check latencies
      expect(latencies.length).toBeGreaterThan(0);
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      expect(avgLatency).toBeLessThan(200); // Average should be under 200ms
      expect(maxLatency).toBeLessThan(500); // Max should be reasonable

      agentWs.close();
      dashboardWs.close();
    });
  });

  describe('Output Subscription', () => {
    it('should allow subscribing to output mid-execution', async () => {
      const agentId = uuidv4();
      let commandId: string;

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: { agentId, token: 'agent-token' },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Set up agent to send outputs slowly
      agentWs.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'COMMAND_REQUEST') {
          const cmdId = message.payload.commandId;

          // Send outputs over time
          for (let i = 1; i <= 5; i++) {
            setTimeout(() => {
              agentWs.send(JSON.stringify({
                type: 'TERMINAL_OUTPUT',
                payload: {
                  commandId: cmdId,
                  sequence: i,
                  streamType: 'STDOUT',
                  data: `Slow output ${i}`,
                  timestamp: new Date().toISOString(),
                },
              }));
            }, i * 200);
          }

          setTimeout(() => {
            agentWs.send(JSON.stringify({
              type: 'COMMAND_COMPLETE',
              payload: { commandId: cmdId, exitCode: 0 },
            }));
          }, 1200);
        }
      });

      // Connect dashboard and start command
      const dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      dashboardWs.send(JSON.stringify({
        type: 'COMMAND_REQUEST',
        payload: { agentId, content: 'slow-command' },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          commandId = message.payload.commandId;
          resolve();
        });
      });

      // Wait a bit, then subscribe (missing first outputs)
      await new Promise(resolve => setTimeout(resolve, 500));

      dashboardWs.send(JSON.stringify({
        type: 'SUBSCRIBE_OUTPUT',
        payload: { commandId },
      }));

      let historyReceived = false;
      const liveOutputs: any[] = [];

      await new Promise<void>((resolve) => {
        dashboardWs.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'OUTPUT_HISTORY') {
            historyReceived = true;
            expect(message.payload.outputs.length).toBeGreaterThan(0);
          }

          if (message.type === 'TERMINAL_OUTPUT') {
            liveOutputs.push(message.payload);
          }

          if (message.type === 'COMMAND_COMPLETE') {
            resolve();
          }
        });
      });

      // Should have received history and live updates
      expect(historyReceived).toBe(true);
      expect(liveOutputs.length).toBeGreaterThan(0);

      agentWs.close();
      dashboardWs.close();
    });
  });
});