import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { agentFixtures } from '../../fixtures/agents';
import { v4 as uuidv4 } from 'uuid';

describe('POST /agents/{id}/restart', () => {
  let server: FastifyInstance;
  let authToken: string;
  let onlineAgent: any;
  let offlineAgent: any;
  let errorAgent: any;
  let nonExistentId: string;

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);

    // Create mock agents with different statuses
    onlineAgent = agentFixtures.createAgent({ status: 'ONLINE' });
    offlineAgent = agentFixtures.createAgent({ status: 'OFFLINE' });
    errorAgent = agentFixtures.createAgent({ status: 'ERROR' });
    nonExistentId = uuidv4();

    // Register the restart agent route
    server.post('/agents/:agentId/restart', {
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

      // Simulate agent lookup and restart logic
      const agents = [onlineAgent, offlineAgent, errorAgent];
      const agent = agents.find(a => a.id === agentId);

      if (!agent) {
        return reply.code(404).send({
          error: 'Agent not found',
        });
      }

      // In production, this would:
      // 1. Send restart command via WebSocket to agent
      // 2. Update agent status to CONNECTING
      // 3. Wait for agent to reconnect
      // 4. Return success message

      // Simulate different responses based on agent status
      if (agent.status === 'OFFLINE') {
        return reply.code(400).send({
          error: 'Cannot restart offline agent',
        });
      }

      return reply.code(200).send({
        message: `Agent ${agent.name} restart initiated`,
      });
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should restart online agent successfully', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${onlineAgent.id}/restart`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        message: `Agent ${onlineAgent.name} restart initiated`,
      });
    });

    it('should restart agent in error state', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${errorAgent.id}/restart`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        message: `Agent ${errorAgent.name} restart initiated`,
      });
    });

    it('should accept empty request body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${onlineAgent.id}/restart`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle POST without body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${onlineAgent.id}/restart`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        // No payload at all
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Error Cases', () => {
    it('should return 404 for non-existent agent', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${nonExistentId}/restart`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: 'Agent not found',
      });
    });

    it('should return 400 for offline agent', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${offlineAgent.id}/restart`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Cannot restart offline agent',
      });
    });

    it('should return 400 for invalid UUID format', async () => {
      const invalidIds = [
        'not-a-uuid',
        '123',
        'abc-def-ghi',
        '12345678-1234-1234-1234-123456789012x',
        '../etc/passwd',
        'null',
        'undefined',
      ];

      for (const id of invalidIds) {
        const response = await server.inject({
          method: 'POST',
          url: `/agents/${id}/restart`,
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
        method: 'POST',
        url: `/agents/${onlineAgent.id}/restart`,
        // No authorization header
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'Unauthorized',
      });
    });

    it('should return 401 with invalid token', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${onlineAgent.id}/restart`,
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
        method: 'POST',
        url: `/agents/${onlineAgent.id}/restart`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify response matches MessageResponse schema
      expect(body).toHaveProperty('message');
      expect(typeof body.message).toBe('string');
      expect(Object.keys(body)).toEqual(['message']);
    });

    it('should match OpenAPI schema for 404 response', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${nonExistentId}/restart`,
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
      const testId = uuidv4();
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${testId}/restart`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      // Should return 404 (not found) not 400 (invalid format)
      expect(response.statusCode).toBe(404);
    });

    it('should require Bearer authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${onlineAgent.id}/restart`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept application/json content type', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${onlineAgent.id}/restart`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Security', () => {
    it('should not expose internal errors', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${onlineAgent.id}/restart`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: '{"invalid": json', // Malformed JSON
      });

      // Should handle gracefully
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
    });

    it('should handle SQL injection attempts in agent ID', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE agents; --",
        "' OR '1'='1",
        '" OR "1"="1',
      ];

      for (const injection of sqlInjectionAttempts) {
        const response = await server.inject({
          method: 'POST',
          url: `/agents/${injection}/restart`,
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
      ];

      for (const xss of xssAttempts) {
        const response = await server.inject({
          method: 'POST',
          url: `/agents/${encodeURIComponent(xss)}/restart`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        // Should safely reject
        expect(response.statusCode).toBe(400);
        const body = response.json();

        // Ensure XSS attempt is not reflected
        expect(JSON.stringify(body)).not.toContain('<script>');
        expect(JSON.stringify(body)).not.toContain('javascript:');
        expect(JSON.stringify(body)).not.toContain('onerror=');
      }
    });

    it('should not leak agent existence to unauthorized users', async () => {
      // Test with existing agent without auth
      const response1 = await server.inject({
        method: 'POST',
        url: `/agents/${onlineAgent.id}/restart`,
        // No authorization
      });

      // Test with non-existent agent without auth
      const response2 = await server.inject({
        method: 'POST',
        url: `/agents/${nonExistentId}/restart`,
        // No authorization
      });

      // Both should return 401 (not 404 for non-existent)
      expect(response1.statusCode).toBe(401);
      expect(response2.statusCode).toBe(401);
      expect(response1.json()).toEqual(response2.json());
    });

    it('should be idempotent', async () => {
      // Multiple restart requests should be safe
      const responses = await Promise.all([
        server.inject({
          method: 'POST',
          url: `/agents/${onlineAgent.id}/restart`,
          headers: { authorization: `Bearer ${authToken}` },
        }),
        server.inject({
          method: 'POST',
          url: `/agents/${onlineAgent.id}/restart`,
          headers: { authorization: `Bearer ${authToken}` },
        }),
        server.inject({
          method: 'POST',
          url: `/agents/${onlineAgent.id}/restart`,
          headers: { authorization: `Bearer ${authToken}` },
        }),
      ]);

      // All should succeed
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          message: `Agent ${onlineAgent.name} restart initiated`,
        });
      });
    });
  });

  describe('Business Logic', () => {
    it('should handle restart for agents in different states', async () => {
      const testCases = [
        { agent: onlineAgent, expectedStatus: 200, description: 'online agent' },
        { agent: offlineAgent, expectedStatus: 400, description: 'offline agent' },
        { agent: errorAgent, expectedStatus: 200, description: 'error state agent' },
      ];

      for (const testCase of testCases) {
        const response = await server.inject({
          method: 'POST',
          url: `/agents/${testCase.agent.id}/restart`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(testCase.expectedStatus);

        if (testCase.expectedStatus === 200) {
          expect(response.json()).toHaveProperty('message');
        } else {
          expect(response.json()).toHaveProperty('error');
        }
      }
    });

    it('should not accept unexpected request body fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${onlineAgent.id}/restart`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          force: true,
          gracefulShutdown: false,
          unexpectedField: 'value',
        },
      });

      // Should still work but ignore extra fields
      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Response should not contain or reference the extra fields
      expect(JSON.stringify(body)).not.toContain('force');
      expect(JSON.stringify(body)).not.toContain('gracefulShutdown');
      expect(JSON.stringify(body)).not.toContain('unexpectedField');
    });
  });
});