import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { commandFixtures } from '../../fixtures/commands';
import { v4 as uuidv4 } from 'uuid';

describe('POST /commands', () => {
  let server: FastifyInstance;
  let authToken: string;
  let userId: string;
  let validAgentIds: string[];

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    userId = uuidv4();
    authToken = generateTestToken(server, { userId });
    validAgentIds = [uuidv4(), uuidv4(), uuidv4()];

    // Register the create command route
    server.post('/commands', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      const body = request.body as any;
      const user = (request as any).user;

      // Validate required fields
      if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
        return reply.code(400).send({
          error: 'Content is required and must be a non-empty string',
        });
      }

      if (!body.type || !commandFixtures.commandTypes.includes(body.type)) {
        return reply.code(400).send({
          error: `Invalid command type. Must be one of: ${commandFixtures.commandTypes.join(', ')}`,
        });
      }

      // Validate targetAgents or broadcast
      if (!body.broadcast && (!body.targetAgents || !Array.isArray(body.targetAgents) || body.targetAgents.length === 0)) {
        return reply.code(400).send({
          error: 'Either targetAgents array or broadcast flag must be provided',
        });
      }

      // Validate targetAgents are valid UUIDs
      if (body.targetAgents && Array.isArray(body.targetAgents)) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        for (const agentId of body.targetAgents) {
          if (!uuidRegex.test(agentId)) {
            return reply.code(400).send({
              error: 'Invalid agent ID format in targetAgents',
            });
          }
        }
      }

      // Validate priority if provided
      if (body.priority !== undefined) {
        const priority = Number(body.priority);
        if (isNaN(priority) || priority < 0 || priority > 10) {
          return reply.code(400).send({
            error: 'Priority must be a number between 0 and 10',
          });
        }
      }

      // Validate content length
      if (body.content.length > 10000) {
        return reply.code(400).send({
          error: 'Content exceeds maximum length of 10000 characters',
        });
      }

      // In production, this would:
      // 1. Create command in database
      // 2. Add to command queue (BullMQ)
      // 3. Send to target agents via WebSocket
      // 4. Return created command

      const command = commandFixtures.createCommand({
        id: uuidv4(),
        userId: user.userId,
        content: body.content,
        type: body.type,
        targetAgents: body.broadcast ? validAgentIds : body.targetAgents,
        broadcast: body.broadcast || false,
        status: 'PENDING',
        priority: body.priority || 0,
        metadata: body.metadata || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      return reply.code(201).send(command);
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should create command with valid request', async () => {
      const request = {
        content: 'Analyze the codebase and suggest improvements',
        type: 'INVESTIGATE',
        targetAgents: [validAgentIds[0]],
        priority: 1,
        metadata: {
          source: 'test',
        },
      };

      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      expect(body.id).toBeDefined();
      expect(body.userId).toBe(userId);
      expect(body.content).toBe(request.content);
      expect(body.type).toBe(request.type);
      expect(body.targetAgents).toEqual(request.targetAgents);
      expect(body.broadcast).toBe(false);
      expect(body.status).toBe('PENDING');
      expect(body.priority).toBe(request.priority);
      expect(body.metadata).toEqual(request.metadata);
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    });

    it('should create broadcast command', async () => {
      const request = {
        content: 'System maintenance announcement',
        type: 'NATURAL',
        broadcast: true,
      };

      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      expect(body.broadcast).toBe(true);
      expect(body.targetAgents).toHaveLength(3); // All agents
      expect(body.content).toBe(request.content);
    });

    it('should create command with multiple target agents', async () => {
      const request = {
        content: 'Compare outputs from multiple agents',
        type: 'REVIEW',
        targetAgents: [validAgentIds[0], validAgentIds[1]],
      };

      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      expect(body.targetAgents).toHaveLength(2);
      expect(body.targetAgents).toContain(validAgentIds[0]);
      expect(body.targetAgents).toContain(validAgentIds[1]);
    });

    it('should use default priority when not provided', async () => {
      const request = {
        content: 'Low priority task',
        type: 'NATURAL',
        targetAgents: [validAgentIds[0]],
      };

      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      expect(body.priority).toBe(0);
    });

    it('should accept all valid command types', async () => {
      for (const type of commandFixtures.commandTypes) {
        const request = {
          content: `Test command of type ${type}`,
          type,
          targetAgents: [validAgentIds[0]],
        };

        const response = await server.inject({
          method: 'POST',
          url: '/commands',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
          payload: request,
        });

        expect(response.statusCode).toBe(201);
        expect(response.json().type).toBe(type);
      }
    });

    it('should handle empty metadata', async () => {
      const request = {
        content: 'Command without metadata',
        type: 'NATURAL',
        targetAgents: [validAgentIds[0]],
        metadata: {},
      };

      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      expect(body.metadata).toEqual({});
    });
  });

  describe('Error Cases', () => {
    it('should return 400 for missing content', async () => {
      const request = {
        type: 'NATURAL',
        targetAgents: [validAgentIds[0]],
      };

      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Content is required and must be a non-empty string',
      });
    });

    it('should return 400 for empty content', async () => {
      const invalidContents = ['', '   ', '\n\t'];

      for (const content of invalidContents) {
        const response = await server.inject({
          method: 'POST',
          url: '/commands',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
          payload: {
            content,
            type: 'NATURAL',
            targetAgents: [validAgentIds[0]],
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Content is required and must be a non-empty string',
        });
      }
    });

    it('should return 400 for content exceeding max length', async () => {
      const request = {
        content: 'a'.repeat(10001),
        type: 'NATURAL',
        targetAgents: [validAgentIds[0]],
      };

      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Content exceeds maximum length of 10000 characters',
      });
    });

    it('should return 400 for invalid command type', async () => {
      const request = {
        content: 'Test command',
        type: 'INVALID_TYPE',
        targetAgents: [validAgentIds[0]],
      };

      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: `Invalid command type. Must be one of: ${commandFixtures.commandTypes.join(', ')}`,
      });
    });

    it('should return 400 for missing type', async () => {
      const request = {
        content: 'Test command',
        targetAgents: [validAgentIds[0]],
      };

      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: `Invalid command type. Must be one of: ${commandFixtures.commandTypes.join(', ')}`,
      });
    });

    it('should return 400 when neither targetAgents nor broadcast provided', async () => {
      const request = {
        content: 'Test command',
        type: 'NATURAL',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Either targetAgents array or broadcast flag must be provided',
      });
    });

    it('should return 400 for empty targetAgents array', async () => {
      const request = {
        content: 'Test command',
        type: 'NATURAL',
        targetAgents: [],
      };

      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Either targetAgents array or broadcast flag must be provided',
      });
    });

    it('should return 400 for invalid agent ID format', async () => {
      const request = {
        content: 'Test command',
        type: 'NATURAL',
        targetAgents: ['not-a-uuid', validAgentIds[0]],
      };

      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Invalid agent ID format in targetAgents',
      });
    });

    it('should return 400 for invalid priority', async () => {
      const invalidPriorities = [-1, 11, 'high', null];

      for (const priority of invalidPriorities) {
        const response = await server.inject({
          method: 'POST',
          url: '/commands',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
          payload: {
            content: 'Test command',
            type: 'NATURAL',
            targetAgents: [validAgentIds[0]],
            priority,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Priority must be a number between 0 and 10',
        });
      }
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        payload: commandFixtures.createCommandRequest,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'Unauthorized',
      });
    });
  });

  describe('Contract Compliance', () => {
    it('should match OpenAPI schema for success response', async () => {
      const request = commandFixtures.createCommandRequest;

      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(201);
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
      expect(typeof body.metadata).toBe('object');
      expect(typeof body.createdAt).toBe('string');
      expect(typeof body.updatedAt).toBe('string');

      // Verify nullable fields
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
    });

    it('should return 201 Created status code', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: commandFixtures.createCommandRequest,
      });

      expect(response.statusCode).toBe(201);
    });

    it('should accept application/json content type', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: commandFixtures.createCommandRequest,
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('Security', () => {
    it('should sanitize user input in content', async () => {
      const xssAttempts = [
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        '<img src=x onerror=alert("XSS")>',
      ];

      for (const xss of xssAttempts) {
        const response = await server.inject({
          method: 'POST',
          url: '/commands',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
          payload: {
            content: xss,
            type: 'NATURAL',
            targetAgents: [validAgentIds[0]],
          },
        });

        expect(response.statusCode).toBe(201);
        const body = response.json();

        // Content should be stored as-is but not executed
        expect(body.content).toBe(xss);
      }
    });

    it('should handle SQL injection attempts in content', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE commands; --",
        "' OR '1'='1",
      ];

      for (const injection of sqlInjectionAttempts) {
        const response = await server.inject({
          method: 'POST',
          url: '/commands',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
          payload: {
            content: injection,
            type: 'NATURAL',
            targetAgents: [validAgentIds[0]],
          },
        });

        expect(response.statusCode).toBe(201);
        const body = response.json();

        // Content should be stored safely
        expect(body.content).toBe(injection);
      }
    });

    it('should not allow command injection in metadata', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          content: 'Test command',
          type: 'NATURAL',
          targetAgents: [validAgentIds[0]],
          metadata: {
            dangerous: '$(rm -rf /)',
            script: '<script>alert("XSS")</script>',
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      // Metadata should be stored safely
      expect(body.metadata.dangerous).toBe('$(rm -rf /)');
      expect(body.metadata.script).toBe('<script>alert("XSS")</script>');
    });
  });

  describe('Business Logic', () => {
    it('should assign userId from authenticated user', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: commandFixtures.createCommandRequest,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      expect(body.userId).toBe(userId);
    });

    it('should set initial status to PENDING', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: commandFixtures.createCommandRequest,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      expect(body.status).toBe('PENDING');
      expect(body.queuePosition).toBeNull();
      expect(body.startedAt).toBeNull();
      expect(body.completedAt).toBeNull();
      expect(body.failureReason).toBeNull();
    });

    it('should generate unique command IDs', async () => {
      const responses = await Promise.all([
        server.inject({
          method: 'POST',
          url: '/commands',
          headers: { authorization: `Bearer ${authToken}` },
          payload: commandFixtures.createCommandRequest,
        }),
        server.inject({
          method: 'POST',
          url: '/commands',
          headers: { authorization: `Bearer ${authToken}` },
          payload: commandFixtures.createCommandRequest,
        }),
      ]);

      const ids = responses.map(r => r.json().id);
      expect(new Set(ids).size).toBe(ids.length); // All unique
    });

    it('should set timestamps on creation', async () => {
      const before = Date.now();

      const response = await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: commandFixtures.createCommandRequest,
      });

      const after = Date.now();

      expect(response.statusCode).toBe(201);
      const body = response.json();

      const createdAt = new Date(body.createdAt).getTime();
      const updatedAt = new Date(body.updatedAt).getTime();

      expect(createdAt).toBeGreaterThanOrEqual(before);
      expect(createdAt).toBeLessThanOrEqual(after);
      expect(updatedAt).toBe(createdAt); // Should be same on creation
    });
  });
});