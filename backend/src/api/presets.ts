/**
 * Command Preset API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Services } from '../server';

// Variable definition schema for preset variables
const variableDefinitionSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'select']),
  description: z.string().optional(),
  required: z.boolean().default(true),
  default_value: z.any().optional(),
  options: z.array(z.string()).optional()
});

// Request/Response schemas
const createPresetSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  category: z.string().optional(),
  type: z.enum(['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE']),
  prompt_template: z.string().min(1),
  variables: z.array(variableDefinitionSchema).optional(),
  priority: z.number().min(0).max(100).default(50).optional(),
  is_public: z.boolean().default(false).optional()
});

const updatePresetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  type: z.enum(['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE']).optional(),
  prompt_template: z.string().min(1).optional(),
  variables: z.array(variableDefinitionSchema).optional(),
  priority: z.number().min(0).max(100).optional(),
  is_public: z.boolean().optional()
});

const presetIdParamsSchema = z.object({
  id: z.string().uuid()
});

const presetListQuerySchema = z.object({
  type: z.enum(['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE']).optional(),
  category: z.string().optional(),
  is_public: z.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional()
});

// Route handler types
type CreatePresetRequest = FastifyRequest<{
  Body: z.infer<typeof createPresetSchema>
}>;

type UpdatePresetRequest = FastifyRequest<{
  Body: z.infer<typeof updatePresetSchema>;
  Params: z.infer<typeof presetIdParamsSchema>
}>;

type PresetIdRequest = FastifyRequest<{
  Params: z.infer<typeof presetIdParamsSchema>
}>;

type PresetListRequest = FastifyRequest<{
  Querystring: z.infer<typeof presetListQuerySchema>
}>;

/**
 * Register preset routes
 */
export async function registerPresetRoutes(
  server: FastifyInstance,
  services: Services
) {
  const { auditService } = services;

  // Note: presetService would need to be added to Services interface
  // For now, we'll assume it exists on the services object
  const presetService = (services as any).presetService;

  // List all presets
  server.get('/api/presets', {
    schema: {
      querystring: zodToJsonSchema(presetListQuerySchema),
      response: {
        200: {
          type: 'object',
          properties: {
            presets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  category: { type: 'string', nullable: true },
                  type: { type: 'string', enum: ['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE'] },
                  prompt_template: { type: 'string' },
                  variables: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        type: { type: 'string', enum: ['string', 'number', 'boolean', 'select'] },
                        description: { type: 'string', nullable: true },
                        required: { type: 'boolean' },
                        default_value: {},
                        options: { type: 'array', items: { type: 'string' }, nullable: true }
                      }
                    },
                    nullable: true
                  },
                  priority: { type: 'number', minimum: 0, maximum: 100 },
                  is_public: { type: 'boolean' },
                  usage_count: { type: 'number' },
                  created_by: { type: 'string', format: 'uuid' },
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
      tags: ['presets'],
      summary: 'List command presets',
      description: 'Retrieve a paginated list of command presets with optional filtering'
    },
    preHandler: server.authenticate
  }, async (request: PresetListRequest, reply: FastifyReply) => {
    try {
      const { type, category, is_public, search, limit = 50, offset = 0 } = request.query;
      const user = request.user as any;

      const result = await presetService.listPresets({
        type,
        category,
        is_public,
        search,
        userId: user.id,
        limit,
        offset
      });

      // Log audit event
      await auditService.log({
        action: 'PRESETS_LISTED',
        actor_id: user.id,
        actor_type: 'USER',
        metadata: { filters: { type, category, is_public, search }, pagination: { limit, offset } }
      });

      return reply.code(200).send({
        presets: result.presets,
        total: result.total,
        limit,
        offset
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to list presets');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to list presets'
      });
    }
  });

  // Get preset details
  server.get('/api/presets/:id', {
    schema: {
      params: zodToJsonSchema(presetIdParamsSchema),
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            category: { type: 'string', nullable: true },
            type: { type: 'string', enum: ['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE'] },
            prompt_template: { type: 'string' },
            variables: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['string', 'number', 'boolean', 'select'] },
                  description: { type: 'string', nullable: true },
                  required: { type: 'boolean' },
                  default_value: {},
                  options: { type: 'array', items: { type: 'string' }, nullable: true }
                }
              },
              nullable: true
            },
            priority: { type: 'number', minimum: 0, maximum: 100 },
            is_public: { type: 'boolean' },
            usage_count: { type: 'number' },
            created_by: { type: 'string', format: 'uuid' },
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
      tags: ['presets'],
      summary: 'Get preset details',
      description: 'Retrieve detailed information about a specific command preset'
    },
    preHandler: server.authenticate
  }, async (request: PresetIdRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const user = request.user as any;

      const preset = await presetService.getPreset(id, user.id);

      if (!preset) {
        return reply.code(404).send({
          error: 'Preset not found'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'PRESET_RETRIEVED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: id,
        resource_type: 'PRESET',
        metadata: {}
      });

      return reply.code(200).send(preset);
    } catch (error) {
      request.log.error({ error }, 'Failed to get preset');
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to get preset'
      });
    }
  });

  // Create new preset
  server.post('/api/presets', {
    schema: {
      body: zodToJsonSchema(createPresetSchema),
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            category: { type: 'string', nullable: true },
            type: { type: 'string', enum: ['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE'] },
            prompt_template: { type: 'string' },
            variables: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['string', 'number', 'boolean', 'select'] },
                  description: { type: 'string', nullable: true },
                  required: { type: 'boolean' },
                  default_value: {},
                  options: { type: 'array', items: { type: 'string' }, nullable: true }
                }
              },
              nullable: true
            },
            priority: { type: 'number', minimum: 0, maximum: 100 },
            is_public: { type: 'boolean' },
            usage_count: { type: 'number' },
            created_by: { type: 'string', format: 'uuid' },
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
      tags: ['presets'],
      summary: 'Create new preset',
      description: 'Create a new command preset template'
    },
    preHandler: server.authenticate
  }, async (request: CreatePresetRequest, reply: FastifyReply) => {
    try {
      const presetData = request.body;
      const user = request.user as any;

      const preset = await presetService.createPreset({
        ...presetData,
        created_by: user.id,
        usage_count: 0
      }, user.id);

      // Log audit event
      await auditService.log({
        action: 'PRESET_CREATED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: preset.id,
        resource_type: 'PRESET',
        metadata: { name: preset.name, type: preset.type }
      });

      return reply.code(201).send(preset);
    } catch (error) {
      request.log.error({ error }, 'Failed to create preset');
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to create preset'
      });
    }
  });

  // Update preset
  server.put('/api/presets/:id', {
    schema: {
      params: zodToJsonSchema(presetIdParamsSchema),
      body: zodToJsonSchema(updatePresetSchema),
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            category: { type: 'string', nullable: true },
            type: { type: 'string', enum: ['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE'] },
            prompt_template: { type: 'string' },
            variables: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['string', 'number', 'boolean', 'select'] },
                  description: { type: 'string', nullable: true },
                  required: { type: 'boolean' },
                  default_value: {},
                  options: { type: 'array', items: { type: 'string' }, nullable: true }
                }
              },
              nullable: true
            },
            priority: { type: 'number', minimum: 0, maximum: 100 },
            is_public: { type: 'boolean' },
            usage_count: { type: 'number' },
            created_by: { type: 'string', format: 'uuid' },
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
      tags: ['presets'],
      summary: 'Update preset',
      description: 'Update an existing command preset'
    },
    preHandler: server.authenticate
  }, async (request: UpdatePresetRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const updateData = request.body;
      const user = request.user as any;

      const preset = await presetService.updatePreset(id, updateData, user.id);

      if (!preset) {
        return reply.code(404).send({
          error: 'Preset not found'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'PRESET_UPDATED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: id,
        resource_type: 'PRESET',
        metadata: { updates: updateData }
      });

      return reply.code(200).send(preset);
    } catch (error) {
      request.log.error({ error }, 'Failed to update preset');

      // Check if it's a permission error
      if (error instanceof Error && error.message.includes('permission')) {
        return reply.code(403).send({
          error: 'You do not have permission to update this preset'
        });
      }

      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to update preset'
      });
    }
  });

  // Delete preset
  server.delete('/api/presets/:id', {
    schema: {
      params: zodToJsonSchema(presetIdParamsSchema),
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
      tags: ['presets'],
      summary: 'Delete preset',
      description: 'Remove a command preset from the system'
    },
    preHandler: server.authenticate
  }, async (request: PresetIdRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const user = request.user as any;

      const deleted = await presetService.deletePreset(id, user.id);

      if (!deleted) {
        return reply.code(404).send({
          error: 'Preset not found'
        });
      }

      // Log audit event
      await auditService.log({
        action: 'PRESET_DELETED',
        actor_id: user.id,
        actor_type: 'USER',
        resource_id: id,
        resource_type: 'PRESET',
        metadata: {}
      });

      return reply.code(204).send();
    } catch (error) {
      request.log.error({ error }, 'Failed to delete preset');

      // Check if it's a permission error
      if (error instanceof Error && error.message.includes('permission')) {
        return reply.code(403).send({
          error: 'You do not have permission to delete this preset'
        });
      }

      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to delete preset'
      });
    }
  });
}