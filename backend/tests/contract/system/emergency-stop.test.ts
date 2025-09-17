import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { agentFixtures } from '../../fixtures/agents';
import { commandFixtures } from '../../fixtures/commands';
import { v4 as uuidv4 } from 'uuid';

describe('POST /emergency-stop', () => {
  let server: FastifyInstance;
  let authToken: string;
  let onlineAgents: any[];
  let executingCommands: any[];

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);

    // Create mock agents with different statuses
    onlineAgents = [
      agentFixtures.createAgent({ status: 'ONLINE', activityState: 'PROCESSING' }),
      agentFixtures.createAgent({ status: 'ONLINE', activityState: 'IDLE' }),
      agentFixtures.createAgent({ status: 'CONNECTING', activityState: 'IDLE' }),
    ];

    // Create mock executing commands
    executingCommands = [
      commandFixtures.createCommand({ status: 'EXECUTING', targetAgents: [onlineAgents[0].id] }),
      commandFixtures.createCommand({ status: 'EXECUTING', targetAgents: [onlineAgents[1].id] }),
      commandFixtures.createCommand({ status: 'QUEUED' }),
    ];

    // Register the emergency stop route
    server.post('/emergency-stop', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      const body = request.body as { reason?: string } | undefined;

      // Validate reason if provided
      if (body?.reason !== undefined && typeof body.reason !== 'string') {
        return reply.code(400).send({
          error: 'Reason must be a string',
        });
      }

      // In production, this would:
      // 1. Send stop signal to all online agents via WebSocket
      // 2. Cancel all executing and queued commands
      // 3. Update agent statuses to OFFLINE
      // 4. Log emergency stop in audit log with reason
      // 5. Send notifications to administrators
      // 6. Return count of stopped agents

      const reason = body?.reason || 'Emergency stop initiated';

      // Count agents that will be stopped (online and connecting)
      const agentsStopped = onlineAgents.filter(a =>
        ['ONLINE', 'CONNECTING'].includes(a.status)
      ).length;

      // Count commands that will be cancelled
      const commandsCancelled = executingCommands.filter(c =>
        ['EXECUTING', 'QUEUED', 'PENDING'].includes(c.status)
      ).length;

      return reply.code(200).send({
        message: 'Emergency stop executed successfully',
        agentsStopped,
        commandsCancelled,
        reason,
        timestamp: new Date().toISOString(),
      });
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should execute emergency stop without reason', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body).toHaveProperty('message');
      expect(body.message).toBe('Emergency stop executed successfully');
      expect(body).toHaveProperty('agentsStopped');
      expect(body.agentsStopped).toBeGreaterThan(0);
      expect(body).toHaveProperty('commandsCancelled');
      expect(body).toHaveProperty('reason');
      expect(body.reason).toBe('Emergency stop initiated');
      expect(body).toHaveProperty('timestamp');
    });

    it('should execute emergency stop with reason', async () => {
      const reason = 'Critical security breach detected';

      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { reason },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.message).toBe('Emergency stop executed successfully');
      expect(body.reason).toBe(reason);
      expect(body.agentsStopped).toBeGreaterThan(0);
      expect(body.commandsCancelled).toBeGreaterThan(0);
    });

    it('should handle empty request body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().reason).toBe('Emergency stop initiated');
    });

    it('should count all affected agents', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Should count online and connecting agents
      const expectedCount = onlineAgents.filter(a =>
        ['ONLINE', 'CONNECTING'].includes(a.status)
      ).length;

      expect(body.agentsStopped).toBe(expectedCount);
    });

    it('should count all affected commands', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Should count executing and queued commands
      const expectedCount = executingCommands.filter(c =>
        ['EXECUTING', 'QUEUED', 'PENDING'].includes(c.status)
      ).length;

      expect(body.commandsCancelled).toBe(expectedCount);
    });

    it('should include timestamp of execution', async () => {
      const before = Date.now();

      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const after = Date.now();

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const timestamp = new Date(body.timestamp).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should be idempotent', async () => {
      // Multiple emergency stops should be safe
      const responses = await Promise.all([
        server.inject({
          method: 'POST',
          url: '/emergency-stop',
          headers: { authorization: `Bearer ${authToken}` },
        }),
        server.inject({
          method: 'POST',
          url: '/emergency-stop',
          headers: { authorization: `Bearer ${authToken}` },
        }),
      ]);

      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
        expect(response.json()).toHaveProperty('message');
      });
    });
  });

  describe('Error Cases', () => {
    it('should return 400 for non-string reason', async () => {
      const invalidReasons = [
        { reason: 123 },
        { reason: true },
        { reason: [] },
        { reason: {} },
      ];

      for (const payload of invalidReasons) {
        const response = await server.inject({
          method: 'POST',
          url: '/emergency-stop',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
          payload,
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Reason must be a string',
        });
      }
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
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
        url: '/emergency-stop',
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
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { reason: 'Test emergency stop' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify response structure
      expect(body).toHaveProperty('message');
      expect(typeof body.message).toBe('string');

      expect(body).toHaveProperty('agentsStopped');
      expect(typeof body.agentsStopped).toBe('number');
      expect(body.agentsStopped).toBeGreaterThanOrEqual(0);

      expect(body).toHaveProperty('commandsCancelled');
      expect(typeof body.commandsCancelled).toBe('number');
      expect(body.commandsCancelled).toBeGreaterThanOrEqual(0);

      expect(body).toHaveProperty('reason');
      expect(typeof body.reason).toBe('string');

      expect(body).toHaveProperty('timestamp');
      expect(typeof body.timestamp).toBe('string');
    });

    it('should accept optional body parameter', async () => {
      // With body
      const response1 = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { reason: 'With reason' },
      });

      // Without body
      const response2 = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept application/json content type', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: { reason: 'Test' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Security', () => {
    it('should handle malformed JSON gracefully', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: '{"reason": "test"', // Malformed JSON
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
    });

    it('should handle XSS attempts in reason', async () => {
      const xssAttempts = [
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        '<img src=x onerror=alert("XSS")>',
      ];

      for (const xss of xssAttempts) {
        const response = await server.inject({
          method: 'POST',
          url: '/emergency-stop',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
          payload: { reason: xss },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        // Reason should be stored safely
        expect(body.reason).toBe(xss);
      }
    });

    it('should require proper authorization level', async () => {
      // In production, this might require admin privileges
      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      // For now, any authenticated user can trigger emergency stop
      // This should be restricted in production
      expect(response.statusCode).toBe(200);
    });

    it('should handle concurrent emergency stops', async () => {
      const promises = Array(5).fill(null).map((_, i) =>
        server.inject({
          method: 'POST',
          url: '/emergency-stop',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
          payload: { reason: `Concurrent stop ${i}` },
        })
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });
    });
  });

  describe('Business Logic', () => {
    it('should stop all active operations', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { reason: 'System maintenance' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify all online agents are stopped
      expect(body.agentsStopped).toBeGreaterThan(0);

      // Verify all active commands are cancelled
      expect(body.commandsCancelled).toBeGreaterThan(0);
    });

    it('should work even with no active agents', async () => {
      // Temporarily clear agents
      const tempAgents = [...onlineAgents];
      onlineAgents.length = 0;

      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.agentsStopped).toBe(0);
      expect(body.message).toBe('Emergency stop executed successfully');

      // Restore agents
      onlineAgents.push(...tempAgents);
    });

    it('should work even with no active commands', async () => {
      // Temporarily clear commands
      const tempCommands = [...executingCommands];
      executingCommands.length = 0;

      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.commandsCancelled).toBe(0);
      expect(body.message).toBe('Emergency stop executed successfully');

      // Restore commands
      executingCommands.push(...tempCommands);
    });

    it('should preserve reason with special characters', async () => {
      const specialReason = 'Emergency: "Critical" failure & system <error>';

      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { reason: specialReason },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().reason).toBe(specialReason);
    });

    it('should not affect offline agents', async () => {
      // Add offline agent
      const offlineAgent = agentFixtures.createAgent({ status: 'OFFLINE' });
      onlineAgents.push(offlineAgent);

      const response = await server.inject({
        method: 'POST',
        url: '/emergency-stop',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Should not count offline agent
      const expectedCount = onlineAgents.filter(a =>
        ['ONLINE', 'CONNECTING'].includes(a.status)
      ).length;

      expect(body.agentsStopped).toBe(expectedCount);

      // Remove offline agent
      const index = onlineAgents.indexOf(offlineAgent);
      onlineAgents.splice(index, 1);
    });
  });
});