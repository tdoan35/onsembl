import { FastifyRequest, FastifyReply, FastifyInstance, FastifyError } from 'fastify';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
  isOperational?: boolean;
}

/**
 * Custom error classes
 */
export class ValidationError extends Error implements AppError {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  isOperational = true;

  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error implements AppError {
  statusCode = 401;
  code = 'AUTHENTICATION_ERROR';
  isOperational = true;

  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error implements AppError {
  statusCode = 403;
  code = 'AUTHORIZATION_ERROR';
  isOperational = true;

  constructor(message = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error implements AppError {
  statusCode = 404;
  code = 'NOT_FOUND';
  isOperational = true;

  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error implements AppError {
  statusCode = 409;
  code = 'CONFLICT';
  isOperational = true;

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends Error implements AppError {
  statusCode = 429;
  code = 'RATE_LIMIT_EXCEEDED';
  isOperational = true;

  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class ServiceUnavailableError extends Error implements AppError {
  statusCode = 503;
  code = 'SERVICE_UNAVAILABLE';
  isOperational = true;

  constructor(service: string) {
    super(`${service} is currently unavailable`);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Error response formatter
 */
function formatErrorResponse(error: AppError, requestId?: string) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return {
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
      statusCode: error.statusCode || 500,
      details: isDevelopment ? error.details : undefined,
      stack: isDevelopment ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
}

/**
 * Global error handler
 */
export function errorHandler(
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = (request as any).id;

  // Log the error
  request.log.error({
    error: {
      message: error.message,
      code: (error as AppError).code,
      statusCode: (error as AppError).statusCode,
      stack: error.stack,
      details: (error as AppError).details,
    },
    requestId,
    method: request.method,
    url: request.url,
  });

  // Handle Fastify validation errors
  if ((error as FastifyError).validation) {
    return reply.status(400).send(
      formatErrorResponse(
        new ValidationError('Request validation failed', (error as FastifyError).validation),
        requestId
      )
    );
  }

  // Handle custom app errors
  if ((error as AppError).isOperational) {
    const statusCode = (error as AppError).statusCode || 500;
    return reply.status(statusCode).send(formatErrorResponse(error as AppError, requestId));
  }

  // Handle Supabase errors
  if (error.message?.includes('PGRST')) {
    let statusCode = 500;
    let message = 'Database error';

    if (error.message.includes('PGRST116')) {
      statusCode = 404;
      message = 'Resource not found';
    } else if (error.message.includes('PGRST301')) {
      statusCode = 401;
      message = 'Authentication required';
    } else if (error.message.includes('PGRST204')) {
      statusCode = 403;
      message = 'Insufficient permissions';
    }

    return reply.status(statusCode).send(
      formatErrorResponse(
        {
          ...error,
          statusCode,
          message,
          code: 'DATABASE_ERROR',
        } as AppError,
        requestId
      )
    );
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    return reply.status(401).send(
      formatErrorResponse(
        new AuthenticationError(error.message),
        requestId
      )
    );
  }

  // Handle Redis/BullMQ errors
  if (error.message?.includes('Redis') || error.message?.includes('Queue')) {
    return reply.status(503).send(
      formatErrorResponse(
        new ServiceUnavailableError('Queue service'),
        requestId
      )
    );
  }

  // Default to 500 Internal Server Error
  const statusCode = (error as AppError).statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  return reply.status(statusCode).send(
    formatErrorResponse(
      {
        ...error,
        statusCode,
        message: isProduction ? 'An unexpected error occurred' : error.message,
        code: 'INTERNAL_ERROR',
      } as AppError,
      requestId
    )
  );
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<any>
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await handler(request, reply);
    } catch (error) {
      throw error; // Will be caught by the error handler
    }
  };
}

/**
 * Not found handler
 */
export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  const requestId = (request as any).id;

  return reply.status(404).send(
    formatErrorResponse(
      new NotFoundError('Route'),
      requestId
    )
  );
}

/**
 * Shutdown handler for graceful shutdown
 */
export function createShutdownHandler(fastify: FastifyInstance) {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    fastify.log.info(`Received ${signal}, starting graceful shutdown...`);

    // Set a timeout for forceful shutdown
    const forceShutdownTimeout = setTimeout(() => {
      fastify.log.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, 30000); // 30 seconds

    try {
      // Stop accepting new connections
      await fastify.close();

      // Clean up resources
      const agentService = (fastify as any).agentService;
      const commandService = (fastify as any).commandService;

      if (agentService) {
        await agentService.cleanup();
      }

      if (commandService) {
        await commandService.cleanup();
      }

      clearTimeout(forceShutdownTimeout);
      fastify.log.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      fastify.log.error({ error }, 'Error during graceful shutdown');
      clearTimeout(forceShutdownTimeout);
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    fastify.log.fatal({ error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    fastify.log.fatal({ reason, promise }, 'Unhandled rejection');
    shutdown('unhandledRejection');
  });

  // Health check that respects shutdown state
  fastify.addHook('onRequest', async (request, reply) => {
    if (isShuttingDown && request.url === '/health') {
      return reply.status(503).send({
        status: 'shutting_down',
        message: 'Server is shutting down',
      });
    }
  });
}

/**
 * Register error handling middleware
 */
export function registerErrorHandler(fastify: FastifyInstance) {
  // Set custom error handler
  fastify.setErrorHandler(errorHandler);

  // Set not found handler
  fastify.setNotFoundHandler(notFoundHandler);

  // Create shutdown handler
  createShutdownHandler(fastify);

  // Add error serializer for better logging
  fastify.addHook('onError', async (request, reply, error) => {
    // Add context to errors
    (error as any).context = {
      method: request.method,
      url: request.url,
      params: request.params,
      query: request.query,
      headers: {
        'user-agent': request.headers['user-agent'],
        'content-type': request.headers['content-type'],
      },
      ip: request.ip,
      requestId: (request as any).id,
    };
  });

  fastify.log.info('Error handler middleware registered');
}