import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import pino from 'pino';
import { randomUUID } from 'crypto';

/**
 * Redact sensitive information from logs
 */
const redactPaths = [
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'res.headers.authorization',
  'password',
  'token',
  'secret',
  'apiKey',
  'credentials',
];

/**
 * Create Pino logger instance with configuration
 */
export function createLogger(config?: {
  level?: string;
  pretty?: boolean;
  redact?: string[];
}) {
  const isDevelopment = process.env['NODE_ENV'] === 'development';
  const level = config?.level || process.env['LOG_LEVEL'] || 'info';

  return pino({
    level,
    redact: {
      paths: [...redactPaths, ...(config?.redact || [])],
      censor: '[REDACTED]',
    },
    serializers: {
      req: (req: FastifyRequest) => ({
        id: (req as any).id,
        method: req.method,
        url: req.url,
        path: req.routerPath,
        parameters: req.params,
        headers: {
          host: req.headers.host,
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
        },
        remoteAddress: req.ip,
        remotePort: req.socket.remotePort,
      }),
      res: (res: FastifyReply) => ({
        statusCode: res.statusCode,
        headers: res.getHeaders(),
      }),
      err: pino.stdSerializers.err,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        hostname: bindings.hostname,
        node_version: process.version,
      }),
    },
    ...(isDevelopment && config?.pretty !== false
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
              singleLine: false,
              errorProps: 'message,stack',
            },
          },
        }
      : {}),
  });
}

/**
 * Logging middleware for structured logs
 */
export function loggingMiddleware(fastify: FastifyInstance) {
  // Request logging
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip health check logs to reduce noise
    if (request.url === '/health') {
      return;
    }

    request.log.debug({
      event: 'request_started',
      method: request.method,
      url: request.url,
      query: request.query,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  });

  // Response logging
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip health check logs
    if (request.url === '/health') {
      return;
    }

    const responseTime = reply.getResponseTime();
    const level = reply.statusCode >= 400 ? 'warn' : 'info';

    request.log[level]({
      event: 'request_completed',
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime,
      contentLength: reply.getHeader('content-length'),
    });
  });

  // Error logging
  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    request.log.error({
      event: 'request_error',
      method: request.method,
      url: request.url,
      error: {
        type: error.name,
        message: error.message,
        stack: error.stack,
      },
    });
  });

  // WebSocket logging
  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.websocket) {
      const originalHandler = routeOptions.handler as any;

      routeOptions.handler = function (connection: any, request: FastifyRequest) {
        const connectionId = randomUUID();

        request.log.info({
          event: 'websocket_connected',
          connectionId,
          url: request.url,
          ip: request.ip,
        });

        connection.socket.on('message', (message: any) => {
          request.log.debug({
            event: 'websocket_message_received',
            connectionId,
            messageSize: message.length,
          });
        });

        connection.socket.on('close', () => {
          request.log.info({
            event: 'websocket_disconnected',
            connectionId,
          });
        });

        connection.socket.on('error', (error: Error) => {
          request.log.error({
            event: 'websocket_error',
            connectionId,
            error: {
              type: error.name,
              message: error.message,
            },
          });
        });

        return originalHandler.call(this, connection, request);
      };
    }
  });
}

/**
 * Audit logging for important actions
 */
export function auditLogger(fastify: FastifyInstance) {
  const auditLog = createLogger({
    level: 'info',
    pretty: false, // Always use JSON for audit logs
  }).child({ component: 'audit' });

  // Store audit logger on fastify instance
  (fastify as any).audit = auditLog;

  // Audit specific routes
  const auditRoutes = [
    '/auth/login',
    '/auth/logout',
    '/agents',
    '/commands',
    '/emergency-stop',
  ];

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    // Check if this route should be audited
    const shouldAudit = auditRoutes.some(route => request.url.startsWith(route));

    if (shouldAudit && reply.statusCode < 400) {
      auditLog.info({
        event: 'audit_action',
        action: `${request.method} ${request.url}`,
        user: (request as any).user?.id || 'anonymous',
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: (request as any).id,
        statusCode: reply.statusCode,
        timestamp: new Date().toISOString(),
      });
    }
  });
}

/**
 * Performance logging for slow operations
 */
export function performanceLogger(fastify: FastifyInstance) {
  const perfLog = createLogger({
    level: 'warn',
  }).child({ component: 'performance' });

  const slowThreshold = parseInt(process.env['SLOW_REQUEST_THRESHOLD'] || '1000', 10);
  const verySlowThreshold = parseInt(process.env['VERY_SLOW_REQUEST_THRESHOLD'] || '5000', 10);

  // Track request timing details
  const requestTiming = new Map<string, {
    startTime: number;
    dbQueries: number;
    externalCalls: number;
    memoryUsage: NodeJS.MemoryUsage;
  }>();

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const requestId = (request as any).id;
    if (requestId) {
      requestTiming.set(requestId, {
        startTime: process.hrtime.bigint(),
        dbQueries: 0,
        externalCalls: 0,
        memoryUsage: process.memoryUsage(),
      });
    }
  });

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const responseTime = reply.getResponseTime();
    const requestId = (request as any).id;
    const timing = requestTiming.get(requestId);

    if (timing) {
      const endTime = process.hrtime.bigint();
      const totalTime = Number(endTime - timing.startTime) / 1000000; // Convert to milliseconds
      const currentMemory = process.memoryUsage();

      // Calculate memory delta
      const memoryDelta = {
        heapUsed: currentMemory.heapUsed - timing.memoryUsage.heapUsed,
        heapTotal: currentMemory.heapTotal - timing.memoryUsage.heapTotal,
        external: currentMemory.external - timing.memoryUsage.external,
        rss: currentMemory.rss - timing.memoryUsage.rss,
      };

      if (responseTime > slowThreshold) {
        const logLevel = responseTime > verySlowThreshold ? 'error' : 'warn';

        perfLog[logLevel]({
          event: responseTime > verySlowThreshold ? 'very_slow_request' : 'slow_request',
          method: request.method,
          url: request.url,
          responseTime,
          totalTime,
          threshold: slowThreshold,
          dbQueries: timing.dbQueries,
          externalCalls: timing.externalCalls,
          memoryDelta,
          statusCode: reply.statusCode,
          requestId,
          userAgent: request.headers['user-agent'],
          ip: request.ip,
        });
      }

      // Track performance metrics
      if (responseTime > 100) { // Log performance data for requests > 100ms
        perfLog.info({
          event: 'performance_metrics',
          method: request.method,
          url: request.url,
          responseTime,
          totalTime,
          memoryDelta,
          statusCode: reply.statusCode,
          requestId,
        });
      }

      requestTiming.delete(requestId);
    }
  });

  // Track database query timing (if using an ORM that supports hooks)
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const requestId = (request as any).id;
    if (requestId && requestTiming.has(requestId)) {
      // Add DB query counter to request context
      (request as any).incrementDbQuery = () => {
        const timing = requestTiming.get(requestId);
        if (timing) {
          timing.dbQueries++;
        }
      };

      (request as any).incrementExternalCall = () => {
        const timing = requestTiming.get(requestId);
        if (timing) {
          timing.externalCalls++;
        }
      };
    }
  });
}

/**
 * Security logging for suspicious activities
 */
export function securityLogger(fastify: FastifyInstance) {
  const secLog = createLogger({
    level: 'warn',
  }).child({ component: 'security' });

  // Log authentication failures
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    if (reply.statusCode === 401 || reply.statusCode === 403) {
      secLog.warn({
        event: 'auth_failure',
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: (request as any).id,
      });
    }
  });

  // Log potential security issues
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    // Check for SQL injection patterns (basic check)
    const suspicious = /(\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|\bdrop\b|\bunion\b)/i;
    const url = request.url;
    const body = JSON.stringify(request.body);

    if (suspicious.test(url) || suspicious.test(body)) {
      secLog.warn({
        event: 'suspicious_request',
        reason: 'Potential SQL injection pattern',
        method: request.method,
        url: request.url,
        ip: request.ip,
        requestId: (request as any).id,
      });
    }

    // Check for path traversal attempts
    if (url.includes('../') || url.includes('..\\')) {
      secLog.warn({
        event: 'suspicious_request',
        reason: 'Path traversal attempt',
        method: request.method,
        url: request.url,
        ip: request.ip,
        requestId: (request as any).id,
      });
    }
  });
}

/**
 * Register all logging middleware
 */
export function registerLoggingMiddleware(fastify: FastifyInstance) {
  loggingMiddleware(fastify);
  auditLogger(fastify);
  performanceLogger(fastify);
  securityLogger(fastify);

  fastify.log.info('Logging middleware registered');
}