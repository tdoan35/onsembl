import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { commandFixtures } from '../../fixtures/commands';
import { traceFixtures } from '../../fixtures/traces';
import { v4 as uuidv4 } from 'uuid';

describe('GET /commands/{id}/traces', () => {
  let server: FastifyInstance;
  let authToken: string;
  let commandWithTraces: any;
  let commandWithoutTraces: any;
  let mockTraces: any[];
  let nonExistentId: string;
  let agentId: string;

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);
    agentId = uuidv4();

    // Create mock commands
    commandWithTraces = commandFixtures.createCommand({
      status: 'EXECUTING',
      startedAt: new Date().toISOString(),
    });
    commandWithoutTraces = commandFixtures.createCommand({
      status: 'PENDING',
    });
    nonExistentId = uuidv4();

    // Create mock trace tree
    mockTraces = traceFixtures.createTraceTree(commandWithTraces.id, agentId);

    // Register the get command traces route
    server.get('/commands/:commandId/traces', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      const { commandId } = request.params as { commandId: string };
      const query = request.query as {
        agentId?: string;
        type?: string;
      };

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(commandId)) {
        return reply.code(400).send({
          error: 'Invalid command ID format',
        });
      }

      // Validate agentId if provided
      if (query.agentId && !uuidRegex.test(query.agentId)) {
        return reply.code(400).send({
          error: 'Invalid agent ID format',
        });
      }

      // Validate trace type if provided
      if (query.type && !traceFixtures.traceTypes.includes(query.type as any)) {
        return reply.code(400).send({
          error: `Invalid trace type. Must be one of: ${traceFixtures.traceTypes.join(', ')}`,
        });
      }

      // Check if command exists
      if (commandId === commandWithoutTraces.id) {
        return reply.code(200).send({
          traces: [],
          total: 0,
          totalTokens: 0,
          totalDuration: 0,
        });
      }

      if (commandId !== commandWithTraces.id) {
        return reply.code(404).send({
          error: 'Command not found',
        });
      }

      // Filter traces
      let filteredTraces = [...mockTraces];

      if (query.agentId) {
        filteredTraces = filteredTraces.filter(t => t.agentId === query.agentId);
      }

      if (query.type) {
        filteredTraces = filteredTraces.filter(t => t.type === query.type);
      }

      // Calculate totals
      const totalTokens = filteredTraces.reduce((sum, trace) => {
        return sum + (trace.tokenUsage?.total || 0);
      }, 0);

      const totalDuration = filteredTraces.reduce((sum, trace) => {
        return sum + trace.duration;
      }, 0);

      return reply.code(200).send({
        traces: filteredTraces,
        total: filteredTraces.length,
        totalTokens,
        totalDuration,
      });
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should return trace tree for command', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithTraces.id}/traces`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body).toHaveProperty('traces');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('totalTokens');
      expect(body).toHaveProperty('totalDuration');
      expect(Array.isArray(body.traces)).toBe(true);
      expect(body.traces.length).toBeGreaterThan(0);
      expect(body.total).toBe(mockTraces.length);
    });

    it('should return empty array for command without traces', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithoutTraces.id}/traces`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.traces).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.totalTokens).toBe(0);
      expect(body.totalDuration).toBe(0);
    });

    it('should filter traces by agent ID', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithTraces.id}/traces?agentId=${agentId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.traces.length).toBeGreaterThan(0);
      body.traces.forEach((trace: any) => {
        expect(trace.agentId).toBe(agentId);
      });
    });

    it('should filter traces by type', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithTraces.id}/traces?type=LLM_PROMPT`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.traces.length).toBeGreaterThan(0);
      body.traces.forEach((trace: any) => {
        expect(trace.type).toBe('LLM_PROMPT');
      });
    });

    it('should combine filters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithTraces.id}/traces?agentId=${agentId}&type=TOOL_CALL`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.traces.forEach((trace: any) => {
        expect(trace.agentId).toBe(agentId);
        expect(trace.type).toBe('TOOL_CALL');
      });
    });

    it('should calculate total tokens correctly', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithTraces.id}/traces`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const expectedTokens = mockTraces.reduce((sum, trace) => {
        return sum + (trace.tokenUsage?.total || 0);
      }, 0);

      expect(body.totalTokens).toBe(expectedTokens);
    });

    it('should calculate total duration correctly', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithTraces.id}/traces`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const expectedDuration = mockTraces.reduce((sum, trace) => {
        return sum + trace.duration;
      }, 0);

      expect(body.totalDuration).toBe(expectedDuration);
    });

    it('should preserve parent-child relationships', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithTraces.id}/traces`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Find root traces (no parent)
      const rootTraces = body.traces.filter((t: any) => t.parentTraceId === null);
      expect(rootTraces.length).toBeGreaterThan(0);

      // Find child traces
      const childTraces = body.traces.filter((t: any) => t.parentTraceId !== null);
      expect(childTraces.length).toBeGreaterThan(0);

      // Verify parent exists for each child
      childTraces.forEach((child: any) => {
        const parent = body.traces.find((t: any) => t.id === child.parentTraceId);
        expect(parent).toBeDefined();
      });
    });
  });

  describe('Error Cases', () => {
    it('should return 404 for non-existent command', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${nonExistentId}/traces`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: 'Command not found',
      });
    });

    it('should return 400 for invalid command ID format', async () => {
      const invalidIds = [
        'not-a-uuid',
        '123',
        'abc-def-ghi',
      ];

      for (const id of invalidIds) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands/${id}/traces`,
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

    it('should return 400 for invalid agent ID format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithTraces.id}/traces?agentId=invalid`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Invalid agent ID format',
      });
    });

    it('should return 400 for invalid trace type', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithTraces.id}/traces?type=INVALID`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: `Invalid trace type. Must be one of: ${traceFixtures.traceTypes.join(', ')}`,
      });
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithTraces.id}/traces`,
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
        url: `/commands/${commandWithTraces.id}/traces`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify response structure
      expect(body).toHaveProperty('traces');
      expect(Array.isArray(body.traces)).toBe(true);
      expect(body).toHaveProperty('total');
      expect(typeof body.total).toBe('number');
      expect(body).toHaveProperty('totalTokens');
      expect(typeof body.totalTokens).toBe('number');
      expect(body).toHaveProperty('totalDuration');
      expect(typeof body.totalDuration).toBe('number');

      // Verify each trace matches TraceEntry schema
      body.traces.forEach((trace: any) => {
        expect(trace).toHaveProperty('id');
        expect(typeof trace.id).toBe('string');

        expect(trace).toHaveProperty('commandId');
        expect(typeof trace.commandId).toBe('string');

        expect(trace).toHaveProperty('agentId');
        expect(typeof trace.agentId).toBe('string');

        expect(trace).toHaveProperty('parentTraceId');
        if (trace.parentTraceId !== null) {
          expect(typeof trace.parentTraceId).toBe('string');
        }

        expect(trace).toHaveProperty('type');
        expect(traceFixtures.traceTypes).toContain(trace.type);

        expect(trace).toHaveProperty('name');
        expect(typeof trace.name).toBe('string');

        expect(trace).toHaveProperty('data');
        expect(typeof trace.data).toBe('object');

        expect(trace).toHaveProperty('startTime');
        expect(typeof trace.startTime).toBe('string');

        expect(trace).toHaveProperty('endTime');
        expect(typeof trace.endTime).toBe('string');

        expect(trace).toHaveProperty('duration');
        expect(typeof trace.duration).toBe('number');

        if (trace.tokenUsage !== null) {
          expect(typeof trace.tokenUsage).toBe('object');
          expect(trace.tokenUsage).toHaveProperty('input');
          expect(trace.tokenUsage).toHaveProperty('output');
          expect(trace.tokenUsage).toHaveProperty('total');
        }

        if (trace.error !== null) {
          expect(typeof trace.error).toBe('object');
        }

        expect(trace).toHaveProperty('metadata');
        expect(typeof trace.metadata).toBe('object');

        expect(trace).toHaveProperty('createdAt');
        expect(typeof trace.createdAt).toBe('string');
      });
    });

    it('should support all trace type enum values', async () => {
      for (const type of traceFixtures.traceTypes) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands/${commandWithTraces.id}/traces?type=${type}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe('Security', () => {
    it('should not expose internal errors', async () => {
      const maliciousPaths = [
        '/commands/%00/traces',
        '/commands/../etc/passwd/traces',
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
        "'; DROP TABLE trace_entries; --",
        "' OR '1'='1",
      ];

      for (const injection of sqlInjectionAttempts) {
        const response = await server.inject({
          method: 'GET',
          url: `/commands/${injection}/traces`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
      }
    });

    it('should not leak command existence to unauthorized users', async () => {
      const response1 = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithTraces.id}/traces`,
        // No authorization
      });

      const response2 = await server.inject({
        method: 'GET',
        url: `/commands/${nonExistentId}/traces`,
        // No authorization
      });

      expect(response1.statusCode).toBe(401);
      expect(response2.statusCode).toBe(401);
      expect(response1.json()).toEqual(response2.json());
    });
  });

  describe('Business Logic', () => {
    it('should handle error traces correctly', async () => {
      // Add an error trace
      const errorTrace = traceFixtures.createErrorTrace(commandWithTraces.id, agentId);
      mockTraces.push(errorTrace);

      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithTraces.id}/traces`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const foundErrorTrace = body.traces.find((t: any) => t.error !== null);
      expect(foundErrorTrace).toBeDefined();
      expect(foundErrorTrace.error).toHaveProperty('message');
      expect(foundErrorTrace.error).toHaveProperty('code');
    });

    it('should order traces by start time', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithTraces.id}/traces`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify traces are ordered by startTime
      for (let i = 1; i < body.traces.length; i++) {
        const prevTime = new Date(body.traces[i - 1].startTime).getTime();
        const currTime = new Date(body.traces[i].startTime).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });

    it('should handle nested trace hierarchy', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithTraces.id}/traces`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Build trace tree
      const traceMap = new Map();
      body.traces.forEach((trace: any) => {
        traceMap.set(trace.id, trace);
      });

      // Verify nested traces
      const nestedTraces = body.traces.filter((t: any) => {
        if (!t.parentTraceId) return false;
        const parent = traceMap.get(t.parentTraceId);
        return parent && parent.parentTraceId !== null;
      });

      expect(nestedTraces.length).toBeGreaterThan(0);
    });

    it('should aggregate token usage across multiple LLM calls', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandWithTraces.id}/traces?type=LLM_PROMPT`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const llmTraces = body.traces;
      const manualTotal = llmTraces.reduce((sum: number, trace: any) => {
        return sum + (trace.tokenUsage?.total || 0);
      }, 0);

      expect(body.totalTokens).toBe(manualTotal);
      expect(body.totalTokens).toBeGreaterThan(0);
    });
  });
});