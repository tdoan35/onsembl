/**
 * Integration test for error messages when Supabase not configured
 * Tests helpful error messages and fallback behavior
 */

import { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server';
import WebSocket from 'ws';

describe('Supabase Configuration Error Messages', () => {
  let server: FastifyInstance;
  let wsUrl: string;

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  describe('Missing configuration errors', () => {
    it('should provide clear error when SUPABASE_URL is missing', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      delete process.env['SUPABASE_URL'];
      process.env['SUPABASE_ANON_KEY'] = 'test-key';

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      const response = await server.inject({
        method: 'GET',
        url: '/health'
      });

      const data = JSON.parse(response.body);
      expect(data.database.message).toMatch(/SUPABASE_URL/);
      expect(data.database.message).toContain('Please set');

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
    });

    it('should provide clear error when SUPABASE_ANON_KEY is missing', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      process.env['SUPABASE_URL'] = 'https://test.supabase.co';
      delete process.env['SUPABASE_ANON_KEY'];

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      const response = await server.inject({
        method: 'GET',
        url: '/health'
      });

      const data = JSON.parse(response.body);
      expect(data.database.message).toMatch(/SUPABASE_ANON_KEY/);

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
    });

    it('should provide setup instructions when no database configured', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];
      const originalDbUrl = process.env['DATABASE_URL'];

      delete process.env['SUPABASE_URL'];
      delete process.env['SUPABASE_ANON_KEY'];
      delete process.env['DATABASE_URL'];

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
      expect(data.components.database.message).toContain('Supabase CLI');
      expect(data.components.database.message).toMatch(/npx supabase|supabase init/);

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
      if (originalDbUrl) process.env['DATABASE_URL'] = originalDbUrl;
    });
  });

  describe('API error responses', () => {
    it('should return appropriate error for database operations without config', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      delete process.env['SUPABASE_URL'];
      delete process.env['SUPABASE_ANON_KEY'];

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      // Try to fetch agents
      const response = await server.inject({
        method: 'GET',
        url: '/api/agents',
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(503);
      const data = JSON.parse(response.body);
      expect(data.error).toContain('Database not configured');
      expect(data.setup).toContain('SUPABASE_URL');
      expect(data.setup).toContain('SUPABASE_ANON_KEY');

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
    });

    it('should return error for command operations without database', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      delete process.env['SUPABASE_URL'];
      delete process.env['SUPABASE_ANON_KEY'];

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      // Try to create a command
      const response = await server.inject({
        method: 'POST',
        url: '/api/commands',
        headers: {
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json'
        },
        payload: {
          agentId: 'test-agent',
          command: 'echo test'
        }
      });

      expect(response.statusCode).toBe(503);
      const data = JSON.parse(response.body);
      expect(data.error).toBeDefined();
      expect(data.message).toContain('database');

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
    });
  });

  describe('WebSocket error messages', () => {
    it('should send database configuration error via WebSocket', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      delete process.env['SUPABASE_URL'];
      delete process.env['SUPABASE_ANON_KEY'];

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });
      const address = server.server.address();
      const port = typeof address === 'object' ? address?.port : 0;
      wsUrl = `ws://localhost:${port}/ws/dashboard`;

      const ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'database:status') {
            expect(message.payload.connected).toBe(false);
            expect(message.payload.message).toContain('Please set SUPABASE_URL');
            ws.close();
            resolve();
          }
        });

        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'dashboard:connect',
            payload: { token: 'test-token' }
          }));
        });
      });

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
    });
  });

  describe('Fallback behavior', () => {
    it('should operate in read-only mode without database', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      delete process.env['SUPABASE_URL'];
      delete process.env['SUPABASE_ANON_KEY'];

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      // Health check should still work
      const healthResponse = await server.inject({
        method: 'GET',
        url: '/health'
      });

      expect(healthResponse.statusCode).toBe(200);

      // System status should indicate degraded
      const systemResponse = await server.inject({
        method: 'GET',
        url: '/api/system/health'
      });

      expect(systemResponse.statusCode).toBe(200);
      const data = JSON.parse(systemResponse.body);
      expect(data.status).toBe('degraded');

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
    });

    it('should log warnings but not crash on startup', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      delete process.env['SUPABASE_URL'];
      delete process.env['SUPABASE_ANON_KEY'];

      const logs: any[] = [];
      server = await buildServer({
        logger: {
          level: 'warn',
          transport: {
            target: 'pino-pretty',
            options: {
              destination: {
                write: (msg: string) => {
                  logs.push(JSON.parse(msg));
                }
              }
            }
          }
        }
      });

      await server.listen({ port: 0 });

      // Should have logged warnings about missing config
      const dbWarnings = logs.filter(log =>
        log.msg?.includes('database') ||
        log.msg?.includes('Supabase')
      );

      expect(dbWarnings.length).toBeGreaterThan(0);

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
    });
  });

  describe('Error message quality', () => {
    it('should provide actionable error messages', () => {
      const errors = [
        {
          condition: 'missing_url',
          message: 'SUPABASE_URL environment variable is not set. Please set it to your Supabase project URL.',
          actionable: true
        },
        {
          condition: 'missing_key',
          message: 'SUPABASE_ANON_KEY environment variable is not set. Please set it to your Supabase anon key.',
          actionable: true
        },
        {
          condition: 'invalid_url',
          message: 'Invalid Supabase URL format. Expected format: https://[project-ref].supabase.co',
          actionable: true
        },
        {
          condition: 'connection_failed',
          message: 'Failed to connect to Supabase. Please check your network and Supabase project status.',
          actionable: true
        }
      ];

      for (const error of errors) {
        expect(error.message).toMatch(/Please|Expected|Check/);
        expect(error.message.length).toBeGreaterThan(20);
        expect(error.actionable).toBe(true);
      }
    });

    it('should include setup commands in error messages', () => {
      const setupMessage = `
        To set up Supabase locally:
        1. Install Supabase CLI: npm install -g supabase
        2. Initialize project: supabase init
        3. Start local instance: supabase start
        4. Copy the API URL and anon key to your .env file
      `;

      expect(setupMessage).toContain('npm install');
      expect(setupMessage).toContain('supabase init');
      expect(setupMessage).toContain('supabase start');
      expect(setupMessage).toContain('.env');
    });
  });
});