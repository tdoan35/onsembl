import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';

/**
 * Generate request ID in format: req-{timestamp}-{random}
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomUUID().replace(/-/g, '').substring(0, 8);
  return `req-${timestamp}-${random}`;
}

/**
 * Request ID middleware - adds unique ID to each request for tracing
 */
export function requestIdMiddleware(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Check if request already has an ID (from proxy or client)
    const existingId =
      request.headers['x-request-id'] ||
      request.headers['x-correlation-id'] ||
      request.headers['x-trace-id'];

    // Generate or use existing ID
    const requestId = (existingId as string) || generateRequestId();

    // Attach to request and reply
    (request as any).id = requestId;
    reply.header('x-request-id', requestId);

    // Add to logger context
    request.log = fastify.log.child({ requestId });
  });

  // Log request details
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    request.log.info({
      method: request.method,
      url: request.url,
      headers: {
        'user-agent': request.headers['user-agent'],
        'content-type': request.headers['content-type'],
        'content-length': request.headers['content-length'],
      },
      ip: request.ip,
      hostname: request.hostname,
    }, 'Request received');
  });

  // Log response details
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const responseTime = reply.getResponseTime();

    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: `${responseTime.toFixed(2)}ms`,
    }, 'Request completed');

    // Log slow requests
    if (responseTime > 1000) {
      request.log.warn({
        method: request.method,
        url: request.url,
        responseTime: `${responseTime.toFixed(2)}ms`,
      }, 'Slow request detected');
    }
  });

  // Add request ID to error responses
  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    const requestId = (request as any).id;

    request.log.error({
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      method: request.method,
      url: request.url,
    }, 'Request error');

    // Ensure error response includes request ID
    if (!reply.sent) {
      reply.header('x-request-id', requestId);
    }
  });
}

/**
 * Correlation ID middleware for distributed tracing
 */
export function correlationIdMiddleware(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Check for existing correlation ID
    const correlationId =
      request.headers['x-correlation-id'] ||
      (request as any).id ||
      generateRequestId();

    // Attach to request
    (request as any).correlationId = correlationId;

    // Add to response headers
    reply.header('x-correlation-id', correlationId);

    // Add to logger context
    if (request.log) {
      request.log = request.log.child({ correlationId });
    }
  });
}

/**
 * Trace context middleware for OpenTelemetry compatibility
 */
export function traceContextMiddleware(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Parse W3C Trace Context headers
    const traceparent = request.headers['traceparent'] as string;
    const tracestate = request.headers['tracestate'] as string;

    if (traceparent) {
      // Parse traceparent: version-trace-id-parent-id-trace-flags
      const parts = traceparent.split('-');
      if (parts.length === 4) {
        const [version, traceId, parentId, traceFlags] = parts;

        (request as any).trace = {
          version,
          traceId,
          parentId,
          traceFlags,
          tracestate,
        };

        // Add to logger context
        if (request.log) {
          request.log = request.log.child({
            traceId,
            parentId,
          });
        }
      }
    } else {
      // Generate new trace context
      const traceId = randomUUID().replace(/-/g, '');
      const parentId = randomUUID().replace(/-/g, '').substring(0, 16);

      (request as any).trace = {
        version: '00',
        traceId,
        parentId,
        traceFlags: '01',
        tracestate: '',
      };

      // Add traceparent header to response
      reply.header('traceparent', `00-${traceId}-${parentId}-01`);
    }
  });
}

/**
 * Register all request ID related middleware
 */
export function registerRequestIdMiddleware(fastify: FastifyInstance) {
  requestIdMiddleware(fastify);
  correlationIdMiddleware(fastify);

  // Only add trace context in production or if explicitly enabled
  if (process.env['ENABLE_TRACING'] === 'true' || process.env['NODE_ENV'] === 'production') {
    traceContextMiddleware(fastify);
  }

  fastify.log.info('Request ID middleware registered');
}