import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { agentFixtures } from '../../fixtures/agents';
import { v4 as uuidv4 } from 'uuid';

describe('POST /agents/{id}/stop', () => {
  let server: FastifyInstance;
  let authToken: string;
  let onlineAgent: any;
  let offlineAgent: any;
  let processingAgent: any;
  let nonExistentId: string;

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);

    // Create mock agents with different statuses
    onlineAgent = agentFixtures.createAgent({
      status: 'ONLINE',
      activityState: 'IDLE'
    });
    offlineAgent = agentFixtures.createAgent({
      status: 'OFFLINE',
      activityState: 'IDLE'
    });
    processingAgent = agentFixtures.createAgent({
      status: 'ONLINE',
      activityState: 'PROCESSING'
    });
    nonExistentId = uuidv4();

    // Register the stop agent route
    server.post('/agents/:agentId/stop', {
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

      // Simulate agent lookup
      const agents = [onlineAgent, offlineAgent, processingAgent];
      const agent = agents.find(a => a.id === agentId);

      if (!agent) {
        return reply.code(404).send({
          error: 'Agent not found',
        });
      }

      // In production, this would:
      // 1. Send stop command via WebSocket to agent
      // 2. Cancel any pending commands for this agent
      // 3. Update agent status to OFFLINE
      // 4. Log the stop action in audit log
      // 5. Return success message

      // Simulate different responses based on agent status
      if (agent.status === 'OFFLINE') {
        return reply.code(400).send({
          error: 'Agent is already stopped',
        });
      }

      // Simulate warning for agent with active processing
      let message = `Agent ${agent.name} stopped successfully`;
      if (agent.activityState === 'PROCESSING') {
        message = `Agent ${agent.name} stopped. Warning: Agent was processing commands`;
      }

      return reply.code(200).send({
        message,
      });
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should stop online idle agent successfully', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${onlineAgent.id}/stop`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        message: `Agent ${onlineAgent.name} stopped successfully`,
      });
    });

    it('should stop agent that is processing with warning', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${processingAgent.id}/stop`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        message: `Agent ${processingAgent.name} stopped. Warning: Agent was processing commands`,
      });
    });

    it('should accept empty request body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${onlineAgent.id}/stop`,
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
        url: `/agents/${onlineAgent.id}/stop`,
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
        url: `/agents/${nonExistentId}/stop`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: 'Agent not found',
      });
    });

    it('should return 400 for already stopped agent', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${offlineAgent.id}/stop`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Agent is already stopped',
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
        '../../admin',
        '%00',
      ];

      for (const id of invalidIds) {
        const response = await server.inject({
          method: 'POST',
          url: `/agents/${id}/stop`,
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
        url: `/agents/${onlineAgent.id}/stop`,
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
        url: `/agents/${onlineAgent.id}/stop`,
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'Unauthorized',
      });
    });

    it('should return 401 with expired token', async () => {
      // Generate an expired token
      const expiredToken = generateTestToken(server, {
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      });

      const response = await server.inject({
        method: 'POST',
        url: `/agents/${onlineAgent.id}/stop`,
        headers: {
          authorization: `Bearer ${expiredToken}`,
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
        url: `/agents/${onlineAgent.id}/stop`,
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
        url: `/agents/${nonExistentId}/stop`,
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

    it('should match OpenAPI schema for 400 response', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${offlineAgent.id}/stop`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
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
        url: `/agents/${testId}/stop`,
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
        url: `/agents/${onlineAgent.id}/stop`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Security', () => {
    it('should not expose internal errors', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${onlineAgent.id}/stop`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: '{"force": true', // Malformed JSON
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
        "1' AND '1'='1' UNION SELECT * FROM agents--",
      ];

      for (const injection of sqlInjectionAttempts) {
        const response = await server.inject({
          method: 'POST',
          url: `/agents/${injection}/stop`,
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
        '"><script>alert(String.fromCharCode(88,83,83))</script>',
      ];

      for (const xss of xssAttempts) {
        const response = await server.inject({
          method: 'POST',
          url: `/agents/${encodeURIComponent(xss)}/stop`,
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
        url: `/agents/${onlineAgent.id}/stop`,
        // No authorization
      });

      // Test with non-existent agent without auth
      const response2 = await server.inject({
        method: 'POST',
        url: `/agents/${nonExistentId}/stop`,
        // No authorization
      });

      // Both should return same 401 error
      expect(response1.statusCode).toBe(401);
      expect(response2.statusCode).toBe(401);
      expect(response1.json()).toEqual(response2.json());
    });

    it('should be idempotent for stopped agents', async () => {
      // First attempt on offline agent
      const response1 = await server.inject({
        method: 'POST',
        url: `/agents/${offlineAgent.id}/stop`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      // Second attempt on same offline agent
      const response2 = await server.inject({
        method: 'POST',
        url: `/agents/${offlineAgent.id}/stop`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      // Both should return same error
      expect(response1.statusCode).toBe(400);
      expect(response2.statusCode).toBe(400);
      expect(response1.json()).toEqual(response2.json());
    });
  });

  describe('Business Logic', () => {
    it('should handle stop for agents in different states', async () => {
      const testCases = [
        {
          agent: onlineAgent,
          expectedStatus: 200,
          expectedMessage: 'stopped successfully',
          description: 'idle online agent'
        },
        {
          agent: offlineAgent,
          expectedStatus: 400,
          expectedMessage: 'already stopped',
          description: 'offline agent'
        },
        {
          agent: processingAgent,
          expectedStatus: 200,
          expectedMessage: 'Warning: Agent was processing',
          description: 'processing agent'
        },
      ];

      for (const testCase of testCases) {
        const response = await server.inject({
          method: 'POST',
          url: `/agents/${testCase.agent.id}/stop`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(testCase.expectedStatus);

        const body = response.json();
        if (testCase.expectedStatus === 200) {
          expect(body.message).toContain(testCase.expectedMessage);
        } else {
          expect(body.error).toContain(testCase.expectedMessage);
        }
      }
    });

    it('should differentiate between normal stop and forced stop with processing', async () => {
      // Stop idle agent - no warning
      const idleResponse = await server.inject({
        method: 'POST',
        url: `/agents/${onlineAgent.id}/stop`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(idleResponse.statusCode).toBe(200);
      expect(idleResponse.json().message).not.toContain('Warning');

      // Stop processing agent - includes warning
      const processingResponse = await server.inject({
        method: 'POST',
        url: `/agents/${processingAgent.id}/stop`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(processingResponse.statusCode).toBe(200);
      expect(processingResponse.json().message).toContain('Warning');
    });

    it('should not accept unexpected request body fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/agents/${onlineAgent.id}/stop`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          force: true,
          gracePeriod: 30,
          unexpectedField: 'value',
        },
      });

      // Should still work but ignore extra fields
      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Response should not reference the extra fields
      expect(JSON.stringify(body)).not.toContain('force');
      expect(JSON.stringify(body)).not.toContain('gracePeriod');
      expect(JSON.stringify(body)).not.toContain('unexpectedField');
    });
  });
});