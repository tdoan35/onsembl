import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { auth, profiles, audit } from '../lib/supabase.js';
import { authenticateSupabase } from '../middleware/auth.js';

interface SessionRequest extends FastifyRequest {
  user?: any;
}

interface ProfileUpdateBody {
  username?: string;
  avatar_url?: string;
  full_name?: string;
  bio?: string;
  preferences?: Record<string, any>;
}

interface ValidateTokenBody {
  token: string;
}

export default async function authRoutes(fastify: FastifyInstance) {
  // GET /api/auth/session - Get current session
  fastify.get('/auth/session',
    { preHandler: authenticateSupabase },
    async (request: SessionRequest, reply: FastifyReply) => {
      try {
        const user = request.user;
        if (!user) {
          return reply.code(401).send({
            error: 'UNAUTHORIZED',
            message: 'No active session',
          });
        }

        // Calculate token expiration
        const token = request.headers.authorization?.replace('Bearer ', '');
        let expiresAt = 0;
        let expiresIn = 0;

        if (token) {
          try {
            // Decode JWT to get exp claim
            const parts = token.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
              if (payload.exp) {
                expiresAt = payload.exp;
                expiresIn = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
              }
            }
          } catch (e) {
            // Ignore decode errors
          }
        }

        return reply.send({
          user: {
            id: user.id,
            email: user.email,
            email_confirmed_at: user.email_confirmed_at,
            created_at: user.created_at,
            updated_at: user.updated_at,
            user_metadata: user.user_metadata,
          },
          expires_at: expiresAt,
          expires_in: expiresIn,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to get session',
        });
      }
    }
  );

  // GET /api/auth/profile - Get user profile
  fastify.get('/auth/profile',
    { preHandler: authenticateSupabase },
    async (request: SessionRequest, reply: FastifyReply) => {
      try {
        const user = request.user;
        if (!user) {
          return reply.code(401).send({
            error: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        const profile = await profiles.get(user.id);

        if (!profile) {
          return reply.code(404).send({
            error: 'NOT_FOUND',
            message: 'User profile not found',
          });
        }

        return reply.send(profile);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to get profile',
        });
      }
    }
  );

  // PUT /api/auth/profile - Update user profile
  fastify.put<{ Body: ProfileUpdateBody }>('/auth/profile',
    {
      preHandler: authenticateSupabase,
      schema: {
        body: {
          type: 'object',
          properties: {
            username: {
              type: 'string',
              minLength: 3,
              maxLength: 30,
              pattern: '^[a-zA-Z0-9_]+$',
            },
            avatar_url: {
              type: 'string',
              format: 'uri',
            },
            full_name: { type: 'string' },
            bio: {
              type: 'string',
              maxLength: 500,
            },
            preferences: { type: 'object' },
          },
        },
      },
    },
    async (request: SessionRequest, reply: FastifyReply) => {
      try {
        const user = request.user;
        if (!user) {
          return reply.code(401).send({
            error: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
        }

        const body = request.body as ProfileUpdateBody;

        // Validate username format if provided
        if (body.username) {
          const usernameRegex = /^[a-zA-Z0-9_]+$/;
          if (!usernameRegex.test(body.username) ||
              body.username.length < 3 ||
              body.username.length > 30) {
            return reply.code(400).send({
              error: 'BAD_REQUEST',
              message: 'Username must be 3-30 characters and contain only letters, numbers, and underscores',
            });
          }
        }

        // Validate bio length if provided
        if (body.bio && body.bio.length > 500) {
          return reply.code(400).send({
            error: 'BAD_REQUEST',
            message: 'Bio must be 500 characters or less',
          });
        }

        try {
          const updatedProfile = await profiles.upsert(user.id, body);

          // Log profile update
          await audit.log({
            user_id: user.id,
            event_type: 'profile_update',
            event_data: {
              fields: Object.keys(body),
            },
            ip_address: request.ip,
            user_agent: request.headers['user-agent'],
          });

          return reply.send(updatedProfile);
        } catch (error: any) {
          // Check for duplicate username error
          if (error.code === '23505' && error.constraint === 'user_profiles_username_key') {
            return reply.code(409).send({
              error: 'CONFLICT',
              message: 'Username already taken',
            });
          }
          throw error;
        }
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to update profile',
        });
      }
    }
  );

  // POST /api/auth/validate - Validate JWT token
  fastify.post<{ Body: ValidateTokenBody }>('/auth/validate',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { token } = request.body as ValidateTokenBody;

        if (!token) {
          return reply.code(401).send({
            error: 'UNAUTHORIZED',
            message: 'No token provided',
          });
        }

        // Validate token
        const user = await auth.validateToken(token);

        if (!user) {
          return reply.code(401).send({
            error: 'UNAUTHORIZED',
            message: 'Invalid or expired token',
          });
        }

        // Extract expiration from token
        let expiresAt = 0;
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            if (payload.exp) {
              expiresAt = payload.exp;
            }
          }
        } catch (e) {
          // Ignore decode errors
        }

        return reply.send({
          valid: true,
          user_id: user.id,
          email: user.email,
          expires_at: expiresAt,
        });
      } catch (error) {
        fastify.log.error(error);

        // Check for specific JWT errors
        if ((error as any).name === 'TokenExpiredError') {
          return reply.code(401).send({
            error: 'UNAUTHORIZED',
            message: 'Token has expired',
          });
        }

        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: 'Invalid token',
        });
      }
    }
  );

  // Health check endpoint (no auth required)
  fastify.get('/auth/health', async (request, reply) => {
    return reply.send({ status: 'ok', service: 'auth' });
  });

  fastify.log.info('Auth routes registered');
}