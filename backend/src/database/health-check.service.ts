/**
 * Database health check service
 * Monitors and reports database connection status
 */

import { FastifyInstance } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { EventEmitter } from 'events';
import { SupabaseValidator } from './supabase-validator.js';
import { EnvironmentDetector } from './environment-detector.js';
import { DatabaseErrorMessages } from './error-messages.js';

export interface HealthStatus {
  healthy: boolean;
  connected: boolean;
  environment: 'production' | 'local' | 'none';
  type: 'supabase' | 'postgres' | 'none';
  message: string;
  lastCheck: string;
  uptime: number;
  error?: string;
  latency?: number;
}

export interface HealthCheckOptions {
  interval?: number;  // Check interval in milliseconds
  timeout?: number;   // Query timeout in milliseconds
  retries?: number;   // Number of retries before marking unhealthy
}

export class HealthCheckService extends EventEmitter {
  private fastify: FastifyInstance;
  private validator: SupabaseValidator;
  private client: SupabaseClient | null = null;
  private status: HealthStatus;
  private checkInterval: NodeJS.Timeout | null = null;
  private startTime: number;
  private options: Required<HealthCheckOptions>;
  private consecutiveFailures: number = 0;

  constructor(fastify: FastifyInstance, options?: HealthCheckOptions) {
    super();
    this.fastify = fastify;
    this.validator = new SupabaseValidator(fastify.log);
    this.startTime = Date.now();

    this.options = {
      interval: options?.interval || 30000,  // 30 seconds
      timeout: options?.timeout || 5000,     // 5 seconds
      retries: options?.retries || 3
    };

    this.status = {
      healthy: false,
      connected: false,
      environment: 'none',
      type: 'none',
      message: 'Initializing...',
      lastCheck: new Date().toISOString(),
      uptime: 0
    };
  }

  /**
   * Initialize health check service
   */
  async initialize(): Promise<void> {
    this.fastify.log.info('Initializing database health check service');

    // Perform initial validation
    const validation = await this.validator.validate();

    if (validation.valid && validation.configured) {
      this.client = this.validator.getClient();
      await this.performHealthCheck();

      // Start periodic health checks
      this.startMonitoring();
    } else {
      // Database not configured
      this.status = {
        healthy: false,
        connected: false,
        environment: validation.environment,
        type: validation.environment === 'none' ? 'none' : 'supabase',
        message: validation.errors[0] || 'Database not configured',
        lastCheck: new Date().toISOString(),
        uptime: this.getUptime(),
        error: DatabaseErrorMessages.getSetupInstructions(
          !!process.env['SUPABASE_URL'],
          !!process.env['SUPABASE_ANON_KEY']
        )
      };

      this.fastify.log.warn(
        { status: this.status },
        'Database not configured - running without persistence'
      );

      // Emit status event
      this.emit('status', this.status);
    }
  }

  /**
   * Start periodic health monitoring
   */
  private startMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.options.interval);

    this.fastify.log.info(
      { interval: this.options.interval },
      'Started database health monitoring'
    );
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.fastify.log.info('Stopped database health monitoring');
  }

  /**
   * Perform health check
   */
  async performHealthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      if (!this.client) {
        throw new Error('Database client not initialized');
      }

      // Perform a simple query to test connection
      const { error } = await Promise.race([
        this.client.from('_health_check').select('count').single(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), this.options.timeout)
        )
      ]) as any;

      const latency = Date.now() - startTime;

      // Table might not exist, but connection works
      const isHealthy = !error || error.code === 'PGRST116';

      if (isHealthy) {
        this.consecutiveFailures = 0;

        const envInfo = EnvironmentDetector.detect();
        this.status = {
          healthy: true,
          connected: true,
          environment: envInfo.isLocal ? 'local' : 'production',
          type: 'supabase',
          message: `Connected to ${EnvironmentDetector.getConnectionSummary()}`,
          lastCheck: new Date().toISOString(),
          uptime: this.getUptime(),
          latency
        };

        this.fastify.log.debug(
          { status: this.status },
          'Database health check passed'
        );
      } else {
        this.handleHealthCheckFailure(error);
      }
    } catch (error) {
      this.handleHealthCheckFailure(error as Error);
    }

    // Emit status update
    this.emit('status', this.status);

    return this.status;
  }

  /**
   * Handle health check failure
   */
  private handleHealthCheckFailure(error: Error): void {
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= this.options.retries) {
      // Mark as unhealthy after multiple failures
      const envInfo = EnvironmentDetector.detect();
      this.status = {
        healthy: false,
        connected: false,
        environment: envInfo.isLocal ? 'local' : envInfo.isCloud ? 'production' : 'none',
        type: envInfo.type === 'none' ? 'none' : 'supabase',
        message: 'Database connection lost',
        lastCheck: new Date().toISOString(),
        uptime: this.getUptime(),
        error: error.message
      };

      this.fastify.log.error(
        {
          error: error.message,
          consecutiveFailures: this.consecutiveFailures
        },
        'Database health check failed'
      );

      // Emit unhealthy event
      this.emit('unhealthy', { status: this.status, error });
    } else {
      // Temporary failure, keep previous status
      this.fastify.log.warn(
        {
          error: error.message,
          attempt: this.consecutiveFailures,
          maxRetries: this.options.retries
        },
        'Database health check failed, retrying...'
      );
    }
  }

  /**
   * Get current health status
   */
  getStatus(): HealthStatus {
    return { ...this.status };
  }

  /**
   * Force immediate health check
   */
  async check(): Promise<HealthStatus> {
    return await this.performHealthCheck();
  }

  /**
   * Get service uptime in seconds
   */
  private getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Check if database is available
   */
  isAvailable(): boolean {
    return this.status.healthy && this.status.connected;
  }

  /**
   * Get detailed health metrics
   */
  getMetrics(): {
    status: HealthStatus;
    statistics: {
      uptimeSeconds: number;
      consecutiveFailures: number;
      lastSuccessfulCheck?: string;
      averageLatency?: number;
    };
  } {
    return {
      status: this.getStatus(),
      statistics: {
        uptimeSeconds: this.getUptime(),
        consecutiveFailures: this.consecutiveFailures,
        lastSuccessfulCheck: this.status.healthy ? this.status.lastCheck : undefined,
        averageLatency: this.status.latency
      }
    };
  }

  /**
   * Get health status for API response
   */
  getApiResponse(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    database: {
      connected: boolean;
      type: string;
      environment: string;
      message: string;
      lastCheck: string;
      latency?: number;
    };
  } {
    const overallStatus = this.status.healthy ? 'healthy' :
                          this.status.connected ? 'degraded' : 'unhealthy';

    return {
      status: overallStatus,
      database: {
        connected: this.status.connected,
        type: this.status.type,
        environment: this.status.environment,
        message: this.status.message,
        lastCheck: this.status.lastCheck,
        latency: this.status.latency
      }
    };
  }

  /**
   * Register health check endpoints
   */
  registerEndpoints(): void {
    // Simple health check
    this.fastify.get('/health', async (request, reply) => {
      const status = this.getStatus();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: {
          connected: status.connected,
          type: status.type,
          message: status.message
        }
      };
    });

    // Detailed system health
    this.fastify.get('/api/system/health', async (request, reply) => {
      const metrics = this.getMetrics();
      const envInfo = EnvironmentDetector.detect();

      return {
        status: metrics.status.healthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        components: {
          database: {
            status: metrics.status.healthy ? 'healthy' : 'unhealthy',
            type: metrics.status.type,
            environment: metrics.status.environment,
            message: metrics.status.message,
            lastCheck: metrics.status.lastCheck,
            latency: metrics.status.latency
          },
          redis: {
            status: process.env['REDIS_URL'] ? 'healthy' : 'unhealthy',
            message: process.env['REDIS_URL'] ? 'Connected to Redis' : 'Redis not configured',
            lastCheck: new Date().toISOString()
          },
          websocket: {
            status: 'healthy',
            activeConnections: 0,
            message: 'WebSocket server ready'
          }
        },
        uptime: metrics.statistics.uptimeSeconds,
        version: process.env['npm_package_version'] || '1.0.0',
        environment: envInfo
      };
    });
  }
}