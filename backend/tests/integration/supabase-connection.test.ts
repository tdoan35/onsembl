/**
 * Integration test for Supabase connection validation on startup
 * Tests that the server properly validates and connects to Supabase
 */

import { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server';
import { createClient } from '@supabase/supabase-js';

describe('Supabase Connection on Startup', () => {
  let server: FastifyInstance;

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  describe('Server startup with Supabase', () => {
    it('should validate Supabase configuration on startup', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      // Set valid Supabase config
      process.env['SUPABASE_URL'] = 'https://test.supabase.co';
      process.env['SUPABASE_ANON_KEY'] = 'test-anon-key';

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      // Server should start successfully
      await server.listen({ port: 0 });

      // Health check should show database connected
      const response = await server.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.database).toMatchObject({
        connected: true,
        type: 'supabase'
      });

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      else delete process.env['SUPABASE_URL'];
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
      else delete process.env['SUPABASE_ANON_KEY'];
    });

    it('should fail gracefully when Supabase URL is invalid', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      // Set invalid Supabase config
      process.env['SUPABASE_URL'] = 'not-a-valid-url';
      process.env['SUPABASE_ANON_KEY'] = 'test-anon-key';

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      // Server should still start but with validation error
      await server.listen({ port: 0 });

      const response = await server.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.database).toMatchObject({
        connected: false,
        message: expect.stringContaining('Invalid')
      });

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      else delete process.env['SUPABASE_URL'];
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
      else delete process.env['SUPABASE_ANON_KEY'];
    });

    it('should detect local Supabase CLI instance', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      // Set local Supabase CLI config
      process.env['SUPABASE_URL'] = 'http://localhost:54321';
      process.env['SUPABASE_ANON_KEY'] = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-key';

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      const response = await server.inject({
        method: 'GET',
        url: '/api/system/health'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.components.database).toMatchObject({
        type: 'supabase',
        message: expect.stringContaining('local')
      });

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      else delete process.env['SUPABASE_URL'];
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
      else delete process.env['SUPABASE_ANON_KEY'];
    });
  });

  describe('Supabase client validation', () => {
    it('should validate Supabase client can be created', () => {
      const url = 'https://test.supabase.co';
      const key = 'test-anon-key';

      const client = createClient(url, key);

      expect(client).toBeDefined();
      expect(client.auth).toBeDefined();
      expect(client.from).toBeDefined();
    });

    it('should reject invalid Supabase URLs', () => {
      const invalidUrls = [
        '',
        'not-a-url',
        'ftp://invalid.com',
        'http://',
        'supabase.co' // Missing protocol
      ];

      for (const url of invalidUrls) {
        expect(() => {
          createClient(url, 'test-key');
        }).toThrow();
      }
    });
  });

  describe('Environment detection', () => {
    it('should detect production Supabase', () => {
      const url = 'https://project.supabase.co';
      const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
      const isProduction = url.includes('.supabase.co');

      expect(isLocal).toBe(false);
      expect(isProduction).toBe(true);
    });

    it('should detect local Supabase CLI', () => {
      const urls = [
        'http://localhost:54321',
        'http://127.0.0.1:54321',
        'http://localhost:8000'
      ];

      for (const url of urls) {
        const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
        expect(isLocal).toBe(true);
      }
    });
  });

  describe('Connection retry logic', () => {
    it('should retry connection on transient failures', async () => {
      let attempts = 0;
      const maxRetries = 3;

      const tryConnect = async () => {
        attempts++;
        if (attempts < maxRetries) {
          throw new Error('Connection failed');
        }
        return { connected: true };
      };

      const result = await retryConnection(tryConnect, maxRetries);

      expect(attempts).toBe(maxRetries);
      expect(result.connected).toBe(true);
    });

    it('should fail after max retries exceeded', async () => {
      const maxRetries = 3;
      let attempts = 0;

      const tryConnect = async () => {
        attempts++;
        throw new Error('Connection failed');
      };

      await expect(retryConnection(tryConnect, maxRetries)).rejects.toThrow('Connection failed');
      expect(attempts).toBe(maxRetries);
    });
  });
});

// Helper function for retry logic
async function retryConnection(
  connectFn: () => Promise<any>,
  maxRetries: number
): Promise<any> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await connectFn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
      }
    }
  }

  throw lastError;
}