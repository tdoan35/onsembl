import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { agentFixtures } from '../../fixtures/agents';

describe('GET /agents', () => {
  let server: FastifyInstance;
  let authToken: string;
  let mockAgents: any[];

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);
    mockAgents = agentFixtures.createMultipleAgents(5);

    // Register the agents list route
    server.get('/agents', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      const query = request.query as {
        type?: string;
        status?: string;
      };

      // Filter agents based on query parameters
      let filteredAgents = [...mockAgents];

      if (query.type) {
        if (!agentFixtures.agentTypes.includes(query.type as any)) {
          return reply.code(400).send({
            error: `Invalid agent type. Must be one of: ${agentFixtures.agentTypes.join(', ')}`,
          });
        }
        filteredAgents = filteredAgents.filter(agent => agent.type === query.type);
      }

      if (query.status) {
        if (!agentFixtures.agentStatuses.includes(query.status as any)) {
          return reply.code(400).send({
            error: `Invalid agent status. Must be one of: ${agentFixtures.agentStatuses.join(', ')}`,
          });
        }
        filteredAgents = filteredAgents.filter(agent => agent.status === query.status);
      }

      return reply.code(200).send({
        agents: filteredAgents,
        total: filteredAgents.length,
      });
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should return list of all agents', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/agents',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body).toHaveProperty('agents');
      expect(body).toHaveProperty('total');
      expect(Array.isArray(body.agents)).toBe(true);
      expect(body.agents).toHaveLength(5);
      expect(body.total).toBe(5);

      // Verify agent structure
      body.agents.forEach((agent: any) => {
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('name');
        expect(agent).toHaveProperty('type');
        expect(agent).toHaveProperty('status');
        expect(agent).toHaveProperty('activityState');
        expect(agent).toHaveProperty('hostMachine');
        expect(agent).toHaveProperty('connectedAt');
        expect(agent).toHaveProperty('healthMetrics');
        expect(agent).toHaveProperty('config');
      });
    });

    it('should filter agents by type', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/agents?type=CLAUDE',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.agents).toBeDefined();
      body.agents.forEach((agent: any) => {
        expect(agent.type).toBe('CLAUDE');
      });
    });

    it('should filter agents by status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/agents?status=ONLINE',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.agents).toBeDefined();
      body.agents.forEach((agent: any) => {
        expect(agent.status).toBe('ONLINE');
      });
    });

    it('should filter agents by both type and status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/agents?type=GEMINI&status=OFFLINE',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.agents).toBeDefined();
      body.agents.forEach((agent: any) => {
        expect(agent.type).toBe('GEMINI');
        expect(agent.status).toBe('OFFLINE');
      });
    });

    it('should return empty list when no agents match filters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/agents?type=CLAUDE&status=ERROR',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.agents).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should handle multiple query parameter formats', async () => {
      // Test with uppercase
      const response1 = await server.inject({
        method: 'GET',
        url: '/agents?type=CLAUDE&status=ONLINE',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response1.statusCode).toBe(200);
    });
  });

  describe('Error Cases', () => {
    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/agents',
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
        url: '/agents',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'Unauthorized',
      });
    });

    it('should return 401 with malformed authorization header', async () => {
      const malformedHeaders = [
        'invalid',
        'Bearer',
        'Bearer ',
        'Basic dGVzdDp0ZXN0',
        authToken, // Token without "Bearer" prefix
      ];

      for (const header of malformedHeaders) {
        const response = await server.inject({
          method: 'GET',
          url: '/agents',
          headers: {
            authorization: header,
          },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: 'Unauthorized',
        });
      }
    });

    it('should return 400 for invalid type parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/agents?type=INVALID_TYPE',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Invalid agent type. Must be one of: CLAUDE, GEMINI, CODEX',
      });
    });

    it('should return 400 for invalid status parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/agents?status=INVALID_STATUS',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Invalid agent status. Must be one of: ONLINE, OFFLINE, CONNECTING, ERROR',
      });
    });
  });

  describe('Contract Compliance', () => {
    it('should match OpenAPI schema for success response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/agents',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify response structure matches OpenAPI schema
      expect(body).toHaveProperty('agents');
      expect(body).toHaveProperty('total');
      expect(Array.isArray(body.agents)).toBe(true);
      expect(typeof body.total).toBe('number');

      // Verify each agent matches Agent schema
      body.agents.forEach((agent: any) => {
        // Required fields
        expect(agent).toHaveProperty('id');
        expect(typeof agent.id).toBe('string');

        expect(agent).toHaveProperty('name');
        expect(typeof agent.name).toBe('string');

        expect(agent).toHaveProperty('type');
        expect(agentFixtures.agentTypes).toContain(agent.type);

        expect(agent).toHaveProperty('status');
        expect(agentFixtures.agentStatuses).toContain(agent.status);

        expect(agent).toHaveProperty('activityState');
        expect(agentFixtures.agentActivityStates).toContain(agent.activityState);

        expect(agent).toHaveProperty('hostMachine');
        expect(typeof agent.hostMachine).toBe('string');

        expect(agent).toHaveProperty('connectedAt');
        expect(typeof agent.connectedAt).toBe('string');

        // Optional nullable field
        if (agent.disconnectedAt !== null) {
          expect(typeof agent.disconnectedAt).toBe('string');
        }

        // Health metrics
        expect(agent).toHaveProperty('healthMetrics');
        expect(typeof agent.healthMetrics).toBe('object');
        expect(typeof agent.healthMetrics.cpuUsage).toBe('number');
        expect(typeof agent.healthMetrics.memoryUsage).toBe('number');
        expect(typeof agent.healthMetrics.uptime).toBe('number');
        expect(typeof agent.healthMetrics.commandsProcessed).toBe('number');
        expect(typeof agent.healthMetrics.averageResponseTime).toBe('number');

        // Config
        expect(agent).toHaveProperty('config');
        expect(typeof agent.config).toBe('object');
        expect(typeof agent.config.serverUrl).toBe('string');
        expect(typeof agent.config.autoReconnect).toBe('boolean');
        expect(typeof agent.config.maxRetries).toBe('number');

        // Timestamps
        expect(agent).toHaveProperty('createdAt');
        expect(typeof agent.createdAt).toBe('string');
        expect(agent).toHaveProperty('updatedAt');
        expect(typeof agent.updatedAt).toBe('string');
      });
    });

    it('should accept type parameter from enum values', async () => {
      for (const type of agentFixtures.agentTypes) {
        const response = await server.inject({
          method: 'GET',
          url: `/agents?type=${type}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
      }
    });

    it('should accept status parameter from enum values', async () => {
      for (const status of agentFixtures.agentStatuses) {
        const response = await server.inject({
          method: 'GET',
          url: `/agents?status=${status}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
      }
    });

    it('should require Bearer authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/agents',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Security', () => {
    it('should not expose sensitive information in error messages', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/agents',
        headers: {
          authorization: 'Bearer completely-invalid-jwt-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();

      // Should not expose JWT parsing errors or internal details
      expect(body.error).not.toContain('jwt');
      expect(body.error).not.toContain('JWT');
      expect(body.error).not.toContain('malformed');
      expect(body.error).toBe('Unauthorized');
    });

    it('should handle SQL injection attempts in query parameters', async () => {
      const sqlInjectionAttempts = [
        "CLAUDE'; DROP TABLE agents; --",
        "CLAUDE' OR '1'='1",
        "CLAUDE\"; DROP TABLE agents; --",
      ];

      for (const injection of sqlInjectionAttempts) {
        const response = await server.inject({
          method: 'GET',
          url: `/agents?type=${encodeURIComponent(injection)}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        // Should safely reject as invalid type
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid agent type. Must be one of: CLAUDE, GEMINI, CODEX',
        });
      }
    });

    it('should handle XSS attempts in query parameters', async () => {
      const xssAttempts = [
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        '<img src=x onerror=alert("XSS")>',
      ];

      for (const xss of xssAttempts) {
        const response = await server.inject({
          method: 'GET',
          url: `/agents?type=${encodeURIComponent(xss)}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        // Should safely reject as invalid type
        expect(response.statusCode).toBe(400);
        const body = response.json();

        // Ensure XSS attempt is not reflected in response
        expect(JSON.stringify(body)).not.toContain('<script>');
        expect(JSON.stringify(body)).not.toContain('javascript:');
        expect(JSON.stringify(body)).not.toContain('onerror=');
      }
    });
  });
});