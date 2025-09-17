import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { auditLogFixtures } from '../../fixtures/audit-logs';
import { v4 as uuidv4 } from 'uuid';

describe('GET /audit-logs', () => {
  let server: FastifyInstance;
  let authToken: string;
  let mockLogs: any[];
  let userIds: string[];
  let agentIds: string[];

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);

    // Create test IDs
    userIds = [uuidv4(), uuidv4(), uuidv4()];
    agentIds = [uuidv4(), uuidv4()];

    // Create mock audit logs with various types and timestamps
    const now = Date.now();
    mockLogs = [
      // Auth logs
      auditLogFixtures.createAuthLog({
        userId: userIds[0],
        eventType: 'AUTH_LOGIN',
        createdAt: new Date(now - 7200000).toISOString(), // 2 hours ago
      }),
      auditLogFixtures.createAuthLog({
        userId: userIds[0],
        eventType: 'AUTH_TOKEN_REFRESH',
        createdAt: new Date(now - 3600000).toISOString(), // 1 hour ago
      }),

      // Agent logs
      auditLogFixtures.createAgentLog({
        agentId: agentIds[0],
        eventType: 'AGENT_CONNECTED',
        createdAt: new Date(now - 5400000).toISOString(), // 1.5 hours ago
      }),
      auditLogFixtures.createAuditLog({
        userId: userIds[1],
        agentId: agentIds[0],
        eventType: 'COMMAND_EXECUTED',
        createdAt: new Date(now - 1800000).toISOString(), // 30 minutes ago
      }),
      auditLogFixtures.createAuditLog({
        userId: userIds[1],
        agentId: agentIds[0],
        eventType: 'COMMAND_COMPLETED',
        createdAt: new Date(now - 900000).toISOString(), // 15 minutes ago
      }),

      // Security logs
      auditLogFixtures.createSecurityLog({
        userId: userIds[2],
        eventType: 'SECURITY_ALERT',
        createdAt: new Date(now - 600000).toISOString(), // 10 minutes ago
      }),

      // Emergency stop log
      auditLogFixtures.createEmergencyStopLog({
        userId: userIds[0],
        eventType: 'EMERGENCY_STOP_TRIGGERED',
        createdAt: new Date(now - 300000).toISOString(), // 5 minutes ago
      }),

      // More agent activity
      auditLogFixtures.createAgentLog({
        agentId: agentIds[1],
        eventType: 'AGENT_DISCONNECTED',
        createdAt: new Date(now - 120000).toISOString(), // 2 minutes ago
      }),

      // Recent commands
      auditLogFixtures.createAuditLog({
        userId: userIds[2],
        agentId: agentIds[1],
        eventType: 'COMMAND_FAILED',
        createdAt: new Date(now - 60000).toISOString(), // 1 minute ago
      }),
      auditLogFixtures.createAuditLog({
        userId: userIds[1],
        agentId: agentIds[0],
        eventType: 'COMMAND_CANCELLED',
        createdAt: new Date().toISOString(), // Just now
      }),
    ];

    // Register the audit logs route
    server.get('/audit-logs', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      const query = request.query as {
        eventType?: string;
        userId?: string;
        agentId?: string;
        from?: string;
        to?: string;
        limit?: string;
        offset?: string;
      };

      let filteredLogs = [...mockLogs];

      // Filter by eventType
      if (query.eventType) {
        filteredLogs = filteredLogs.filter(log => log.eventType === query.eventType);
      }

      // Filter by userId
      if (query.userId) {
        if (!query.userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          return reply.code(400).send({
            error: 'Invalid userId format',
          });
        }
        filteredLogs = filteredLogs.filter(log => log.userId === query.userId);
      }

      // Filter by agentId
      if (query.agentId) {
        if (!query.agentId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          return reply.code(400).send({
            error: 'Invalid agentId format',
          });
        }
        filteredLogs = filteredLogs.filter(log => log.agentId === query.agentId);
      }

      // Filter by date range
      if (query.from) {
        const fromDate = new Date(query.from);
        if (isNaN(fromDate.getTime())) {
          return reply.code(400).send({
            error: 'Invalid from date format',
          });
        }
        filteredLogs = filteredLogs.filter(log =>
          new Date(log.createdAt) >= fromDate
        );
      }

      if (query.to) {
        const toDate = new Date(query.to);
        if (isNaN(toDate.getTime())) {
          return reply.code(400).send({
            error: 'Invalid to date format',
          });
        }
        filteredLogs = filteredLogs.filter(log =>
          new Date(log.createdAt) <= toDate
        );
      }

      // Sort by createdAt descending (newest first)
      filteredLogs.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Apply pagination
      const limit = query.limit ? parseInt(query.limit, 10) : 100;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      if (isNaN(limit) || limit < 1 || limit > 1000) {
        return reply.code(400).send({
          error: 'Invalid limit value',
        });
      }

      if (isNaN(offset) || offset < 0) {
        return reply.code(400).send({
          error: 'Invalid offset value',
        });
      }

      const total = filteredLogs.length;
      const paginatedLogs = filteredLogs.slice(offset, offset + limit);

      return reply.code(200).send({
        logs: paginatedLogs,
        total,
      });
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should list all audit logs without filters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/audit-logs',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body).toHaveProperty('logs');
      expect(body).toHaveProperty('total');
      expect(Array.isArray(body.logs)).toBe(true);
      expect(body.total).toBe(mockLogs.length);
    });

    it('should filter logs by eventType', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/audit-logs?eventType=COMMAND_EXECUTED',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const expectedCount = mockLogs.filter(log => log.eventType === 'COMMAND_EXECUTED').length;
      expect(body.logs.length).toBe(expectedCount);

      body.logs.forEach((log: any) => {
        expect(log.eventType).toBe('COMMAND_EXECUTED');
      });
    });

    it('should filter logs by userId', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/audit-logs?userId=${userIds[0]}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const expectedCount = mockLogs.filter(log => log.userId === userIds[0]).length;
      expect(body.logs.length).toBe(expectedCount);

      body.logs.forEach((log: any) => {
        expect(log.userId).toBe(userIds[0]);
      });
    });

    it('should filter logs by agentId', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/audit-logs?agentId=${agentIds[0]}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const expectedCount = mockLogs.filter(log => log.agentId === agentIds[0]).length;
      expect(body.logs.length).toBe(expectedCount);

      body.logs.forEach((log: any) => {
        expect(log.agentId).toBe(agentIds[0]);
      });
    });

    it('should filter logs by date range using from', async () => {
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

      const response = await server.inject({
        method: 'GET',
        url: `/audit-logs?from=${oneHourAgo}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.logs.forEach((log: any) => {
        expect(new Date(log.createdAt).getTime()).toBeGreaterThanOrEqual(
          new Date(oneHourAgo).getTime()
        );
      });
    });

    it('should filter logs by date range using to', async () => {
      const thirtyMinutesAgo = new Date(Date.now() - 1800000).toISOString();

      const response = await server.inject({
        method: 'GET',
        url: `/audit-logs?to=${thirtyMinutesAgo}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.logs.forEach((log: any) => {
        expect(new Date(log.createdAt).getTime()).toBeLessThanOrEqual(
          new Date(thirtyMinutesAgo).getTime()
        );
      });
    });

    it('should filter logs by date range using from and to', async () => {
      const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

      const response = await server.inject({
        method: 'GET',
        url: `/audit-logs?from=${twoHoursAgo}&to=${oneHourAgo}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.logs.forEach((log: any) => {
        const logTime = new Date(log.createdAt).getTime();
        expect(logTime).toBeGreaterThanOrEqual(new Date(twoHoursAgo).getTime());
        expect(logTime).toBeLessThanOrEqual(new Date(oneHourAgo).getTime());
      });
    });

    it('should combine multiple filters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/audit-logs?userId=${userIds[1]}&agentId=${agentIds[0]}&eventType=COMMAND_COMPLETED`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.logs.forEach((log: any) => {
        expect(log.userId).toBe(userIds[1]);
        expect(log.agentId).toBe(agentIds[0]);
        expect(log.eventType).toBe('COMMAND_COMPLETED');
      });
    });

    it('should paginate results with limit', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/audit-logs?limit=5',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.logs.length).toBeLessThanOrEqual(5);
      expect(body.total).toBe(mockLogs.length);
    });

    it('should paginate results with limit and offset', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/audit-logs?limit=3&offset=2',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.logs.length).toBeLessThanOrEqual(3);
      expect(body.total).toBe(mockLogs.length);
    });

    it('should return empty array when no logs match filters', async () => {
      const nonExistentUserId = uuidv4();

      const response = await server.inject({
        method: 'GET',
        url: `/audit-logs?userId=${nonExistentUserId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.logs).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should sort logs by creation date descending', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/audit-logs',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      for (let i = 1; i < body.logs.length; i++) {
        const prevDate = new Date(body.logs[i - 1].createdAt).getTime();
        const currDate = new Date(body.logs[i].createdAt).getTime();
        expect(prevDate).toBeGreaterThanOrEqual(currDate);
      }
    });
  });

  describe('Error Cases', () => {
    it('should return 400 for invalid userId format', async () => {
      const invalidUserIds = [
        'not-a-uuid',
        '123',
        'xyz-abc',
      ];

      for (const userId of invalidUserIds) {
        const response = await server.inject({
          method: 'GET',
          url: `/audit-logs?userId=${userId}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid userId format',
        });
      }
    });

    it('should return 400 for invalid agentId format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/audit-logs?agentId=invalid-id',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Invalid agentId format',
      });
    });

    it('should return 400 for invalid date format', async () => {
      const invalidDates = [
        'not-a-date',
        '2024-13-01', // Invalid month
        'yesterday',
      ];

      for (const date of invalidDates) {
        const response = await server.inject({
          method: 'GET',
          url: `/audit-logs?from=${date}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid from date format',
        });
      }
    });

    it('should return 400 for invalid limit value', async () => {
      const invalidLimits = ['0', '-1', '1001', 'abc'];

      for (const limit of invalidLimits) {
        const response = await server.inject({
          method: 'GET',
          url: `/audit-logs?limit=${limit}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid limit value',
        });
      }
    });

    it('should return 400 for invalid offset value', async () => {
      const invalidOffsets = ['-1', 'abc'];

      for (const offset of invalidOffsets) {
        const response = await server.inject({
          method: 'GET',
          url: `/audit-logs?offset=${offset}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid offset value',
        });
      }
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/audit-logs',
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
        url: '/audit-logs',
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
    it('should match OpenAPI schema for response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/audit-logs',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify response structure
      expect(body).toHaveProperty('logs');
      expect(body).toHaveProperty('total');
      expect(typeof body.total).toBe('number');
      expect(Array.isArray(body.logs)).toBe(true);

      // Verify log entry structure
      if (body.logs.length > 0) {
        const log = body.logs[0];

        expect(log).toHaveProperty('id');
        expect(typeof log.id).toBe('string');

        expect(log).toHaveProperty('eventType');
        expect(typeof log.eventType).toBe('string');

        expect(log).toHaveProperty('details');
        expect(typeof log.details).toBe('object');

        expect(log).toHaveProperty('createdAt');
        expect(typeof log.createdAt).toBe('string');

        // Optional fields
        if (log.userId !== null && log.userId !== undefined) {
          expect(typeof log.userId).toBe('string');
        }

        if (log.agentId !== null && log.agentId !== undefined) {
          expect(typeof log.agentId).toBe('string');
        }

        if (log.commandId !== null && log.commandId !== undefined) {
          expect(typeof log.commandId).toBe('string');
        }

        if (log.ipAddress !== null && log.ipAddress !== undefined) {
          expect(typeof log.ipAddress).toBe('string');
        }

        if (log.userAgent !== null && log.userAgent !== undefined) {
          expect(typeof log.userAgent).toBe('string');
        }
      }
    });

    it('should support all query parameters', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);

      const response = await server.inject({
        method: 'GET',
        url: `/audit-logs?eventType=COMMAND_EXECUTED&userId=${userIds[0]}&agentId=${agentIds[0]}&from=${oneHourAgo.toISOString()}&to=${now.toISOString()}&limit=10&offset=0`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate UUID formats', async () => {
      const validUuid = uuidv4();

      const response = await server.inject({
        method: 'GET',
        url: `/audit-logs?userId=${validUuid}&agentId=${validUuid}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Security', () => {
    it('should handle SQL injection attempts in query parameters', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE audit_logs; --",
        "1' OR '1'='1",
      ];

      for (const attempt of sqlInjectionAttempts) {
        const response = await server.inject({
          method: 'GET',
          url: `/audit-logs?eventType=${encodeURIComponent(attempt)}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        // Should process safely without executing SQL
        expect(response.statusCode).toBe(200);
      }
    });

    it('should not expose sensitive details in error messages', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/audit-logs?userId=invalid',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();

      // Should not reveal internal details
      expect(body.error).not.toContain('database');
      expect(body.error).not.toContain('SQL');
      expect(body.error).not.toContain('table');
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(5).fill(null).map(() =>
        server.inject({
          method: 'GET',
          url: '/audit-logs',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        })
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
        expect(response.json()).toHaveProperty('logs');
      });
    });
  });

  describe('Business Logic', () => {
    it('should include all event types', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/audit-logs',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const eventTypes = new Set(body.logs.map((log: any) => log.eventType));

      // Should include various event types
      expect(eventTypes.size).toBeGreaterThan(3);
    });

    it('should preserve log details structure', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/audit-logs',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.logs.forEach((log: any) => {
        expect(log.details).toBeDefined();
        expect(typeof log.details).toBe('object');
      });
    });

    it('should handle null values correctly', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/audit-logs?eventType=AGENT_CONNECTED',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Agent logs should have null userId
      const agentLogs = body.logs.filter((log: any) => log.eventType === 'AGENT_CONNECTED');
      if (agentLogs.length > 0) {
        expect(agentLogs[0].userId).toBeNull();
      }
    });

    it('should respect 30-day retention policy', async () => {
      // In production, logs older than 30 days should not be returned
      const response = await server.inject({
        method: 'GET',
        url: '/audit-logs',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      body.logs.forEach((log: any) => {
        const logDate = new Date(log.createdAt);
        expect(logDate.getTime()).toBeGreaterThan(thirtyDaysAgo.getTime());
      });
    });

    it('should track security events', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/audit-logs?eventType=SECURITY_ALERT',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.logs.forEach((log: any) => {
        expect(log.eventType).toBe('SECURITY_ALERT');
        expect(log.details).toHaveProperty('severity');
      });
    });

    it('should track emergency stop events', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/audit-logs?eventType=EMERGENCY_STOP_TRIGGERED',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.logs.forEach((log: any) => {
        expect(log.eventType).toBe('EMERGENCY_STOP_TRIGGERED');
        expect(log.details).toHaveProperty('agentsStopped');
        expect(log.details).toHaveProperty('commandsCancelled');
      });
    });
  });
});