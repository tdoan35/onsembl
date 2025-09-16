import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { commandFixtures } from '../../fixtures/commands';
import { v4 as uuidv4 } from 'uuid';

describe('GET /commands', () => {
  let server: FastifyInstance;
  let authToken: string;
  let mockCommands: any[];
  let agentId: string;

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);
    agentId = uuidv4();
    mockCommands = commandFixtures.createMultipleCommands(15); // Create more than default limit

    // Register the commands list route
    server.get('/commands', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      const query = request.query as {
        status?: string;
        agentId?: string;
        limit?: string;
        offset?: string;
      };

      // Validate query parameters
      const limit = query.limit ? parseInt(query.limit, 10) : 10;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      // Validate limit and offset
      if (isNaN(limit) || limit < 1 || limit > 100) {
        return reply.code(400).send({
          error: 'Invalid limit. Must be between 1 and 100',
        });
      }

      if (isNaN(offset) || offset < 0) {
        return reply.code(400).send({
          error: 'Invalid offset. Must be non-negative',
        });
      }

      // Filter commands based on query parameters
      let filteredCommands = [...mockCommands];

      if (query.status) {
        if (!commandFixtures.commandStatuses.includes(query.status as any)) {
          return reply.code(400).send({
            error: `Invalid command status. Must be one of: ${commandFixtures.commandStatuses.join(', ')}`,
          });
        }
        filteredCommands = filteredCommands.filter(cmd => cmd.status === query.status);
      }

      if (query.agentId) {
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(query.agentId)) {
          return reply.code(400).send({
            error: 'Invalid agent ID format',
          });
        }
        filteredCommands = filteredCommands.filter(cmd =>
          cmd.targetAgents.includes(query.agentId)
        );
      }

      // Apply pagination
      const paginatedCommands = filteredCommands.slice(offset, offset + limit);
      const hasMore = (offset + limit) < filteredCommands.length;

      return reply.code(200).send({
        commands: paginatedCommands,
        total: filteredCommands.length,
        hasMore,
      });
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should return paginated list of commands with default limit', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body).toHaveProperty('commands');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('hasMore');
      expect(Array.isArray(body.commands)).toBe(true);
      expect(body.commands).toHaveLength(10); // Default limit
      expect(body.total).toBe(15);
      expect(body.hasMore).toBe(true);
    });

    it('should respect custom limit parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/commands?limit=5',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.commands).toHaveLength(5);
      expect(body.hasMore).toBe(true);
    });

    it('should respect offset parameter for pagination', async () => {
      // Get first page
      const response1 = await server.inject({
        method: 'GET',
        url: '/commands?limit=5&offset=0',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      // Get second page
      const response2 = await server.inject({
        method: 'GET',
        url: '/commands?limit=5&offset=5',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);

      const body1 = response1.json();
      const body2 = response2.json();

      // Commands should be different
      expect(body1.commands[0].id).not.toBe(body2.commands[0].id);
      expect(body1.commands).toHaveLength(5);
      expect(body2.commands).toHaveLength(5);
    });

    it('should filter commands by status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/commands?status=EXECUTING',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.commands).toBeDefined();
      body.commands.forEach((command: any) => {
        expect(command.status).toBe('EXECUTING');
      });
    });

    it('should filter commands by agentId', async () => {
      // Add some commands with specific agent ID
      const specificAgentId = uuidv4();
      mockCommands[0].targetAgents = [specificAgentId];
      mockCommands[2].targetAgents = [specificAgentId, uuidv4()];

      const response = await server.inject({
        method: 'GET',
        url: `/commands?agentId=${specificAgentId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.commands).toBeDefined();
      body.commands.forEach((command: any) => {
        expect(command.targetAgents).toContain(specificAgentId);
      });
    });

    it('should combine multiple filters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/commands?status=COMPLETED&limit=3',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.commands.length).toBeLessThanOrEqual(3);
      body.commands.forEach((command: any) => {
        expect(command.status).toBe('COMPLETED');
      });
    });

    it('should return empty list when no commands match filters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands?agentId=${uuidv4()}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.commands).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.hasMore).toBe(false);
    });

    it('should handle last page correctly', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/commands?limit=10&offset=10',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.commands).toHaveLength(5); // Only 5 remaining
      expect(body.hasMore).toBe(false);
    });
  });

  describe('Error Cases', () => {
    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/commands',
        // No authorization header
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'Unauthorized',
      });
    });

    it('should return 400 for invalid status parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/commands?status=INVALID_STATUS',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: `Invalid command status. Must be one of: ${commandFixtures.commandStatuses.join(', ')}`,
      });
    });

    it('should return 400 for invalid agentId format', async () => {
      const invalidIds = [
        'not-a-uuid',
        '123',
        'abc-def-ghi',
      ];

      for (const id of invalidIds) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands?agentId=${id}`,
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

    it('should return 400 for invalid limit values', async () => {
      const invalidLimits = ['0', '-1', '101', 'abc', 'null'];

      for (const limit of invalidLimits) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands?limit=${limit}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid limit. Must be between 1 and 100',
        });
      }
    });

    it('should return 400 for invalid offset values', async () => {
      const invalidOffsets = ['-1', 'abc', 'null'];

      for (const offset of invalidOffsets) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands?offset=${offset}`,
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
  });

  describe('Contract Compliance', () => {
    it('should match OpenAPI schema for success response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify response structure
      expect(body).toHaveProperty('commands');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('hasMore');
      expect(Array.isArray(body.commands)).toBe(true);
      expect(typeof body.total).toBe('number');
      expect(typeof body.hasMore).toBe('boolean');

      // Verify each command matches Command schema
      body.commands.forEach((command: any) => {
        expect(command).toHaveProperty('id');
        expect(typeof command.id).toBe('string');

        expect(command).toHaveProperty('userId');
        expect(typeof command.userId).toBe('string');

        expect(command).toHaveProperty('content');
        expect(typeof command.content).toBe('string');

        expect(command).toHaveProperty('type');
        expect(commandFixtures.commandTypes).toContain(command.type);

        expect(command).toHaveProperty('targetAgents');
        expect(Array.isArray(command.targetAgents)).toBe(true);

        expect(command).toHaveProperty('broadcast');
        expect(typeof command.broadcast).toBe('boolean');

        expect(command).toHaveProperty('status');
        expect(commandFixtures.commandStatuses).toContain(command.status);

        expect(command).toHaveProperty('priority');
        expect(typeof command.priority).toBe('number');

        // Optional nullable fields
        if (command.queuePosition !== null) {
          expect(typeof command.queuePosition).toBe('number');
        }
        if (command.startedAt !== null) {
          expect(typeof command.startedAt).toBe('string');
        }
        if (command.completedAt !== null) {
          expect(typeof command.completedAt).toBe('string');
        }
        if (command.failureReason !== null) {
          expect(typeof command.failureReason).toBe('string');
        }

        expect(command).toHaveProperty('metadata');
        expect(typeof command.metadata).toBe('object');

        expect(command).toHaveProperty('createdAt');
        expect(typeof command.createdAt).toBe('string');

        expect(command).toHaveProperty('updatedAt');
        expect(typeof command.updatedAt).toBe('string');
      });
    });

    it('should accept all valid status enum values', async () => {
      for (const status of commandFixtures.commandStatuses) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands?status=${status}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
      }
    });

    it('should support pagination parameters as defined in OpenAPI', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/commands?limit=20&offset=5',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.commands).toHaveLength(10); // 15 total - 5 offset = 10 remaining
      expect(body.total).toBe(15);
    });
  });

  describe('Security', () => {
    it('should not expose sensitive information in error messages', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/commands',
        headers: {
          authorization: 'Bearer completely-invalid-jwt',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();

      expect(body.error).not.toContain('jwt');
      expect(body.error).toBe('Unauthorized');
    });

    it('should handle SQL injection attempts in query parameters', async () => {
      const sqlInjectionAttempts = [
        "PENDING'; DROP TABLE commands; --",
        "PENDING' OR '1'='1",
      ];

      for (const injection of sqlInjectionAttempts) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands?status=${encodeURIComponent(injection)}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error).toContain('Invalid command status');
      }
    });

    it('should handle XSS attempts in query parameters', async () => {
      const xssAttempts = [
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
      ];

      for (const xss of xssAttempts) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands?status=${encodeURIComponent(xss)}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();

        // Ensure XSS is not reflected
        expect(JSON.stringify(body)).not.toContain('<script>');
        expect(JSON.stringify(body)).not.toContain('javascript:');
      }
    });
  });

  describe('Business Logic', () => {
    it('should sort commands by creation date descending', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify commands are sorted by createdAt descending
      for (let i = 1; i < body.commands.length; i++) {
        const prevDate = new Date(body.commands[i - 1].createdAt);
        const currDate = new Date(body.commands[i].createdAt);
        expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
      }
    });

    it('should include queue position for queued commands', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/commands?status=QUEUED',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.commands.forEach((command: any) => {
        expect(command.status).toBe('QUEUED');
        expect(command.queuePosition).not.toBeNull();
        expect(typeof command.queuePosition).toBe('number');
        expect(command.queuePosition).toBeGreaterThan(0);
      });
    });

    it('should include failure reason for failed commands', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/commands?status=FAILED',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.commands.forEach((command: any) => {
        expect(command.status).toBe('FAILED');
        expect(command.failureReason).not.toBeNull();
        expect(typeof command.failureReason).toBe('string');
      });
    });
  });
});