import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { agentFixtures } from '../../fixtures/agents';
import { v4 as uuidv4 } from 'uuid';

describe('GET /agents/{id}', () => {
  let server: FastifyInstance;
  let authToken: string;
  let mockAgent: any;
  let nonExistentId: string;

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);
    mockAgent = agentFixtures.createAgent();
    nonExistentId = uuidv4();

    // Register the get agent by ID route
    server.get('/agents/:agentId', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      const { agentId } = request.params as { agentId: string };

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(agentId)) {
        return reply.code(400).send({
          error: 'Invalid agent ID format',
        });
      }

      // Simulate database lookup
      if (agentId === mockAgent.id) {
        return reply.code(200).send(mockAgent);
      }

      // Agent not found
      return reply.code(404).send({
        error: 'Agent not found',
      });
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should return agent details for valid ID', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/agents/${mockAgent.id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.id).toBe(mockAgent.id);
      expect(body.name).toBe(mockAgent.name);
      expect(body.type).toBe(mockAgent.type);
      expect(body.status).toBe(mockAgent.status);
      expect(body.activityState).toBe(mockAgent.activityState);
      expect(body.hostMachine).toBe(mockAgent.hostMachine);
    });

    it('should return complete agent object with all fields', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/agents/${mockAgent.id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify all required fields are present
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name');
      expect(body).toHaveProperty('type');
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('activityState');
      expect(body).toHaveProperty('hostMachine');
      expect(body).toHaveProperty('connectedAt');
      expect(body).toHaveProperty('disconnectedAt');
      expect(body).toHaveProperty('healthMetrics');
      expect(body).toHaveProperty('config');
      expect(body).toHaveProperty('createdAt');
      expect(body).toHaveProperty('updatedAt');

      // Verify nested objects
      expect(body.healthMetrics).toHaveProperty('cpuUsage');
      expect(body.healthMetrics).toHaveProperty('memoryUsage');
      expect(body.healthMetrics).toHaveProperty('uptime');
      expect(body.healthMetrics).toHaveProperty('commandsProcessed');
      expect(body.healthMetrics).toHaveProperty('averageResponseTime');

      expect(body.config).toHaveProperty('serverUrl');
      expect(body.config).toHaveProperty('autoReconnect');
      expect(body.config).toHaveProperty('maxRetries');
    });
  });

  describe('Error Cases', () => {
    it('should return 404 for non-existent agent ID', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/agents/${nonExistentId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: 'Agent not found',
      });
    });

    it('should return 400 for invalid UUID format', async () => {
      const invalidIds = [
        'not-a-uuid',
        '123',
        'abc-def-ghi',
        '12345678-1234-1234-1234-123456789012x', // Invalid character
        '12345678-1234-1234-1234-12345678901', // Too short
        '12345678-1234-1234-1234-1234567890123', // Too long
        '../etc/passwd',
        'null',
        'undefined',
      ];

      for (const id of invalidIds) {
        const response = await server.inject({
          method: 'GET',
          url: `/agents/${id}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid agent ID format',
        });
      }
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/agents/${mockAgent.id}`,
        // No authorization header
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'Unauthorized',
      });
    });

    it('should return 401 with invalid token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/agents/${mockAgent.id}`,
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'Unauthorized',
      });
    });
  });

  describe('Contract Compliance', () => {
    it('should match OpenAPI schema for success response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/agents/${mockAgent.id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify response matches Agent schema
      expect(typeof body.id).toBe('string');
      expect(typeof body.name).toBe('string');
      expect(agentFixtures.agentTypes).toContain(body.type);
      expect(agentFixtures.agentStatuses).toContain(body.status);
      expect(agentFixtures.agentActivityStates).toContain(body.activityState);
      expect(typeof body.hostMachine).toBe('string');
      expect(typeof body.connectedAt).toBe('string');

      if (body.disconnectedAt !== null) {
        expect(typeof body.disconnectedAt).toBe('string');
      }

      expect(typeof body.healthMetrics).toBe('object');
      expect(typeof body.healthMetrics.cpuUsage).toBe('number');
      expect(typeof body.healthMetrics.memoryUsage).toBe('number');
      expect(typeof body.healthMetrics.uptime).toBe('number');
      expect(typeof body.healthMetrics.commandsProcessed).toBe('number');
      expect(typeof body.healthMetrics.averageResponseTime).toBe('number');

      expect(typeof body.config).toBe('object');
      expect(typeof body.config.serverUrl).toBe('string');
      expect(typeof body.config.autoReconnect).toBe('boolean');
      expect(typeof body.config.maxRetries).toBe('number');

      expect(typeof body.createdAt).toBe('string');
      expect(typeof body.updatedAt).toBe('string');
    });

    it('should match OpenAPI schema for 404 response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/agents/${nonExistentId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();

      // Verify response matches ErrorResponse schema
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
      expect(Object.keys(body)).toEqual(['error']);
    });

    it('should use path parameter agentId as UUID', async () => {
      // Test that the path parameter is properly parsed
      const testId = uuidv4();
      const response = await server.inject({
        method: 'GET',
        url: `/agents/${testId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      // Should either return 200 (if exists) or 404 (if not exists)
      // But NOT 400 (invalid format) since it's a valid UUID
      expect([200, 404]).toContain(response.statusCode);
    });

    it('should require Bearer authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/agents/${mockAgent.id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Security', () => {
    it('should not expose internal errors for malformed paths', async () => {
      const maliciousPaths = [
        '/agents/%00',
        '/agents/%20',
        '/agents/../../etc/passwd',
        '/agents/${mockAgent.id}%00',
        '/agents/${mockAgent.id}/',
        '/agents//',
      ];

      for (const path of maliciousPaths) {
        const response = await server.inject({
          method: 'GET',
          url: path,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        // Should handle gracefully without exposing internals
        expect(response.statusCode).toBeGreaterThanOrEqual(400);
        expect(response.statusCode).toBeLessThan(500);
      }
    });

    it('should handle SQL injection attempts in agent ID', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE agents; --",
        "' OR '1'='1",
        '" OR "1"="1',
        "1' AND '1'='1' UNION SELECT * FROM agents--",
      ];

      for (const injection of sqlInjectionAttempts) {
        const response = await server.inject({
          method: 'GET',
          url: `/agents/${injection}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        // Should safely reject as invalid format
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid agent ID format',
        });
      }
    });

    it('should handle XSS attempts in agent ID', async () => {
      const xssAttempts = [
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        '<img src=x onerror=alert("XSS")>',
        '"><script>alert("XSS")</script>',
      ];

      for (const xss of xssAttempts) {
        const response = await server.inject({
          method: 'GET',
          url: `/agents/${encodeURIComponent(xss)}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        // Should safely reject as invalid format
        expect(response.statusCode).toBe(400);
        const body = response.json();

        // Ensure XSS attempt is not reflected in response
        expect(JSON.stringify(body)).not.toContain('<script>');
        expect(JSON.stringify(body)).not.toContain('javascript:');
        expect(JSON.stringify(body)).not.toContain('onerror=');
      }
    });

    it('should not leak information about agent existence to unauthorized users', async () => {
      // Test with existing agent ID without auth
      const response1 = await server.inject({
        method: 'GET',
        url: `/agents/${mockAgent.id}`,
        // No authorization
      });

      // Test with non-existent agent ID without auth
      const response2 = await server.inject({
        method: 'GET',
        url: `/agents/${nonExistentId}`,
        // No authorization
      });

      // Both should return same 401 error (not 404 for non-existent)
      expect(response1.statusCode).toBe(401);
      expect(response2.statusCode).toBe(401);
      expect(response1.json()).toEqual(response2.json());
    });
  });
});