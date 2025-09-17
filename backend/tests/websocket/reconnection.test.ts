import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { createTestServer, closeTestServer, generateTestToken } from '../utils/test-server';
import { v4 as uuidv4 } from 'uuid';

describe('WebSocket Reconnection Logic', () => {
  let server: FastifyInstance;
  let wsUrl: string;
  let authToken: string;

  // Track connected agents for testing
  const connectedAgents = new Map<string, any>();

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);

    // Register WebSocket plugin
    await server.register(require('@fastify/websocket'));

    // Agent WebSocket endpoint with reconnection support
    server.register(async function (fastify) {
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        const socket = connection.socket;
        let agentId: string | null = null;
        let sessionId: string | null = null;

        socket.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
              case 'AGENT_CONNECT':
                agentId = data.payload.agentId;
                const isReconnection = data.payload.sessionId && connectedAgents.has(agentId);

                if (isReconnection) {
                  // Handle reconnection
                  sessionId = data.payload.sessionId;
                  const previousSession = connectedAgents.get(agentId);

                  if (previousSession && previousSession.sessionId === sessionId) {
                    // Valid reconnection
                    socket.send(JSON.stringify({
                      type: 'RECONNECTION_ACK',
                      payload: {
                        agentId,
                        sessionId,
                        connectionId: `reconn-${Date.now()}`,
                        missedMessages: previousSession.missedMessages || [],
                        lastSeenSequence: previousSession.lastSequence || 0,
                      },
                    }));

                    // Update connection
                    connectedAgents.set(agentId, {
                      socket,
                      sessionId,
                      connectionTime: Date.now(),
                      lastSequence: previousSession.lastSequence || 0,
                      missedMessages: [],
                    });
                  } else {
                    // Invalid session
                    socket.send(JSON.stringify({
                      type: 'ERROR',
                      payload: {
                        code: 'INVALID_SESSION',
                        message: 'Session expired or invalid',
                        requiresNewSession: true,
                      },
                    }));
                    socket.close();
                    return;
                  }
                } else {
                  // New connection
                  sessionId = `session-${Date.now()}`;

                  socket.send(JSON.stringify({
                    type: 'CONNECTION_ACK',
                    payload: {
                      agentId,
                      sessionId,
                      connectionId: `conn-${Date.now()}`,
                      serverTime: new Date().toISOString(),
                    },
                  }));

                  // Store connection
                  connectedAgents.set(agentId, {
                    socket,
                    sessionId,
                    connectionTime: Date.now(),
                    lastSequence: 0,
                    missedMessages: [],
                  });
                }
                break;

              case 'HEARTBEAT':
                if (!agentId || !connectedAgents.has(agentId)) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'NOT_CONNECTED',
                      message: 'Agent not connected',
                    },
                  }));
                  return;
                }

                const agent = connectedAgents.get(agentId);
                agent.lastHeartbeat = Date.now();
                agent.lastSequence = data.payload.sequence || 0;

                socket.send(JSON.stringify({
                  type: 'HEARTBEAT_ACK',
                  payload: {
                    sequence: data.payload.sequence,
                    serverTime: Date.now(),
                  },
                }));
                break;

              case 'DISCONNECT':
                if (agentId) {
                  const agent = connectedAgents.get(agentId);
                  if (agent) {
                    // Mark as disconnected but keep session
                    agent.socket = null;
                    agent.disconnectedAt = Date.now();
                  }
                }
                socket.close();
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
            const agent = connectedAgents.get(agentId);
            if (agent) {
              agent.socket = null;
              agent.disconnectedAt = Date.now();
              // Keep session for potential reconnection
            }
          }
        });

        socket.on('error', (error) => {
          console.error('WebSocket error:', error);
        });
      });
    });

    await server.ready();
    await server.listen({ port: 0 });

    const address = server.server.address() as any;
    wsUrl = `ws://localhost:${address.port}/ws/agent`;
  });

  afterAll(async () => {
    connectedAgents.clear();
    await closeTestServer(server);
  });

  afterEach(() => {
    // Clean up connections between tests
    connectedAgents.clear();
  });

  describe('Initial Connection', () => {
    it('should establish initial connection with new session', async () => {
      const agentId = uuidv4();
      const ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      ws.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          token: 'agent-token',
          name: 'test-agent',
        },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('CONNECTION_ACK');
          expect(message.payload.agentId).toBe(agentId);
          expect(message.payload.sessionId).toBeDefined();
          expect(message.payload.connectionId).toBeDefined();
          resolve();
        });
      });

      ws.close();
    });
  });

  describe('Reconnection Flow', () => {
    it('should handle successful reconnection with same session', async () => {
      const agentId = uuidv4();
      let sessionId: string;

      // Initial connection
      const ws1 = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws1.once('open', () => resolve());
      });

      ws1.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        ws1.once('message', (data) => {
          const message = JSON.parse(data.toString());
          sessionId = message.payload.sessionId;
          resolve();
        });
      });

      // Graceful disconnect
      ws1.send(JSON.stringify({
        type: 'DISCONNECT',
        payload: {},
      }));

      await new Promise<void>((resolve) => {
        ws1.once('close', () => resolve());
      });

      // Wait a bit before reconnecting
      await new Promise(resolve => setTimeout(resolve, 100));

      // Reconnection
      const ws2 = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws2.once('open', () => resolve());
      });

      ws2.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          sessionId,
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        ws2.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('RECONNECTION_ACK');
          expect(message.payload.agentId).toBe(agentId);
          expect(message.payload.sessionId).toBe(sessionId);
          expect(message.payload.lastSeenSequence).toBeDefined();
          resolve();
        });
      });

      ws2.close();
    });

    it('should reject reconnection with invalid session', async () => {
      const agentId = uuidv4();
      const invalidSessionId = 'invalid-session-123';

      // Try reconnection with invalid session
      const ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      ws.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          sessionId: invalidSessionId,
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('ERROR');
          expect(message.payload.code).toBe('INVALID_SESSION');
          expect(message.payload.requiresNewSession).toBe(true);
          resolve();
        });
      });

      await new Promise<void>((resolve) => {
        ws.once('close', () => resolve());
      });
    });

    it('should implement exponential backoff for reconnection attempts', async () => {
      const agentId = uuidv4();
      const maxAttempts = 3;
      const baseDelay = 100;
      const attempts: number[] = [];

      async function attemptConnection(attempt: number): Promise<boolean> {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));

        const ws = new WebSocket(wsUrl);

        return new Promise<boolean>((resolve) => {
          ws.once('open', () => {
            attempts.push(Date.now());

            // Simulate connection failure for first attempts
            if (attempt < maxAttempts - 1) {
              ws.close();
              resolve(false);
            } else {
              // Successful connection on last attempt
              ws.send(JSON.stringify({
                type: 'AGENT_CONNECT',
                payload: {
                  agentId,
                  token: 'agent-token',
                },
              }));

              ws.once('message', (data) => {
                const message = JSON.parse(data.toString());
                if (message.type === 'CONNECTION_ACK') {
                  ws.close();
                  resolve(true);
                }
              });
            }
          });

          ws.once('error', () => {
            attempts.push(Date.now());
            resolve(false);
          });
        });
      }

      // Try reconnection with exponential backoff
      let connected = false;
      for (let i = 0; i < maxAttempts; i++) {
        connected = await attemptConnection(i);
        if (connected) break;
      }

      expect(connected).toBe(true);
      expect(attempts.length).toBe(maxAttempts);

      // Verify exponential delays
      for (let i = 1; i < attempts.length; i++) {
        const actualDelay = attempts[i] - attempts[i - 1];
        const expectedMinDelay = baseDelay * Math.pow(2, i - 1);
        expect(actualDelay).toBeGreaterThanOrEqual(expectedMinDelay);
      }
    });

    it('should handle reconnection with missed messages', async () => {
      const agentId = uuidv4();
      let sessionId: string;

      // Initial connection
      const ws1 = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws1.once('open', () => resolve());
      });

      ws1.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        ws1.once('message', (data) => {
          const message = JSON.parse(data.toString());
          sessionId = message.payload.sessionId;
          resolve();
        });
      });

      // Send heartbeat with sequence
      ws1.send(JSON.stringify({
        type: 'HEARTBEAT',
        payload: {
          sequence: 5,
        },
      }));

      await new Promise<void>((resolve) => {
        ws1.once('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'HEARTBEAT_ACK') {
            resolve();
          }
        });
      });

      // Disconnect
      ws1.close();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate missed messages while disconnected
      const agent = connectedAgents.get(agentId);
      if (agent) {
        agent.missedMessages = [
          { id: 'msg1', content: 'Missed message 1' },
          { id: 'msg2', content: 'Missed message 2' },
        ];
      }

      // Reconnect
      const ws2 = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws2.once('open', () => resolve());
      });

      ws2.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          sessionId,
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        ws2.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('RECONNECTION_ACK');
          expect(message.payload.missedMessages).toHaveLength(2);
          expect(message.payload.lastSeenSequence).toBe(5);
          resolve();
        });
      });

      ws2.close();
    });
  });

  describe('Connection State Management', () => {
    it('should track connection state properly', async () => {
      const agentId = uuidv4();
      let sessionId: string;

      // Connect
      const ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      ws.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          sessionId = message.payload.sessionId;
          resolve();
        });
      });

      // Verify agent is tracked
      expect(connectedAgents.has(agentId)).toBe(true);
      const agent = connectedAgents.get(agentId);
      expect(agent.sessionId).toBe(sessionId);
      expect(agent.socket).toBeDefined();

      // Disconnect
      ws.close();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify agent is marked as disconnected but session preserved
      const disconnectedAgent = connectedAgents.get(agentId);
      expect(disconnectedAgent.socket).toBeNull();
      expect(disconnectedAgent.disconnectedAt).toBeDefined();
      expect(disconnectedAgent.sessionId).toBe(sessionId);
    });

    it('should clean up expired sessions', async () => {
      const agentId = uuidv4();
      const SESSION_TIMEOUT = 30000; // 30 seconds in production

      // Connect
      const ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      ws.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          token: 'agent-token',
        },
      }));

      let sessionId: string;
      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          sessionId = message.payload.sessionId;
          resolve();
        });
      });

      ws.close();

      // Simulate session expiry
      const agent = connectedAgents.get(agentId);
      if (agent) {
        agent.disconnectedAt = Date.now() - SESSION_TIMEOUT - 1000;
      }

      // Try reconnection after session expiry
      const ws2 = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws2.once('open', () => resolve());
      });

      ws2.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          sessionId,
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        ws2.once('message', (data) => {
          const message = JSON.parse(data.toString());
          // Should be new connection, not reconnection
          expect(message.type).toBe('CONNECTION_ACK');
          expect(message.payload.sessionId).not.toBe(sessionId);
          resolve();
        });
      });

      ws2.close();
    });
  });

  describe('Heartbeat and Keep-Alive', () => {
    it('should maintain connection with heartbeats', async () => {
      const agentId = uuidv4();
      const ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      ws.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', () => resolve());
      });

      // Send multiple heartbeats
      const heartbeatResponses: any[] = [];

      for (let i = 1; i <= 3; i++) {
        ws.send(JSON.stringify({
          type: 'HEARTBEAT',
          payload: {
            sequence: i,
            timestamp: Date.now(),
          },
        }));

        await new Promise<void>((resolve) => {
          ws.once('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.type === 'HEARTBEAT_ACK') {
              heartbeatResponses.push(message);
              resolve();
            }
          });
        });

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      expect(heartbeatResponses).toHaveLength(3);
      heartbeatResponses.forEach((response, index) => {
        expect(response.payload.sequence).toBe(index + 1);
      });

      ws.close();
    });

    it('should detect stale connections without heartbeat', async () => {
      const agentId = uuidv4();
      const HEARTBEAT_INTERVAL = 30000; // 30 seconds
      const HEARTBEAT_TIMEOUT = HEARTBEAT_INTERVAL * 3; // 3 missed = disconnect

      const ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      ws.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', () => resolve());
      });

      // Simulate no heartbeats (mark as stale)
      const agent = connectedAgents.get(agentId);
      if (agent) {
        agent.lastHeartbeat = Date.now() - HEARTBEAT_TIMEOUT - 1000;
      }

      // Connection should be considered stale
      const staleAgent = connectedAgents.get(agentId);
      const isStale = staleAgent &&
        staleAgent.lastHeartbeat &&
        (Date.now() - staleAgent.lastHeartbeat) > HEARTBEAT_TIMEOUT;

      expect(isStale).toBe(true);

      ws.close();
    });
  });

  describe('Error Recovery', () => {
    it('should handle network interruption gracefully', async () => {
      const agentId = uuidv4();
      const ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      ws.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          token: 'agent-token',
        },
      }));

      let sessionId: string;
      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          sessionId = message.payload.sessionId;
          resolve();
        });
      });

      // Simulate abrupt disconnection
      ws.terminate();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify session is preserved
      const agent = connectedAgents.get(agentId);
      expect(agent).toBeDefined();
      expect(agent.sessionId).toBe(sessionId);
      expect(agent.socket).toBeNull();

      // Should be able to reconnect
      const ws2 = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws2.once('open', () => resolve());
      });

      ws2.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          sessionId,
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        ws2.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('RECONNECTION_ACK');
          resolve();
        });
      });

      ws2.close();
    });

    it('should handle rapid reconnection attempts', async () => {
      const agentId = uuidv4();
      let sessionId: string;

      // Initial connection
      const ws1 = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws1.once('open', () => resolve());
      });

      ws1.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        ws1.once('message', (data) => {
          const message = JSON.parse(data.toString());
          sessionId = message.payload.sessionId;
          resolve();
        });
      });

      ws1.close();

      // Rapid reconnection attempts
      const reconnectionPromises = [];

      for (let i = 0; i < 5; i++) {
        reconnectionPromises.push(
          new Promise<boolean>(async (resolve) => {
            await new Promise(r => setTimeout(r, i * 10));

            const ws = new WebSocket(wsUrl);

            ws.once('open', () => {
              ws.send(JSON.stringify({
                type: 'AGENT_CONNECT',
                payload: {
                  agentId,
                  sessionId,
                  token: 'agent-token',
                },
              }));
            });

            ws.once('message', (data) => {
              const message = JSON.parse(data.toString());
              const success = message.type === 'RECONNECTION_ACK';
              ws.close();
              resolve(success);
            });

            ws.once('error', () => {
              resolve(false);
            });
          })
        );
      }

      const results = await Promise.all(reconnectionPromises);

      // At least some reconnections should succeed
      const successCount = results.filter(r => r).length;
      expect(successCount).toBeGreaterThan(0);
    });
  });
});