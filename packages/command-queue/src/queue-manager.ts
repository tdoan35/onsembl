import { Queue, Worker, QueueEvents } from 'bullmq';
import { pino } from 'pino';
import { createRedisConnection, getRedisClient } from './redis-connection.js';
import type { Redis } from 'ioredis';

const logger = pino({ name: 'queue-manager' });

export interface QueueConfig {
  name: string;
  defaultJobOptions?: {
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
    attempts?: number;
    backoff?: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
  };
}

export class QueueManager {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();
  private redisConnection: Redis;

  constructor() {
    this.redisConnection = createRedisConnection();
  }

  createQueue(config: QueueConfig): Queue {
    const existingQueue = this.queues.get(config.name);
    if (existingQueue) {
      logger.info(`Queue "${config.name}" already exists`);
      return existingQueue;
    }

    logger.info(`Creating queue "${config.name}"`);
    const queue = new Queue(config.name, {
      connection: this.redisConnection.duplicate(),
      defaultJobOptions: {
        removeOnComplete: config.defaultJobOptions?.removeOnComplete ?? 10,
        removeOnFail: config.defaultJobOptions?.removeOnFail ?? 10,
        attempts: config.defaultJobOptions?.attempts ?? 3,
        backoff: config.defaultJobOptions?.backoff ?? {
          type: 'exponential',
          delay: 5000,
        },
      },
    });

    this.queues.set(config.name, queue);

    const queueEvents = new QueueEvents(config.name, {
      connection: this.redisConnection.duplicate(),
    });

    this.queueEvents.set(config.name, queueEvents);

    queueEvents.on('completed', ({ jobId, returnvalue }) => {
      logger.info({ jobId, returnvalue }, `Job completed in queue "${config.name}"`);
    });

    queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error({ jobId, failedReason }, `Job failed in queue "${config.name}"`);
    });

    queueEvents.on('progress', ({ jobId, data }) => {
      logger.debug({ jobId, data }, `Job progress in queue "${config.name}"`);
    });

    return queue;
  }

  getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  createWorker<T = any, R = any>(
    queueName: string,
    processor: (job: any) => Promise<R>,
    concurrency: number = 5
  ): Worker<T, R> {
    const existingWorker = this.workers.get(queueName);
    if (existingWorker) {
      logger.warn(`Worker for queue "${queueName}" already exists`);
      return existingWorker as Worker<T, R>;
    }

    logger.info(`Creating worker for queue "${queueName}" with concurrency ${concurrency}`);
    const worker = new Worker<T, R>(queueName, processor, {
      connection: this.redisConnection.duplicate(),
      concurrency,
    });

    this.workers.set(queueName, worker as any);

    worker.on('completed', (job) => {
      logger.info({ jobId: job.id, jobName: job.name }, `Worker completed job in queue "${queueName}"`);
    });

    worker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, jobName: job?.name, error: err }, `Worker failed job in queue "${queueName}"`);
    });

    worker.on('error', (err) => {
      logger.error({ error: err }, `Worker error in queue "${queueName}"`);
    });

    return worker;
  }

  async getQueueStats(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue "${queueName}" not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }

  async clearQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue "${queueName}" not found`);
    }

    logger.info(`Clearing queue "${queueName}"`);
    await queue.obliterate({ force: true });
  }

  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue "${queueName}" not found`);
    }

    logger.info(`Pausing queue "${queueName}"`);
    await queue.pause();
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue "${queueName}" not found`);
    }

    logger.info(`Resuming queue "${queueName}"`);
    await queue.resume();
  }

  async pauseWorker(queueName: string): Promise<void> {
    const worker = this.workers.get(queueName);
    if (!worker) {
      throw new Error(`Worker for queue "${queueName}" not found`);
    }

    logger.info(`Pausing worker for queue "${queueName}"`);
    await worker.pause();
  }

  async resumeWorker(queueName: string): Promise<void> {
    const worker = this.workers.get(queueName);
    if (!worker) {
      throw new Error(`Worker for queue "${queueName}" not found`);
    }

    logger.info(`Resuming worker for queue "${queueName}"`);
    await worker.resume();
  }

  async close(): Promise<void> {
    logger.info('Closing all queues and workers');

    const closePromises: Promise<void>[] = [];

    for (const [name, queue] of this.queues) {
      logger.info(`Closing queue "${name}"`);
      closePromises.push(queue.close());
    }

    for (const [name, worker] of this.workers) {
      logger.info(`Closing worker for queue "${name}"`);
      closePromises.push(worker.close());
    }

    for (const [name, queueEvents] of this.queueEvents) {
      logger.info(`Closing queue events for "${name}"`);
      closePromises.push(queueEvents.close());
    }

    await Promise.all(closePromises);

    this.queues.clear();
    this.workers.clear();
    this.queueEvents.clear();

    await this.redisConnection.quit();
  }
}

// Export the class, not an instance, to allow proper initialization after env vars are loaded
export const QueueManager_ = QueueManager;