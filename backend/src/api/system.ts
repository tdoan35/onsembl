/**
 * System API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Services } from '../server';

// Request/Response schemas
const emergencyStopSchema = z.object({
  reason: z.string().optional(),
  force: z.boolean().default(false).optional()
});

const auditLogQuerySchema = z.object({
  action: z.string().optional(),
  actor_type: z.enum(['USER', 'AGENT', 'SYSTEM']).optional(),
  resource_type: z.enum(['AGENT', 'COMMAND', 'PRESET', 'REPORT', 'CONSTRAINT']).optional(),
  resource_id: z.string().uuid().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional()
});

// Route handler types
type EmergencyStopRequest = FastifyRequest<{
  Body: z.infer<typeof emergencyStopSchema>
}>;

type AuditLogRequest = FastifyRequest<{
  Querystring: z.infer<typeof auditLogQuerySchema>
}>;

/**
 * Register system routes
 */
export async function registerSystemRoutes(
  server: FastifyInstance,
  services: Services
) {
  const { agentService, commandService, auditService } = services;

  // Emergency stop all agents
  server.post('/api/system/emergency-stop', {
    schema: {
      body: zodToJsonSchema(emergencyStopSchema),
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            agentsStopped: { type: 'number' },
            commandsCancelled: { type: 'number' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['system'],
      summary: 'Emergency stop all agents',
      description: 'Immediately stop all running agents and cancel pending commands'
    },
    preHandler: server.authenticate
  }, async (request: EmergencyStopRequest, reply: FastifyReply) => {
    try {
      const { reason, force = false } = request.body;
      const user = request.user as any;

      server.log.warn({ userId: user.id, reason, force }, 'Emergency stop initiated');

      // Stop all agents
      const agentsResult = await agentService.emergencyStopAll(user.id, force);

      // Cancel all pending/running commands
      const commandsResult = await commandService.cancelAllCommands(user.id, 'EMERGENCY_STOP');

      const timestamp = new Date().toISOString();

      // Log critical audit event
      await auditService.log({
        action: 'EMERGENCY_STOP_EXECUTED',
        actor_id: user.id,
        actor_type: 'USER',
        metadata: {
          reason: reason || 'No reason provided',
          force,
          agentsStopped: agentsResult.stopped,
          commandsCancelled: commandsResult.cancelled,
          timestamp
        }
      });

      return reply.code(200).send({
        success: true,
        message: 'Emergency stop executed successfully',
        agentsStopped: agentsResult.stopped,
        commandsCancelled: commandsResult.cancelled,
        timestamp
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to execute emergency stop');

      // Still log the attempt even if it failed
      const user = request.user as any;
      await auditService.log({
        action: 'EMERGENCY_STOP_FAILED',
        actor_id: user.id,
        actor_type: 'USER',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }
      });

      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to execute emergency stop'
      });
    }
  });

  // Get audit logs
  server.get('/api/system/audit-logs', {
    schema: {
      querystring: zodToJsonSchema(auditLogQuerySchema),
      response: {
        200: {
          type: 'object',
          properties: {
            logs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  action: { type: 'string' },
                  actor_id: { type: 'string', format: 'uuid' },
                  actor_type: { type: 'string', enum: ['USER', 'AGENT', 'SYSTEM'] },
                  resource_id: { type: 'string', format: 'uuid', nullable: true },
                  resource_type: { type: 'string', enum: ['AGENT', 'COMMAND', 'PRESET', 'REPORT', 'CONSTRAINT'], nullable: true },
                  metadata: { type: 'object', nullable: true },
                  timestamp: { type: 'string', format: 'date-time' },
                  ip_address: { type: 'string', nullable: true },
                  user_agent: { type: 'string', nullable: true }
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
      tags: ['system'],
      summary: 'Get audit logs',
      description: 'Retrieve system audit logs with filtering and pagination'
    },
    preHandler: server.authenticate
  }, async (request: AuditLogRequest, reply: FastifyReply) => {
    try {
      const { action, actor_type, resource_type, resource_id, start_date, end_date, limit = 100, offset = 0, sortOrder = 'desc' } = request.query;
      const user = request.user as any;

      const result = await auditService.getLogs({
        action,
        actor_type,
        resource_type,
        resource_id,
        start_date,
        end_date,
        limit,
        offset,
        sortOrder
      });

      // Log audit event for accessing audit logs
      await auditService.log({
        action: 'AUDIT_LOGS_ACCESSED',
        actor_id: user.id,
        actor_type: 'USER',
        metadata: {
          filters: { action, actor_type, resource_type, resource_id, start_date, end_date },
          pagination: { limit, offset },
          sortOrder
        }
      });

      return reply.code(200).send({
        logs: result.logs,
        total: result.total,
        limit,
        offset
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to get audit logs');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to get audit logs'
      });
    }
  });

  // Get system status
  server.get('/api/system/status', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            timestamp: { type: 'string', format: 'date-time' },
            uptime: { type: 'number' },
            version: { type: 'string' },
            environment: { type: 'string' },
            agents: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                online: { type: 'number' },
                offline: { type: 'number' },
                error: { type: 'number' }
              }
            },
            commands: {
              type: 'object',
              properties: {
                total_today: { type: 'number' },
                pending: { type: 'number' },
                executing: { type: 'number' },
                completed_today: { type: 'number' },
                failed_today: { type: 'number' }
              }
            },
            system: {
              type: 'object',
              properties: {
                memory: {
                  type: 'object',
                  properties: {
                    used: { type: 'number' },
                    total: { type: 'number' },
                    percentage: { type: 'number' }
                  }
                },
                cpu: {
                  type: 'object',
                  properties: {
                    usage: { type: 'number' }
                  }
                },
                database: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['connected', 'disconnected', 'error'] },
                    response_time_ms: { type: 'number' }
                  }
                },
                redis: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['connected', 'disconnected', 'error'] },
                    response_time_ms: { type: 'number' }
                  }
                }
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['system'],
      summary: 'Get system status',
      description: 'Retrieve comprehensive system health and status information'
    },
    preHandler: server.authenticate
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as any;

      // Get agent statistics
      const agentStats = await agentService.getSystemStats();

      // Get command statistics
      const commandStats = await commandService.getSystemStats();

      // Get system metrics
      const systemMetrics = await getSystemMetrics();

      // Determine overall system status
      const status = determineSystemStatus(agentStats, commandStats, systemMetrics);

      const statusResponse = {
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env['npm_package_version'] || '1.0.0',
        environment: process.env['NODE_ENV'] || 'development',
        agents: agentStats,
        commands: commandStats,
        system: systemMetrics
      };

      // Log audit event for status check
      await auditService.log({
        action: 'SYSTEM_STATUS_CHECKED',
        actor_id: user.id,
        actor_type: 'USER',
        metadata: { status }
      });

      return reply.code(200).send(statusResponse);
    } catch (error) {
      request.log.error({ error }, 'Failed to get system status');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to get system status'
      });
    }
  });

  // Health check endpoint is now registered by HealthCheckService
  // See src/database/health-check.service.ts
}

/**
 * Helper function to get system metrics
 */
async function getSystemMetrics() {
  const memoryUsage = process.memoryUsage();

  // Mock database and Redis health checks
  // In real implementation, these would check actual connections
  const databaseHealth = await checkDatabaseHealth();
  const redisHealth = await checkRedisHealth();

  return {
    memory: {
      used: memoryUsage.heapUsed,
      total: memoryUsage.heapTotal,
      percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
    },
    cpu: {
      usage: 0 // Would implement actual CPU monitoring
    },
    database: databaseHealth,
    redis: redisHealth
  };
}

/**
 * Check database health
 */
async function checkDatabaseHealth() {
  try {
    const start = Date.now();
    // Mock database check - in real implementation would ping database
    await new Promise(resolve => setTimeout(resolve, 10));
    const responseTime = Date.now() - start;

    return {
      status: 'connected' as const,
      response_time_ms: responseTime
    };
  } catch (error) {
    return {
      status: 'error' as const,
      response_time_ms: -1
    };
  }
}

/**
 * Check Redis health
 */
async function checkRedisHealth() {
  try {
    const start = Date.now();
    // Mock Redis check - in real implementation would ping Redis
    await new Promise(resolve => setTimeout(resolve, 5));
    const responseTime = Date.now() - start;

    return {
      status: 'connected' as const,
      response_time_ms: responseTime
    };
  } catch (error) {
    return {
      status: 'error' as const,
      response_time_ms: -1
    };
  }
}

/**
 * Determine overall system status
 */
function determineSystemStatus(agentStats: any, commandStats: any, systemMetrics: any): 'healthy' | 'degraded' | 'unhealthy' {
  // Check for critical failures
  if (systemMetrics.database.status === 'error' || systemMetrics.redis.status === 'error') {
    return 'unhealthy';
  }

  // Check for degraded conditions
  if (systemMetrics.memory.percentage > 90) {
    return 'degraded';
  }

  if (agentStats.error > agentStats.total * 0.5) {
    return 'degraded';
  }

  return 'healthy';
}