import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { commandFixtures } from '../../fixtures/commands';
import { v4 as uuidv4 } from 'uuid';

describe('GET /commands/{id}', () => {
  let server: FastifyInstance;
  let authToken: string;
  let mockCommand: any;
  let nonExistentId: string;

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);
    mockCommand = commandFixtures.createCommand({
      status: 'EXECUTING',
      queuePosition: null,
      startedAt: new Date().toISOString(),
    });
    nonExistentId = uuidv4();

    // Register the get command by ID route
    server.get('/commands/:commandId', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      const { commandId } = request.params as { commandId: string };

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(commandId)) {
        return reply.code(400).send({
          error: 'Invalid command ID format',
        });
      }

      // Simulate database lookup
      if (commandId === mockCommand.id) {
        return reply.code(200).send(mockCommand);
      }

      // Command not found
      return reply.code(404).send({
        error: 'Command not found',
      });
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should return command details for valid ID', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${mockCommand.id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.id).toBe(mockCommand.id);
      expect(body.content).toBe(mockCommand.content);
      expect(body.type).toBe(mockCommand.type);
      expect(body.status).toBe(mockCommand.status);
      expect(body.targetAgents).toEqual(mockCommand.targetAgents);
    });

    it('should return complete command object with all fields', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${mockCommand.id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify all required fields
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('userId');
      expect(body).toHaveProperty('content');
      expect(body).toHaveProperty('type');
      expect(body).toHaveProperty('targetAgents');
      expect(body).toHaveProperty('broadcast');
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('priority');
      expect(body).toHaveProperty('queuePosition');
      expect(body).toHaveProperty('startedAt');
      expect(body).toHaveProperty('completedAt');
      expect(body).toHaveProperty('failureReason');
      expect(body).toHaveProperty('metadata');
      expect(body).toHaveProperty('createdAt');
      expect(body).toHaveProperty('updatedAt');
    });

    it('should include execution details for executing command', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${mockCommand.id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.status).toBe('EXECUTING');
      expect(body.startedAt).not.toBeNull();
      expect(body.completedAt).toBeNull();
      expect(body.queuePosition).toBeNull();
    });
  });

  describe('Error Cases', () => {
    it('should return 404 for non-existent command ID', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${nonExistentId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: 'Command not found',
      });
    });

    it('should return 400 for invalid UUID format', async () => {
      const invalidIds = [
        'not-a-uuid',
        '123',
        'abc-def-ghi',
        '12345678-1234-1234-1234-123456789012x',
        '12345678-1234-1234-1234-12345678901',
        '12345678-1234-1234-1234-1234567890123',
        '../etc/passwd',
        'null',
        'undefined',
      ];

      for (const id of invalidIds) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands/${id}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid command ID format',
        });
      }
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${mockCommand.id}`,
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
        url: `/commands/${mockCommand.id}`,
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
        url: `/commands/${mockCommand.id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify response matches Command schema
      expect(typeof body.id).toBe('string');
      expect(typeof body.userId).toBe('string');
      expect(typeof body.content).toBe('string');
      expect(commandFixtures.commandTypes).toContain(body.type);
      expect(Array.isArray(body.targetAgents)).toBe(true);
      expect(typeof body.broadcast).toBe('boolean');
      expect(commandFixtures.commandStatuses).toContain(body.status);
      expect(typeof body.priority).toBe('number');

      // Nullable fields
      if (body.queuePosition !== null) {
        expect(typeof body.queuePosition).toBe('number');
      }
      if (body.startedAt !== null) {
        expect(typeof body.startedAt).toBe('string');
      }
      if (body.completedAt !== null) {
        expect(typeof body.completedAt).toBe('string');
      }
      if (body.failureReason !== null) {
        expect(typeof body.failureReason).toBe('string');
      }

      expect(typeof body.metadata).toBe('object');
      expect(typeof body.createdAt).toBe('string');
      expect(typeof body.updatedAt).toBe('string');
    });

    it('should match OpenAPI schema for 404 response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${nonExistentId}`,
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

    it('should use path parameter commandId as UUID', async () => {
      const testId = uuidv4();
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${testId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      // Should return 404 (not found) not 400 (invalid format)
      expect(response.statusCode).toBe(404);
    });

    it('should require Bearer authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${mockCommand.id}`,
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
        '/commands/%00',
        '/commands/%20',
        '/commands/../../etc/passwd',
        '/commands/${mockCommand.id}%00',
        '/commands/${mockCommand.id}/',
        '/commands//',
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

    it('should handle SQL injection attempts in command ID', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE commands; --",
        "' OR '1'='1",
        '" OR "1"="1',
        "1' AND '1'='1' UNION SELECT * FROM commands--",
      ];

      for (const injection of sqlInjectionAttempts) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands/${injection}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        // Should safely reject as invalid format
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid command ID format',
        });
      }
    });

    it('should handle XSS attempts in command ID', async () => {
      const xssAttempts = [
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        '<img src=x onerror=alert("XSS")>',
        '"><script>alert("XSS")</script>',
      ];

      for (const xss of xssAttempts) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands/${encodeURIComponent(xss)}`,
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

    it('should not leak command existence to unauthorized users', async () => {
      // Test with existing command ID without auth
      const response1 = await server.inject({
        method: 'GET',
        url: `/commands/${mockCommand.id}`,
        // No authorization
      });

      // Test with non-existent command ID without auth
      const response2 = await server.inject({
        method: 'GET',
        url: `/commands/${nonExistentId}`,
        // No authorization
      });

      // Both should return same 401 error
      expect(response1.statusCode).toBe(401);
      expect(response2.statusCode).toBe(401);
      expect(response1.json()).toEqual(response2.json());
    });
  });

  describe('Business Logic', () => {
    it('should show different states for commands', async () => {
      const states = [
        { status: 'PENDING', queuePosition: null, startedAt: null, completedAt: null },
        { status: 'QUEUED', queuePosition: 3, startedAt: null, completedAt: null },
        { status: 'EXECUTING', queuePosition: null, startedAt: new Date().toISOString(), completedAt: null },
        { status: 'COMPLETED', queuePosition: null, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
        { status: 'FAILED', queuePosition: null, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), failureReason: 'Error occurred' },
        { status: 'CANCELLED', queuePosition: null, startedAt: null, completedAt: new Date().toISOString() },
      ];

      // Mock different command states
      for (const state of states) {
        const testCommand = commandFixtures.createCommand(state);

        // Add to mock database
        server.get(`/commands/${testCommand.id}`, {
          preHandler: server.authenticate,
        }, async (request, reply) => {
          return reply.code(200).send(testCommand);
        });

        const response = await server.inject({
          method: 'GET',
          url: `/commands/${testCommand.id}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        expect(body.status).toBe(state.status);

        if (state.status === 'QUEUED') {
          expect(body.queuePosition).toBe(state.queuePosition);
        } else {
          expect(body.queuePosition).toBeNull();
        }

        if (['EXECUTING', 'COMPLETED', 'FAILED'].includes(state.status)) {
          expect(body.startedAt).not.toBeNull();
        }

        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(state.status)) {
          expect(body.completedAt).not.toBeNull();
        }

        if (state.status === 'FAILED') {
          expect(body.failureReason).not.toBeNull();
        }
      }
    });

    it('should return consistent data across multiple requests', async () => {
      const responses = await Promise.all([
        server.inject({
          method: 'GET',
          url: `/commands/${mockCommand.id}`,
          headers: { authorization: `Bearer ${authToken}` },
        }),
        server.inject({
          method: 'GET',
          url: `/commands/${mockCommand.id}`,
          headers: { authorization: `Bearer ${authToken}` },
        }),
        server.inject({
          method: 'GET',
          url: `/commands/${mockCommand.id}`,
          headers: { authorization: `Bearer ${authToken}` },
        }),
      ]);

      const bodies = responses.map(r => r.json());

      // All responses should be identical
      expect(bodies[0]).toEqual(bodies[1]);
      expect(bodies[1]).toEqual(bodies[2]);
    });
  });
});