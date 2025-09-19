/**
 * Comprehensive health checker for all system services
 * Provides detailed health status for database, Redis, WebSocket, and other dependencies
 */

import { FastifyInstance } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';

export type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ServiceHealth {
  status: ServiceStatus;
  message: string;
  responseTime?: number;
  error?: string;
  details?: Record<string, any>;
}

export interface SystemHealth {
  status: ServiceStatus;
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    websocket: ServiceHealth;
    queue: ServiceHealth;
  };
  checks: {
    liveness: boolean;
    readiness: boolean;
  };
}

export interface HealthCheckDependencies {
  fastify: FastifyInstance;
  supabaseClient?: SupabaseClient;
  redis?: Redis;
  commandQueue?: Queue;
}

export class HealthChecker {
  private fastify: FastifyInstance;
  private supabaseClient?: SupabaseClient;
  private redis?: Redis;
  private commandQueue?: Queue;
  private startTime: number;

  constructor(deps: HealthCheckDependencies) {
    this.fastify = deps.fastify;
    this.supabaseClient = deps.supabaseClient;
    this.redis = deps.redis;
    this.commandQueue = deps.commandQueue;
    this.startTime = Date.now();
  }

  /**
   * Perform comprehensive health check of all services
   */
  async checkHealth(): Promise<SystemHealth> {
    const [database, redis, websocket, queue] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkWebSocket(),
      this.checkQueue()
    ]);

    const overallStatus = this.determineOverallStatus({ database, redis, websocket, queue });

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: this.getUptimeSeconds(),
      version: process.env['npm_package_version'] || '1.0.0',
      environment: process.env['NODE_ENV'] || 'development',
      services: {
        database,
        redis,
        websocket,
        queue
      },
      checks: {
        liveness: this.isLive({ database, redis, websocket, queue }),
        readiness: this.isReady({ database, redis, websocket, queue })
      }
    };
  }

  /**
   * Check database health
   */
  async checkDatabase(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
      if (!this.supabaseClient) {
        return {
          status: 'unhealthy',
          message: 'Database client not initialized',
          error: 'No database connection configured'
        };
      }

      // Perform a test query
      const testQuery = await this.performDatabaseTestQuery();

      if (!testQuery.success) {
        return {
          status: 'degraded',
          message: 'Database connected but queries failing',
          responseTime: Date.now() - startTime,
          error: testQuery.error
        };
      }

      const dbUrl = process.env['SUPABASE_URL'] || 'unknown';
      const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');

      return {
        status: 'healthy',
        message: 'Database connection healthy',
        responseTime: Date.now() - startTime,
        details: {
          type: 'supabase',
          environment: isLocal ? 'local' : 'production',
          tablesAccessible: testQuery.tablesAccessible
        }
      };
    } catch (error) {
      this.fastify.log.error({ error }, 'Database health check failed');
      return {
        status: 'unhealthy',
        message: 'Database health check failed',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check Redis health
   */
  async checkRedis(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
      if (!this.redis) {
        return {
          status: 'unhealthy',
          message: 'Redis not configured',
          error: 'Redis connection not initialized'
        };
      }

      // Ping Redis
      const result = await this.redis.ping();

      if (result !== 'PONG') {
        return {
          status: 'degraded',
          message: 'Redis responding but not healthy',
          responseTime: Date.now() - startTime,
          error: `Unexpected ping response: ${result}`
        };
      }

      // Check Redis info
      const info = await this.redis.info('server');
      const version = info.match(/redis_version:([^\r\n]+)/)?.[1];

      return {
        status: 'healthy',
        message: 'Redis connection healthy',
        responseTime: Date.now() - startTime,
        details: {
          version,
          connected: this.redis.status === 'ready'
        }
      };
    } catch (error) {
      this.fastify.log.error({ error }, 'Redis health check failed');
      return {
        status: 'unhealthy',
        message: 'Redis health check failed',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check WebSocket service health
   */
  async checkWebSocket(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
      // Check if WebSocket server is available via the fastify instance
      const hasWebSocketPlugin = !!(this.fastify as any).websocketServer;

      if (!hasWebSocketPlugin) {
        return {
          status: 'unhealthy',
          message: 'WebSocket server not initialized',
          error: 'WebSocket plugin not loaded'
        };
      }

      // Get WebSocket server stats
      const wsServer = (this.fastify as any).websocketServer;
      const clientsCount = wsServer.clients?.size || 0;

      return {
        status: 'healthy',
        message: 'WebSocket service healthy',
        responseTime: Date.now() - startTime,
        details: {
          activeConnections: clientsCount,
          serverReady: true
        }
      };
    } catch (error) {
      this.fastify.log.error({ error }, 'WebSocket health check failed');
      return {
        status: 'unhealthy',
        message: 'WebSocket health check failed',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check BullMQ queue health
   */
  async checkQueue(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
      if (!this.commandQueue) {
        return {
          status: 'unhealthy',
          message: 'Command queue not configured',
          error: 'Queue not initialized'
        };
      }

      // Check queue connection
      const client = await (this.commandQueue as any).client;
      if (!client || client.status !== 'ready') {
        return {
          status: 'unhealthy',
          message: 'Queue Redis connection not ready',
          responseTime: Date.now() - startTime,
          error: 'Queue client not connected'
        };
      }

      // Get queue metrics
      const [waiting, active, completed, failed] = await Promise.all([
        this.commandQueue.getWaitingCount(),
        this.commandQueue.getActiveCount(),
        this.commandQueue.getCompletedCount(),
        this.commandQueue.getFailedCount()
      ]);

      return {
        status: 'healthy',
        message: 'Command queue healthy',
        responseTime: Date.now() - startTime,
        details: {
          waiting,
          active,
          completed,
          failed,
          isPaused: await this.commandQueue.isPaused()
        }
      };
    } catch (error) {
      this.fastify.log.error({ error }, 'Queue health check failed');
      return {
        status: 'unhealthy',
        message: 'Queue health check failed',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Perform a test query on the database
   */
  private async performDatabaseTestQuery(): Promise<{
    success: boolean;
    error?: string;
    tablesAccessible?: number;
  }> {
    try {
      if (!this.supabaseClient) {
        return { success: false, error: 'No database client' };
      }

      // Try to query the agent table to verify schema is accessible
      const { data, error } = await this.supabaseClient
        .from('agent')
        .select('id')
        .limit(1);

      if (error) {
        // Table might not exist yet, but connection works
        if (error.code === 'PGRST116' || error.code === '42P01') {
          return { success: true, tablesAccessible: 0 };
        }
        return { success: false, error: error.message };
      }

      return { success: true, tablesAccessible: 1 };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Determine overall system status based on individual service statuses
   */
  private determineOverallStatus(services: Record<string, ServiceHealth>): ServiceStatus {
    const statuses = Object.values(services).map(s => s.status);

    if (statuses.every(s => s === 'healthy')) {
      return 'healthy';
    }

    if (statuses.some(s => s === 'unhealthy')) {
      // Critical services that must be healthy
      const criticalServices = ['database', 'websocket'];
      const criticalUnhealthy = criticalServices.some(
        service => services[service]?.status === 'unhealthy'
      );

      if (criticalUnhealthy) {
        return 'unhealthy';
      }
      return 'degraded';
    }

    return 'degraded';
  }

  /**
   * Check if system is live (basic process health)
   */
  private isLive(services: Record<string, ServiceHealth>): boolean {
    // System is live if the process is running and can respond
    // Even if some services are degraded
    return true;
  }

  /**
   * Check if system is ready to accept traffic
   */
  private isReady(services: Record<string, ServiceHealth>): boolean {
    // System is ready if critical services are healthy
    const criticalServices = ['database', 'websocket'];
    return criticalServices.every(
      service => services[service]?.status !== 'unhealthy'
    );
  }

  /**
   * Get uptime in seconds
   */
  private getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get liveness status (for k8s liveness probe)
   */
  async getLiveness(): Promise<{
    alive: boolean;
    uptime: number;
    timestamp: string;
  }> {
    return {
      alive: true,
      uptime: this.getUptimeSeconds(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get readiness status (for k8s readiness probe)
   */
  async getReadiness(): Promise<{
    ready: boolean;
    services: Record<string, boolean>;
    timestamp: string;
  }> {
    const health = await this.checkHealth();

    return {
      ready: health.checks.readiness,
      services: {
        database: health.services.database.status !== 'unhealthy',
        redis: health.services.redis.status !== 'unhealthy',
        websocket: health.services.websocket.status !== 'unhealthy',
        queue: health.services.queue.status !== 'unhealthy'
      },
      timestamp: new Date().toISOString()
    };
  }
}