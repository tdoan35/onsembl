/**
 * Investigation Report API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Services } from '../server';

// Request/Response schemas
const createReportSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  agentId: z.string().uuid(),
  commandId: z.string().uuid().optional(),
  reportType: z.enum(['INVESTIGATION', 'ANALYSIS', 'SUMMARY', 'DEBUG']),
  findings: z.array(z.object({
    type: z.enum(['ISSUE', 'IMPROVEMENT', 'OBSERVATION', 'RECOMMENDATION']),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    title: z.string().min(1),
    description: z.string(),
    evidence: z.array(z.string()).optional(),
    recommendation: z.string().optional()
  })).optional(),
  metadata: z.record(z.any()).optional()
});

const updateReportSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'IN_PROGRESS', 'COMPLETE']).optional(),
  findings: z.array(z.object({
    type: z.enum(['ISSUE', 'IMPROVEMENT', 'OBSERVATION', 'RECOMMENDATION']),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    title: z.string().min(1),
    description: z.string(),
    evidence: z.array(z.string()).optional(),
    recommendation: z.string().optional()
  })).optional(),
  metadata: z.record(z.any()).optional()
});

const reportIdParamsSchema = z.object({
  id: z.string().uuid()
});

const reportListQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
  commandId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'IN_PROGRESS', 'COMPLETE']).optional(),
  reportType: z.enum(['INVESTIGATION', 'ANALYSIS', 'SUMMARY', 'DEBUG']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'title']).default('created_at').optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional()
});

// Route handler types
type CreateReportRequest = FastifyRequest<{
  Body: z.infer<typeof createReportSchema>
}>;

type UpdateReportRequest = FastifyRequest<{
  Body: z.infer<typeof updateReportSchema>;
  Params: z.infer<typeof reportIdParamsSchema>
}>;

type ReportIdRequest = FastifyRequest<{
  Params: z.infer<typeof reportIdParamsSchema>
}>;

type ReportListRequest = FastifyRequest<{
  Querystring: z.infer<typeof reportListQuerySchema>
}>;

/**
 * Register report routes
 */
export async function registerReportRoutes(
  server: FastifyInstance,
  services: Services
) {
  const { auditService } = services;

  // Note: reportService would need to be added to Services interface
  // For now, we'll assume it exists on the services object
  const reportService = (services as any).reportService;

  // List all reports
  server.get('/api/reports', {
    schema: {
      querystring: zodToJsonSchema(reportListQuerySchema),
      response: {
        200: {
          type: 'object',
          properties: {
            reports: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  title: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  agentId: { type: 'string', format: 'uuid' },
                  commandId: { type: 'string', format: 'uuid', nullable: true },
                  reportType: { type: 'string', enum: ['INVESTIGATION', 'ANALYSIS', 'SUMMARY', 'DEBUG'] },
                  status: { type: 'string', enum: ['DRAFT', 'IN_PROGRESS', 'COMPLETE'] },
                  findings: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: ['ISSUE', 'IMPROVEMENT', 'OBSERVATION', 'RECOMMENDATION'] },
                        severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        evidence: { type: 'array', items: { type: 'string' }, nullable: true },
                        recommendation: { type: 'string', nullable: true }
                      }
                    },
                    nullable: true
                  },
                  metadata: { type: 'object', nullable: true },
                  createdBy: { type: 'string', format: 'uuid' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' }
                }
              }
            },
            total: { type: 'number' },
            limit: { type: 'number' },
            offset: { type: 'number' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['reports'],
      summary: 'List investigation reports',
      description: 'Retrieve a paginated list of investigation reports with optional filtering'
    },
    preHandler: server.authenticate
  }, async (request: ReportListRequest, reply: FastifyReply) => {
    try {
      const { agentId, commandId, status, reportType, search, limit = 50, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = request.query;
      const user = request.user as any;

      const result = await reportService.listReports({
        agentId,
        commandId,
        status,
        reportType,
        search,
        userId: user.id,
        limit,
        offset,
        sortBy,
        sortOrder
      });

      // Log audit event
      await auditService.log({
        action: 'REPORTS_LISTED',
        actor_id: user.id,
        actor_type: 'USER',
        metadata: {
          filters: { agentId, commandId, status, reportType, search },
          pagination: { limit, offset },
          sorting: { sortBy, sortOrder }
        }
      });

      return reply.code(200).send({
        reports: result.reports,
        total: result.total,
        limit,
        offset
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to list reports');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to list reports'
      });
    }
  });

  // Get report details
  server.get('/api/reports/:id', {
    schema: {
      params: zodToJsonSchema(reportIdParamsSchema),
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            agentId: { type: 'string', format: 'uuid' },
            commandId: { type: 'string', format: 'uuid', nullable: true },
            reportType: { type: 'string', enum: ['INVESTIGATION', 'ANALYSIS', 'SUMMARY', 'DEBUG'] },
            status: { type: 'string', enum: ['DRAFT', 'IN_PROGRESS', 'COMPLETE'] },
            findings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['ISSUE', 'IMPROVEMENT', 'OBSERVATION', 'RECOMMENDATION'] },
                  severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  evidence: { type: 'array', items: { type: 'string' }, nullable: true },
                  recommendation: { type: 'string', nullable: true }
                }
              },
              nullable: true
            },
            metadata: { type: 'object', nullable: true },
            createdBy: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['reports'],
      summary: 'Get report details',
      description: 'Retrieve detailed information about a specific investigation report'
    },
    preHandler: server.authenticate
  }, async (request: ReportIdRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const user = request.user as any;

      const report = await reportService.getReport(id, user.id);

      if (!report) {
        return reply.code(404).send({
          error: 'Report not found'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'REPORT_RETRIEVED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: id,
        resource_type: 'REPORT',
        metadata: {}
      });

      return reply.code(200).send(report);
    } catch (error) {
      request.log.error({ error }, 'Failed to get report');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to get report'
      });
    }
  });

  // Create new report
  server.post('/api/reports', {
    schema: {
      body: zodToJsonSchema(createReportSchema),
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            agentId: { type: 'string', format: 'uuid' },
            commandId: { type: 'string', format: 'uuid', nullable: true },
            reportType: { type: 'string', enum: ['INVESTIGATION', 'ANALYSIS', 'SUMMARY', 'DEBUG'] },
            status: { type: 'string', enum: ['DRAFT', 'IN_PROGRESS', 'COMPLETE'] },
            findings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['ISSUE', 'IMPROVEMENT', 'OBSERVATION', 'RECOMMENDATION'] },
                  severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  evidence: { type: 'array', items: { type: 'string' }, nullable: true },
                  recommendation: { type: 'string', nullable: true }
                }
              },
              nullable: true
            },
            metadata: { type: 'object', nullable: true },
            createdBy: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['reports'],
      summary: 'Create new report',
      description: 'Create a new investigation report'
    },
    preHandler: server.authenticate
  }, async (request: CreateReportRequest, reply: FastifyReply) => {
    try {
      const reportData = request.body;
      const user = request.user as any;

      const report = await reportService.createReport({
        ...reportData,
        createdBy: user.id,
        status: 'DRAFT'
      }, user.id);

      // Log audit event
      await auditService.log({
        action: 'REPORT_CREATED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: report.id,
        resource_type: 'REPORT',
        metadata: { title: report.title, reportType: report.reportType, agentId: report.agentId }
      });

      return reply.code(201).send(report);
    } catch (error) {
      request.log.error({ error }, 'Failed to create report');
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to create report'
      });
    }
  });

  // Update report
  server.put('/api/reports/:id', {
    schema: {
      params: zodToJsonSchema(reportIdParamsSchema),
      body: zodToJsonSchema(updateReportSchema),
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            agentId: { type: 'string', format: 'uuid' },
            commandId: { type: 'string', format: 'uuid', nullable: true },
            reportType: { type: 'string', enum: ['INVESTIGATION', 'ANALYSIS', 'SUMMARY', 'DEBUG'] },
            status: { type: 'string', enum: ['DRAFT', 'IN_PROGRESS', 'COMPLETE'] },
            findings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['ISSUE', 'IMPROVEMENT', 'OBSERVATION', 'RECOMMENDATION'] },
                  severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  evidence: { type: 'array', items: { type: 'string' }, nullable: true },
                  recommendation: { type: 'string', nullable: true }
                }
              },
              nullable: true
            },
            metadata: { type: 'object', nullable: true },
            createdBy: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['reports'],
      summary: 'Update report',
      description: 'Update an existing investigation report'
    },
    preHandler: server.authenticate
  }, async (request: UpdateReportRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const updateData = request.body;
      const user = request.user as any;

      const report = await reportService.updateReport(id, updateData, user.id);

      if (!report) {
        return reply.code(404).send({
          error: 'Report not found'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'REPORT_UPDATED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: id,
        resource_type: 'REPORT',
        metadata: { updates: updateData }
      });

      return reply.code(200).send(report);
    } catch (error) {
      request.log.error({ error }, 'Failed to update report');

      // Check if it's a permission error
      if (error instanceof Error && error.message.includes('permission')) {
        return reply.code(403).send({
          error: 'You do not have permission to update this report'
        });
      }

      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to update report'
      });
    }
  });

  // Delete report
  server.delete('/api/reports/:id', {
    schema: {
      params: zodToJsonSchema(reportIdParamsSchema),
      response: {
        204: {
          type: 'null'
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['reports'],
      summary: 'Delete report',
      description: 'Remove an investigation report from the system'
    },
    preHandler: server.authenticate
  }, async (request: ReportIdRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const user = request.user as any;

      const deleted = await reportService.deleteReport(id, user.id);

      if (!deleted) {
        return reply.code(404).send({
          error: 'Report not found'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'REPORT_DELETED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: id,
        resource_type: 'REPORT',
        metadata: {}
      });

      return reply.code(204).send();
    } catch (error) {
      request.log.error({ error }, 'Failed to delete report');

      // Check if it's a permission error
      if (error instanceof Error && error.message.includes('permission')) {
        return reply.code(403).send({
          error: 'You do not have permission to delete this report'
        });
      }

      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to delete report'
      });
    }
  });

  // Export report (additional endpoint for report generation)
  server.get('/api/reports/:id/export', {
    schema: {
      params: zodToJsonSchema(reportIdParamsSchema),
      querystring: zodToJsonSchema(z.object({
        format: z.enum(['json', 'pdf', 'markdown']).default('json').optional()
      })),
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'string' },
            format: { type: 'string' },
            filename: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['reports'],
      summary: 'Export report',
      description: 'Export investigation report in various formats'
    },
    preHandler: server.authenticate
  }, async (request: FastifyRequest<{
    Params: z.infer<typeof reportIdParamsSchema>;
    Querystring: { format?: 'json' | 'pdf' | 'markdown' }
  }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { format = 'json' } = request.query;
      const user = request.user as any;

      const exportData = await reportService.exportReport(id, format, user.id);

      if (!exportData) {
        return reply.code(404).send({
          error: 'Report not found'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'REPORT_EXPORTED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: id,
        resource_type: 'REPORT',
        metadata: { format }
      });

      return reply.code(200).send(exportData);
    } catch (error) {
      request.log.error({ error }, 'Failed to export report');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to export report'
      });
    }
  });
}