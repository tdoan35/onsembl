import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { createTestServer, closeTestServer, generateTestToken } from '../utils/test-server';
import { v4 as uuidv4 } from 'uuid';

describe('WebSocket Command Execution Flow', () => {
  let server: FastifyInstance;
  let wsUrl: string;
  let authToken: string;
  let agentWs: WebSocket;
  let dashboardWs: WebSocket;

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);

    // Register WebSocket plugin
    await server.register(require('@fastify/websocket'));

    // Agent WebSocket endpoint
    server.register(async function (fastify) {
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        const socket = connection.socket;
        let agentId: string | null = null;
        let isAuthenticated = false;

        socket.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
              case 'AGENT_CONNECT':
                // Validate agent credentials
                if (!data.payload.agentId || !data.payload.token) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'INVALID_CREDENTIALS',
                      message: 'Missing agentId or token',
                    },
                  }));
                  socket.close();
                  return;
                }

                agentId = data.payload.agentId;
                isAuthenticated = true;

                // Send connection acknowledgment
                socket.send(JSON.stringify({
                  type: 'CONNECTION_ACK',
                  payload: {
                    agentId,
                    connectionId: `conn-${Date.now()}`,
                    serverTime: new Date().toISOString(),
                  },
                }));
                break;

              case 'COMMAND_ACK':
                if (!isAuthenticated) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'NOT_AUTHENTICATED',
                      message: 'Agent not authenticated',
                    },
                  }));
                  return;
                }

                // Acknowledge command receipt
                const { commandId, status } = data.payload;
                if (status === 'RECEIVED') {
                  // Simulate processing
                  setTimeout(() => {
                    socket.send(JSON.stringify({
                      type: 'COMMAND_STATUS',
                      payload: {
                        commandId,
                        status: 'EXECUTING',
                        timestamp: new Date().toISOString(),
                      },
                    }));
                  }, 100);
                }
                break;

              case 'COMMAND_COMPLETE':
                if (!isAuthenticated) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'NOT_AUTHENTICATED',
                      message: 'Agent not authenticated',
                    },
                  }));
                  return;
                }

                // Command completed
                const { commandId: completedId, result, exitCode } = data.payload;

                // Notify dashboard of completion
                server.websocketServer?.clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                      type: 'COMMAND_COMPLETE',
                      payload: {
                        agentId,
                        commandId: completedId,
                        result,
                        exitCode,
                        timestamp: new Date().toISOString(),
                      },
                    }));
                  }
                });
                break;

              case 'COMMAND_ERROR':
                if (!isAuthenticated) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'NOT_AUTHENTICATED',
                      message: 'Agent not authenticated',
                    },
                  }));
                  return;
                }

                // Command failed
                const { commandId: failedId, error } = data.payload;

                // Notify dashboard of failure
                server.websocketServer?.clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                      type: 'COMMAND_ERROR',
                      payload: {
                        agentId,
                        commandId: failedId,
                        error,
                        timestamp: new Date().toISOString(),
                      },
                    }));
                  }
                });
                break;

              default:
                socket.send(JSON.stringify({
                  type: 'ERROR',
                  payload: {
                    code: 'UNKNOWN_MESSAGE_TYPE',
                    message: `Unknown message type: ${data.type}`,
                  },
                }));
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

        socket.on('close', () => {
          if (agentId) {
            // Notify dashboard of agent disconnection
            server.websocketServer?.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'AGENT_DISCONNECTED',
                  payload: {
                    agentId,
                    timestamp: new Date().toISOString(),
                  },
                }));
              }
            });
          }
        });
      });

      // Dashboard WebSocket endpoint
      fastify.get('/ws/dashboard', { websocket: true }, (connection, req) => {
        const socket = connection.socket;
        let isAuthenticated = false;

        socket.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
              case 'AUTHENTICATE':
                // Validate JWT token
                if (!data.payload.token) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'MISSING_TOKEN',
                      message: 'Authentication token required',
                    },
                  }));
                  socket.close();
                  return;
                }

                isAuthenticated = true;
                socket.send(JSON.stringify({
                  type: 'AUTHENTICATED',
                  payload: {
                    userId: uuidv4(),
                    timestamp: new Date().toISOString(),
                  },
                }));
                break;

              case 'COMMAND_REQUEST':
                if (!isAuthenticated) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'NOT_AUTHENTICATED',
                      message: 'Not authenticated',
                    },
                  }));
                  return;
                }

                const { commandId, agentId, content } = data.payload;

                // Find agent WebSocket and send command
                let agentFound = false;
                server.websocketServer?.clients.forEach((client) => {
                  // In production, we'd track agent connections properly
                  // For testing, we'll broadcast to all agent connections
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                      type: 'COMMAND_REQUEST',
                      payload: {
                        commandId,
                        content,
                        timestamp: new Date().toISOString(),
                      },
                    }));
                    agentFound = true;
                  }
                });

                if (agentFound) {
                  socket.send(JSON.stringify({
                    type: 'COMMAND_ACCEPTED',
                    payload: {
                      commandId,
                      status: 'QUEUED',
                      timestamp: new Date().toISOString(),
                    },
                  }));
                } else {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'AGENT_NOT_FOUND',
                      message: `Agent ${agentId} not connected`,
                    },
                  }));
                }
                break;

              default:
                socket.send(JSON.stringify({
                  type: 'ERROR',
                  payload: {
                    code: 'UNKNOWN_MESSAGE_TYPE',
                    message: `Unknown message type: ${data.type}`,
                  },
                }));
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

    await server.ready();
    await server.listen({ port: 0 });

    const address = server.server.address() as any;
    wsUrl = `ws://localhost:${address.port}`;
  });

  afterAll(async () => {
    if (agentWs && agentWs.readyState === WebSocket.OPEN) {
      agentWs.close();
    }
    if (dashboardWs && dashboardWs.readyState === WebSocket.OPEN) {
      dashboardWs.close();
    }
    await closeTestServer(server);
  });

  describe('Command Request Flow', () => {
    it('should handle complete command execution flow', async () => {
      const agentId = uuidv4();
      const commandId = uuidv4();
      const commandContent = 'ls -la';

      // Connect agent
      agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      // Send agent connection
      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          token: 'agent-token',
          name: 'test-agent',
          type: 'CLAUDE',
        },
      }));

      // Wait for connection acknowledgment
      await new Promise<void>((resolve) => {
        agentWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('CONNECTION_ACK');
          expect(message.payload.agentId).toBe(agentId);
          resolve();
        });
      });

      // Connect dashboard
      dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      // Authenticate dashboard
      dashboardWs.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token: authToken },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('AUTHENTICATED');
          resolve();
        });
      });

      // Set up agent to handle command request
      agentWs.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'COMMAND_REQUEST') {
          // Send acknowledgment
          agentWs.send(JSON.stringify({
            type: 'COMMAND_ACK',
            payload: {
              commandId: message.payload.commandId,
              status: 'RECEIVED',
            },
          }));

          // Simulate command execution
          setTimeout(() => {
            agentWs.send(JSON.stringify({
              type: 'COMMAND_COMPLETE',
              payload: {
                commandId: message.payload.commandId,
                result: 'Command executed successfully',
                exitCode: 0,
              },
            }));
          }, 200);
        }
      });

      // Dashboard sends command request
      dashboardWs.send(JSON.stringify({
        type: 'COMMAND_REQUEST',
        payload: {
          commandId,
          agentId,
          content: commandContent,
        },
      }));

      // Wait for command accepted
      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('COMMAND_ACCEPTED');
          expect(message.payload.commandId).toBe(commandId);
          expect(message.payload.status).toBe('QUEUED');
          resolve();
        });
      });

      // Wait for command completion notification
      await new Promise<void>((resolve) => {
        dashboardWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'COMMAND_COMPLETE') {
            expect(message.payload.commandId).toBe(commandId);
            expect(message.payload.exitCode).toBe(0);
            resolve();
          }
        });
      });
    });

    it('should handle command acknowledgment timeout', async () => {
      const agentId = uuidv4();
      const commandId = uuidv4();

      // Connect agent but don't send ACK
      agentWs = new WebSocket(`${wsUrl}/ws/agent`);

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
        agentWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('CONNECTION_ACK');
          resolve();
        });
      });

      // Connect and authenticate dashboard
      dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      dashboardWs.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token: authToken },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('AUTHENTICATED');
          resolve();
        });
      });

      // Agent doesn't acknowledge command
      agentWs.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'COMMAND_REQUEST') {
          // Don't send ACK - simulate timeout scenario
        }
      });

      // Send command request
      dashboardWs.send(JSON.stringify({
        type: 'COMMAND_REQUEST',
        payload: {
          commandId,
          agentId,
          content: 'test command',
        },
      }));

      // Should still receive initial acceptance
      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('COMMAND_ACCEPTED');
          resolve();
        });
      });
    });

    it('should handle command execution error', async () => {
      const agentId = uuidv4();
      const commandId = uuidv4();

      // Connect agent
      agentWs = new WebSocket(`${wsUrl}/ws/agent`);

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
      dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      dashboardWs.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token: authToken },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', () => resolve());
      });

      // Agent sends error for command
      agentWs.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'COMMAND_REQUEST') {
          // Send acknowledgment
          agentWs.send(JSON.stringify({
            type: 'COMMAND_ACK',
            payload: {
              commandId: message.payload.commandId,
              status: 'RECEIVED',
            },
          }));

          // Send error
          setTimeout(() => {
            agentWs.send(JSON.stringify({
              type: 'COMMAND_ERROR',
              payload: {
                commandId: message.payload.commandId,
                error: {
                  code: 'EXECUTION_FAILED',
                  message: 'Command not found',
                },
              },
            }));
          }, 100);
        }
      });

      // Send command request
      dashboardWs.send(JSON.stringify({
        type: 'COMMAND_REQUEST',
        payload: {
          commandId,
          agentId,
          content: 'invalid-command',
        },
      }));

      // Wait for error notification
      await new Promise<void>((resolve) => {
        dashboardWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'COMMAND_ERROR') {
            expect(message.payload.commandId).toBe(commandId);
            expect(message.payload.error.code).toBe('EXECUTION_FAILED');
            resolve();
          }
        });
      });
    });

    it('should reject command for disconnected agent', async () => {
      const nonExistentAgentId = uuidv4();
      const commandId = uuidv4();

      // Only connect dashboard (no agent)
      dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      dashboardWs.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token: authToken },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', () => resolve());
      });

      // Send command request for non-existent agent
      dashboardWs.send(JSON.stringify({
        type: 'COMMAND_REQUEST',
        payload: {
          commandId,
          agentId: nonExistentAgentId,
          content: 'test command',
        },
      }));

      // Should receive error
      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('ERROR');
          expect(message.payload.code).toBe('AGENT_NOT_FOUND');
          resolve();
        });
      });
    });

    it('should handle multiple commands in sequence', async () => {
      const agentId = uuidv4();
      const commandIds = [uuidv4(), uuidv4(), uuidv4()];
      let completedCommands = 0;

      // Connect agent
      agentWs = new WebSocket(`${wsUrl}/ws/agent`);

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
      dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      dashboardWs.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token: authToken },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', () => resolve());
      });

      // Agent handles commands
      agentWs.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'COMMAND_REQUEST') {
          const cmdId = message.payload.commandId;

          // Send acknowledgment
          agentWs.send(JSON.stringify({
            type: 'COMMAND_ACK',
            payload: {
              commandId: cmdId,
              status: 'RECEIVED',
            },
          }));

          // Complete after delay
          setTimeout(() => {
            agentWs.send(JSON.stringify({
              type: 'COMMAND_COMPLETE',
              payload: {
                commandId: cmdId,
                result: `Command ${cmdId} completed`,
                exitCode: 0,
              },
            }));
          }, 100 * (commandIds.indexOf(cmdId) + 1));
        }
      });

      // Send multiple commands
      for (const commandId of commandIds) {
        dashboardWs.send(JSON.stringify({
          type: 'COMMAND_REQUEST',
          payload: {
            commandId,
            agentId,
            content: `command-${commandId}`,
          },
        }));
      }

      // Wait for all commands to complete
      await new Promise<void>((resolve) => {
        dashboardWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'COMMAND_COMPLETE') {
            completedCommands++;
            if (completedCommands === commandIds.length) {
              resolve();
            }
          }
        });
      });

      expect(completedCommands).toBe(commandIds.length);
    });
  });

  describe('Error Handling', () => {
    it('should reject unauthenticated dashboard connections', async () => {
      dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      // Try to send command without authentication
      dashboardWs.send(JSON.stringify({
        type: 'COMMAND_REQUEST',
        payload: {
          commandId: uuidv4(),
          agentId: uuidv4(),
          content: 'test',
        },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('ERROR');
          expect(message.payload.code).toBe('NOT_AUTHENTICATED');
          resolve();
        });
      });
    });

    it('should reject invalid agent credentials', async () => {
      agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      // Send invalid connection message
      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          // Missing required fields
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('ERROR');
          expect(message.payload.code).toBe('INVALID_CREDENTIALS');
          resolve();
        });
      });

      await new Promise<void>((resolve) => {
        agentWs.once('close', () => resolve());
      });
    });

    it('should handle malformed JSON messages', async () => {
      dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      // Send malformed JSON
      dashboardWs.send('{ invalid json }');

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('ERROR');
          expect(message.payload.code).toBe('INVALID_MESSAGE');
          resolve();
        });
      });
    });

    it('should handle unknown message types', async () => {
      dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      // Authenticate first
      dashboardWs.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token: authToken },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', () => resolve());
      });

      // Send unknown message type
      dashboardWs.send(JSON.stringify({
        type: 'UNKNOWN_TYPE',
        payload: {},
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('ERROR');
          expect(message.payload.code).toBe('UNKNOWN_MESSAGE_TYPE');
          resolve();
        });
      });
    });
  });
});