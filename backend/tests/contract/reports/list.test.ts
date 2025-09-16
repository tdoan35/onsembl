import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, generateTestToken } from '../../utils/test-server';
import { reportFixtures } from '../../fixtures/reports';
import { v4 as uuidv4 } from 'uuid';

describe('GET /reports', () => {
  let server: FastifyInstance;
  let authToken: string;
  let mockReports: any[];
  let agentIds: string[];

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);

    // Create some agent IDs for testing
    agentIds = [uuidv4(), uuidv4(), uuidv4()];

    // Create mock reports with different statuses and agents
    mockReports = [
      reportFixtures.createReport({
        agentId: agentIds[0],
        status: 'COMPLETE',
        createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      }),
      reportFixtures.createInProgressReport({
        agentId: agentIds[0],
        status: 'IN_PROGRESS',
        createdAt: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
      }),
      reportFixtures.createDraftReport({
        agentId: agentIds[1],
        status: 'DRAFT',
        createdAt: new Date(Date.now() - 900000).toISOString(), // 15 minutes ago
      }),
      reportFixtures.createReport({
        agentId: agentIds[1],
        status: 'COMPLETE',
        title: 'Security Audit Report',
        createdAt: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
      }),
      reportFixtures.createInProgressReport({
        agentId: agentIds[2],
        status: 'IN_PROGRESS',
        title: 'Performance Analysis',
        createdAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
      }),
      reportFixtures.createReport({
        agentId: agentIds[2],
        status: 'COMPLETE',
        title: 'Code Quality Assessment',
        createdAt: new Date().toISOString(), // Just now
      }),
    ];

    // Register the list reports route
    server.get('/reports', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      const query = request.query as {
        agentId?: string;
        status?: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETE';
      };

      let filteredReports = [...mockReports];

      // Filter by agentId if provided
      if (query.agentId) {
        if (!query.agentId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          return reply.code(400).send({
            error: 'Invalid agentId format',
          });
        }
        filteredReports = filteredReports.filter(r => r.agentId === query.agentId);
      }

      // Filter by status if provided
      if (query.status) {
        const validStatuses = ['DRAFT', 'IN_PROGRESS', 'COMPLETE'];
        if (!validStatuses.includes(query.status)) {
          return reply.code(400).send({
            error: 'Invalid status value',
          });
        }
        filteredReports = filteredReports.filter(r => r.status === query.status);
      }

      // Sort by createdAt descending (newest first)
      filteredReports.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return reply.code(200).send({
        reports: filteredReports,
      });
    });

    await server.ready();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('Success Cases', () => {
    it('should list all reports without filters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/reports',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body).toHaveProperty('reports');
      expect(Array.isArray(body.reports)).toBe(true);
      expect(body.reports.length).toBe(mockReports.length);
    });

    it('should filter reports by agentId', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/reports?agentId=${agentIds[0]}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const expectedCount = mockReports.filter(r => r.agentId === agentIds[0]).length;
      expect(body.reports.length).toBe(expectedCount);

      body.reports.forEach((report: any) => {
        expect(report.agentId).toBe(agentIds[0]);
      });
    });

    it('should filter reports by status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/reports?status=COMPLETE',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const expectedCount = mockReports.filter(r => r.status === 'COMPLETE').length;
      expect(body.reports.length).toBe(expectedCount);

      body.reports.forEach((report: any) => {
        expect(report.status).toBe('COMPLETE');
      });
    });

    it('should filter by both agentId and status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/reports?agentId=${agentIds[0]}&status=IN_PROGRESS`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const expectedCount = mockReports.filter(r =>
        r.agentId === agentIds[0] && r.status === 'IN_PROGRESS'
      ).length;
      expect(body.reports.length).toBe(expectedCount);

      body.reports.forEach((report: any) => {
        expect(report.agentId).toBe(agentIds[0]);
        expect(report.status).toBe('IN_PROGRESS');
      });
    });

    it('should return empty array when no reports match filters', async () => {
      const nonExistentAgentId = uuidv4();

      const response = await server.inject({
        method: 'GET',
        url: `/reports?agentId=${nonExistentAgentId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.reports).toEqual([]);
    });

    it('should sort reports by creation date descending', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/reports',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      for (let i = 1; i < body.reports.length; i++) {
        const prevDate = new Date(body.reports[i - 1].createdAt);
        const currDate = new Date(body.reports[i].createdAt);
        expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
      }
    });

    it('should handle all report statuses', async () => {
      const statuses = ['DRAFT', 'IN_PROGRESS', 'COMPLETE'];

      for (const status of statuses) {
        const response = await server.inject({
          method: 'GET',
          url: `/reports?status=${status}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        body.reports.forEach((report: any) => {
          expect(report.status).toBe(status);
        });
      }
    });
  });

  describe('Error Cases', () => {
    it('should return 400 for invalid agentId format', async () => {
      const invalidAgentIds = [
        'not-a-uuid',
        '123',
        'xyz-abc-def',
        '12345678-1234-1234-1234-12345678901g', // Invalid character
      ];

      for (const agentId of invalidAgentIds) {
        const response = await server.inject({
          method: 'GET',
          url: `/reports?agentId=${agentId}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid agentId format',
        });
      }
    });

    it('should return 400 for invalid status value', async () => {
      const invalidStatuses = [
        'PENDING',
        'INVALID',
        'complete', // Wrong case
        'IN-PROGRESS', // Wrong format
      ];

      for (const status of invalidStatuses) {
        const response = await server.inject({
          method: 'GET',
          url: `/reports?status=${status}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: 'Invalid status value',
        });
      }
    });

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/reports',
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
        url: '/reports',
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
        url: '/reports',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // Verify response structure
      expect(body).toHaveProperty('reports');
      expect(Array.isArray(body.reports)).toBe(true);

      // Verify report structure
      if (body.reports.length > 0) {
        const report = body.reports[0];

        // Required fields
        expect(report).toHaveProperty('id');
        expect(typeof report.id).toBe('string');

        expect(report).toHaveProperty('commandId');
        expect(typeof report.commandId).toBe('string');

        expect(report).toHaveProperty('agentId');
        expect(typeof report.agentId).toBe('string');

        expect(report).toHaveProperty('title');
        expect(typeof report.title).toBe('string');

        expect(report).toHaveProperty('summary');
        expect(typeof report.summary).toBe('string');

        expect(report).toHaveProperty('status');
        expect(['DRAFT', 'IN_PROGRESS', 'COMPLETE']).toContain(report.status);

        expect(report).toHaveProperty('content');
        expect(typeof report.content).toBe('object');

        // Content structure
        expect(report.content).toHaveProperty('sections');
        expect(Array.isArray(report.content.sections)).toBe(true);

        if (report.content.sections.length > 0) {
          const section = report.content.sections[0];
          expect(section).toHaveProperty('title');
          expect(section).toHaveProperty('content');
          expect(section).toHaveProperty('type');
          expect(section).toHaveProperty('order');
        }

        expect(report.content).toHaveProperty('findings');
        expect(Array.isArray(report.content.findings)).toBe(true);

        if (report.content.findings.length > 0) {
          const finding = report.content.findings[0];
          expect(finding).toHaveProperty('description');
        }

        expect(report).toHaveProperty('createdAt');
        expect(typeof report.createdAt).toBe('string');
      }
    });

    it('should support query parameters as specified', async () => {
      // Test agentId parameter
      const agentResponse = await server.inject({
        method: 'GET',
        url: `/reports?agentId=${agentIds[0]}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(agentResponse.statusCode).toBe(200);

      // Test status parameter
      const statusResponse = await server.inject({
        method: 'GET',
        url: '/reports?status=DRAFT',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(statusResponse.statusCode).toBe(200);

      // Test combined parameters
      const combinedResponse = await server.inject({
        method: 'GET',
        url: `/reports?agentId=${agentIds[0]}&status=COMPLETE`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(combinedResponse.statusCode).toBe(200);
    });

    it('should return valid UUIDs for all ID fields', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/reports',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      body.reports.forEach((report: any) => {
        expect(report.id).toMatch(uuidRegex);
        expect(report.commandId).toMatch(uuidRegex);
        expect(report.agentId).toMatch(uuidRegex);
      });
    });
  });

  describe('Security', () => {
    it('should handle SQL injection attempts in query parameters', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE reports; --",
        "1' OR '1'='1",
        "1; DELETE FROM reports WHERE '1'='1",
      ];

      for (const attempt of sqlInjectionAttempts) {
        const response = await server.inject({
          method: 'GET',
          url: `/reports?agentId=${encodeURIComponent(attempt)}`,
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        });

        // Should return 400 for invalid UUID format, not execute SQL
        expect(response.statusCode).toBe(400);
        expect(response.json().error).toBe('Invalid agentId format');
      }
    });

    it('should not expose sensitive internal fields', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/reports',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.reports.forEach((report: any) => {
        // Should not include internal fields
        expect(report).not.toHaveProperty('_internalId');
        expect(report).not.toHaveProperty('deletedAt');
        expect(report).not.toHaveProperty('userId');
        expect(report).not.toHaveProperty('encryptedContent');
      });
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(5).fill(null).map(() =>
        server.inject({
          method: 'GET',
          url: '/reports',
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        })
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
        expect(response.json()).toHaveProperty('reports');
      });
    });
  });

  describe('Business Logic', () => {
    it('should include complete report content', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/reports?status=COMPLETE',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const completeReports = body.reports.filter((r: any) => r.status === 'COMPLETE');
      expect(completeReports.length).toBeGreaterThan(0);

      completeReports.forEach((report: any) => {
        // Complete reports should have sections and findings
        expect(report.content.sections.length).toBeGreaterThan(0);
        expect(report).toHaveProperty('completedAt');
      });
    });

    it('should include partial content for draft reports', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/reports?status=DRAFT',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const draftReports = body.reports.filter((r: any) => r.status === 'DRAFT');

      if (draftReports.length > 0) {
        draftReports.forEach((report: any) => {
          // Draft reports may have incomplete content
          expect(report.completedAt).toBeNull();
        });
      }
    });

    it('should maintain section order', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/reports',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.reports.forEach((report: any) => {
        if (report.content.sections.length > 1) {
          for (let i = 1; i < report.content.sections.length; i++) {
            const prevOrder = report.content.sections[i - 1].order;
            const currOrder = report.content.sections[i].order;
            expect(currOrder).toBeGreaterThan(prevOrder);
          }
        }
      });
    });

    it('should validate timestamps', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/reports',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.reports.forEach((report: any) => {
        // Validate createdAt
        expect(new Date(report.createdAt).toISOString()).toBe(report.createdAt);

        // Validate updatedAt
        if (report.updatedAt) {
          expect(new Date(report.updatedAt).toISOString()).toBe(report.updatedAt);

          // updatedAt should be >= createdAt
          const created = new Date(report.createdAt).getTime();
          const updated = new Date(report.updatedAt).getTime();
          expect(updated).toBeGreaterThanOrEqual(created);
        }

        // Validate completedAt for complete reports
        if (report.status === 'COMPLETE' && report.completedAt) {
          expect(new Date(report.completedAt).toISOString()).toBe(report.completedAt);
        }
      });
    });
  });
});