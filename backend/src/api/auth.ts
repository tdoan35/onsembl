/**
 * Authentication API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Services } from '../server';
import { auth, profiles, audit, supabaseAdmin } from '../lib/supabase.js';
import { authenticateSupabase } from '../middleware/auth.js';

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

// CLI OAuth device flow schemas
const deviceAuthRequestZod = z.object({
  client_id: z.string().optional().default('onsembl-cli'),
  scope: z.string().optional().default('agent:manage')
});

const deviceTokenRequestZod = z.object({
  device_code: z.string(),
  grant_type: z.literal('urn:ietf:params:oauth:grant-type:device_code')
});

const cliRefreshTokenRequestZod = z.object({
  refresh_token: z.string(),
  grant_type: z.literal('refresh_token')
});

const cliTokenValidationRequestZod = z.object({
  access_token: z.string()
});

// Convert Zod schemas to JSON Schema for Fastify
const magicLinkRequestSchema = zodToJsonSchema(magicLinkRequestZod);
const verifyTokenRequestSchema = zodToJsonSchema(verifyTokenRequestZod);
const refreshTokenRequestSchema = zodToJsonSchema(refreshTokenRequestZod);
const logoutRequestSchema = zodToJsonSchema(logoutRequestZod);

// CLI OAuth schemas
const deviceAuthRequestSchema = zodToJsonSchema(deviceAuthRequestZod);
const deviceTokenRequestSchema = zodToJsonSchema(deviceTokenRequestZod);
const cliRefreshTokenRequestSchema = zodToJsonSchema(cliRefreshTokenRequestZod);
const cliTokenValidationRequestSchema = zodToJsonSchema(cliTokenValidationRequestZod);


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

  // ====== SUPABASE AUTH ENDPOINTS ======

  // GET /api/auth/session - Get current Supabase session
  server.get('/api/auth/session', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                email_confirmed_at: { type: 'string', nullable: true },
                created_at: { type: 'string' },
                updated_at: { type: 'string' },
                user_metadata: { type: 'object' }
              }
            },
            expires_at: { type: 'number' },
            expires_in: { type: 'number' }
          }
        }
      },
      tags: ['auth'],
      summary: 'Get current Supabase session',
      description: 'Returns the current authenticated user session from Supabase'
    },
    preHandler: authenticateSupabase
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    if (!user) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'No active session'
      });
    }

    const token = request.headers.authorization?.replace('Bearer ', '');
    let expiresAt = 0;
    let expiresIn = 0;

    if (token) {
      try {
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
        user_metadata: user.metadata || {}
      },
      expires_at: expiresAt,
      expires_in: expiresIn
    });
  });

  // GET /api/auth/profile - Get user profile
  server.get('/api/auth/profile', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            username: { type: 'string', nullable: true },
            avatar_url: { type: 'string', nullable: true },
            full_name: { type: 'string', nullable: true },
            bio: { type: 'string', nullable: true },
            preferences: { type: 'object' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      },
      tags: ['auth'],
      summary: 'Get user profile',
      description: 'Returns the authenticated user\'s profile'
    },
    preHandler: authenticateSupabase
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    if (!user) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const profile = await profiles.get(user.id);
    if (!profile) {
      return reply.code(404).send({
        error: 'NOT_FOUND',
        message: 'User profile not found'
      });
    }

    return reply.send(profile);
  });

  // PUT /api/auth/profile - Update user profile
  server.put('/api/auth/profile', {
    schema: {
      body: {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 30,
            pattern: '^[a-zA-Z0-9_]+$'
          },
          avatar_url: { type: 'string', format: 'uri' },
          full_name: { type: 'string' },
          bio: { type: 'string', maxLength: 500 },
          preferences: { type: 'object' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            username: { type: 'string', nullable: true },
            avatar_url: { type: 'string', nullable: true },
            full_name: { type: 'string', nullable: true },
            bio: { type: 'string', nullable: true },
            preferences: { type: 'object' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' }
          }
        }
      },
      tags: ['auth'],
      summary: 'Update user profile',
      description: 'Updates the authenticated user\'s profile'
    },
    preHandler: authenticateSupabase
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    if (!user) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const body = request.body as any;

    try {
      const updatedProfile = await profiles.upsert(user.id, body);

      // Log profile update
      await audit.log({
        user_id: user.id,
        event_type: 'profile_update',
        event_data: { fields: Object.keys(body) },
        ip_address: request.ip,
        user_agent: request.headers['user-agent']
      });

      return reply.send(updatedProfile);
    } catch (error: any) {
      if (error.code === '23505' && error.constraint === 'user_profiles_username_key') {
        return reply.code(409).send({
          error: 'CONFLICT',
          message: 'Username already taken'
        });
      }
      throw error;
    }
  });

  // POST /api/auth/validate - Validate Supabase JWT token
  server.post('/api/auth/validate', {
    schema: {
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            user_id: { type: 'string' },
            email: { type: 'string', nullable: true },
            expires_at: { type: 'number' }
          }
        }
      },
      tags: ['auth'],
      summary: 'Validate JWT token',
      description: 'Validates a Supabase JWT token and returns user information'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.body as { token: string };

    if (!token) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'No token provided'
      });
    }

    const user = await auth.validateToken(token);
    if (!user) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Invalid or expired token'
      });
    }

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
      expires_at: expiresAt
    });
  });

  // ====== CLI OAUTH DEVICE FLOW ENDPOINTS ======

  // POST /api/auth/device/authorize - Start OAuth device flow
  server.post('/api/auth/device/authorize', {
    schema: {
      body: deviceAuthRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            device_code: { type: 'string' },
            user_code: { type: 'string' },
            verification_uri: { type: 'string' },
            verification_uri_complete: { type: 'string' },
            expires_in: { type: 'number' },
            interval: { type: 'number' }
          }
        }
      },
      tags: ['cli-auth'],
      summary: 'Start OAuth device authorization flow',
      description: 'Initiates the OAuth device flow for CLI authentication'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { client_id, scope } = request.body as z.infer<typeof deviceAuthRequestZod>;

    // Generate device and user codes
    const deviceCode = generateRandomCode(32);
    const userCode = generateUserCode(); // 6-digit human-friendly code
    const expiresIn = 600; // 10 minutes
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Store the device authorization
    const { data, error } = await supabaseAdmin.from('cli_tokens').insert({
      device_code: deviceCode,
      user_code: userCode,
      expires_at: expiresAt,
      scopes: scope.split(' '),
      user_id: '', // Will be set when user authorizes
      is_revoked: false
    });

    if (error) {
      request.log.error({ error }, 'Failed to create device authorization');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to create device authorization'
      });
    }

    const baseUrl = process.env['FRONTEND_URL'] || 'http://localhost:3000';
    const verificationUri = `${baseUrl}/auth/device`;
    const verificationUriComplete = `${verificationUri}?user_code=${userCode}`;

    return reply.send({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: verificationUriComplete,
      expires_in: expiresIn,
      interval: 5 // Poll every 5 seconds
    });
  });

  // POST /api/auth/device/token - Exchange device code for access token
  server.post('/api/auth/device/token', {
    schema: {
      body: deviceTokenRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            refresh_token: { type: 'string' },
            token_type: { type: 'string' },
            expires_in: { type: 'number' },
            scope: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            error_description: { type: 'string' }
          }
        }
      },
      tags: ['cli-auth'],
      summary: 'Exchange device code for access token',
      description: 'Exchanges device code for access token in OAuth device flow'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { device_code } = request.body as z.infer<typeof deviceTokenRequestZod>;

    // Find the device authorization
    const { data: tokenData, error: findError } = await supabaseAdmin
      .from('cli_tokens')
      .select('*')
      .eq('device_code', device_code)
      .eq('is_revoked', false)
      .single();

    if (findError || !tokenData) {
      return reply.code(400).send({
        error: 'invalid_grant',
        error_description: 'Device code not found or expired'
      });
    }

    // Check if expired
    if (new Date() > new Date(tokenData.expires_at!)) {
      return reply.code(400).send({
        error: 'expired_token',
        error_description: 'Device code has expired'
      });
    }

    // Check if user has authorized (user_id is set and access_token exists)
    if (!tokenData.user_id || !tokenData.access_token) {
      return reply.code(400).send({
        error: 'authorization_pending',
        error_description: 'User has not yet authorized the device'
      });
    }

    // Return the tokens
    return reply.send({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token!,
      token_type: 'Bearer',
      expires_in: 3600, // 1 hour
      scope: tokenData.scopes.join(' ')
    });
  });

  // POST /api/auth/cli/refresh - Refresh CLI access token
  server.post('/api/auth/cli/refresh', {
    schema: {
      body: cliRefreshTokenRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            refresh_token: { type: 'string' },
            token_type: { type: 'string' },
            expires_in: { type: 'number' }
          }
        }
      },
      tags: ['cli-auth'],
      summary: 'Refresh CLI access token',
      description: 'Refreshes an expired CLI access token using refresh token'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { refresh_token } = request.body as z.infer<typeof cliRefreshTokenRequestZod>;

    // Find token by refresh token
    const { data: tokenData, error: findError } = await supabaseAdmin
      .from('cli_tokens')
      .select('*')
      .eq('refresh_token', refresh_token)
      .eq('is_revoked', false)
      .single();

    if (findError || !tokenData) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Invalid or expired refresh token'
      });
    }

    // Check refresh token expiry
    if (tokenData.refresh_expires_at && new Date() > new Date(tokenData.refresh_expires_at)) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Refresh token has expired'
      });
    }

    // Generate new tokens
    const newAccessToken = server.jwt.sign(
      { sub: tokenData.user_id, scope: tokenData.scopes.join(' '), type: 'cli' },
      { expiresIn: '1h' }
    );
    const newRefreshToken = server.jwt.sign(
      { sub: tokenData.user_id, type: 'cli_refresh' },
      { expiresIn: '30d' }
    );

    // Update token in database
    const newExpiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const newRefreshExpiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('cli_tokens')
      .update({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_at: newExpiresAt,
        refresh_expires_at: newRefreshExpiresAt,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', tokenData.id);

    if (updateError) {
      request.log.error({ error: updateError }, 'Failed to update CLI tokens');
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to refresh token'
      });
    }

    return reply.send({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      token_type: 'Bearer',
      expires_in: 3600
    });
  });

  // POST /api/auth/cli/validate - Validate CLI access token
  server.post('/api/auth/cli/validate', {
    schema: {
      body: cliTokenValidationRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            user_id: { type: 'string' },
            scopes: { type: 'array', items: { type: 'string' } },
            expires_at: { type: 'number' }
          }
        }
      },
      tags: ['cli-auth'],
      summary: 'Validate CLI access token',
      description: 'Validates a CLI access token and returns user info'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { access_token } = request.body as z.infer<typeof cliTokenValidationRequestZod>;

    try {
      const decoded = server.jwt.verify(access_token) as any;

      if (decoded.type !== 'cli') {
        return reply.code(401).send({
          error: 'UNAUTHORIZED',
          message: 'Invalid token type'
        });
      }

      return reply.send({
        valid: true,
        user_id: decoded.sub,
        scopes: decoded.scope ? decoded.scope.split(' ') : [],
        expires_at: decoded.exp
      });
    } catch (error) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Invalid or expired token'
      });
    }
  });

  // POST /api/auth/cli/revoke - Revoke CLI tokens
  server.post('/api/auth/cli/revoke', {
    schema: {
      body: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          token_type_hint: { type: 'string', enum: ['access_token', 'refresh_token'] }
        },
        required: ['token']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      },
      tags: ['cli-auth'],
      summary: 'Revoke CLI token',
      description: 'Revokes a CLI access or refresh token'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.body as { token: string };

    // Try to find and revoke the token
    const { error } = await supabaseAdmin
      .from('cli_tokens')
      .update({ is_revoked: true, updated_at: new Date().toISOString() })
      .or(`access_token.eq.${token},refresh_token.eq.${token}`);

    if (error) {
      request.log.error({ error }, 'Failed to revoke CLI token');
    }

    // Always return success for security (don't reveal if token exists)
    return reply.send({ success: true });
  });
}

// Utility functions
function generateRandomCode(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateUserCode(): string {
  // Generate 6-digit human-friendly code (avoiding confusing characters)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}