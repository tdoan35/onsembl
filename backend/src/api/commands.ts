/**
 * Command API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Services } from '../server';

// Request/Response schemas
const createCommandSchema = z.object({
  content: z.string().min(1),
  type: z.enum(['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE']),
  targetAgents: z.array(z.string().uuid()).optional(),
  broadcast: z.boolean().default(false).optional(),
  priority: z.number().min(0).max(100).default(50).optional(),
  executionConstraints: z.object({
    timeLimitMs: z.number().positive().optional(),
    tokenBudget: z.number().positive().optional()
  }).optional()
});

const commandIdParamsSchema = z.object({
  id: z.string().uuid()
});

const commandListQuerySchema = z.object({
  status: z.enum(['PENDING', 'QUEUED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
  type: z.enum(['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE']).optional(),
  agentId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional()
});

const terminalOutputQuerySchema = z.object({
  streamType: z.enum(['STDOUT', 'STDERR']).optional(),
  limit: z.coerce.number().min(1).max(1000).default(100).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
  since: z.string().datetime().optional()
});

// Route handler types
type CreateCommandRequest = FastifyRequest<{
  Body: z.infer<typeof createCommandSchema>
}>;

type CommandIdRequest = FastifyRequest<{
  Params: z.infer<typeof commandIdParamsSchema>
}>;

type CommandListRequest = FastifyRequest<{
  Querystring: z.infer<typeof commandListQuerySchema>
}>;

type CommandOutputRequest = FastifyRequest<{
  Params: z.infer<typeof commandIdParamsSchema>;
  Querystring: z.infer<typeof terminalOutputQuerySchema>
}>;

/**
 * Register command routes
 */
export async function registerCommandRoutes(
  server: FastifyInstance,
  services: Services
) {
  const { commandService, auditService } = services;

  // List all commands
  server.get('/api/commands', {
    schema: {
      querystring: zodToJsonSchema(commandListQuerySchema),
      response: {
        200: {
          type: 'object',
          properties: {
            commands: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  userId: { type: 'string', format: 'uuid' },
                  content: { type: 'string' },
                  type: { type: 'string', enum: ['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE'] },
                  targetAgents: { type: 'array', items: { type: 'string', format: 'uuid' } },
                  broadcast: { type: 'boolean' },
                  status: { type: 'string', enum: ['PENDING', 'QUEUED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED'] },
                  priority: { type: 'number', minimum: 0, maximum: 100 },
                  executionConstraints: {
                    type: 'object',
                    properties: {
                      timeLimitMs: { type: 'number' },
                      tokenBudget: { type: 'number' }
                    },
                    nullable: true
                  },
                  startedAt: { type: 'string', format: 'date-time', nullable: true },
                  completedAt: { type: 'string', format: 'date-time', nullable: true },
                  error: { type: 'string', nullable: true },
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
      tags: ['commands'],
      summary: 'List all commands',
      description: 'Retrieve a paginated list of all commands with optional filtering'
    },
    preHandler: server.authenticate
  }, async (request: CommandListRequest, reply: FastifyReply) => {
    try {
      const { status, type, agentId, limit = 50, offset = 0 } = request.query;
      const user = request.user as any;

      const result = await commandService.listCommands({
        status,
        type,
        agentId,
        userId: user.id,
        limit,
        offset
      });

      // Log audit event
      await auditService.log({
        action: 'COMMANDS_LISTED',
        actor_id: user.id,
        actor_type: 'USER',
        metadata: { filters: { status, type, agentId }, pagination: { limit, offset } }
      });

      return reply.code(200).send({
        commands: result.commands,
        total: result.total,
        limit,
        offset
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to list commands');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to list commands'
      });
    }
  });

  // Get command details
  server.get('/api/commands/:id', {
    schema: {
      params: zodToJsonSchema(commandIdParamsSchema),
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            content: { type: 'string' },
            type: { type: 'string', enum: ['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE'] },
            targetAgents: { type: 'array', items: { type: 'string', format: 'uuid' } },
            broadcast: { type: 'boolean' },
            status: { type: 'string', enum: ['PENDING', 'QUEUED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED'] },
            priority: { type: 'number', minimum: 0, maximum: 100 },
            executionConstraints: {
              type: 'object',
              properties: {
                timeLimitMs: { type: 'number' },
                tokenBudget: { type: 'number' }
              },
              nullable: true
            },
            startedAt: { type: 'string', format: 'date-time', nullable: true },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
            error: { type: 'string', nullable: true },
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
      tags: ['commands'],
      summary: 'Get command details',
      description: 'Retrieve detailed information about a specific command'
    },
    preHandler: server.authenticate
  }, async (request: CommandIdRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const user = request.user as any;

      const command = await commandService.getCommand(id, user.id);

      if (!command) {
        return reply.code(404).send({
          error: 'Command not found'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'COMMAND_RETRIEVED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: id,
        resource_type: 'COMMAND',
        metadata: {}
      });

      return reply.code(200).send(command);
    } catch (error) {
      request.log.error({ error }, 'Failed to get command');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to get command'
      });
    }
  });

  // Create new command
  server.post('/api/commands', {
    schema: {
      body: zodToJsonSchema(createCommandSchema),
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            content: { type: 'string' },
            type: { type: 'string', enum: ['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE'] },
            targetAgents: { type: 'array', items: { type: 'string', format: 'uuid' } },
            broadcast: { type: 'boolean' },
            status: { type: 'string', enum: ['PENDING', 'QUEUED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED'] },
            priority: { type: 'number', minimum: 0, maximum: 100 },
            executionConstraints: {
              type: 'object',
              properties: {
                timeLimitMs: { type: 'number' },
                tokenBudget: { type: 'number' }
              },
              nullable: true
            },
            startedAt: { type: 'string', format: 'date-time', nullable: true },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
            error: { type: 'string', nullable: true },
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
      tags: ['commands'],
      summary: 'Create new command',
      description: 'Submit a new command for execution by agents'
    },
    preHandler: server.authenticate
  }, async (request: CreateCommandRequest, reply: FastifyReply) => {
    try {
      const commandData = request.body;
      const user = request.user as any;

      const command = await commandService.createCommand({
        ...commandData,
        userId: user.id,
        status: 'PENDING'
      }, user.id);

      // Log audit event
      await auditService.log({
        action: 'COMMAND_CREATED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: command.id,
        resource_type: 'COMMAND',
        metadata: { type: command.type, priority: command.priority }
      });

      return reply.code(201).send(command);
    } catch (error) {
      request.log.error({ error }, 'Failed to create command');
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to create command'
      });
    }
  });

  // Cancel command
  server.delete('/api/commands/:id/cancel', {
    schema: {
      params: zodToJsonSchema(commandIdParamsSchema),
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
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
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['commands'],
      summary: 'Cancel command',
      description: 'Cancel a pending or executing command'
    },
    preHandler: server.authenticate
  }, async (request: CommandIdRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const user = request.user as any;

      const success = await commandService.cancelCommand(id, user.id);

      if (!success) {
        return reply.code(404).send({
          error: 'Command not found or cannot be cancelled'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'COMMAND_CANCELLED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: id,
        resource_type: 'COMMAND',
        metadata: {}
      });

      return reply.code(200).send({
        success: true,
        message: 'Command cancelled successfully'
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to cancel command');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to cancel command'
      });
    }
  });

  // Get command output
  server.get('/api/commands/:id/output', {
    schema: {
      params: zodToJsonSchema(commandIdParamsSchema),
      querystring: zodToJsonSchema(terminalOutputQuerySchema),
      response: {
        200: {
          type: 'object',
          properties: {
            output: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  commandId: { type: 'string', format: 'uuid' },
                  agentId: { type: 'string', format: 'uuid' },
                  streamType: { type: 'string', enum: ['STDOUT', 'STDERR'] },
                  content: { type: 'string' },
                  ansiCodes: { type: 'boolean' },
                  timestamp: { type: 'string', format: 'date-time' },
                  sequence: { type: 'number' }
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
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['commands'],
      summary: 'Get command output',
      description: 'Retrieve terminal output for a specific command'
    },
    preHandler: server.authenticate
  }, async (request: CommandOutputRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { streamType, limit = 100, offset = 0, since } = request.query;
      const user = request.user as any;

      const result = await commandService.getCommandOutput(id, {
        streamType,
        limit,
        offset,
        since,
        userId: user.id
      });

      if (!result) {
        return reply.code(404).send({
          error: 'Command not found'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'COMMAND_OUTPUT_RETRIEVED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: id,
        resource_type: 'COMMAND',
        metadata: { filters: { streamType, since }, pagination: { limit, offset } }
      });

      return reply.code(200).send({
        output: result.output,
        total: result.total,
        limit,
        offset
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to get command output');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to get command output'
      });
    }
  });

  // Get command traces
  server.get('/api/commands/:id/traces', {
    schema: {
      params: zodToJsonSchema(commandIdParamsSchema),
      response: {
        200: {
          type: 'object',
          properties: {
            traces: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  commandId: { type: 'string', format: 'uuid' },
                  agentId: { type: 'string', format: 'uuid' },
                  traceType: { type: 'string', enum: ['LLM_PROMPT', 'TOOL_CALL', 'RESPONSE'] },
                  parentTraceId: { type: 'string', format: 'uuid', nullable: true },
                  content: { type: 'string' },
                  metadata: { type: 'object', nullable: true },
                  timestamp: { type: 'string', format: 'date-time' },
                  duration: { type: 'number', nullable: true }
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
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['commands'],
      summary: 'Get command trace tree',
      description: 'Retrieve LLM trace tree for a specific command'
    },
    preHandler: server.authenticate
  }, async (request: CommandIdRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const user = request.user as any;

      const traces = await commandService.getCommandTraces(id, user.id);

      if (!traces) {
        return reply.code(404).send({
          error: 'Command not found'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'COMMAND_TRACES_RETRIEVED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: id,
        resource_type: 'COMMAND',
        metadata: {}
      });

      return reply.code(200).send({
        traces
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to get command traces');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to get command traces'
      });
    }
  });
}