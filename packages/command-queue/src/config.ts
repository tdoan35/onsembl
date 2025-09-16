/**
 * Configuration management for the command queue system
 */

import { z } from 'zod';
import type { QueueConfiguration } from './types.js';

// Zod schema for queue configuration validation
const queueConfigSchema = z.object({
  redis: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    password: z.string().optional(),
    db: z.number().int().min(0).max(15).optional(),
    keyPrefix: z.string().optional()
  }),
  queue: z.object({
    name: z.string().min(1),
    defaultJobOptions: z.object({
      removeOnComplete: z.number().int().min(1),
      removeOnFail: z.number().int().min(1),
      attempts: z.number().int().min(1),
      backoff: z.object({
        type: z.enum(['exponential', 'fixed']),
        delay: z.number().int().min(1)
      })
    }),
    concurrency: z.number().int().min(1).optional(),
    maxStalledCount: z.number().int().min(1).optional(),
    stalledInterval: z.number().int().min(1000).optional()
  }),
  priorities: z.object({
    emergency: z.number().int().min(1).max(100),
    high: z.number().int().min(1).max(100),
    normal: z.number().int().min(1).max(100),
    low: z.number().int().min(1).max(100)
  })
});

/**
 * Default configuration for the command queue
 */
export const defaultQueueConfig: QueueConfiguration = {
  redis: {
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
    password: process.env['REDIS_PASSWORD'],
    db: parseInt(process.env['REDIS_DB'] || '0', 10),
    keyPrefix: process.env['REDIS_KEY_PREFIX'] || 'onsembl:'
  },
  queue: {
    name: 'command-queue',
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    },
    concurrency: 10,
    maxStalledCount: 1,
    stalledInterval: 30000
  },
  priorities: {
    emergency: 90,
    high: 70,
    normal: 50,
    low: 20
  }
};

/**
 * Validates and merges configuration with defaults
 */
export function validateQueueConfig(config: Partial<QueueConfiguration>): QueueConfiguration {
  const mergedConfig = {
    redis: { ...defaultQueueConfig.redis, ...config.redis },
    queue: {
      ...defaultQueueConfig.queue,
      ...config.queue,
      defaultJobOptions: {
        ...defaultQueueConfig.queue.defaultJobOptions,
        ...config.queue?.defaultJobOptions,
        backoff: {
          ...defaultQueueConfig.queue.defaultJobOptions.backoff,
          ...config.queue?.defaultJobOptions?.backoff
        }
      }
    },
    priorities: { ...defaultQueueConfig.priorities, ...config.priorities }
  };

  const result = queueConfigSchema.safeParse(mergedConfig);

  if (!result.success) {
    throw new Error(`Invalid queue configuration: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Gets queue configuration from environment variables
 */
export function getConfigFromEnv(): QueueConfiguration {
  const envConfig: Partial<QueueConfiguration> = {};

  // Redis configuration from environment
  if (process.env['REDIS_HOST']) {
    envConfig.redis = {
      host: process.env['REDIS_HOST'],
      port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
      password: process.env['REDIS_PASSWORD'],
      db: parseInt(process.env['REDIS_DB'] || '0', 10),
      keyPrefix: process.env['REDIS_KEY_PREFIX'] || 'onsembl:'
    };
  }

  // Queue configuration from environment
  if (process.env['QUEUE_NAME']) {
    envConfig.queue = {
      name: process.env['QUEUE_NAME'],
      defaultJobOptions: {
        removeOnComplete: parseInt(process.env['QUEUE_REMOVE_ON_COMPLETE'] || '100', 10),
        removeOnFail: parseInt(process.env['QUEUE_REMOVE_ON_FAIL'] || '50', 10),
        attempts: parseInt(process.env['QUEUE_ATTEMPTS'] || '3', 10),
        backoff: {
          type: (process.env['QUEUE_BACKOFF_TYPE'] as 'exponential' | 'fixed') || 'exponential',
          delay: parseInt(process.env['QUEUE_BACKOFF_DELAY'] || '2000', 10)
        }
      },
      concurrency: process.env['QUEUE_CONCURRENCY'] ? parseInt(process.env['QUEUE_CONCURRENCY'], 10) : undefined,
      maxStalledCount: process.env['QUEUE_MAX_STALLED'] ? parseInt(process.env['QUEUE_MAX_STALLED'], 10) : undefined,
      stalledInterval: process.env['QUEUE_STALLED_INTERVAL'] ? parseInt(process.env['QUEUE_STALLED_INTERVAL'], 10) : undefined
    };
  }

  // Priority configuration from environment
  if (process.env['PRIORITY_EMERGENCY']) {
    envConfig.priorities = {
      emergency: parseInt(process.env['PRIORITY_EMERGENCY'] || '90', 10),
      high: parseInt(process.env['PRIORITY_HIGH'] || '70', 10),
      normal: parseInt(process.env['PRIORITY_NORMAL'] || '50', 10),
      low: parseInt(process.env['PRIORITY_LOW'] || '20', 10)
    };
  }

  return validateQueueConfig(envConfig);
}

/**
 * Configuration utilities
 */
export class ConfigManager {
  private static instance: QueueConfiguration;

  /**
   * Initialize configuration (should be called once at startup)
   */
  static initialize(config?: Partial<QueueConfiguration>): QueueConfiguration {
    if (config) {
      this.instance = validateQueueConfig(config);
    } else {
      this.instance = getConfigFromEnv();
    }
    return this.instance;
  }

  /**
   * Get current configuration
   */
  static get(): QueueConfiguration {
    if (!this.instance) {
      this.instance = getConfigFromEnv();
    }
    return this.instance;
  }

  /**
   * Update configuration
   */
  static update(config: Partial<QueueConfiguration>): QueueConfiguration {
    const currentConfig = this.get();
    this.instance = validateQueueConfig({ ...currentConfig, ...config });
    return this.instance;
  }

  /**
   * Reset to defaults
   */
  static reset(): QueueConfiguration {
    this.instance = defaultQueueConfig;
    return this.instance;
  }

  /**
   * Get Redis connection URL
   */
  static getRedisUrl(): string {
    const config = this.get();
    const { host, port, password, db } = config.redis;

    let url = `redis://${host}:${port}`;
    if (db && db > 0) {
      url += `/${db}`;
    }
    if (password) {
      url = `redis://:${password}@${host}:${port}`;
      if (db && db > 0) {
        url += `/${db}`;
      }
    }

    return url;
  }

  /**
   * Get Redis connection options for BullMQ
   */
  static getRedisOptions() {
    const config = this.get();
    return {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db || 0,
      keyPrefix: config.redis.keyPrefix || 'onsembl:',
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3
    };
  }
}