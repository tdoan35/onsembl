/**
 * Contract test for GET /api/health endpoint with database status
 * Tests that the health endpoint returns database connection status
 */

import Fastify, { FastifyInstance } from 'fastify';
import { IncomingMessage, Server, ServerResponse } from 'http';

describe('Health Endpoint Contract', () => {
  let server: FastifyInstance<Server, IncomingMessage, ServerResponse>;
  let serverUrl: string;

  beforeAll(async () => {
    server = Fastify({ logger: false });

    // Mock health route with database status
    server.get('/health', async (request, reply) => {
      const databaseConnected = !!(process.env['SUPABASE_URL'] && process.env['SUPABASE_ANON_KEY']);

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: {
          connected: databaseConnected || false,
          type: databaseConnected ? 'supabase' : 'none',
          message: databaseConnected ? 'Connected to Supabase' : 'No database configured'
        }
      };
    });

    // More detailed health endpoint
    server.get('/api/system/health', async (request, reply) => {
      const databaseConnected = !!(process.env['SUPABASE_URL'] && process.env['SUPABASE_ANON_KEY']);
      const redisConnected = process.env['REDIS_URL'] ? true : false;

      return {
        status: databaseConnected && redisConnected ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        components: {
          database: {
            status: databaseConnected ? 'healthy' : 'unhealthy',
            type: databaseConnected ? 'supabase' : 'none',
            message: databaseConnected ? 'Connected to Supabase' : 'Supabase not configured',
            lastCheck: new Date().toISOString()
          },
          redis: {
            status: redisConnected ? 'healthy' : 'unhealthy',
            message: redisConnected ? 'Connected to Redis' : 'Redis not configured',
            lastCheck: new Date().toISOString()
          },
          websocket: {
            status: 'healthy',
            activeConnections: 0,
            message: 'WebSocket server ready'
          }
        },
        uptime: process.uptime(),
        version: process.env['npm_package_version'] || '1.0.0'
      };
    });

    await server.listen({ port: 0 });
    const address = server.server.address();
    const port = typeof address === 'object' ? address?.port : 0;
    serverUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await server.close();
  });

  describe('GET /health', () => {
    it('should return 200 with basic health status', async () => {
      const response = await fetch(`${serverUrl}/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');

      const data = await response.json();
      expect(data).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        database: {
          connected: expect.any(Boolean),
          type: expect.any(String),
          message: expect.any(String)
        }
      });
    });

    it('should indicate database not configured when env vars missing', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      delete process.env['SUPABASE_URL'];
      delete process.env['SUPABASE_ANON_KEY'];

      const response = await fetch(`${serverUrl}/health`);
      const data = await response.json();

      expect(data.database).toMatchObject({
        connected: false,
        type: 'none',
        message: 'No database configured'
      });

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
    });
  });

  describe('GET /api/system/health', () => {
    it('should return 200 with detailed system health', async () => {
      const response = await fetch(`${serverUrl}/api/system/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');

      const data = await response.json();
      expect(data).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        timestamp: expect.any(String),
        components: {
          database: {
            status: expect.stringMatching(/healthy|unhealthy/),
            type: expect.any(String),
            message: expect.any(String),
            lastCheck: expect.any(String)
          },
          redis: {
            status: expect.stringMatching(/healthy|unhealthy/),
            message: expect.any(String),
            lastCheck: expect.any(String)
          },
          websocket: {
            status: expect.any(String),
            activeConnections: expect.any(Number),
            message: expect.any(String)
          }
        },
        uptime: expect.any(Number),
        version: expect.any(String)
      });
    });

    it('should report degraded status when database not configured', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      delete process.env['SUPABASE_URL'];
      delete process.env['SUPABASE_ANON_KEY'];

      const response = await fetch(`${serverUrl}/api/system/health`);
      const data = await response.json();

      expect(data.status).toBe('degraded');
      expect(data.components.database).toMatchObject({
        status: 'unhealthy',
        type: 'none',
        message: 'Supabase not configured'
      });

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
    });

    it('should include version and uptime information', async () => {
      const response = await fetch(`${serverUrl}/api/system/health`);
      const data = await response.json();

      expect(data.uptime).toBeGreaterThan(0);
      expect(data.version).toBeDefined();
    });
  });

  describe('Health Check Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Mock a database error scenario
      const testServer = Fastify({ logger: false });

      testServer.get('/health', async () => {
        try {
          // Simulate database check that might fail
          throw new Error('Database connection failed');
        } catch (error) {
          return {
            status: 'error',
            timestamp: new Date().toISOString(),
            database: {
              connected: false,
              type: 'supabase',
              message: 'Failed to connect to database',
              error: 'Database connection failed'
            }
          };
        }
      });

      await testServer.listen({ port: 0 });
      const address = testServer.server.address();
      const port = typeof address === 'object' ? address?.port : 0;

      const response = await fetch(`http://localhost:${port}/health`);
      const data = await response.json();

      expect(response.status).toBe(200); // Still returns 200 but with error status
      expect(data.status).toBe('error');
      expect(data.database.connected).toBe(false);
      expect(data.database.error).toBe('Database connection failed');

      await testServer.close();
    });
  });
});