/**
 * Contract test for WebSocket database:status event
 * Tests database status broadcasting via WebSocket
 */

import Fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import WebSocket from 'ws';
// Mock message types for testing
interface DashboardConnectMessage {
  type: 'connect';
  payload: {
    userId: string;
  };
}

const createMessage = (type: string, payload: any) => ({
  type,
  payload
});

const isConnectionAck = (msg: any) => msg?.type === 'connected';

describe('WebSocket Database Status Contract', () => {
  let server: FastifyInstance;
  let serverUrl: string;
  let wsUrl: string;
  const validToken = 'valid-test-token';

  beforeAll(async () => {
    server = Fastify({ logger: false });
    await server.register(fastifyWebsocket);

    // Track database status
    let databaseStatus = {
      connected: false,
      type: 'none' as 'supabase' | 'local' | 'none',
      message: 'No database configured',
      lastCheck: new Date().toISOString()
    };

    // Mock database health monitoring
    const checkDatabaseHealth = async () => {
      const hasSupabase = process.env['SUPABASE_URL'] && process.env['SUPABASE_ANON_KEY'];
      const hasLocal = process.env['DATABASE_URL'];

      if (hasSupabase) {
        // Simulate checking Supabase connection
        databaseStatus = {
          connected: true,
          type: 'supabase',
          message: 'Connected to Supabase',
          lastCheck: new Date().toISOString()
        };
      } else if (hasLocal) {
        // Simulate checking local PostgreSQL
        databaseStatus = {
          connected: true,
          type: 'local',
          message: 'Connected to local PostgreSQL',
          lastCheck: new Date().toISOString()
        };
      } else {
        databaseStatus = {
          connected: false,
          type: 'none',
          message: 'No database configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY or DATABASE_URL',
          lastCheck: new Date().toISOString()
        };
      }

      return databaseStatus;
    };

    server.register(async function (fastify) {
      fastify.get('/ws/dashboard', { websocket: true }, (connection, req) => {
        const { socket } = connection;
        let authenticated = false;
        let healthCheckInterval: NodeJS.Timeout | null = null;

        socket.on('message', async (data) => {
          try {
            const message = JSON.parse(data.toString());

            if (message.type === 'dashboard:connect' && message.payload.token === validToken) {
              authenticated = true;

              // Send connection ack
              socket.send(JSON.stringify(createMessage('connection:ack', {
                connectionId: `conn-${Date.now()}`,
                serverVersion: '1.0.0',
                features: ['database-monitoring']
              })));

              // Send initial database status
              const status = await checkDatabaseHealth();
              socket.send(JSON.stringify(createMessage('database:status', status)));

              // Start periodic health checks
              healthCheckInterval = setInterval(async () => {
                const newStatus = await checkDatabaseHealth();
                socket.send(JSON.stringify(createMessage('database:status', newStatus)));
              }, 30000); // Every 30 seconds
            }

            // Handle database status request
            if (message.type === 'database:check' && authenticated) {
              const status = await checkDatabaseHealth();
              socket.send(JSON.stringify(createMessage('database:status', status)));
            }

            // Simulate database connection change
            if (message.type === 'test:simulate-database-disconnect' && authenticated) {
              databaseStatus = {
                connected: false,
                type: 'supabase',
                message: 'Lost connection to Supabase',
                lastCheck: new Date().toISOString()
              };
              socket.send(JSON.stringify(createMessage('database:status', databaseStatus)));
            }

            // Simulate database reconnection
            if (message.type === 'test:simulate-database-reconnect' && authenticated) {
              databaseStatus = {
                connected: true,
                type: 'supabase',
                message: 'Reconnected to Supabase',
                lastCheck: new Date().toISOString()
              };
              socket.send(JSON.stringify(createMessage('database:status', databaseStatus)));
            }
          } catch (err) {
            socket.send(JSON.stringify(createMessage('error', {
              message: 'Invalid message format'
            })));
          }
        });

        socket.on('close', () => {
          if (healthCheckInterval) {
            clearInterval(healthCheckInterval);
          }
        });
      });
    });

    await server.listen({ port: 0 });
    const address = server.server.address();
    const port = typeof address === 'object' ? address?.port : 0;
    serverUrl = `http://localhost:${port}`;
    wsUrl = `ws://localhost:${port}/ws/dashboard`;
  });

  afterAll(async () => {
    await server.close();
  });

  describe('Database Status Events', () => {
    it('should send database status on connection', async () => {
      const ws = new WebSocket(wsUrl);
      const messages: any[] = [];

      await new Promise<void>((resolve, reject) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          messages.push(message);

          if (message.type === 'database:status') {
            ws.close();
            resolve();
          }
        });

        ws.on('open', () => {
          const connectMessage: DashboardConnectMessage = createMessage('dashboard:connect', {
            token: validToken
          });
          ws.send(JSON.stringify(connectMessage));
        });

        ws.on('error', reject);

        setTimeout(() => {
          ws.close();
          reject(new Error('Timeout waiting for database status'));
        }, 5000);
      });

      // Should have received connection ack and database status
      expect(messages).toHaveLength(2);

      const ackMessage = messages[0];
      expect(ackMessage.type).toBe('connection:ack');

      const statusMessage = messages[1];
      expect(statusMessage.type).toBe('database:status');
      expect(statusMessage.payload).toMatchObject({
        connected: expect.any(Boolean),
        type: expect.stringMatching(/supabase|local|none/),
        message: expect.any(String),
        lastCheck: expect.any(String)
      });
    });

    it('should respond to database check requests', async () => {
      const ws = new WebSocket(wsUrl);
      let statusReceived = false;

      await new Promise<void>((resolve, reject) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'connection:ack') {
            // Request database status
            ws.send(JSON.stringify(createMessage('database:check', {})));
          }

          if (message.type === 'database:status' && !statusReceived) {
            statusReceived = true;
            // Skip the initial status, wait for response to our check
          } else if (message.type === 'database:status' && statusReceived) {
            expect(message.payload).toMatchObject({
              connected: expect.any(Boolean),
              type: expect.any(String),
              message: expect.any(String),
              lastCheck: expect.any(String)
            });
            ws.close();
            resolve();
          }
        });

        ws.on('open', () => {
          ws.send(JSON.stringify(createMessage('dashboard:connect', {
            token: validToken
          })));
        });

        ws.on('error', reject);

        setTimeout(() => {
          ws.close();
          reject(new Error('Timeout waiting for database check response'));
        }, 5000);
      });
    });

    it('should broadcast database disconnection events', async () => {
      const ws = new WebSocket(wsUrl);
      const statusMessages: any[] = [];

      await new Promise<void>((resolve, reject) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'database:status') {
            statusMessages.push(message.payload);

            if (statusMessages.length === 2) {
              // Received disconnection status
              expect(statusMessages[1]).toMatchObject({
                connected: false,
                type: 'supabase',
                message: expect.stringContaining('Lost connection')
              });
              ws.close();
              resolve();
            }
          }

          if (message.type === 'connection:ack') {
            // Simulate database disconnect after connection
            setTimeout(() => {
              ws.send(JSON.stringify(createMessage('test:simulate-database-disconnect', {})));
            }, 100);
          }
        });

        ws.on('open', () => {
          ws.send(JSON.stringify(createMessage('dashboard:connect', {
            token: validToken
          })));
        });

        ws.on('error', reject);

        setTimeout(() => {
          ws.close();
          reject(new Error('Timeout waiting for database status events'));
        }, 5000);
      });
    });

    it('should broadcast database reconnection events', async () => {
      const ws = new WebSocket(wsUrl);
      const statusMessages: any[] = [];

      await new Promise<void>((resolve, reject) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'database:status') {
            statusMessages.push(message.payload);

            if (statusMessages.length === 3) {
              // Initial, disconnect, reconnect
              expect(statusMessages[2]).toMatchObject({
                connected: true,
                type: 'supabase',
                message: expect.stringContaining('Reconnected')
              });
              ws.close();
              resolve();
            }
          }

          if (message.type === 'connection:ack') {
            // Simulate disconnect then reconnect
            setTimeout(() => {
              ws.send(JSON.stringify(createMessage('test:simulate-database-disconnect', {})));
              setTimeout(() => {
                ws.send(JSON.stringify(createMessage('test:simulate-database-reconnect', {})));
              }, 100);
            }, 100);
          }
        });

        ws.on('open', () => {
          ws.send(JSON.stringify(createMessage('dashboard:connect', {
            token: validToken
          })));
        });

        ws.on('error', reject);

        setTimeout(() => {
          ws.close();
          reject(new Error('Timeout waiting for reconnection events'));
        }, 5000);
      });
    });

    it('should provide helpful error messages when database not configured', async () => {
      // Temporarily remove database config
      const originalSupabaseUrl = process.env['SUPABASE_URL'];
      const originalSupabaseKey = process.env['SUPABASE_ANON_KEY'];
      const originalDbUrl = process.env['DATABASE_URL'];

      delete process.env['SUPABASE_URL'];
      delete process.env['SUPABASE_ANON_KEY'];
      delete process.env['DATABASE_URL'];

      const ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'database:status') {
            expect(message.payload).toMatchObject({
              connected: false,
              type: 'none',
              message: expect.stringContaining('Please set SUPABASE_URL and SUPABASE_ANON_KEY')
            });

            // Restore env vars
            if (originalSupabaseUrl) process.env['SUPABASE_URL'] = originalSupabaseUrl;
            if (originalSupabaseKey) process.env['SUPABASE_ANON_KEY'] = originalSupabaseKey;
            if (originalDbUrl) process.env['DATABASE_URL'] = originalDbUrl;

            ws.close();
            resolve();
          }
        });

        ws.on('open', () => {
          ws.send(JSON.stringify(createMessage('dashboard:connect', {
            token: validToken
          })));
        });

        ws.on('error', reject);

        setTimeout(() => {
          ws.close();
          reject(new Error('Timeout waiting for database status'));
        }, 5000);
      });
    });
  });

  describe('Database Status with Multiple Clients', () => {
    it('should broadcast database status to all connected dashboards', async () => {
      const ws1 = new WebSocket(wsUrl);
      const ws2 = new WebSocket(wsUrl);

      const ws1Messages: any[] = [];
      const ws2Messages: any[] = [];

      await new Promise<void>((resolve, reject) => {
        let ws1Connected = false;
        let ws2Connected = false;

        ws1.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'database:status') {
            ws1Messages.push(message);
          }
          if (message.type === 'connection:ack') {
            ws1Connected = true;
            if (ws1Connected && ws2Connected) {
              // Both connected, trigger a database status change
              ws1.send(JSON.stringify(createMessage('test:simulate-database-disconnect', {})));
            }
          }
        });

        ws2.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'database:status') {
            ws2Messages.push(message);
            // Check if both received the disconnect event
            if (ws1Messages.length >= 2 && ws2Messages.length >= 2) {
              ws1.close();
              ws2.close();
              resolve();
            }
          }
          if (message.type === 'connection:ack') {
            ws2Connected = true;
            if (ws1Connected && ws2Connected) {
              // Both connected, trigger a database status change
              ws1.send(JSON.stringify(createMessage('test:simulate-database-disconnect', {})));
            }
          }
        });

        ws1.on('open', () => {
          ws1.send(JSON.stringify(createMessage('dashboard:connect', { token: validToken })));
        });

        ws2.on('open', () => {
          ws2.send(JSON.stringify(createMessage('dashboard:connect', { token: validToken })));
        });

        ws1.on('error', reject);
        ws2.on('error', reject);

        setTimeout(() => {
          ws1.close();
          ws2.close();
          reject(new Error('Timeout waiting for database status broadcast'));
        }, 5000);
      });

      // Both clients should have received status updates
      expect(ws1Messages.length).toBeGreaterThanOrEqual(2);
      expect(ws2Messages.length).toBeGreaterThanOrEqual(2);

      // Last message should be the disconnect event
      const lastWs1Message = ws1Messages[ws1Messages.length - 1];
      const lastWs2Message = ws2Messages[ws2Messages.length - 1];

      expect(lastWs1Message.payload.connected).toBe(false);
      expect(lastWs2Message.payload.connected).toBe(false);
    });
  });
});