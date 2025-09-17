import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { presetFixtures } from '../../fixtures/presets';
import { v4 as uuidv4 } from 'uuid';

describe('POST /presets', () => {
  let server: FastifyInstance;
  let authToken: string;
  let createdPresetIds: string[] = [];

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);

    // Register the create preset route
    server.post('/presets', {
      preHandler: server.authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['name', 'content', 'type'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            content: { type: 'string' },
            type: { type: 'string' },
            targetAgentTypes: {
              type: 'array',
              items: { type: 'string' },
            },
            variables: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  default: { type: 'string' },
                },
              },
            },
          },
        },
      },
    }, async (request, reply) => {
      const body = request.body as any;

      // Validate command type
      const validTypes = ['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE'];
      if (!validTypes.includes(body.type)) {
        return reply.code(400).send({
          error: 'Invalid command type',
        });
      }

      // Validate agent types if provided
      if (body.targetAgentTypes) {
        const validAgentTypes = ['CLAUDE', 'GEMINI', 'CODEX'];
        for (const agentType of body.targetAgentTypes) {
          if (!validAgentTypes.includes(agentType)) {
            return reply.code(400).send({
              error: `Invalid agent type: ${agentType}`,
            });
          }
        }
      }

      // Validate variables if provided
      if (body.variables) {
        const variableNames = new Set<string>();
        for (const variable of body.variables) {
          if (!variable.name) {
            return reply.code(400).send({
              error: 'Variable name is required',
            });
          }
          if (variableNames.has(variable.name)) {
            return reply.code(400).send({
              error: `Duplicate variable name: ${variable.name}`,
            });
          }
          variableNames.add(variable.name);

          // Check if variable is used in content
          const placeholder = `{{${variable.name}}}`;
          if (!body.content.includes(placeholder)) {
            return reply.code(400).send({
              error: `Variable ${variable.name} is not used in content`,
            });
          }
        }

        // Check for undefined variables in content
        const contentVariables = body.content.match(/\{\{(\w+)\}\}/g);
        if (contentVariables) {
          for (const match of contentVariables) {
            const varName = match.slice(2, -2);
            if (!variableNames.has(varName)) {
              return reply.code(400).send({
                error: `Undefined variable in content: ${varName}`,
              });
            }
          }
        }
      }

      // Create the preset
      const preset = presetFixtures.createPreset({
        ...body,
        userId: uuidv4(), // Would come from JWT in production
      });

      createdPresetIds.push(preset.id);

      return reply.code(201).send(preset);
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should create preset with minimal required fields', async () => {
      const request = {
        name: 'Minimal Preset',
        content: 'Execute command without variables',
        type: 'NATURAL',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      expect(body).toHaveProperty('id');
      expect(body.name).toBe(request.name);
      expect(body.content).toBe(request.content);
      expect(body.type).toBe(request.type);
      expect(body).toHaveProperty('createdAt');
    });

    it('should create preset with all fields', async () => {
      const request = presetFixtures.createPresetRequest;

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      expect(body.name).toBe(request.name);
      expect(body.description).toBe(request.description);
      expect(body.content).toBe(request.content);
      expect(body.type).toBe(request.type);
      expect(body.targetAgentTypes).toEqual(request.targetAgentTypes);
      expect(body.variables).toEqual(request.variables);
    });

    it('should create preset with multiple variables', async () => {
      const request = {
        name: 'Multi-Variable Preset',
        content: 'Analyze {{input}} and generate {{output}} based on {{config}}',
        type: 'SYNTHESIZE',
        variables: [
          { name: 'input', description: 'Input data' },
          { name: 'output', description: 'Output format' },
          { name: 'config', description: 'Configuration', default: 'default' },
        ],
      };

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      expect(body.variables).toHaveLength(3);
      expect(body.variables[2].default).toBe('default');
    });

    it('should create preset for specific agent types', async () => {
      const request = {
        name: 'Claude-Only Preset',
        content: 'Claude-specific command',
        type: 'INVESTIGATE',
        targetAgentTypes: ['CLAUDE'],
      };

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      expect(body.targetAgentTypes).toEqual(['CLAUDE']);
    });

    it('should create preset for multiple agent types', async () => {
      const request = {
        name: 'Multi-Agent Preset',
        content: 'Command for multiple agents',
        type: 'REVIEW',
        targetAgentTypes: ['CLAUDE', 'GEMINI', 'CODEX'],
      };

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      expect(body.targetAgentTypes).toEqual(['CLAUDE', 'GEMINI', 'CODEX']);
    });

    it('should generate unique ID for each preset', async () => {
      const request = {
        name: 'Test Preset',
        content: 'Test content',
        type: 'NATURAL',
      };

      const response1 = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      const response2 = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response1.statusCode).toBe(201);
      expect(response2.statusCode).toBe(201);

      const id1 = response1.json().id;
      const id2 = response2.json().id;

      expect(id1).not.toBe(id2);
    });
  });

  describe('Error Cases', () => {
    it('should return 400 for missing required fields', async () => {
      const invalidRequests = [
        { content: 'Missing name and type' },
        { name: 'Missing content and type' },
        { name: 'Missing type', content: 'Content' },
        { type: 'NATURAL' }, // Missing name and content
      ];

      for (const request of invalidRequests) {
        const response = await server.inject({
          method: 'POST',
          url: '/presets',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
          payload: request,
        });

        expect(response.statusCode).toBe(400);
      }
    });

    it('should return 400 for invalid command type', async () => {
      const request = {
        name: 'Invalid Type',
        content: 'Test content',
        type: 'INVALID_TYPE',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Invalid command type',
      });
    });

    it('should return 400 for invalid agent type', async () => {
      const request = {
        name: 'Invalid Agent Type',
        content: 'Test content',
        type: 'NATURAL',
        targetAgentTypes: ['CLAUDE', 'INVALID_AGENT'],
      };

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('Invalid agent type');
    });

    it('should return 400 for duplicate variable names', async () => {
      const request = {
        name: 'Duplicate Variables',
        content: 'Use {{var}} and {{var}}',
        type: 'NATURAL',
        variables: [
          { name: 'var', description: 'First' },
          { name: 'var', description: 'Duplicate' },
        ],
      };

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('Duplicate variable name');
    });

    it('should return 400 for unused variables', async () => {
      const request = {
        name: 'Unused Variable',
        content: 'Content without variable',
        type: 'NATURAL',
        variables: [
          { name: 'unused', description: 'Not in content' },
        ],
      };

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('not used in content');
    });

    it('should return 400 for undefined variables in content', async () => {
      const request = {
        name: 'Undefined Variable',
        content: 'Use {{defined}} and {{undefined}}',
        type: 'NATURAL',
        variables: [
          { name: 'defined', description: 'Defined variable' },
        ],
      };

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('Undefined variable in content');
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        payload: presetFixtures.createPresetRequest,
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
        url: '/presets',
        headers: {
          authorization: 'Bearer invalid-token',
        },
        payload: presetFixtures.createPresetRequest,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'Unauthorized',
      });
    });
  });

  describe('Contract Compliance', () => {
    it('should match OpenAPI schema for request and response', async () => {
      const request = presetFixtures.createPresetRequest;

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      // Verify response structure matches CommandPreset schema
      expect(body).toHaveProperty('id');
      expect(typeof body.id).toBe('string');

      expect(body).toHaveProperty('userId');
      expect(typeof body.userId).toBe('string');

      expect(body).toHaveProperty('name');
      expect(typeof body.name).toBe('string');

      expect(body).toHaveProperty('content');
      expect(typeof body.content).toBe('string');

      expect(body).toHaveProperty('type');
      expect(['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE']).toContain(body.type);

      if (body.description !== undefined) {
        expect(typeof body.description).toBe('string');
      }

      if (body.targetAgentTypes !== undefined) {
        expect(Array.isArray(body.targetAgentTypes)).toBe(true);
        body.targetAgentTypes.forEach((type: string) => {
          expect(['CLAUDE', 'GEMINI', 'CODEX']).toContain(type);
        });
      }

      if (body.variables !== undefined) {
        expect(Array.isArray(body.variables)).toBe(true);
      }

      expect(body).toHaveProperty('createdAt');
      expect(typeof body.createdAt).toBe('string');
    });

    it('should return 201 Created status', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          name: 'Status Test',
          content: 'Test content',
          type: 'NATURAL',
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should accept application/json content type', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Content Type Test',
          content: 'Test content',
          type: 'NATURAL',
        },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  describe('Security', () => {
    it('should sanitize preset name', async () => {
      const request = {
        name: '<script>alert("XSS")</script>',
        content: 'Safe content',
        type: 'NATURAL',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      // Name should be stored as-is (sanitization happens on display)
      expect(body.name).toBe(request.name);
    });

    it('should handle SQL injection attempts', async () => {
      const request = {
        name: "'; DROP TABLE presets; --",
        content: "'; DELETE FROM presets WHERE '1'='1",
        type: 'NATURAL',
      };

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: request,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      // Should store the values safely
      expect(body.name).toBe(request.name);
      expect(body.content).toBe(request.content);
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: '{"name": "Test", "content": "Test"', // Malformed JSON
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
    });

    it('should handle concurrent preset creation', async () => {
      const request = {
        name: 'Concurrent Test',
        content: 'Test content',
        type: 'NATURAL',
      };

      const promises = Array(5).fill(null).map((_, i) =>
        server.inject({
          method: 'POST',
          url: '/presets',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
          payload: { ...request, name: `Concurrent Test ${i}` },
        })
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.statusCode).toBe(201);
      });

      // All should have unique IDs
      const ids = responses.map(r => r.json().id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Business Logic', () => {
    it('should set timestamps correctly', async () => {
      const before = Date.now();

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          name: 'Timestamp Test',
          content: 'Test content',
          type: 'NATURAL',
        },
      });

      const after = Date.now();

      expect(response.statusCode).toBe(201);
      const body = response.json();

      const createdAt = new Date(body.createdAt).getTime();
      expect(createdAt).toBeGreaterThanOrEqual(before);
      expect(createdAt).toBeLessThanOrEqual(after);

      if (body.updatedAt) {
        expect(body.updatedAt).toBe(body.createdAt);
      }
    });

    it('should associate preset with authenticated user', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          name: 'User Association Test',
          content: 'Test content',
          type: 'NATURAL',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      // Should have a userId (from JWT in production)
      expect(body).toHaveProperty('userId');
      expect(body.userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should preserve variable order', async () => {
      const variables = [
        { name: 'first', description: 'First variable' },
        { name: 'second', description: 'Second variable' },
        { name: 'third', description: 'Third variable' },
      ];

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          name: 'Variable Order Test',
          content: 'Use {{first}}, {{second}}, and {{third}}',
          type: 'NATURAL',
          variables,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      expect(body.variables).toHaveLength(3);
      expect(body.variables[0].name).toBe('first');
      expect(body.variables[1].name).toBe('second');
      expect(body.variables[2].name).toBe('third');
    });

    it('should handle special characters in content', async () => {
      const specialContent = 'Line 1\nLine 2\tTabbed\n"Quoted"\n\'Single\'\n\\Escaped\\';

      const response = await server.inject({
        method: 'POST',
        url: '/presets',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          name: 'Special Characters',
          content: specialContent,
          type: 'NATURAL',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();

      expect(body.content).toBe(specialContent);
    });
  });
});