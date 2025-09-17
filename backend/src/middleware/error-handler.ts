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

export class TimeoutError extends Error implements AppError {
  statusCode = 408;
  code = 'REQUEST_TIMEOUT';
  isOperational = true;

  constructor(operation: string, timeout: number) {
    super(`${operation} timed out after ${timeout}ms`);
    this.name = 'TimeoutError';
  }
}

export class PayloadTooLargeError extends Error implements AppError {
  statusCode = 413;
  code = 'PAYLOAD_TOO_LARGE';
  isOperational = true;

  constructor(maxSize: string) {
    super(`Request payload exceeds maximum size of ${maxSize}`);
    this.name = 'PayloadTooLargeError';
  }
}

/**
 * Error response formatter
 */
function formatErrorResponse(error: AppError, requestId?: string) {
  const isDevelopment = process.env['NODE_ENV'] === 'development';

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
 * Enhanced error classification
 */
function classifyError(error: FastifyError | AppError): {
  category: 'client' | 'server' | 'network' | 'validation' | 'auth' | 'rate_limit' | 'timeout';
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoverable: boolean;
} {
  const statusCode = (error as AppError).statusCode || 500;

  // Client errors (4xx)
  if (statusCode >= 400 && statusCode < 500) {
    if (statusCode === 401 || statusCode === 403) {
      return { category: 'auth', severity: 'medium', recoverable: true };
    }
    if (statusCode === 429) {
      return { category: 'rate_limit', severity: 'low', recoverable: true };
    }
    if (statusCode === 408) {
      return { category: 'timeout', severity: 'medium', recoverable: true };
    }
    if (statusCode === 400 || statusCode === 422) {
      return { category: 'validation', severity: 'low', recoverable: true };
    }
    return { category: 'client', severity: 'low', recoverable: true };
  }

  // Server errors (5xx)
  if (statusCode >= 500) {
    if (statusCode === 503) {
      return { category: 'network', severity: 'high', recoverable: true };
    }
    if (statusCode === 500) {
      return { category: 'server', severity: 'critical', recoverable: false };
    }
    return { category: 'server', severity: 'high', recoverable: false };
  }

  return { category: 'server', severity: 'medium', recoverable: false };
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
  const classification = classifyError(error);

  // Enhanced error logging with classification
  const logLevel = classification.severity === 'critical' ? 'fatal' :
                   classification.severity === 'high' ? 'error' :
                   classification.severity === 'medium' ? 'warn' : 'info';

  request.log[logLevel]({
    error: {
      message: error.message,
      code: (error as AppError).code,
      statusCode: (error as AppError).statusCode,
      stack: error.stack,
      details: (error as AppError).details,
      classification,
    },
    requestId,
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
    ip: request.ip,
    correlationId: (request as any).correlationId,
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

  // Handle connection timeout errors
  if (error.message?.includes('timeout') || error.message?.includes('TIMEOUT')) {
    return reply.status(408).send(
      formatErrorResponse(
        new TimeoutError('Request operation', 30000),
        requestId
      )
    );
  }

  // Handle CORS errors
  if (error.message?.includes('CORS') || error.message?.includes('Origin')) {
    return reply.status(403).send(
      formatErrorResponse(
        new AuthorizationError('Cross-origin request not allowed'),
        requestId
      )
    );
  }

  // Handle payload size errors
  if (error.message?.includes('Payload too large') || (error as any).code === 'FST_REQ_FILE_TOO_LARGE') {
    return reply.status(413).send(
      formatErrorResponse(
        new PayloadTooLargeError('10MB'),
        requestId
      )
    );
  }

  // Handle rate limit errors from external services
  if (error.message?.includes('rate limit') || error.message?.includes('Too Many Requests')) {
    return reply.status(429).send(
      formatErrorResponse(
        new RateLimitError('External service rate limit exceeded'),
        requestId
      )
    );
  }

  // Default to 500 Internal Server Error
  const statusCode = (error as AppError).statusCode || 500;
  const isProduction = process.env['NODE_ENV'] === 'production';

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
 * Error monitoring and alerting
 */
class ErrorMonitor {
  private errorCounts: Map<string, number> = new Map();
  private errorRates: Map<string, { count: number; timestamp: number }> = new Map();
  private criticalErrors: Set<string> = new Set();

  trackError(error: AppError | FastifyError, classification: any) {
    const errorKey = `${error.name}:${(error as AppError).code || 'UNKNOWN'}`;

    // Track error counts
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);

    // Track error rates (per minute)
    const now = Date.now();
    const minuteKey = `${errorKey}:${Math.floor(now / 60000)}`;
    const current = this.errorRates.get(minuteKey) || { count: 0, timestamp: now };
    current.count++;
    this.errorRates.set(minuteKey, current);

    // Alert on critical errors
    if (classification.severity === 'critical') {
      this.criticalErrors.add(errorKey);
    }

    // Alert on high error rates (>10 errors per minute)
    if (current.count > 10) {
      console.warn(`High error rate detected: ${errorKey} - ${current.count} errors in last minute`);
    }

    // Clean old error rate data (keep last 5 minutes)
    const fiveMinutesAgo = Math.floor((now - 300000) / 60000);
    for (const [key] of this.errorRates.entries()) {
      const minute = parseInt(key.split(':').pop() || '0');
      if (minute < fiveMinutesAgo) {
        this.errorRates.delete(key);
      }
    }
  }

  getErrorStats() {
    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0),
      errorBreakdown: Object.fromEntries(this.errorCounts),
      criticalErrors: Array.from(this.criticalErrors),
      recentRates: Object.fromEntries(
        Array.from(this.errorRates.entries())
          .filter(([key]) => {
            const minute = parseInt(key.split(':').pop() || '0');
            return minute >= Math.floor((Date.now() - 300000) / 60000);
          })
      ),
    };
  }
}

const errorMonitor = new ErrorMonitor();

/**
 * Circuit breaker for error handling
 */
class ErrorCircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private readonly threshold: number = 5;
  private readonly timeout: number = 60000; // 1 minute

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      console.warn('Error circuit breaker opened due to high failure rate');
    }
  }

  recordSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  canProceed(): boolean {
    if (this.state === 'CLOSED') return true;

    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }

    return true; // HALF_OPEN
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

const circuitBreaker = new ErrorCircuitBreaker();

/**
 * Register error handling middleware
 */
export function registerErrorHandler(fastify: FastifyInstance) {
  // Set custom error handler
  fastify.setErrorHandler((error, request, reply) => {
    const classification = classifyError(error);

    // Track error in monitor
    errorMonitor.trackError(error, classification);

    // Update circuit breaker
    if (classification.severity === 'critical' || classification.severity === 'high') {
      circuitBreaker.recordFailure();
    }

    // Call the main error handler
    return errorHandler(error, request, reply);
  });

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

  // Add health check that includes error monitoring
  fastify.get('/health/errors', async (request, reply) => {
    return {
      errorStats: errorMonitor.getErrorStats(),
      circuitBreaker: circuitBreaker.getState(),
      timestamp: new Date().toISOString(),
    };
  });

  // Success tracking for circuit breaker
  fastify.addHook('onResponse', async (request, reply) => {
    if (reply.statusCode < 400) {
      circuitBreaker.recordSuccess();
    }
  });

  fastify.log.info('Enhanced error handler middleware registered');
}