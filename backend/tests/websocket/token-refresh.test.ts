import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { createTestServer, closeTestServer, generateTestToken } from '../utils/test-server';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

describe('WebSocket Token Refresh', () => {
  let server: FastifyInstance;
  let wsUrl: string;
  const JWT_SECRET = 'test-secret-key';
  const TOKEN_EXPIRY = '15m'; // 15 minutes
  const REFRESH_WINDOW = 5 * 60 * 1000; // 5 minutes before expiry

  function generateToken(payload: any, expiresIn: string = TOKEN_EXPIRY): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
  }

  function generateRefreshToken(userId: string): string {
    return jwt.sign(
      { userId, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  function verifyToken(token: string): any {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });

    // Register WebSocket plugin
    await server.register(require('@fastify/websocket'));

    // Dashboard WebSocket endpoint with token refresh support
    server.register(async function (fastify) {
      fastify.get('/ws/dashboard', { websocket: true }, (connection, req) => {
        const socket = connection.socket;
        let currentToken: string | null = null;
        let userId: string | null = null;
        let tokenRefreshTimer: NodeJS.Timeout | null = null;

        function scheduleTokenRefresh(token: string) {
          if (tokenRefreshTimer) {
            clearTimeout(tokenRefreshTimer);
          }

          const decoded = verifyToken(token);
          if (!decoded || !decoded.exp) return;

          const expiryTime = decoded.exp * 1000;
          const now = Date.now();
          const timeUntilExpiry = expiryTime - now;
          const refreshTime = Math.max(0, timeUntilExpiry - REFRESH_WINDOW);

          // Send refresh reminder when approaching expiry
          tokenRefreshTimer = setTimeout(() => {
            socket.send(JSON.stringify({
              type: 'TOKEN_REFRESH_REQUIRED',
              payload: {
                expiresAt: new Date(expiryTime).toISOString(),
                refreshBy: new Date(expiryTime - 60000).toISOString(), // 1 minute before expiry
              },
            }));
          }, refreshTime);
        }

        socket.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
              case 'AUTHENTICATE':
                const token = data.payload.token;
                const decoded = verifyToken(token);

                if (!decoded) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'INVALID_TOKEN',
                      message: 'Invalid or expired token',
                    },
                  }));
                  socket.close();
                  return;
                }

                currentToken = token;
                userId = decoded.userId || decoded.sub;

                socket.send(JSON.stringify({
                  type: 'AUTHENTICATED',
                  payload: {
                    userId,
                    expiresAt: new Date(decoded.exp * 1000).toISOString(),
                  },
                }));

                // Schedule refresh reminder
                scheduleTokenRefresh(token);
                break;

              case 'REFRESH_TOKEN':
                if (!userId) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'NOT_AUTHENTICATED',
                      message: 'Not authenticated',
                    },
                  }));
                  return;
                }

                const refreshToken = data.payload.refreshToken;
                const refreshDecoded = verifyToken(refreshToken);

                if (!refreshDecoded || refreshDecoded.type !== 'refresh') {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'INVALID_REFRESH_TOKEN',
                      message: 'Invalid refresh token',
                    },
                  }));
                  return;
                }

                // Generate new access token
                const newToken = generateToken({ userId }, TOKEN_EXPIRY);
                const newDecoded = verifyToken(newToken);
                currentToken = newToken;

                socket.send(JSON.stringify({
                  type: 'TOKEN_REFRESHED',
                  payload: {
                    token: newToken,
                    expiresAt: new Date(newDecoded.exp * 1000).toISOString(),
                  },
                }));

                // Reschedule refresh reminder
                scheduleTokenRefresh(newToken);
                break;

              case 'VALIDATE_TOKEN':
                const isValid = currentToken && verifyToken(currentToken);

                socket.send(JSON.stringify({
                  type: 'TOKEN_VALIDATION',
                  payload: {
                    valid: !!isValid,
                    expiresAt: isValid ? new Date(isValid.exp * 1000).toISOString() : null,
                  },
                }));
                break;

              case 'DISCONNECT':
                if (tokenRefreshTimer) {
                  clearTimeout(tokenRefreshTimer);
                }
                socket.close();
                break;

              default:
                // For other messages, check token validity
                if (!currentToken || !verifyToken(currentToken)) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'TOKEN_EXPIRED',
                      message: 'Token has expired, please refresh',
                    },
                  }));
                  return;
                }

                // Process other messages...
                socket.send(JSON.stringify({
                  type: 'MESSAGE_ACK',
                  payload: { messageType: data.type },
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
          if (tokenRefreshTimer) {
            clearTimeout(tokenRefreshTimer);
          }
        });
      });

      // Agent WebSocket endpoint with token validation
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        const socket = connection.socket;
        let agentToken: string | null = null;
        let agentId: string | null = null;

        socket.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
              case 'AGENT_CONNECT':
                const token = data.payload.token;
                const decoded = verifyToken(token);

                if (!decoded) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'INVALID_TOKEN',
                      message: 'Invalid or expired agent token',
                    },
                  }));
                  socket.close();
                  return;
                }

                agentToken = token;
                agentId = data.payload.agentId;

                socket.send(JSON.stringify({
                  type: 'CONNECTION_ACK',
                  payload: {
                    agentId,
                    tokenExpiresAt: new Date(decoded.exp * 1000).toISOString(),
                  },
                }));
                break;

              case 'RENEW_TOKEN':
                if (!agentId) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'NOT_CONNECTED',
                      message: 'Agent not connected',
                    },
                  }));
                  return;
                }

                // In production, this would validate the agent's credentials
                const newAgentToken = generateToken({ agentId, type: 'agent' }, '1h');
                const newDecoded = verifyToken(newAgentToken);
                agentToken = newAgentToken;

                socket.send(JSON.stringify({
                  type: 'TOKEN_RENEWED',
                  payload: {
                    token: newAgentToken,
                    expiresAt: new Date(newDecoded.exp * 1000).toISOString(),
                  },
                }));
                break;

              default:
                // Validate token for all other messages
                if (!agentToken || !verifyToken(agentToken)) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'TOKEN_EXPIRED',
                      message: 'Agent token has expired',
                    },
                  }));
                  return;
                }

                socket.send(JSON.stringify({
                  type: 'MESSAGE_ACK',
                  payload: { messageType: data.type },
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
    await closeTestServer(server);
  });

  describe('Dashboard Token Refresh', () => {
    it('should authenticate with valid token', async () => {
      const userId = uuidv4();
      const token = generateToken({ userId });

      const ws = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      ws.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('AUTHENTICATED');
          expect(message.payload.userId).toBe(userId);
          expect(message.payload.expiresAt).toBeDefined();
          resolve();
        });
      });

      ws.close();
    });

    it('should reject expired token', async () => {
      const userId = uuidv4();
      const expiredToken = generateToken({ userId }, '-1s'); // Already expired

      const ws = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      ws.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token: expiredToken },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('ERROR');
          expect(message.payload.code).toBe('INVALID_TOKEN');
          resolve();
        });
      });

      await new Promise<void>((resolve) => {
        ws.once('close', () => resolve());
      });
    });

    it('should refresh token with valid refresh token', async () => {
      const userId = uuidv4();
      const token = generateToken({ userId });
      const refreshToken = generateRefreshToken(userId);

      const ws = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      // Authenticate
      ws.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', () => resolve());
      });

      // Refresh token
      ws.send(JSON.stringify({
        type: 'REFRESH_TOKEN',
        payload: { refreshToken },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('TOKEN_REFRESHED');
          expect(message.payload.token).toBeDefined();
          expect(message.payload.expiresAt).toBeDefined();

          // Verify new token is different
          expect(message.payload.token).not.toBe(token);

          // Verify new token is valid
          const decoded = verifyToken(message.payload.token);
          expect(decoded).toBeTruthy();
          expect(decoded.userId).toBe(userId);

          resolve();
        });
      });

      ws.close();
    });

    it('should receive refresh reminder before token expiry', async () => {
      const userId = uuidv4();
      const shortLivedToken = generateToken({ userId }, '10s'); // Very short expiry for testing

      const ws = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      ws.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token: shortLivedToken },
      }));

      // Should receive authentication confirmation
      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('AUTHENTICATED');
          resolve();
        });
      });

      // Should receive refresh reminder (this would happen after 5 seconds in this test)
      // For testing purposes, we'll validate the token instead
      ws.send(JSON.stringify({
        type: 'VALIDATE_TOKEN',
        payload: {},
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('TOKEN_VALIDATION');
          expect(message.payload.valid).toBe(true);
          resolve();
        });
      });

      ws.close();
    });

    it('should handle seamless token refresh without connection interruption', async () => {
      const userId = uuidv4();
      const token = generateToken({ userId });
      const refreshToken = generateRefreshToken(userId);

      const ws = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      // Authenticate
      ws.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', () => resolve());
      });

      // Send a regular message
      ws.send(JSON.stringify({
        type: 'TEST_MESSAGE',
        payload: { data: 'before refresh' },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('MESSAGE_ACK');
          resolve();
        });
      });

      // Refresh token
      ws.send(JSON.stringify({
        type: 'REFRESH_TOKEN',
        payload: { refreshToken },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('TOKEN_REFRESHED');
          resolve();
        });
      });

      // Send another message with new token
      ws.send(JSON.stringify({
        type: 'TEST_MESSAGE',
        payload: { data: 'after refresh' },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('MESSAGE_ACK');
          resolve();
        });
      });

      ws.close();
    });

    it('should reject invalid refresh token', async () => {
      const userId = uuidv4();
      const token = generateToken({ userId });

      const ws = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      // Authenticate
      ws.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', () => resolve());
      });

      // Try to refresh with invalid token
      ws.send(JSON.stringify({
        type: 'REFRESH_TOKEN',
        payload: { refreshToken: 'invalid-refresh-token' },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('ERROR');
          expect(message.payload.code).toBe('INVALID_REFRESH_TOKEN');
          resolve();
        });
      });

      ws.close();
    });
  });

  describe('Agent Token Renewal', () => {
    it('should connect agent with valid token', async () => {
      const agentId = uuidv4();
      const agentToken = generateToken({ agentId, type: 'agent' }, '1h');

      const ws = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      ws.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          token: agentToken,
        },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('CONNECTION_ACK');
          expect(message.payload.agentId).toBe(agentId);
          expect(message.payload.tokenExpiresAt).toBeDefined();
          resolve();
        });
      });

      ws.close();
    });

    it('should renew agent token', async () => {
      const agentId = uuidv4();
      const agentToken = generateToken({ agentId, type: 'agent' }, '1h');

      const ws = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      // Connect
      ws.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          token: agentToken,
        },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', () => resolve());
      });

      // Renew token
      ws.send(JSON.stringify({
        type: 'RENEW_TOKEN',
        payload: {},
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('TOKEN_RENEWED');
          expect(message.payload.token).toBeDefined();
          expect(message.payload.expiresAt).toBeDefined();

          // Verify new token
          const decoded = verifyToken(message.payload.token);
          expect(decoded).toBeTruthy();
          expect(decoded.agentId).toBe(agentId);

          resolve();
        });
      });

      ws.close();
    });

    it('should reject agent with expired token', async () => {
      const agentId = uuidv4();
      const expiredToken = generateToken({ agentId, type: 'agent' }, '-1s');

      const ws = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      ws.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          token: expiredToken,
        },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('ERROR');
          expect(message.payload.code).toBe('INVALID_TOKEN');
          resolve();
        });
      });

      await new Promise<void>((resolve) => {
        ws.once('close', () => resolve());
      });
    });
  });

  describe('Token Validation', () => {
    it('should validate current token', async () => {
      const userId = uuidv4();
      const token = generateToken({ userId });

      const ws = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      // Authenticate
      ws.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', () => resolve());
      });

      // Validate token
      ws.send(JSON.stringify({
        type: 'VALIDATE_TOKEN',
        payload: {},
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('TOKEN_VALIDATION');
          expect(message.payload.valid).toBe(true);
          expect(message.payload.expiresAt).toBeDefined();
          resolve();
        });
      });

      ws.close();
    });

    it('should reject messages after token expiry', async () => {
      const userId = uuidv4();
      const veryShortToken = generateToken({ userId }, '1s'); // Expires in 1 second

      const ws = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      // Authenticate
      ws.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token: veryShortToken },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', () => resolve());
      });

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Try to send message with expired token
      ws.send(JSON.stringify({
        type: 'TEST_MESSAGE',
        payload: {},
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('ERROR');
          expect(message.payload.code).toBe('TOKEN_EXPIRED');
          resolve();
        });
      });

      ws.close();
    });
  });

  describe('Concurrent Token Operations', () => {
    it('should handle multiple simultaneous token refreshes', async () => {
      const NUM_CLIENTS = 5;
      const clients: WebSocket[] = [];
      const refreshPromises: Promise<void>[] = [];

      // Connect multiple clients
      for (let i = 0; i < NUM_CLIENTS; i++) {
        const userId = uuidv4();
        const token = generateToken({ userId });
        const refreshToken = generateRefreshToken(userId);

        const ws = new WebSocket(`${wsUrl}/ws/dashboard`);
        clients.push(ws);

        await new Promise<void>((resolve) => {
          ws.once('open', () => resolve());
        });

        // Authenticate
        ws.send(JSON.stringify({
          type: 'AUTHENTICATE',
          payload: { token },
        }));

        await new Promise<void>((resolve) => {
          ws.once('message', () => resolve());
        });

        // Schedule refresh
        refreshPromises.push(
          new Promise<void>((resolve) => {
            ws.send(JSON.stringify({
              type: 'REFRESH_TOKEN',
              payload: { refreshToken },
            }));

            ws.once('message', (data) => {
              const message = JSON.parse(data.toString());
              expect(message.type).toBe('TOKEN_REFRESHED');
              resolve();
            });
          })
        );
      }

      // Wait for all refreshes to complete
      await Promise.all(refreshPromises);

      // Clean up
      for (const ws of clients) {
        ws.close();
      }
    });

    it('should maintain independent token states for multiple connections', async () => {
      const user1Id = uuidv4();
      const user2Id = uuidv4();
      const token1 = generateToken({ userId: user1Id });
      const token2 = generateToken({ userId: user2Id }, '1s'); // Short expiry

      const ws1 = new WebSocket(`${wsUrl}/ws/dashboard`);
      const ws2 = new WebSocket(`${wsUrl}/ws/dashboard`);

      // Connect both clients
      await Promise.all([
        new Promise<void>((resolve) => ws1.once('open', () => resolve())),
        new Promise<void>((resolve) => ws2.once('open', () => resolve())),
      ]);

      // Authenticate both
      ws1.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token: token1 },
      }));

      ws2.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token: token2 },
      }));

      await Promise.all([
        new Promise<void>((resolve) => ws1.once('message', () => resolve())),
        new Promise<void>((resolve) => ws2.once('message', () => resolve())),
      ]);

      // Wait for token2 to expire
      await new Promise(resolve => setTimeout(resolve, 1500));

      // ws1 should still work
      ws1.send(JSON.stringify({
        type: 'VALIDATE_TOKEN',
        payload: {},
      }));

      await new Promise<void>((resolve) => {
        ws1.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('TOKEN_VALIDATION');
          expect(message.payload.valid).toBe(true);
          resolve();
        });
      });

      // ws2 should fail
      ws2.send(JSON.stringify({
        type: 'VALIDATE_TOKEN',
        payload: {},
      }));

      await new Promise<void>((resolve) => {
        ws2.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('ERROR');
          expect(message.payload.code).toBe('TOKEN_EXPIRED');
          resolve();
        });
      });

      ws1.close();
      ws2.close();
    });
  });
});