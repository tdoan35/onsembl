/**
 * Integration test for health check monitoring
 * Tests periodic health checks and status updates
 */

import { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server';
import WebSocket from 'ws';

describe('Health Check Monitoring', () => {
  let server: FastifyInstance;
  let wsUrl: string;

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  describe('Periodic health checks', () => {
    it('should perform periodic database health checks', async () => {
      server = await buildServer({
        logger: false,
        disableRequestLogging: true,
        healthCheckInterval: 1000 // 1 second for testing
      });

      await server.listen({ port: 0 });

      // Wait for multiple health check cycles
      const healthChecks: any[] = [];

      await new Promise<void>((resolve) => {
        const checkHealth = async () => {
          const response = await server.inject({
            method: 'GET',
            url: '/api/system/health'
          });
          healthChecks.push({
            timestamp: new Date().toISOString(),
            data: JSON.parse(response.body)
          });
        };

        // Collect health checks over 3 seconds
        const interval = setInterval(checkHealth, 500);
        setTimeout(() => {
          clearInterval(interval);
          resolve();
        }, 3000);
      });

      expect(healthChecks.length).toBeGreaterThanOrEqual(5);

      // Verify health check data changes over time
      const uniqueTimestamps = new Set(healthChecks.map(h => h.data.timestamp));
      expect(uniqueTimestamps.size).toBeGreaterThan(1);

      // Verify lastCheck timestamps are updated
      const lastChecks = healthChecks.map(h => h.data.components.database.lastCheck);
      const uniqueLastChecks = new Set(lastChecks);
      expect(uniqueLastChecks.size).toBeGreaterThan(1);
    });

    it('should detect database status changes', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      process.env['SUPABASE_URL'] = 'https://test.supabase.co';
      process.env['SUPABASE_ANON_KEY'] = 'test-key';

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      // Initial health check - database configured
      const initialResponse = await server.inject({
        method: 'GET',
        url: '/health'
      });

      const initialData = JSON.parse(initialResponse.body);
      expect(initialData.database.connected).toBe(true);

      // Remove database config
      delete process.env['SUPABASE_URL'];
      delete process.env['SUPABASE_ANON_KEY'];

      // Force health check update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check health after config removal
      const afterResponse = await server.inject({
        method: 'GET',
        url: '/health'
      });

      const afterData = JSON.parse(afterResponse.body);
      expect(afterData.database.connected).toBe(false);

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
    });
  });

  describe('WebSocket health monitoring', () => {
    it('should broadcast health status updates via WebSocket', async () => {
      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });
      const address = server.server.address();
      const port = typeof address === 'object' ? address?.port : 0;
      wsUrl = `ws://localhost:${port}/ws/dashboard`;

      const ws = new WebSocket(wsUrl);
      const healthUpdates: any[] = [];

      await new Promise<void>((resolve, reject) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'database:status') {
            healthUpdates.push(message.payload);

            if (healthUpdates.length >= 2) {
              ws.close();
              resolve();
            }
          }

          if (message.type === 'connection:ack') {
            // Request health check to trigger update
            setTimeout(() => {
              ws.send(JSON.stringify({
                type: 'database:check',
                payload: {}
              }));
            }, 100);
          }
        });

        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'dashboard:connect',
            payload: { token: 'test-token' }
          }));
        });

        ws.on('error', reject);

        setTimeout(() => {
          ws.close();
          reject(new Error('Timeout waiting for health updates'));
        }, 5000);
      });

      expect(healthUpdates).toHaveLength(2);
      expect(healthUpdates[0]).toHaveProperty('connected');
      expect(healthUpdates[0]).toHaveProperty('lastCheck');
    });

    it('should include health metrics in system status', async () => {
      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      const response = await server.inject({
        method: 'GET',
        url: '/api/system/health'
      });

      const data = JSON.parse(response.body);

      // Should include comprehensive health metrics
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('uptime');
      expect(data).toHaveProperty('components');

      // Database component health
      expect(data.components.database).toMatchObject({
        status: expect.stringMatching(/healthy|unhealthy/),
        type: expect.any(String),
        message: expect.any(String),
        lastCheck: expect.any(String)
      });

      // Redis component health
      expect(data.components.redis).toMatchObject({
        status: expect.stringMatching(/healthy|unhealthy/),
        message: expect.any(String),
        lastCheck: expect.any(String)
      });

      // WebSocket component health
      expect(data.components.websocket).toMatchObject({
        status: expect.any(String),
        activeConnections: expect.any(Number),
        message: expect.any(String)
      });
    });
  });

  describe('Health status aggregation', () => {
    it('should report degraded when any component unhealthy', async () => {
      const originalRedis = process.env['REDIS_URL'];

      // Configure database but not Redis
      process.env['SUPABASE_URL'] = 'https://test.supabase.co';
      process.env['SUPABASE_ANON_KEY'] = 'test-key';
      delete process.env['REDIS_URL'];

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      const response = await server.inject({
        method: 'GET',
        url: '/api/system/health'
      });

      const data = JSON.parse(response.body);

      expect(data.status).toBe('degraded');
      expect(data.components.database.status).toBe('healthy');
      expect(data.components.redis.status).toBe('unhealthy');

      // Restore env vars
      if (originalRedis) process.env['REDIS_URL'] = originalRedis;
    });

    it('should report healthy when all components operational', async () => {
      // Configure all components
      process.env['SUPABASE_URL'] = 'https://test.supabase.co';
      process.env['SUPABASE_ANON_KEY'] = 'test-key';
      process.env['REDIS_URL'] = 'redis://localhost:6379';

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      const response = await server.inject({
        method: 'GET',
        url: '/api/system/health'
      });

      const data = JSON.parse(response.body);

      expect(data.status).toBe('healthy');
      expect(data.components.database.status).toBe('healthy');
      expect(data.components.redis.status).toBe('healthy');
      expect(data.components.websocket.status).toBe('healthy');
    });
  });

  describe('Health check alerts', () => {
    it('should emit events on health status changes', async () => {
      const events: any[] = [];

      server = await buildServer({
        logger: false,
        disableRequestLogging: true,
        onHealthChange: (status: any) => {
          events.push({
            timestamp: new Date().toISOString(),
            status
          });
        }
      });

      await server.listen({ port: 0 });

      // Simulate health status change
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      // Start with database configured
      process.env['SUPABASE_URL'] = 'https://test.supabase.co';
      process.env['SUPABASE_ANON_KEY'] = 'test-key';

      await server.inject({ method: 'GET', url: '/health' });

      // Remove database config to trigger unhealthy status
      delete process.env['SUPABASE_URL'];
      delete process.env['SUPABASE_ANON_KEY'];

      await server.inject({ method: 'GET', url: '/health' });

      // Should have captured health change events
      expect(events.length).toBeGreaterThanOrEqual(1);

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
    });

    it('should log warnings for unhealthy components', async () => {
      const logs: any[] = [];

      server = await buildServer({
        logger: {
          level: 'warn',
          transport: {
            target: 'pino-pretty',
            options: {
              destination: {
                write: (msg: string) => {
                  try {
                    logs.push(JSON.parse(msg));
                  } catch {
                    // Ignore non-JSON logs
                  }
                }
              }
            }
          }
        }
      });

      // Start server without database config
      delete process.env['SUPABASE_URL'];
      delete process.env['SUPABASE_ANON_KEY'];

      await server.listen({ port: 0 });

      // Trigger health check
      await server.inject({ method: 'GET', url: '/health' });

      // Should have logged warnings about unhealthy database
      const healthWarnings = logs.filter(log =>
        log.level >= 40 && // WARN level
        (log.msg?.includes('database') || log.msg?.includes('unhealthy'))
      );

      expect(healthWarnings.length).toBeGreaterThan(0);
    });
  });

  describe('Health check performance', () => {
    it('should not block requests during health checks', async () => {
      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      const startTime = Date.now();
      const responses = await Promise.all([
        server.inject({ method: 'GET', url: '/health' }),
        server.inject({ method: 'GET', url: '/api/system/health' }),
        server.inject({ method: 'GET', url: '/health' })
      ]);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });

      // Should complete quickly (parallel execution)
      expect(duration).toBeLessThan(1000);
    });

    it('should cache health check results appropriately', async () => {
      server = await buildServer({
        logger: false,
        disableRequestLogging: true,
        healthCacheTTL: 500 // 500ms cache
      });

      await server.listen({ port: 0 });

      // First request - fresh check
      const response1 = await server.inject({
        method: 'GET',
        url: '/api/system/health'
      });
      const data1 = JSON.parse(response1.body);

      // Immediate second request - should use cache
      const response2 = await server.inject({
        method: 'GET',
        url: '/api/system/health'
      });
      const data2 = JSON.parse(response2.body);

      // Timestamps should be the same (cached)
      expect(data2.timestamp).toBe(data1.timestamp);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 600));

      // Third request - fresh check
      const response3 = await server.inject({
        method: 'GET',
        url: '/api/system/health'
      });
      const data3 = JSON.parse(response3.body);

      // Timestamp should be different (fresh)
      expect(data3.timestamp).not.toBe(data1.timestamp);
    });
  });
});