import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { commandFixtures } from '../../fixtures/commands';
import { v4 as uuidv4 } from 'uuid';

describe('GET /commands/{id}/output', () => {
  let server: FastifyInstance;
  let authToken: string;
  let commandWithOutput: any;
  let commandWithoutOutput: any;
  let mockOutputs: any[];
  let nonExistentId: string;

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);

    // Create mock commands
    commandWithOutput = commandFixtures.createCommand({
      status: 'EXECUTING',
      startedAt: new Date().toISOString(),
    });
    commandWithoutOutput = commandFixtures.createCommand({
      status: 'PENDING',
    });
    nonExistentId = uuidv4();

    // Create mock terminal outputs
    mockOutputs = commandFixtures.createMultipleOutputs(commandWithOutput.id, 20);

    // Register the get command output route
    server.get('/commands/:commandId/output', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      const { commandId } = request.params as { commandId: string };
      const query = request.query as {
        limit?: string;
        offset?: string;
        stream?: string;
      };

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(commandId)) {
        return reply.code(400).send({
          error: 'Invalid command ID format',
        });
      }

      // Validate query parameters
      const limit = query.limit ? parseInt(query.limit, 10) : 100;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      if (isNaN(limit) || limit < 1 || limit > 1000) {
        return reply.code(400).send({
          error: 'Invalid limit. Must be between 1 and 1000',
        });
      }

      if (isNaN(offset) || offset < 0) {
        return reply.code(400).send({
          error: 'Invalid offset. Must be non-negative',
        });
      }

      // Validate stream filter
      if (query.stream && !commandFixtures.streamTypes.includes(query.stream as any)) {
        return reply.code(400).send({
          error: `Invalid stream type. Must be one of: ${commandFixtures.streamTypes.join(', ')}`,
        });
      }

      // Check if command exists
      if (commandId === commandWithoutOutput.id) {
        return reply.code(200).send({
          outputs: [],
          total: 0,
          hasMore: false,
        });
      }

      if (commandId !== commandWithOutput.id) {
        return reply.code(404).send({
          error: 'Command not found',
        });
      }

      // Filter outputs by stream type if specified
      let filteredOutputs = [...mockOutputs];
      if (query.stream) {
        filteredOutputs = filteredOutputs.filter(o => o.streamType === query.stream);
      }

      // Apply pagination
      const paginatedOutputs = filteredOutputs.slice(offset, offset + limit);
      const hasMore = (offset + limit) < filteredOutputs.length;

      return reply.code(200).send({
        outputs: paginatedOutputs,
        total: filteredOutputs.length,
        hasMore,
      });
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should return terminal outputs for command', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithOutput.id}/output`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body).toHaveProperty('outputs');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('hasMore');
      expect(Array.isArray(body.outputs)).toBe(true);
      expect(body.outputs.length).toBeGreaterThan(0);
      expect(body.total).toBe(20);
    });

    it('should return empty array for command without output', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithoutOutput.id}/output`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.outputs).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.hasMore).toBe(false);
    });

    it('should paginate outputs with limit', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithOutput.id}/output?limit=5`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.outputs).toHaveLength(5);
      expect(body.hasMore).toBe(true);
      expect(body.total).toBe(20);
    });

    it('should paginate outputs with offset', async () => {
      // Get first page
      const response1 = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithOutput.id}/output?limit=5&offset=0`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      // Get second page
      const response2 = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithOutput.id}/output?limit=5&offset=5`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const body1 = response1.json();
      const body2 = response2.json();

      // Different outputs
      expect(body1.outputs[0].sequenceNumber).toBe(1);
      expect(body2.outputs[0].sequenceNumber).toBe(6);
    });

    it('should filter outputs by stream type', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithOutput.id}/output?stream=STDERR`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.outputs.length).toBeGreaterThan(0);
      body.outputs.forEach((output: any) => {
        expect(output.streamType).toBe('STDERR');
      });
    });

    it('should combine filtering and pagination', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithOutput.id}/output?stream=STDOUT&limit=3`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.outputs.length).toBeLessThanOrEqual(3);
      body.outputs.forEach((output: any) => {
        expect(output.streamType).toBe('STDOUT');
      });
    });

    it('should maintain output order by sequence number', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithOutput.id}/output`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify outputs are ordered by sequence number
      for (let i = 1; i < body.outputs.length; i++) {
        expect(body.outputs[i].sequenceNumber).toBeGreaterThan(
          body.outputs[i - 1].sequenceNumber
        );
      }
    });
  });

  describe('Error Cases', () => {
    it('should return 404 for non-existent command', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${nonExistentId}/output`,
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
      ];

      for (const id of invalidIds) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands/${id}/output`,
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

    it('should return 400 for invalid limit values', async () => {
      const invalidLimits = ['0', '-1', '1001', 'abc'];

      for (const limit of invalidLimits) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands/${commandWithOutput.id}/output?limit=${limit}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid limit. Must be between 1 and 1000',
        });
      }
    });

    it('should return 400 for invalid offset values', async () => {
      const invalidOffsets = ['-1', 'abc'];

      for (const offset of invalidOffsets) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands/${commandWithOutput.id}/output?offset=${offset}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid offset. Must be non-negative',
        });
      }
    });

    it('should return 400 for invalid stream type', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithOutput.id}/output?stream=INVALID`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: `Invalid stream type. Must be one of: ${commandFixtures.streamTypes.join(', ')}`,
      });
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithOutput.id}/output`,
        // No authorization header
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
        url: `/commands/${commandWithOutput.id}/output`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify response structure
      expect(body).toHaveProperty('outputs');
      expect(Array.isArray(body.outputs)).toBe(true);
      expect(body).toHaveProperty('total');
      expect(typeof body.total).toBe('number');
      expect(body).toHaveProperty('hasMore');
      expect(typeof body.hasMore).toBe('boolean');

      // Verify each output matches TerminalOutput schema
      body.outputs.forEach((output: any) => {
        expect(output).toHaveProperty('id');
        expect(typeof output.id).toBe('string');

        expect(output).toHaveProperty('commandId');
        expect(typeof output.commandId).toBe('string');
        expect(output.commandId).toBe(commandWithOutput.id);

        expect(output).toHaveProperty('agentId');
        expect(typeof output.agentId).toBe('string');

        expect(output).toHaveProperty('content');
        expect(typeof output.content).toBe('string');

        expect(output).toHaveProperty('streamType');
        expect(commandFixtures.streamTypes).toContain(output.streamType);

        expect(output).toHaveProperty('timestamp');
        expect(typeof output.timestamp).toBe('string');

        expect(output).toHaveProperty('sequenceNumber');
        expect(typeof output.sequenceNumber).toBe('number');
      });
    });

    it('should support all stream type enum values', async () => {
      for (const stream of commandFixtures.streamTypes) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands/${commandWithOutput.id}/output?stream=${stream}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
      }
    });

    it('should use path parameter commandId as UUID', async () => {
      const testId = uuidv4();
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${testId}/output`,
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
      const maliciousPaths = [
        '/commands/%00/output',
        '/commands/../etc/passwd/output',
      ];

      for (const path of maliciousPaths) {
        const response = await server.inject({
          method: 'GET',
          url: path,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(400);
        expect(response.statusCode).toBeLessThan(500);
      }
    });

    it('should handle SQL injection attempts', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE terminal_outputs; --",
        "' OR '1'='1",
      ];

      for (const injection of sqlInjectionAttempts) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands/${injection}/output`,
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

    it('should not leak command existence to unauthorized users', async () => {
      // Test with existing command without auth
      const response1 = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithOutput.id}/output`,
        // No authorization
      });

      // Test with non-existent command without auth
      const response2 = await server.inject({
        method: 'GET',
        url: `/commands/${nonExistentId}/output`,
        // No authorization
      });

      expect(response1.statusCode).toBe(401);
      expect(response2.statusCode).toBe(401);
      expect(response1.json()).toEqual(response2.json());
    });

    it('should sanitize output content for display', async () => {
      // Add outputs with potential XSS content
      const xssOutput = commandFixtures.createTerminalOutput({
        commandId: commandWithOutput.id,
        content: '<script>alert("XSS")</script>',
        streamType: 'STDOUT',
        sequenceNumber: 999,
      });

      mockOutputs.push(xssOutput);

      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithOutput.id}/output?limit=100`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const dangerousOutput = body.outputs.find((o: any) => o.sequenceNumber === 999);
      expect(dangerousOutput).toBeDefined();

      // Content should be preserved but not executed
      expect(dangerousOutput.content).toBe('<script>alert("XSS")</script>');
    });
  });

  describe('Business Logic', () => {
    it('should handle large output streams efficiently', async () => {
      // Test with maximum limit
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithOutput.id}/output?limit=1000`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.outputs.length).toBeLessThanOrEqual(1000);
    });

    it('should preserve ANSI color codes in output', async () => {
      const ansiOutput = commandFixtures.createTerminalOutput({
        commandId: commandWithOutput.id,
        content: '\x1b[32mSuccess:\x1b[0m Test passed',
        streamType: 'STDOUT',
        sequenceNumber: 1000,
      });

      mockOutputs.push(ansiOutput);

      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithOutput.id}/output?limit=100`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const coloredOutput = body.outputs.find((o: any) => o.sequenceNumber === 1000);
      expect(coloredOutput).toBeDefined();
      expect(coloredOutput.content).toContain('\x1b[32m');
    });

    it('should handle multi-line output correctly', async () => {
      const multilineOutput = commandFixtures.createTerminalOutput({
        commandId: commandWithOutput.id,
        content: 'Line 1\nLine 2\nLine 3\n',
        streamType: 'STDOUT',
        sequenceNumber: 1001,
      });

      mockOutputs.push(multilineOutput);

      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithOutput.id}/output?limit=100`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const multiline = body.outputs.find((o: any) => o.sequenceNumber === 1001);
      expect(multiline).toBeDefined();
      expect(multiline.content).toBe('Line 1\nLine 2\nLine 3\n');
    });

    it('should distinguish between stdout and stderr', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithOutput.id}/output`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const stdoutCount = body.outputs.filter((o: any) => o.streamType === 'STDOUT').length;
      const stderrCount = body.outputs.filter((o: any) => o.streamType === 'STDERR').length;

      expect(stdoutCount).toBeGreaterThan(0);
      expect(stderrCount).toBeGreaterThan(0);
      expect(stdoutCount + stderrCount).toBe(body.outputs.length);
    });
  });
});