import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

export interface CorsOptions {
  origin?: boolean | string | RegExp | (string | RegExp)[] | ((origin: string, callback: (err: Error | null, allow?: boolean) => void) => void);
  credentials?: boolean;
  exposedHeaders?: string | string[];
  allowedHeaders?: string | string[];
  methods?: string | string[];
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
  preflight?: boolean;
  strictPreflight?: boolean;
  hideOptionsRoute?: boolean;
}

/**
 * Get CORS configuration based on environment
 */
export function getCorsConfig(): CorsOptions {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';

  // Parse allowed origins from environment
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001',
  ];

  if (isDevelopment) {
    // Permissive CORS in development
    return {
      origin: true, // Allow all origins
      credentials: true,
      exposedHeaders: [
        'x-request-id',
        'x-correlation-id',
        'x-ratelimit-limit',
        'x-ratelimit-remaining',
        'x-ratelimit-reset',
      ],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-api-key',
        'x-request-id',
        'x-correlation-id',
        'x-trace-id',
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      preflight: true,
      optionsSuccessStatus: 204,
    };
  }

  if (isProduction) {
    // Strict CORS in production
    return {
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g., mobile apps, Postman)
        if (!origin) {
          return callback(null, true);
        }

        // Check if origin is in allowed list
        const isAllowed = allowedOrigins.some(allowed => {
          if (allowed instanceof RegExp) {
            return allowed.test(origin);
          }
          return allowed === origin;
        });

        if (isAllowed) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      exposedHeaders: [
        'x-request-id',
        'x-ratelimit-limit',
        'x-ratelimit-remaining',
        'x-ratelimit-reset',
      ],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-api-key',
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      preflight: true,
      strictPreflight: true,
      optionsSuccessStatus: 204,
    };
  }

  // Default configuration
  return {
    origin: allowedOrigins,
    credentials: true,
    exposedHeaders: ['x-request-id'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 204,
  };
}

/**
 * Configure CORS for WebSocket connections
 */
export function configureWebSocketCors(fastify: FastifyInstance) {
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001',
  ];

  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.websocket) {
      const originalHandler = routeOptions.handler as any;

      routeOptions.handler = function (connection: any, request: any) {
        const origin = request.headers.origin;

        // Check origin for WebSocket connections
        if (origin && process.env.NODE_ENV === 'production') {
          const isAllowed = allowedOrigins.includes(origin);

          if (!isAllowed) {
            fastify.log.warn({ origin }, 'WebSocket connection rejected due to CORS');
            connection.socket.close(1008, 'Origin not allowed');
            return;
          }
        }

        // Add CORS headers to WebSocket upgrade response
        connection.socket.on('headers', (headers: string[]) => {
          if (origin) {
            headers.push(`Access-Control-Allow-Origin: ${origin}`);
            headers.push('Access-Control-Allow-Credentials: true');
          }
        });

        return originalHandler.call(this, connection, request);
      };
    }
  });
}

/**
 * Security headers middleware
 */
export function securityHeaders(fastify: FastifyInstance) {
  fastify.addHook('onSend', async (request, reply, payload) => {
    // Security headers
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy
    if (process.env.NODE_ENV === 'production') {
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "font-src 'self' data:; " +
        "connect-src 'self' wss: https:; " +
        "frame-ancestors 'none';"
      );
    }

    // Strict Transport Security (HSTS)
    if (process.env.NODE_ENV === 'production' && request.protocol === 'https') {
      reply.header(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    }

    // Remove server header
    reply.removeHeader('Server');
    reply.header('Server', 'Onsembl.ai');

    return payload;
  });
}

/**
 * Configure API versioning headers
 */
export function apiVersioning(fastify: FastifyInstance) {
  const apiVersion = process.env.API_VERSION || '1.0.0';

  fastify.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-API-Version', apiVersion);
    return payload;
  });

  // Support version in Accept header
  fastify.addHook('onRequest', async (request, reply) => {
    const acceptHeader = request.headers.accept;

    if (acceptHeader && acceptHeader.includes('version=')) {
      const match = acceptHeader.match(/version=(\d+\.\d+\.\d+)/);
      if (match) {
        const requestedVersion = match[1];

        // Check if requested version is supported
        if (requestedVersion !== apiVersion) {
          request.log.warn(
            { requestedVersion, currentVersion: apiVersion },
            'API version mismatch'
          );

          // Could implement version routing here
          // For now, just add a warning header
          reply.header('X-API-Version-Warning', `Requested version ${requestedVersion} not available, using ${apiVersion}`);
        }
      }
    }
  });
}

/**
 * Configure cache control headers
 */
export function cacheControl(fastify: FastifyInstance) {
  fastify.addHook('onSend', async (request, reply, payload) => {
    // No cache for API responses by default
    if (!reply.hasHeader('Cache-Control')) {
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
    }

    // Allow caching for static assets
    if (request.url.startsWith('/static/') || request.url.startsWith('/public/')) {
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    }

    // Short cache for health checks
    if (request.url === '/health') {
      reply.header('Cache-Control', 'public, max-age=5');
    }

    return payload;
  });
}

/**
 * Register CORS and security middleware
 */
export async function registerCorsMiddleware(fastify: FastifyInstance) {
  // Register CORS plugin
  await fastify.register(cors, getCorsConfig());

  // Configure WebSocket CORS
  configureWebSocketCors(fastify);

  // Add security headers
  securityHeaders(fastify);

  // Add API versioning
  apiVersioning(fastify);

  // Add cache control
  cacheControl(fastify);

  fastify.log.info('CORS and security middleware registered');
}