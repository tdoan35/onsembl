/**
 * Fastify server setup for Onsembl.ai Backend
 * Configures plugins, routes, and WebSocket support
 */

import Fastify, {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import websocket from '@fastify/websocket';
import fastifyJWT from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import { config } from './config/index';
import { registerAuthDecorators } from './middleware/auth';
import { registerRequestIdMiddleware } from './middleware/request-id';
import { registerLoggingMiddleware } from './middleware/logging';
import { registerRateLimitingMiddleware } from './middleware/rate-limit';
import { registerCorsMiddleware } from './middleware/cors';
import { registerErrorHandler } from './middleware/error-handler';

// Services
import { AgentService } from './services/agent.service';
import { CommandService } from './services/command.service';
import { AuthService } from './services/auth.service';
import { AuditService } from './services/audit.service';

// API Routes
import { registerAuthRoutes } from './api/auth';
import { registerAgentRoutes } from './api/agents';
import { registerCommandRoutes } from './api/commands';
import { registerPresetRoutes } from './api/presets';
import { registerReportRoutes } from './api/reports';
import { registerSystemRoutes } from './api/system';
import { registerConstraintRoutes } from './api/constraints';

/**
 * Health check response interface
 */
interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
}

export interface Services {
  agentService: AgentService;
  commandService: CommandService;
  authService: AuthService;
  auditService: AuditService;
}

// Services will be initialized in createServer
let services: Services;

/**
 * Create and configure Fastify server instance
 */
export async function createServer(): Promise<FastifyInstance> {
  // Initialize Fastify with Pino logger
  const server = Fastify({
    logger:
      config.nodeEnv === 'development'
        ? {
            level: config.logLevel,
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            },
          }
        : {
            level: config.logLevel,
          },
    trustProxy: true,
  });

  // Initialize Supabase client (optional for development)
  let supabaseClient = null;
  try {
    if (
      config.SUPABASE_URL &&
      config.SUPABASE_URL !== 'http://localhost:54321'
    ) {
      const { createClient } = await import('@supabase/supabase-js');
      supabaseClient = createClient(
        config.SUPABASE_URL,
        config.SUPABASE_ANON_KEY,
      );
      server.log.info('Supabase client initialized');
    } else {
      server.log.warn('Running in mock mode without Supabase');
    }
  } catch (error) {
    server.log.warn(
      { error },
      'Failed to initialize Supabase client, running in mock mode',
    );
  }

  // Initialize services with dependencies
  // For now, create mock services if Supabase is not available
  if (supabaseClient) {
    services = {
      agentService: new AgentService(supabaseClient as any, server),
      commandService: new CommandService(supabaseClient as any, server, null),
      authService: new AuthService(server, supabaseClient as any),
      auditService: new AuditService(server, {}, supabaseClient as any),
    };
  } else {
    // Create mock services for development without database
    server.log.warn(
      'Creating mock services - database operations will not work',
    );
    services = {
      agentService: {} as AgentService,
      commandService: {} as CommandService,
      authService: {} as AuthService,
      auditService: {} as AuditService,
    };
  }

  // Attach services to server instance for access in routes
  server.decorate('services', services);

  // Register JWT plugin
  await server.register(fastifyJWT, {
    secret: config.JWT_SECRET || 'supersecretkey',
    sign: {
      expiresIn: '24h',
    },
  });

  // Register Swagger documentation
  await server.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Onsembl.ai Control Center API',
        description: 'API for orchestrating AI coding agents',
        version: process.env['npm_package_version'] || '1.0.0',
      },
      servers: [
        {
          url: config.API_URL || `http://${config.host}:${config.port}`,
          description:
            config.nodeEnv === 'production'
              ? 'Production server'
              : 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await server.register(fastifySwaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // Register middleware
  registerRequestIdMiddleware(server);
  registerLoggingMiddleware(server);
  await registerCorsMiddleware(server);
  registerRateLimitingMiddleware(server);
  registerAuthDecorators(server);
  registerErrorHandler(server);

  // Register WebSocket plugin
  await server.register(websocket, {
    options: {
      maxPayload: config.wsMaxPayload,
      verifyClient: (info: any) => {
        // Basic connection limit
        const connections = server.websocketServer?.clients.size || 0;
        if (connections >= config.wsMaxConnections) {
          server.log.warn(
            `WebSocket connection rejected: max connections (${config.wsMaxConnections}) reached`,
          );
          return false;
        }
        return true;
      },
    },
  });

  // Health check endpoint
  server.get(
    '/health',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response: HealthCheckResponse = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.nodeEnv,
        version: process.env['npm_package_version'] || 'unknown',
      };

      return reply.code(200).send(response);
    },
  );

  // Root endpoint
  server.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({
      message: 'Onsembl.ai Agent Control Center - Backend API',
      version: process.env['npm_package_version'] || 'unknown',
      timestamp: new Date().toISOString(),
      docs: '/docs',
    });
  });

  // Register API routes
  await registerAuthRoutes(server, services);
  await registerAgentRoutes(server, services);
  await registerCommandRoutes(server, services);
  await registerPresetRoutes(server, services);
  await registerReportRoutes(server, services);
  await registerSystemRoutes(server, services);
  await registerConstraintRoutes(server, services);

  // Add basic test routes for now
  server.get('/api/test', async () => ({
    message: 'Backend is running!',
  }));

  // WebSocket endpoints
  await server.register(async function (server) {
    // Agent WebSocket endpoint
    server.get('/ws/agent', { websocket: true }, (connection, request) => {
      server.log.info(
        { remoteAddress: request.socket.remoteAddress },
        'Agent WebSocket connection established',
      );

      connection.socket.on('message', message => {
        try {
          const data = JSON.parse(message.toString());
          server.log.debug({ data }, 'Agent message received');

          // Will be implemented in T091
          connection.socket.send(
            JSON.stringify({
              type: 'ack',
              timestamp: new Date().toISOString(),
            }),
          );
        } catch (error) {
          server.log.error({ error }, 'Failed to parse agent message');
        }
      });

      connection.socket.on('close', () => {
        server.log.info('Agent WebSocket connection closed');
      });

      connection.socket.on('error', error => {
        server.log.error({ error }, 'Agent WebSocket error');
      });
    });

    // Dashboard WebSocket endpoint
    server.get('/ws/dashboard', { websocket: true }, (connection, request) => {
      server.log.info(
        { remoteAddress: request.socket.remoteAddress },
        'Dashboard WebSocket connection established',
      );

      connection.socket.on('message', message => {
        try {
          const data = JSON.parse(message.toString());
          server.log.debug({ data }, 'Dashboard message received');

          // Will be implemented in T092
          connection.socket.send(
            JSON.stringify({
              type: 'ack',
              timestamp: new Date().toISOString(),
            }),
          );
        } catch (error) {
          server.log.error({ error }, 'Failed to parse dashboard message');
          connection.socket.send(
            JSON.stringify({
              type: 'error',
              message: 'Invalid JSON',
              timestamp: new Date().toISOString(),
            }),
          );
        }
      });

      connection.socket.on('close', () => {
        server.log.info('Dashboard WebSocket connection closed');
      });

      connection.socket.on('error', error => {
        server.log.error({ error }, 'Dashboard WebSocket error');
      });
    });
  });

  // Global error handler
  server.setErrorHandler(async (error, request, reply) => {
    server.log.error(
      { error, url: request.url, method: request.method },
      'Request error',
    );

    const statusCode = error.statusCode || 500;
    const message =
      config.nodeEnv === 'production' && statusCode === 500
        ? 'Internal Server Error'
        : error.message;

    return reply.code(statusCode).send({
      error: {
        message,
        statusCode,
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    server.log.info(`Received ${signal}, shutting down gracefully`);
    try {
      await server.close();
      server.log.info('Server closed successfully');
      process.exit(0);
    } catch (error) {
      server.log.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  return server;
}

/**
 * Start the server
 */
export async function startServer(): Promise<FastifyInstance> {
  const server = await createServer();

  try {
    await server.listen({
      port: config.port,
      host: config.host,
    });

    server.log.info(
      `Server listening on http://${config.host}:${config.port} (${config.nodeEnv})`,
    );

    return server;
  } catch (error) {
    server.log.error({ error }, 'Failed to start server');
    throw error;
  }
}
