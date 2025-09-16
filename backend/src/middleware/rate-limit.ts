import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { LRUCache } from 'lru-cache';

interface RateLimitOptions {
  max: number;
  window: number; // in milliseconds
  keyGenerator?: (request: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  allowList?: string[];
  blockList?: string[];
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * In-memory rate limiter using LRU cache
 */
class RateLimiter {
  private cache: LRUCache<string, RateLimitEntry>;

  constructor(private options: RateLimitOptions) {
    this.cache = new LRUCache<string, RateLimitEntry>({
      max: 10000, // Maximum number of keys to store
      ttl: options.window,
    });
  }

  async check(key: string): Promise<{
    allowed: boolean;
    limit: number;
    remaining: number;
    resetTime: number;
  }> {
    const now = Date.now();
    let entry = this.cache.get(key);

    if (!entry || now > entry.resetTime) {
      // Create new entry
      entry = {
        count: 0,
        resetTime: now + this.options.window,
      };
    }

    entry.count++;
    this.cache.set(key, entry);

    const allowed = entry.count <= this.options.max;
    const remaining = Math.max(0, this.options.max - entry.count);

    return {
      allowed,
      limit: this.options.max,
      remaining,
      resetTime: entry.resetTime,
    };
  }

  reset(key: string) {
    this.cache.delete(key);
  }

  resetAll() {
    this.cache.clear();
  }
}

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(request: FastifyRequest): string {
  return request.ip;
}

/**
 * Rate limiting middleware factory
 */
export function createRateLimiter(options: RateLimitOptions) {
  const limiter = new RateLimiter(options);
  const keyGenerator = options.keyGenerator || defaultKeyGenerator;

  return async function rateLimitMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    // Check allow list
    if (options.allowList) {
      const ip = request.ip;
      if (options.allowList.includes(ip)) {
        return; // Skip rate limiting
      }
    }

    // Check block list
    if (options.blockList) {
      const ip = request.ip;
      if (options.blockList.includes(ip)) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Your IP has been blocked',
        });
      }
    }

    const key = keyGenerator(request);
    const result = await limiter.check(key);

    // Set rate limit headers
    reply.header('X-RateLimit-Limit', result.limit);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    if (!result.allowed) {
      // Set Retry-After header
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
      reply.header('Retry-After', retryAfter);

      return reply.code(429).send({
        error: 'Too Many Requests',
        message: options.message || `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        retryAfter,
      });
    }

    // Optionally skip counting successful/failed requests
    if (options.skipSuccessfulRequests || options.skipFailedRequests) {
      reply.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
        const shouldSkip =
          (options.skipSuccessfulRequests && reply.statusCode < 400) ||
          (options.skipFailedRequests && reply.statusCode >= 400);

        if (shouldSkip) {
          // Decrement the count
          const entry = limiter['cache'].get(key);
          if (entry && entry.count > 0) {
            entry.count--;
            limiter['cache'].set(key, entry);
          }
        }
      });
    }
  };
}

/**
 * Global rate limiter - applies to all routes
 */
export function globalRateLimiter(fastify: FastifyInstance) {
  const limiter = createRateLimiter({
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    window: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
    allowList: process.env.RATE_LIMIT_ALLOW_LIST?.split(','),
    message: 'Too many requests, please try again later.',
  });

  fastify.addHook('onRequest', limiter);
}

/**
 * API endpoint rate limiter - stricter limits
 */
export function apiRateLimiter(options?: Partial<RateLimitOptions>) {
  return createRateLimiter({
    max: 50,
    window: 60000, // 1 minute
    ...options,
  });
}

/**
 * Auth endpoint rate limiter - very strict
 */
export function authRateLimiter(options?: Partial<RateLimitOptions>) {
  return createRateLimiter({
    max: 5,
    window: 900000, // 15 minutes
    keyGenerator: (request) => {
      // Use combination of IP and email/username if available
      const body = request.body as any;
      const email = body?.email || body?.username || '';
      return `${request.ip}:${email}`;
    },
    skipSuccessfulRequests: true, // Don't count successful logins
    message: 'Too many authentication attempts. Please try again later.',
    ...options,
  });
}

/**
 * WebSocket connection rate limiter
 */
export function wsRateLimiter(options?: Partial<RateLimitOptions>) {
  return createRateLimiter({
    max: 10,
    window: 60000, // 1 minute
    message: 'Too many WebSocket connection attempts.',
    ...options,
  });
}

/**
 * Command execution rate limiter - per agent
 */
export function commandRateLimiter(options?: Partial<RateLimitOptions>) {
  return createRateLimiter({
    max: 30,
    window: 60000, // 1 minute
    keyGenerator: (request) => {
      // Use agent ID from params or body
      const agentId = (request.params as any)?.id || (request.body as any)?.agentId;
      return `agent:${agentId || 'unknown'}`;
    },
    message: 'Command rate limit exceeded. Please slow down.',
    ...options,
  });
}

/**
 * Dynamic rate limiter - adjusts based on server load
 */
export class DynamicRateLimiter {
  private baseLimit: number;
  private currentLimit: number;
  private limiter: RateLimiter;

  constructor(private options: RateLimitOptions) {
    this.baseLimit = options.max;
    this.currentLimit = options.max;
    this.limiter = new RateLimiter(options);

    // Adjust limits based on CPU usage every 30 seconds
    setInterval(() => this.adjustLimits(), 30000);
  }

  private async adjustLimits() {
    const usage = process.cpuUsage();
    const cpuPercent = (usage.user + usage.system) / 1000000 * 100;

    if (cpuPercent > 80) {
      // High load - reduce limit
      this.currentLimit = Math.max(10, Math.floor(this.baseLimit * 0.5));
    } else if (cpuPercent > 60) {
      // Medium load - slightly reduce limit
      this.currentLimit = Math.max(20, Math.floor(this.baseLimit * 0.75));
    } else {
      // Normal load - use base limit
      this.currentLimit = this.baseLimit;
    }

    // Update limiter options
    this.limiter = new RateLimiter({
      ...this.options,
      max: this.currentLimit,
    });
  }

  async check(key: string) {
    return this.limiter.check(key);
  }
}

/**
 * Register rate limiting middleware
 */
export function registerRateLimitingMiddleware(fastify: FastifyInstance) {
  // Apply global rate limiter
  globalRateLimiter(fastify);

  // Apply specific rate limiters to routes
  fastify.addHook('onRoute', (routeOptions) => {
    // Auth endpoints
    if (routeOptions.url?.startsWith('/auth')) {
      routeOptions.preHandler = [
        ...(Array.isArray(routeOptions.preHandler) ? routeOptions.preHandler : []),
        authRateLimiter(),
      ];
    }

    // Command endpoints
    if (routeOptions.url?.includes('/execute') || routeOptions.url?.includes('/commands')) {
      routeOptions.preHandler = [
        ...(Array.isArray(routeOptions.preHandler) ? routeOptions.preHandler : []),
        commandRateLimiter(),
      ];
    }

    // WebSocket endpoints
    if (routeOptions.websocket) {
      routeOptions.preHandler = [
        ...(Array.isArray(routeOptions.preHandler) ? routeOptions.preHandler : []),
        wsRateLimiter(),
      ];
    }
  });

  fastify.log.info('Rate limiting middleware registered');
}

// Export LRU cache for external use
export { LRUCache };