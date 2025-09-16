import { Redis } from 'ioredis';
import { pino } from 'pino';

const logger = pino({ name: 'redis-connection' });

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  tls?: boolean;
  maxRetriesPerRequest?: number;
  retryStrategy?: (times: number) => number | null;
}

let redisClient: Redis | null = null;

export function createRedisConnection(config: RedisConfig = {}): Redis {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = config.url || process.env['REDIS_URL'];

  if (redisUrl) {
    logger.info('Connecting to Redis using URL');
    const redisOptions: any = {
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      retryStrategy: config.retryStrategy || ((times: number) => {
        const delay = Math.min(times * 50, 2000);
        logger.info(`Retrying Redis connection in ${delay}ms (attempt ${times})`);
        return delay;
      }),
    };

    if (redisUrl.startsWith('rediss://')) {
      redisOptions.tls = {};
    }

    redisClient = new Redis(redisUrl, redisOptions);
  } else {
    const host = config.host || process.env['REDIS_HOST'] || 'localhost';
    const port = config.port || parseInt(process.env['REDIS_PORT'] || '6379', 10);
    const password = config.password || process.env['REDIS_PASSWORD'];
    const useTls = config.tls ?? process.env['REDIS_TLS'] === 'true';

    logger.info(`Connecting to Redis at ${host}:${port}${useTls ? ' with TLS' : ''}`);

    const redisOptions: any = {
      host,
      port,
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      retryStrategy: config.retryStrategy || ((times: number) => {
        const delay = Math.min(times * 50, 2000);
        logger.info(`Retrying Redis connection in ${delay}ms (attempt ${times})`);
        return delay;
      }),
    };

    if (password) {
      redisOptions.password = password;
    }

    if (useTls) {
      redisOptions.tls = {};
    }

    redisClient = new Redis(redisOptions);
  }

  redisClient.on('connect', () => {
    logger.info('Successfully connected to Redis');
  });

  redisClient.on('error', (error) => {
    logger.error({ error }, 'Redis connection error');
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  redisClient.on('reconnecting', (delay: number) => {
    logger.info(`Reconnecting to Redis in ${delay}ms`);
  });

  return redisClient;
}

export function getRedisClient(): Redis {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call createRedisConnection first.');
  }
  return redisClient;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    logger.info('Closing Redis connection');
    await redisClient.quit();
    redisClient = null;
  }
}

export async function pingRedis(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error({ error }, 'Redis ping failed');
    return false;
  }
}