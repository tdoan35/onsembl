import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { commandFixtures } from '../../fixtures/commands';
import { v4 as uuidv4 } from 'uuid';

describe('POST /commands/{id}/cancel', () => {
  let server: FastifyInstance;
  let authToken: string;
  let pendingCommand: any;
  let queuedCommand: any;
  let executingCommand: any;
  let completedCommand: any;
  let failedCommand: any;
  let cancelledCommand: any;
  let nonExistentId: string;

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);

    // Create mock commands with different statuses
    pendingCommand = commandFixtures.createCommand({ status: 'PENDING' });
    queuedCommand = commandFixtures.createCommand({ status: 'QUEUED', queuePosition: 5 });
    executingCommand = commandFixtures.createCommand({
      status: 'EXECUTING',
      startedAt: new Date().toISOString(),
    });
    completedCommand = commandFixtures.createCommand({
      status: 'COMPLETED',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    failedCommand = commandFixtures.createCommand({
      status: 'FAILED',
      failureReason: 'Command execution failed',
    });
    cancelledCommand = commandFixtures.createCommand({
      status: 'CANCELLED',
      completedAt: new Date().toISOString(),
    });
    nonExistentId = uuidv4();

    // Register the cancel command route
    server.post('/commands/:commandId/cancel', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      const { commandId } = request.params as { commandId: string };
      const body = request.body as { reason?: string } | undefined;

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(commandId)) {
        return reply.code(400).send({
          error: 'Invalid command ID format',
        });
      }

      // Validate reason if provided
      if (body?.reason !== undefined && typeof body.reason !== 'string') {
        return reply.code(400).send({
          error: 'Cancellation reason must be a string',
        });
      }

      // Simulate command lookup
      const commands = [
        pendingCommand,
        queuedCommand,
        executingCommand,
        completedCommand,
        failedCommand,
        cancelledCommand,
      ];
      const command = commands.find(c => c.id === commandId);

      if (!command) {
        return reply.code(404).send({
          error: 'Command not found',
        });
      }

      // Check if command can be cancelled
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(command.status)) {
        return reply.code(400).send({
          error: `Cannot cancel command with status ${command.status}`,
        });
      }

      // In production, this would:
      // 1. Update command status to CANCELLED in database
      // 2. Send cancellation signal via WebSocket to agent
      // 3. Remove from queue if queued
      // 4. Log cancellation with reason in audit log
      // 5. Return success message

      const reason = body?.reason || 'Cancelled by user';

      return reply.code(200).send({
        message: `Command ${command.id} cancelled successfully`,
        reason,
      });
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should cancel pending command', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/commands/${pendingCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        message: `Command ${pendingCommand.id} cancelled successfully`,
        reason: 'Cancelled by user',
      });
    });

    it('should cancel queued command', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/commands/${queuedCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        message: `Command ${queuedCommand.id} cancelled successfully`,
        reason: 'Cancelled by user',
      });
    });

    it('should cancel executing command', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/commands/${executingCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        message: `Command ${executingCommand.id} cancelled successfully`,
        reason: 'Cancelled by user',
      });
    });

    it('should accept cancellation reason', async () => {
      const reason = 'User requested different analysis';

      const response = await server.inject({
        method: 'POST',
        url: `/commands/${pendingCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { reason },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        message: `Command ${pendingCommand.id} cancelled successfully`,
        reason,
      });
    });

    it('should handle empty request body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/commands/${pendingCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        message: `Command ${pendingCommand.id} cancelled successfully`,
        reason: 'Cancelled by user',
      });
    });

    it('should handle no request body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/commands/${pendingCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        // No payload
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        message: `Command ${pendingCommand.id} cancelled successfully`,
        reason: 'Cancelled by user',
      });
    });

    it('should accept long cancellation reasons', async () => {
      const reason = 'This command needs to be cancelled because ' +
        'the requirements have changed and we need a different approach ' +
        'to solve this problem. The original analysis is no longer valid.';

      const response = await server.inject({
        method: 'POST',
        url: `/commands/${pendingCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { reason },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().reason).toBe(reason);
    });
  });

  describe('Error Cases', () => {
    it('should return 404 for non-existent command', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/commands/${nonExistentId}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: 'Command not found',
      });
    });

    it('should return 400 for already completed command', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/commands/${completedCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Cannot cancel command with status COMPLETED',
      });
    });

    it('should return 400 for already failed command', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/commands/${failedCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Cannot cancel command with status FAILED',
      });
    });

    it('should return 400 for already cancelled command', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/commands/${cancelledCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Cannot cancel command with status CANCELLED',
      });
    });

    it('should return 400 for invalid UUID format', async () => {
      const invalidIds = [
        'not-a-uuid',
        '123',
        'abc-def-ghi',
        '12345678-1234-1234-1234-123456789012x',
      ];

      for (const id of invalidIds) {
        const response = await server.inject({
          method: 'POST',
          url: `/commands/${id}/cancel`,
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
          url: `/commands/${pendingCommand.id}/cancel`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
          payload,
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Cancellation reason must be a string',
        });
      }
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/commands/${pendingCommand.id}/cancel`,
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
        url: `/commands/${pendingCommand.id}/cancel`,
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
        url: `/commands/${pendingCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { reason: 'Test cancellation' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify response structure
      expect(body).toHaveProperty('message');
      expect(typeof body.message).toBe('string');
      expect(body).toHaveProperty('reason');
      expect(typeof body.reason).toBe('string');
    });

    it('should match OpenAPI schema for 404 response', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/commands/${nonExistentId}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();

      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
      expect(Object.keys(body)).toEqual(['error']);
    });

    it('should accept optional body parameter', async () => {
      // With body
      const response1 = await server.inject({
        method: 'POST',
        url: `/commands/${pendingCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { reason: 'Custom reason' },
      });

      // Without body
      const response2 = await server.inject({
        method: 'POST',
        url: `/commands/${queuedCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);
    });

    it('should use path parameter commandId as UUID', async () => {
      const testId = uuidv4();
      const response = await server.inject({
        method: 'POST',
        url: `/commands/${testId}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      // Should return 404 (not found) not 400 (invalid format)
      expect(response.statusCode).toBe(404);
    });
  });

  describe('Security', () => {
    it('should not expose internal errors', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/commands/${pendingCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: '{"reason": "test"', // Malformed JSON
      });

      // Should handle gracefully
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
    });

    it('should handle SQL injection attempts in command ID', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE commands; --",
        "' OR '1'='1",
      ];

      for (const injection of sqlInjectionAttempts) {
        const response = await server.inject({
          method: 'POST',
          url: `/commands/${injection}/cancel`,
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

    it('should handle XSS attempts in reason', async () => {
      const xssAttempts = [
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        '<img src=x onerror=alert("XSS")>',
      ];

      for (const xss of xssAttempts) {
        const response = await server.inject({
          method: 'POST',
          url: `/commands/${pendingCommand.id}/cancel`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
          payload: { reason: xss },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        // Reason should be stored safely without execution
        expect(body.reason).toBe(xss);
      }
    });

    it('should not leak command existence to unauthorized users', async () => {
      // Test with existing command without auth
      const response1 = await server.inject({
        method: 'POST',
        url: `/commands/${pendingCommand.id}/cancel`,
        // No authorization
      });

      // Test with non-existent command without auth
      const response2 = await server.inject({
        method: 'POST',
        url: `/commands/${nonExistentId}/cancel`,
        // No authorization
      });

      // Both should return 401
      expect(response1.statusCode).toBe(401);
      expect(response2.statusCode).toBe(401);
      expect(response1.json()).toEqual(response2.json());
    });
  });

  describe('Business Logic', () => {
    it('should be idempotent for already cancelled commands', async () => {
      // First attempt
      const response1 = await server.inject({
        method: 'POST',
        url: `/commands/${cancelledCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { reason: 'First attempt' },
      });

      // Second attempt
      const response2 = await server.inject({
        method: 'POST',
        url: `/commands/${cancelledCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { reason: 'Second attempt' },
      });

      // Both should return same error
      expect(response1.statusCode).toBe(400);
      expect(response2.statusCode).toBe(400);
      expect(response1.json()).toEqual(response2.json());
    });

    it('should handle different command states appropriately', async () => {
      const testCases = [
        { command: pendingCommand, canCancel: true, description: 'pending command' },
        { command: queuedCommand, canCancel: true, description: 'queued command' },
        { command: executingCommand, canCancel: true, description: 'executing command' },
        { command: completedCommand, canCancel: false, description: 'completed command' },
        { command: failedCommand, canCancel: false, description: 'failed command' },
        { command: cancelledCommand, canCancel: false, description: 'already cancelled command' },
      ];

      for (const testCase of testCases) {
        const response = await server.inject({
          method: 'POST',
          url: `/commands/${testCase.command.id}/cancel`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        if (testCase.canCancel) {
          expect(response.statusCode).toBe(200);
          expect(response.json()).toHaveProperty('message');
        } else {
          expect(response.statusCode).toBe(400);
          expect(response.json()).toHaveProperty('error');
        }
      }
    });

    it('should preserve original reason if provided', async () => {
      const specialCharacters = 'Reason with "quotes" and \'apostrophes\' & symbols < > !';

      const response = await server.inject({
        method: 'POST',
        url: `/commands/${pendingCommand.id}/cancel`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { reason: specialCharacters },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().reason).toBe(specialCharacters);
    });
  });
});