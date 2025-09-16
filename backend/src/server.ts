/**
 * Fastify server setup for Onsembl.ai Backend
 * Configures plugins, routes, and WebSocket support
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import websocket from '@fastify/websocket';
import { config } from './config/index.js';
import { registerAuthDecorators } from './middleware/auth';
import { registerRequestIdMiddleware } from './middleware/request-id';
import { registerLoggingMiddleware } from './middleware/logging';
import { registerRateLimitingMiddleware } from './middleware/rate-limit';
import { registerCorsMiddleware } from './middleware/cors';
import { registerErrorHandler } from './middleware/error-handler';

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

/**
 * Create and configure Fastify server instance
 */
export async function createServer(): Promise<FastifyInstance> {
  // Initialize Fastify with Pino logger
  const server = Fastify({
    logger: config.nodeEnv === 'development' ? {
      level: config.logLevel,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    } : {
      level: config.logLevel,
    },
    trustProxy: true,
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
          server.log.warn(`WebSocket connection rejected: max connections (${config.wsMaxConnections}) reached`);
          return false;
        }
        return true;
      },
    },
  });

  // Health check endpoint
  server.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const response: HealthCheckResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.nodeEnv,
      version: process.env.npm_package_version || 'unknown',
    };

    return reply.code(200).send(response);
  });

  // Root endpoint
  server.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({
      message: 'Onsembl.ai Agent Control Center - Backend API',
      version: process.env.npm_package_version || 'unknown',
      timestamp: new Date().toISOString(),
      docs: '/docs',
    });
  });

  // WebSocket endpoint placeholder
  await server.register(async function (server) {
    server.get(config.wsPath, { websocket: true }, (connection, request) => {
      server.log.info('WebSocket connection established');

      connection.socket.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          server.log.debug({ data }, 'WebSocket message received');

          // Echo back for now (will be replaced with actual protocol implementation)
          connection.socket.send(JSON.stringify({
            type: 'echo',
            data,
            timestamp: new Date().toISOString(),
          }));
        } catch (error) {
          server.log.error({ error }, 'Failed to parse WebSocket message');
          connection.socket.send(JSON.stringify({
            type: 'error',
            message: 'Invalid JSON',
            timestamp: new Date().toISOString(),
          }));
        }
      });

      connection.socket.on('close', () => {
        server.log.info('WebSocket connection closed');
      });

      connection.socket.on('error', (error) => {
        server.log.error({ error }, 'WebSocket error');
      });

      // Send welcome message
      connection.socket.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to Onsembl.ai Agent Control Center',
        timestamp: new Date().toISOString(),
      }));
    });
  });

  // Global error handler
  server.setErrorHandler(async (error, request, reply) => {
    server.log.error({ error, url: request.url, method: request.method }, 'Request error');

    const statusCode = error.statusCode || 500;
    const message = config.nodeEnv === 'production' && statusCode === 500
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
      `Server listening on http://${config.host}:${config.port} (${config.nodeEnv})`
    );

    return server;
  } catch (error) {
    server.log.error({ error }, 'Failed to start server');
    throw error;
  }
}