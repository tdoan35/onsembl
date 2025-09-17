import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { AuthenticationError, AuthorizationError } from './error-handler';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    email: string;
    role?: string;
    metadata?: any;
  };
  token?: string;
}

/**
 * Verify JWT token from Authorization header
 */
async function verifyToken(token: string, secret: string): Promise<any> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

/**
 * Auth middleware for protected routes
 */
export async function authenticate(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'No authorization header provided',
      });
    }

    const [bearer, token] = authHeader.split(' ');

    if (bearer !== 'Bearer' || !token) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid authorization format. Use: Bearer <token>',
      });
    }

    // Verify JWT token
    const decoded = await verifyToken(
      token,
      process.env['JWT_SECRET'] || 'supersecret'
    );

    // Attach user info to request
    request.user = {
      id: decoded.sub || decoded.id,
      email: decoded.email,
      role: decoded.role,
      metadata: decoded.metadata,
    };
    request.token = token;

    return;
  } catch (error) {
    const err = error as any;

    if (err.name === 'TokenExpiredError') {
      return reply.code(401).send({
        error: 'Token Expired',
        message: 'Your session has expired. Please login again.',
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return reply.code(401).send({
        error: 'Invalid Token',
        message: 'The provided token is invalid.',
      });
    }

    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication failed',
    });
  }
}

/**
 * Supabase auth middleware - verifies Supabase JWT tokens
 */
export async function authenticateSupabase(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'No authorization header provided',
      });
    }

    const [bearer, token] = authHeader.split(' ');

    if (bearer !== 'Bearer' || !token) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid authorization format. Use: Bearer <token>',
      });
    }

    // Create Supabase client with the user's token
    const supabase = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_ANON_KEY']!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    // Verify the token by getting the user
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    // Attach user info to request
    request.user = {
      id: user.id,
      email: user.email!,
      role: user.role,
      metadata: user.user_metadata,
    };
    request.token = token;

    return;
  } catch (error) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication failed',
    });
  }
}

/**
 * Optional auth middleware - doesn't fail if no token provided
 */
export async function optionalAuth(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return; // No auth provided, continue without user
  }

  const [bearer, token] = authHeader.split(' ');

  if (bearer !== 'Bearer' || !token) {
    return; // Invalid format, continue without user
  }

  try {
    const decoded = await verifyToken(
      token,
      process.env['JWT_SECRET'] || 'supersecret'
    );

    request.user = {
      id: decoded.sub || decoded.id,
      email: decoded.email,
      role: decoded.role,
      metadata: decoded.metadata,
    };
    request.token = token;
  } catch {
    // Token invalid, continue without user
  }
}

/**
 * Role-based access control middleware
 */
export function requireRole(roles: string[]) {
  return async (request: AuthenticatedRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!request.user.role || !roles.includes(request.user.role)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    }
  };
}

/**
 * API key authentication for agent connections
 */
export async function authenticateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'No API key provided',
      });
    }

    // Verify API key against database
    // This is simplified - in production, check against database
    const validApiKeys = (process.env['VALID_API_KEYS'] || '').split(',');

    if (!validApiKeys.includes(apiKey)) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid API key',
      });
    }

    // Could attach agent info to request based on API key
    (request as any).apiKey = apiKey;

    return;
  } catch (error) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'API key authentication failed',
    });
  }
}

/**
 * WebSocket authentication for socket connections
 */
export async function authenticateWebSocket(
  connection: any,
  request: FastifyRequest
): Promise<any> {
  try {
    // Extract token from query params or headers
    const token =
      (request.query as any)?.token ||
      request.headers.authorization?.replace('Bearer ', '') ||
      request.headers['sec-websocket-protocol']?.replace('bearer, ', '');

    if (!token) {
      throw new AuthenticationError('No token provided for WebSocket connection');
    }

    // Verify JWT token
    const decoded = await verifyToken(
      token,
      process.env['JWT_SECRET'] || 'supersecret'
    );

    // Attach user info to connection
    connection.user = {
      id: decoded.sub || decoded.id,
      email: decoded.email,
      role: decoded.role,
      metadata: decoded.metadata,
    };
    connection.token = token;

    return connection;
  } catch (error) {
    throw new AuthenticationError('WebSocket authentication failed');
  }
}

/**
 * Route-level authentication decorator
 */
export function Protected(roles?: string[]) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const [request, reply] = args;

      // Authenticate user
      await authenticate(request, reply);

      // Check roles if specified
      if (roles && roles.length > 0) {
        const user = (request as AuthenticatedRequest).user;
        if (!user?.role || !roles.includes(user.role)) {
          throw new AuthorizationError('Insufficient permissions');
        }
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Token refresh handler
 */
export async function refreshToken(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  try {
    const currentToken = request.token;
    if (!currentToken) {
      throw new AuthenticationError('No token to refresh');
    }

    // Decode current token (even if expired)
    const decoded = jwt.decode(currentToken) as any;
    if (!decoded) {
      throw new AuthenticationError('Invalid token format');
    }

    // Generate new token with same payload but new expiry
    const newToken = jwt.sign(
      {
        sub: decoded.sub || decoded.id,
        email: decoded.email,
        role: decoded.role,
        metadata: decoded.metadata,
      },
      process.env['JWT_SECRET'] || 'supersecret',
      { expiresIn: process.env['JWT_EXPIRY'] || '1h' }
    );

    return reply.send({
      token: newToken,
      expiresIn: process.env['JWT_EXPIRY'] || '1h',
      user: {
        id: decoded.sub || decoded.id,
        email: decoded.email,
        role: decoded.role,
      },
    });
  } catch (error) {
    throw new AuthenticationError('Token refresh failed');
  }
}

/**
 * Register auth decorators and routes on Fastify instance
 */
export async function registerAuthDecorators(fastify: FastifyInstance) {
  // JWT plugin is already registered in server.ts
  // Just decorate fastify instance with auth methods
  fastify.decorate('authenticate', authenticate);
  fastify.decorate('authenticateSupabase', authenticateSupabase);
  fastify.decorate('optionalAuth', optionalAuth);
  fastify.decorate('requireRole', requireRole);
  fastify.decorate('authenticateApiKey', authenticateApiKey);
  fastify.decorate('authenticateWebSocket', authenticateWebSocket);
  fastify.decorate('refreshToken', refreshToken);

  // Add token refresh route
  fastify.post('/auth/refresh', {
    preHandler: [authenticate],
    handler: refreshToken,
  });

  fastify.log.info('Auth decorators and JWT plugin registered');
}