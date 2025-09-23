/**
 * Agent API routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Services } from '../server';
import { authenticateSupabase } from '../middleware/auth.js';

// Request/Response schemas
const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['claude', 'gemini', 'codex', 'custom']),
  version: z.string(),
  capabilities: z.array(z.string()),
  metadata: z.record(z.any()).optional()
});

const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['claude', 'gemini', 'codex', 'custom']).optional(),
  version: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional()
});

const agentIdParamsSchema = z.object({
  id: z.string().uuid()
});

const agentListQuerySchema = z.object({
  type: z.enum(['claude', 'gemini', 'codex', 'custom']).optional(),
  status: z.enum(['online', 'offline', 'executing', 'error', 'maintenance']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional()
});

/**
 * Register agent routes
 */
export async function registerAgentRoutes(
  server: FastifyInstance,
  services: Services
) {
  const { agentService, auditService } = services;

  // List all agents
  server.get('/api/agents', {
    schema: {
      querystring: zodToJsonSchema(agentListQuerySchema),
      response: {
        200: {
          type: 'object',
          properties: {
            agents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['claude', 'gemini', 'codex', 'custom'] },
                  status: { type: 'string', enum: ['online', 'offline', 'executing', 'error', 'maintenance'] },
                  version: { type: 'string' },
                  capabilities: { type: 'array', items: { type: 'string' } },
                  last_ping: { type: 'string', format: 'date-time', nullable: true },
                  metadata: { type: 'object', nullable: true },
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
      tags: ['agents'],
      summary: 'List all agents',
      description: 'Retrieve a paginated list of all registered agents with optional filtering'
    },
    preHandler: authenticateSupabase
  }, async (request, reply) => {
    try {
      const user = (request as any).user;
      if (!user) {
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: 'Authentication required'
        });
      }

      const { type, status, limit = 50, offset = 0 } = request.query as z.infer<typeof agentListQuerySchema>;

      const agents = await agentService.listAgents({
        user_id: user.id, // Filter by authenticated user
        ...(type && { type }),
        ...(status && { status }),
        limit,
        offset
      });

      // Log audit event
      await auditService.logEvent(
        'AGENTS_LISTED' as any,
        'AGENT',
        undefined,
        { filters: { type, status }, pagination: { limit, offset } },
        request
      );

      return reply.code(200).send({
        agents: agents || [],
        total: agents?.length || 0,
        limit,
        offset
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to list agents');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to list agents'
      });
    }
  });

  // Get agent details
  server.get('/api/agents/:id', {
    schema: {
      params: zodToJsonSchema(agentIdParamsSchema),
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            type: { type: 'string', enum: ['claude', 'gemini', 'codex', 'custom'] },
            status: { type: 'string', enum: ['online', 'offline', 'executing', 'error', 'maintenance'] },
            version: { type: 'string' },
            capabilities: { type: 'array', items: { type: 'string' } },
            last_ping: { type: 'string', format: 'date-time', nullable: true },
            metadata: { type: 'object', nullable: true },
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
      tags: ['agents'],
      summary: 'Get agent details',
      description: 'Retrieve detailed information about a specific agent'
    },
    preHandler: authenticateSupabase
  }, async (request, reply) => {
    try {
      const { id } = request.params as z.infer<typeof agentIdParamsSchema>;

      const agent = await agentService.getAgent(id);

      if (!agent) {
        return reply.code(404).send({
          error: 'Agent not found'
        });
      }

      // Log audit event
      await auditService.logAgentEvent(
        'AGENT_RETRIEVED' as any,
        id,
        {},
        request
      );

      return reply.code(200).send(agent);
    } catch (error) {
      request.log.error({ error }, 'Failed to get agent');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to get agent'
      });
    }
  });

  // Create new agent
  server.post('/api/agents', {
    schema: {
      body: zodToJsonSchema(createAgentSchema),
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            type: { type: 'string', enum: ['claude', 'gemini', 'codex', 'custom'] },
            status: { type: 'string', enum: ['online', 'offline', 'executing', 'error', 'maintenance'] },
            version: { type: 'string' },
            capabilities: { type: 'array', items: { type: 'string' } },
            last_ping: { type: 'string', format: 'date-time', nullable: true },
            metadata: { type: 'object', nullable: true },
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
      tags: ['agents'],
      summary: 'Create new agent',
      description: 'Register a new agent in the system'
    },
    preHandler: authenticateSupabase
  }, async (request, reply) => {
    try {
      const agentData = request.body as z.infer<typeof createAgentSchema>;
      const user = (request as any).user;

      const agent = await agentService.registerAgent({
        ...agentData,
        status: 'offline' // New agents start offline
      } as any, user.id);

      // Log audit event
      await auditService.logAgentEvent(
        'AGENT_CREATED' as any,
        agent.id,
        { agentType: agent.type, version: agent.version },
        request
      );

      return reply.code(201).send(agent);
    } catch (error) {
      request.log.error({ error }, 'Failed to create agent');
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to create agent'
      });
    }
  });

  // Update agent
  server.put('/api/agents/:id', {
    schema: {
      params: zodToJsonSchema(agentIdParamsSchema),
      body: zodToJsonSchema(updateAgentSchema),
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            type: { type: 'string', enum: ['claude', 'gemini', 'codex', 'custom'] },
            status: { type: 'string', enum: ['online', 'offline', 'executing', 'error', 'maintenance'] },
            version: { type: 'string' },
            capabilities: { type: 'array', items: { type: 'string' } },
            last_ping: { type: 'string', format: 'date-time', nullable: true },
            metadata: { type: 'object', nullable: true },
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
      tags: ['agents'],
      summary: 'Update agent',
      description: 'Update an existing agent\'s information'
    },
    preHandler: authenticateSupabase
  }, async (request, reply) => {
    try {
      const { id } = request.params as z.infer<typeof agentIdParamsSchema>;
      const updateData = request.body as z.infer<typeof updateAgentSchema>;
      const user = (request as any).user;

      const agent = await agentService.updateAgent(id, updateData as any, user.id);

      if (!agent) {
        return reply.code(404).send({
          error: 'Agent not found'
        });
      }

      // Log audit event
      await auditService.logAgentEvent(
        'AGENT_UPDATED' as any,
        id,
        { config: updateData },
        request
      );

      return reply.code(200).send(agent);
    } catch (error) {
      request.log.error({ error }, 'Failed to update agent');
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to update agent'
      });
    }
  });

  // Delete agent
  server.delete('/api/agents/:id', {
    schema: {
      params: zodToJsonSchema(agentIdParamsSchema),
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
        }
      },
      tags: ['agents'],
      summary: 'Delete agent',
      description: 'Remove an agent from the system'
    },
    preHandler: authenticateSupabase
  }, async (request, reply) => {
    try {
      const { id } = request.params as z.infer<typeof agentIdParamsSchema>;

      const deleted = await agentService.deleteAgent(id);

      if (!deleted) {
        return reply.code(404).send({
          error: 'Agent not found'
        });
      }

      // Log audit event
      await auditService.logAgentEvent(
        'AGENT_DELETED' as any,
        id,
        {},
        request
      );

      return reply.code(204).send();
    } catch (error) {
      request.log.error({ error }, 'Failed to delete agent');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to delete agent'
      });
    }
  });

  // Restart agent
  server.post('/api/agents/:id/restart', {
    schema: {
      params: zodToJsonSchema(agentIdParamsSchema),
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
        }
      },
      tags: ['agents'],
      summary: 'Restart agent',
      description: 'Restart an agent and reset its connection'
    },
    preHandler: authenticateSupabase
  }, async (request, reply) => {
    try {
      const { id } = request.params as z.infer<typeof agentIdParamsSchema>;
      const user = (request as any).user;

      const success = await agentService.restartAgent(id, user.id);

      if (!success) {
        return reply.code(404).send({
          error: 'Agent not found or cannot be restarted'
        });
      }

      // Log audit event
      await auditService.logAgentEvent(
        'AGENT_RESTARTED' as any,
        id,
        {},
        request
      );

      return reply.code(200).send({
        success: true,
        message: 'Agent restart initiated'
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to restart agent');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to restart agent'
      });
    }
  });
}