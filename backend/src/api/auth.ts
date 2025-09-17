/**
 * Authentication API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Services } from '../server';

// Zod schemas for validation
const magicLinkRequestZod = z.object({
  email: z.string().email(),
  redirectTo: z.string().url().optional()
});

const verifyTokenRequestZod = z.object({
  token: z.string()
});

const refreshTokenRequestZod = z.object({
  refreshToken: z.string()
});

const logoutRequestZod = z.object({
  userId: z.string().uuid()
});

// Convert Zod schemas to JSON Schema for Fastify
const magicLinkRequestSchema = zodToJsonSchema(magicLinkRequestZod);
const verifyTokenRequestSchema = zodToJsonSchema(verifyTokenRequestZod);
const refreshTokenRequestSchema = zodToJsonSchema(refreshTokenRequestZod);
const logoutRequestSchema = zodToJsonSchema(logoutRequestZod);


/**
 * Register authentication routes
 */
export async function registerAuthRoutes(
  server: FastifyInstance,
  services: Services
) {
  const { authService, auditService } = services;

  // Send magic link for authentication
  server.post('/api/auth/magic-link', {
    schema: {
      body: magicLinkRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['auth'],
      summary: 'Send magic link for authentication',
      description: 'Sends a magic link to the user\'s email for passwordless authentication'
    }
  }, async (request, reply) => {
    try {
      const { email, redirectTo } = request.body as z.infer<typeof magicLinkRequestZod>;

      await authService.sendMagicLink({
        email,
        ...(redirectTo && { redirectTo })
      });

      // Log audit event
      await auditService.logAuthEvent(
        'AUTH_MAGIC_LINK_SENT' as any,
        email,
        { email },
        request
      );

      return reply.code(200).send({
        success: true,
        message: 'Magic link sent to your email'
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to send magic link');
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to send magic link'
      });
    }
  });

  // Verify authentication token
  server.post('/api/auth/verify', {
    schema: {
      body: verifyTokenRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            user: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                created_at: { type: 'string' }
              }
            },
            accessToken: { type: 'string', nullable: true },
            refreshToken: { type: 'string', nullable: true }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['auth'],
      summary: 'Verify authentication token',
      description: 'Verifies a JWT token and returns user information'
    }
  }, async (request, reply) => {
    try {
      const { token } = request.body as z.infer<typeof verifyTokenRequestZod>;

      const result = await authService.verifyToken(token);

      if (!result.valid || !result.user) {
        return reply.code(401).send({
          error: result.error || 'Invalid or expired token'
        });
      }

      const user = result.user;

      // Generate new tokens
      const accessToken = server.jwt.sign(
        { id: user.id, email: user.email },
        { expiresIn: '1h' }
      );

      const refreshToken = server.jwt.sign(
        { id: user.id, email: user.email, type: 'refresh' },
        { expiresIn: '7d' }
      );

      // Log audit event
      await auditService.logAuthEvent(
        'AUTH_TOKEN_VERIFIED' as any,
        user.id,
        { email: user.email },
        request
      );

      return reply.code(200).send({
        valid: true,
        user,
        accessToken,
        refreshToken
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to verify token');
      return reply.code(401).send({
        error: 'Invalid or expired token'
      });
    }
  });

  // Refresh authentication token
  server.post('/api/auth/refresh', {
    schema: {
      body: refreshTokenRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['auth'],
      summary: 'Refresh authentication token',
      description: 'Refreshes an expired access token using a refresh token'
    }
  }, async (request, reply) => {
    try {
      const { refreshToken } = request.body as z.infer<typeof refreshTokenRequestZod>;

      const result = await authService.refreshToken(refreshToken);

      if (!result.success || !result.session) {
        return reply.code(401).send({
          error: result.error || 'Invalid or expired refresh token'
        });
      }

      const user = result.session.user;

      // Generate new access token
      const accessToken = server.jwt.sign(
        { id: user.id, email: user.email },
        { expiresIn: '1h' }
      );

      // Generate new refresh token
      const newRefreshToken = server.jwt.sign(
        { id: user.id, email: user.email, type: 'refresh' },
        { expiresIn: '7d' }
      );

      // Log audit event
      await auditService.logAuthEvent(
        'AUTH_TOKEN_REFRESHED' as any,
        user.id,
        { email: user.email },
        request
      );

      return reply.code(200).send({
        accessToken,
        refreshToken: newRefreshToken
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to refresh token');
      return reply.code(401).send({
        error: 'Failed to refresh token'
      });
    }
  });

  // Logout user
  server.post('/api/auth/logout', {
    schema: {
      body: logoutRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      },
      tags: ['auth'],
      summary: 'Logout user',
      description: 'Logs out a user and invalidates their session'
    },
    preHandler: server.authenticate
  }, async (request, reply) => {
    try {
      const { userId } = request.body as z.infer<typeof logoutRequestZod>;

      // Log audit event
      await auditService.logAuthEvent(
        'USER_LOGOUT',
        userId,
        {},
        request
      );

      return reply.code(200).send({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to logout');
      return reply.code(400).send({
        error: 'Failed to logout'
      });
    }
  });

  // Get current user
  server.get('/api/auth/me', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            created_at: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      tags: ['auth'],
      summary: 'Get current user',
      description: 'Returns the currently authenticated user\'s information'
    },
    preHandler: server.authenticate
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get user from JWT payload
      const user = request.user as any;

      return reply.code(200).send({
        id: user.id,
        email: user.email,
        created_at: user.created_at || new Date().toISOString()
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to get current user');
      return reply.code(401).send({
        error: 'Not authenticated'
      });
    }
  });
}