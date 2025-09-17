/**
 * Execution Constraint API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Services } from '../server';

// Request/Response schemas
const createConstraintSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  time_limit_ms: z.number().int().positive().optional(),
  token_budget: z.number().int().positive().optional(),
  memory_limit_mb: z.number().int().positive().optional(),
  cpu_limit_percent: z.number().int().min(1).max(100).optional(),
  is_default: z.boolean().default(false).optional()
});

const updateConstraintSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  time_limit_ms: z.number().int().positive().optional(),
  token_budget: z.number().int().positive().optional(),
  memory_limit_mb: z.number().int().positive().optional(),
  cpu_limit_percent: z.number().int().min(1).max(100).optional(),
  is_default: z.boolean().optional()
});

const constraintIdParamsSchema = z.object({
  id: z.string().uuid()
});

const constraintListQuerySchema = z.object({
  is_default: z.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
  sortBy: z.enum(['name', 'created_at', 'updated_at']).default('created_at').optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional()
});

const evaluateConstraintSchema = z.object({
  current_tokens: z.number().int().min(0).optional(),
  current_cost: z.number().min(0).optional(),
  execution_time_ms: z.number().int().min(0).optional(),
  memory_usage_mb: z.number().min(0).optional(),
  cpu_usage_percent: z.number().min(0).max(100).optional()
});

// Route handler types
type CreateConstraintRequest = FastifyRequest<{
  Body: z.infer<typeof createConstraintSchema>
}>;

type UpdateConstraintRequest = FastifyRequest<{
  Body: z.infer<typeof updateConstraintSchema>;
  Params: z.infer<typeof constraintIdParamsSchema>
}>;

type ConstraintIdRequest = FastifyRequest<{
  Params: z.infer<typeof constraintIdParamsSchema>
}>;

type ConstraintListRequest = FastifyRequest<{
  Querystring: z.infer<typeof constraintListQuerySchema>
}>;

type EvaluateConstraintRequest = FastifyRequest<{
  Params: z.infer<typeof constraintIdParamsSchema>;
  Body: z.infer<typeof evaluateConstraintSchema>
}>;

/**
 * Register constraint routes
 */
export async function registerConstraintRoutes(
  server: FastifyInstance,
  services: Services
) {
  const { auditService } = services;

  // Note: constraintService would need to be added to Services interface
  // For now, we'll assume it exists on the services object
  const constraintService = (services as any).constraintService;

  // List all constraints
  server.get('/api/constraints', {
    schema: {
      querystring: zodToJsonSchema(constraintListQuerySchema),
      response: {
        200: {
          type: 'object',
          properties: {
            constraints: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  time_limit_ms: { type: 'number', nullable: true },
                  token_budget: { type: 'number', nullable: true },
                  memory_limit_mb: { type: 'number', nullable: true },
                  cpu_limit_percent: { type: 'number', nullable: true },
                  is_default: { type: 'boolean' },
                  created_at: { type: 'string', format: 'date-time' },
                  updated_at: { type: 'string', format: 'date-time' }
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
      tags: ['constraints'],
      summary: 'List execution constraints',
      description: 'Retrieve a paginated list of execution constraints with optional filtering'
    },
    preHandler: server.authenticate
  }, async (request: ConstraintListRequest, reply: FastifyReply) => {
    try {
      const { is_default, search, limit = 50, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = request.query;
      const user = request.user as any;

      const result = await constraintService.listConstraints({
        is_default,
        search,
        limit,
        offset,
        sortBy,
        sortOrder
      });

      // Log audit event
      await auditService.log({
        action: 'CONSTRAINTS_LISTED',
        actor_id: user.id,
        actor_type: 'USER',
        metadata: {
          filters: { is_default, search },
          pagination: { limit, offset },
          sorting: { sortBy, sortOrder }
        }
      });

      return reply.code(200).send({
        constraints: result.constraints,
        total: result.total,
        limit,
        offset
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to list constraints');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to list constraints'
      });
    }
  });

  // Get constraint details
  server.get('/api/constraints/:id', {
    schema: {
      params: zodToJsonSchema(constraintIdParamsSchema),
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            time_limit_ms: { type: 'number', nullable: true },
            token_budget: { type: 'number', nullable: true },
            memory_limit_mb: { type: 'number', nullable: true },
            cpu_limit_percent: { type: 'number', nullable: true },
            is_default: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
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
      tags: ['constraints'],
      summary: 'Get constraint details',
      description: 'Retrieve detailed information about a specific execution constraint'
    },
    preHandler: server.authenticate
  }, async (request: ConstraintIdRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const user = request.user as any;

      const constraint = await constraintService.getConstraint(id);

      if (!constraint) {
        return reply.code(404).send({
          error: 'Constraint not found'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'CONSTRAINT_RETRIEVED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: id,
        resource_type: 'CONSTRAINT',
        metadata: {}
      });

      return reply.code(200).send(constraint);
    } catch (error) {
      request.log.error({ error }, 'Failed to get constraint');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to get constraint'
      });
    }
  });

  // Create new constraint
  server.post('/api/constraints', {
    schema: {
      body: zodToJsonSchema(createConstraintSchema),
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            time_limit_ms: { type: 'number', nullable: true },
            token_budget: { type: 'number', nullable: true },
            memory_limit_mb: { type: 'number', nullable: true },
            cpu_limit_percent: { type: 'number', nullable: true },
            is_default: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
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
      tags: ['constraints'],
      summary: 'Create new constraint',
      description: 'Create a new execution constraint for controlling agent behavior'
    },
    preHandler: server.authenticate
  }, async (request: CreateConstraintRequest, reply: FastifyReply) => {
    try {
      const constraintData = request.body;
      const user = request.user as any;

      const constraint = await constraintService.createConstraint(constraintData, user.id);

      // Log audit event
      await auditService.log({
        action: 'CONSTRAINT_CREATED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: constraint.id,
        resource_type: 'CONSTRAINT',
        metadata: { name: constraint.name, is_default: constraint.is_default }
      });

      return reply.code(201).send(constraint);
    } catch (error) {
      request.log.error({ error }, 'Failed to create constraint');
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to create constraint'
      });
    }
  });

  // Update constraint
  server.put('/api/constraints/:id', {
    schema: {
      params: zodToJsonSchema(constraintIdParamsSchema),
      body: zodToJsonSchema(updateConstraintSchema),
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            time_limit_ms: { type: 'number', nullable: true },
            token_budget: { type: 'number', nullable: true },
            memory_limit_mb: { type: 'number', nullable: true },
            cpu_limit_percent: { type: 'number', nullable: true },
            is_default: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
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
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['constraints'],
      summary: 'Update constraint',
      description: 'Update an existing execution constraint'
    },
    preHandler: server.authenticate
  }, async (request: UpdateConstraintRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const updateData = request.body;
      const user = request.user as any;

      const constraint = await constraintService.updateConstraint(id, updateData, user.id);

      if (!constraint) {
        return reply.code(404).send({
          error: 'Constraint not found'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'CONSTRAINT_UPDATED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: id,
        resource_type: 'CONSTRAINT',
        metadata: { updates: updateData }
      });

      return reply.code(200).send(constraint);
    } catch (error) {
      request.log.error({ error }, 'Failed to update constraint');
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to update constraint'
      });
    }
  });

  // Delete constraint
  server.delete('/api/constraints/:id', {
    schema: {
      params: zodToJsonSchema(constraintIdParamsSchema),
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
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['constraints'],
      summary: 'Delete constraint',
      description: 'Remove an execution constraint from the system'
    },
    preHandler: server.authenticate
  }, async (request: ConstraintIdRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const user = request.user as any;

      const deleted = await constraintService.deleteConstraint(id, user.id);

      if (!deleted) {
        return reply.code(404).send({
          error: 'Constraint not found'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'CONSTRAINT_DELETED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: id,
        resource_type: 'CONSTRAINT',
        metadata: {}
      });

      return reply.code(204).send();
    } catch (error) {
      request.log.error({ error }, 'Failed to delete constraint');

      // Check if it's a conflict error (constraint in use)
      if (error instanceof Error && error.message.includes('constraint is in use')) {
        return reply.code(409).send({
          error: 'Cannot delete constraint: it is currently in use by one or more commands'
        });
      }

      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to delete constraint'
      });
    }
  });

  // Evaluate constraint against current usage
  server.post('/api/constraints/:id/evaluate', {
    schema: {
      params: zodToJsonSchema(constraintIdParamsSchema),
      body: zodToJsonSchema(evaluateConstraintSchema),
      response: {
        200: {
          type: 'object',
          properties: {
            isValid: { type: 'boolean' },
            constraint: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' }
              }
            },
            violations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['TIME_LIMIT', 'TOKEN_BUDGET', 'MEMORY_LIMIT', 'CPU_LIMIT'] },
                  current: { type: 'number' },
                  limit: { type: 'number' },
                  message: { type: 'string' }
                }
              }
            },
            evaluation_timestamp: { type: 'string', format: 'date-time' }
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
      tags: ['constraints'],
      summary: 'Evaluate constraint',
      description: 'Evaluate an execution constraint against current usage metrics'
    },
    preHandler: server.authenticate
  }, async (request: EvaluateConstraintRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const evaluationContext = request.body;
      const user = request.user as any;

      const result = await constraintService.evaluateConstraint(id, evaluationContext);

      if (!result) {
        return reply.code(404).send({
          error: 'Constraint not found'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'CONSTRAINT_EVALUATED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: id,
        resource_type: 'CONSTRAINT',
        metadata: {
          isValid: result.isValid,
          violationCount: result.violations.length,
          context: evaluationContext
        }
      });

      return reply.code(200).send({
        ...result,
        evaluation_timestamp: new Date().toISOString()
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to evaluate constraint');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to evaluate constraint'
      });
    }
  });

  // Get default constraint
  server.get('/api/constraints/default', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            time_limit_ms: { type: 'number', nullable: true },
            token_budget: { type: 'number', nullable: true },
            memory_limit_mb: { type: 'number', nullable: true },
            cpu_limit_percent: { type: 'number', nullable: true },
            is_default: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
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
      tags: ['constraints'],
      summary: 'Get default constraint',
      description: 'Retrieve the current default execution constraint'
    },
    preHandler: server.authenticate
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as any;

      const defaultConstraint = await constraintService.getDefaultConstraint();

      if (!defaultConstraint) {
        return reply.code(404).send({
          error: 'No default constraint found'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'DEFAULT_CONSTRAINT_RETRIEVED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: defaultConstraint.id,
        resource_type: 'CONSTRAINT',
        metadata: {}
      });

      return reply.code(200).send(defaultConstraint);
    } catch (error) {
      request.log.error({ error }, 'Failed to get default constraint');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to get default constraint'
      });
    }
  });
}