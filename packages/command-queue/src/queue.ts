/**
 * Command queue implementation using BullMQ
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { EventEmitter } from 'events';
import { Logger } from 'pino';
import { ConfigManager } from './config.js';
import type {
  CommandJobData,
  CommandJobResult,
  QueuedCommand,
  QueueMetrics,
  AgentAvailability,
  CommandFilter,
  InterruptRequest,
  InterruptResult
} from './types.js';

export interface CommandQueueEvents {
  'job:added': (job: Job<CommandJobData>) => void;
  'job:waiting': (job: Job<CommandJobData>) => void;
  'job:active': (job: Job<CommandJobData>) => void;
  'job:completed': (job: Job<CommandJobData>, result: CommandJobResult) => void;
  'job:failed': (job: Job<CommandJobData>, error: Error) => void;
  'job:stalled': (job: Job<CommandJobData>) => void;
  'job:progress': (job: Job<CommandJobData>, progress: number) => void;
  'queue:drained': () => void;
  'queue:error': (error: Error) => void;
}

export class CommandQueue extends EventEmitter {
  private queue: Queue<CommandJobData, CommandJobResult>;
  private queueEvents: QueueEvents;
  private logger: Logger;
  private isInitialized = false;

  constructor(logger: Logger) {
    super();
    this.logger = logger.child({ component: 'CommandQueue' });
  }

  /**
   * Initialize the queue with Redis connection
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const config = ConfigManager.get();
    const redisOptions = ConfigManager.getRedisOptions();

    try {
      // Create the queue
      this.queue = new Queue<CommandJobData, CommandJobResult>(
        config.queue.name,
        {
          connection: redisOptions,
          defaultJobOptions: config.queue.defaultJobOptions
        }
      );

      // Create queue events listener
      this.queueEvents = new QueueEvents(config.queue.name, {
        connection: redisOptions
      });

      // Set up event listeners
      this.setupEventListeners();

      // Test Redis connection
      await this.queue.waitUntilReady();

      this.isInitialized = true;
      this.logger.info('Command queue initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize command queue');
      throw error;
    }
  }

  /**
   * Add a command to the queue
   */
  async addCommand(
    command: QueuedCommand,
    options: {
      agentId?: string;
      userId: string;
      priority?: number;
      delay?: number;
      executionConstraints?: {
        timeLimitMs?: number;
        tokenBudget?: number;
      };
    }
  ): Promise<Job<CommandJobData>> {
    this.ensureInitialized();

    const config = ConfigManager.get();
    const priority = options.priority || config.priorities.normal;

    const jobData: CommandJobData = {
      command: {
        ...command,
        queuedAt: Date.now(),
        attemptCount: 0,
        maxAttempts: config.queue.defaultJobOptions.attempts
      },
      agentId: options.agentId,
      userId: options.userId,
      priority,
      executionConstraints: options.executionConstraints
    };

    const jobOptions = {
      priority,
      delay: options.delay,
      removeOnComplete: config.queue.defaultJobOptions.removeOnComplete,
      removeOnFail: config.queue.defaultJobOptions.removeOnFail
    };

    try {
      const job = await this.queue.add(
        `command-${command.id}`,
        jobData,
        jobOptions
      );

      this.logger.info(
        { commandId: command.id, jobId: job.id, priority },
        'Command added to queue'
      );

      return job;
    } catch (error) {
      this.logger.error(
        { error, commandId: command.id },
        'Failed to add command to queue'
      );
      throw error;
    }
  }

  /**
   * Get command job by command ID
   */
  async getCommand(commandId: string): Promise<Job<CommandJobData> | null> {
    this.ensureInitialized();

    try {
      const jobs = await this.queue.getJobs(['waiting', 'active', 'completed', 'failed']);
      return jobs.find(job => job.data.command.id === commandId) || null;
    } catch (error) {
      this.logger.error({ error, commandId }, 'Failed to get command from queue');
      throw error;
    }
  }

  /**
   * Remove a command from the queue
   */
  async removeCommand(commandId: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const job = await this.getCommand(commandId);
      if (!job) {
        return false;
      }

      await job.remove();
      this.logger.info({ commandId, jobId: job.id }, 'Command removed from queue');
      return true;
    } catch (error) {
      this.logger.error({ error, commandId }, 'Failed to remove command from queue');
      throw error;
    }
  }

  /**
   * Interrupt a running command
   */
  async interruptCommand(request: InterruptRequest): Promise<InterruptResult> {
    this.ensureInitialized();

    try {
      const job = await this.getCommand(request.commandId);
      if (!job) {
        return {
          success: false,
          commandId: request.commandId,
          wasInterrupted: false,
          error: 'Command not found in queue'
        };
      }

      const isActive = await job.isActive();
      if (!isActive) {
        return {
          success: false,
          commandId: request.commandId,
          wasInterrupted: false,
          error: 'Command is not currently active'
        };
      }

      // Add interrupt reason to job data
      await job.updateData({
        ...job.data,
        interruptReason: request.reason
      });

      // Cancel the job
      await job.remove();

      this.logger.info(
        { commandId: request.commandId, reason: request.reason },
        'Command interrupted'
      );

      return {
        success: true,
        commandId: request.commandId,
        wasInterrupted: true,
        reason: request.reason
      };
    } catch (error) {
      this.logger.error(
        { error, commandId: request.commandId },
        'Failed to interrupt command'
      );

      return {
        success: false,
        commandId: request.commandId,
        wasInterrupted: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get queue metrics
   */
  async getMetrics(): Promise<QueueMetrics> {
    this.ensureInitialized();

    try {
      const [waiting, active, completed, failed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed()
      ]);

      // Calculate average wait and processing times
      const recentJobs = await this.queue.getJobs(['completed'], 0, 100);
      let avgWaitTime = 0;
      let avgProcessingTime = 0;

      if (recentJobs.length > 0) {
        const waitTimes = recentJobs
          .filter(job => job.processedOn && job.timestamp)
          .map(job => job.processedOn! - job.timestamp!);

        const processingTimes = recentJobs
          .filter(job => job.finishedOn && job.processedOn)
          .map(job => job.finishedOn! - job.processedOn!);

        avgWaitTime = waitTimes.length > 0
          ? waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length
          : 0;

        avgProcessingTime = processingTimes.length > 0
          ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
          : 0;
      }

      // Calculate throughput (jobs per hour)
      const hourAgo = Date.now() - (60 * 60 * 1000);
      const recentCompletedJobs = recentJobs.filter(
        job => job.finishedOn && job.finishedOn > hourAgo
      );
      const throughputPerHour = recentCompletedJobs.length;

      return {
        totalJobs: waiting.length + active.length + completed.length + failed.length,
        waitingJobs: waiting.length,
        activeJobs: active.length,
        completedJobs: completed.length,
        failedJobs: failed.length,
        avgWaitTime,
        avgProcessingTime,
        throughputPerHour
      };
    } catch (error) {
      this.logger.error({ error }, 'Failed to get queue metrics');
      throw error;
    }
  }

  /**
   * Get commands with filtering
   */
  async getCommands(filter: CommandFilter = {}, limit = 50, offset = 0): Promise<QueuedCommand[]> {
    this.ensureInitialized();

    try {
      const jobs = await this.queue.getJobs(
        ['waiting', 'active', 'completed', 'failed'],
        offset,
        offset + limit - 1
      );

      return jobs
        .filter(job => this.matchesFilter(job.data, filter))
        .map(job => job.data.command);
    } catch (error) {
      this.logger.error({ error, filter }, 'Failed to get commands');
      throw error;
    }
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    this.ensureInitialized();
    await this.queue.pause();
    this.logger.info('Queue paused');
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    this.ensureInitialized();
    await this.queue.resume();
    this.logger.info('Queue resumed');
  }

  /**
   * Drain the queue (remove all waiting jobs)
   */
  async drain(): Promise<void> {
    this.ensureInitialized();
    await this.queue.drain();
    this.logger.info('Queue drained');
  }

  /**
   * Clean up completed and failed jobs
   */
  async clean(olderThanMs = 24 * 60 * 60 * 1000): Promise<void> {
    this.ensureInitialized();

    try {
      const [completedCleaned, failedCleaned] = await Promise.all([
        this.queue.clean(olderThanMs, 100, 'completed'),
        this.queue.clean(olderThanMs, 50, 'failed')
      ]);

      this.logger.info(
        { completedCleaned, failedCleaned },
        'Queue cleaned'
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to clean queue');
      throw error;
    }
  }

  /**
   * Close the queue connection
   */
  async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      await Promise.all([
        this.queue.close(),
        this.queueEvents.close()
      ]);

      this.isInitialized = false;
      this.logger.info('Queue closed');
    } catch (error) {
      this.logger.error({ error }, 'Failed to close queue');
      throw error;
    }
  }

  /**
   * Setup event listeners for the queue
   */
  private setupEventListeners(): void {
    // Queue events
    this.queueEvents.on('waiting', (job) => {
      this.logger.debug({ jobId: job.jobId }, 'Job waiting');
      this.emit('job:waiting', job as any);
    });

    this.queueEvents.on('active', (job) => {
      this.logger.debug({ jobId: job.jobId }, 'Job active');
      this.emit('job:active', job as any);
    });

    this.queueEvents.on('completed', (job, result) => {
      this.logger.info({ jobId: job.jobId }, 'Job completed');
      this.emit('job:completed', job as any, result);
    });

    this.queueEvents.on('failed', (job, error) => {
      this.logger.error({ jobId: job.jobId, error }, 'Job failed');
      this.emit('job:failed', job as any, new Error(error));
    });

    this.queueEvents.on('stalled', (job) => {
      this.logger.warn({ jobId: job.jobId }, 'Job stalled');
      this.emit('job:stalled', job as any);
    });

    this.queueEvents.on('progress', (job, progress) => {
      this.logger.debug({ jobId: job.jobId, progress }, 'Job progress');
      this.emit('job:progress', job as any, progress);
    });

    this.queueEvents.on('drained', () => {
      this.logger.info('Queue drained');
      this.emit('queue:drained');
    });

    // Queue error handling
    this.queue.on('error', (error) => {
      this.logger.error({ error }, 'Queue error');
      this.emit('queue:error', error);
    });

    this.queueEvents.on('error', (error) => {
      this.logger.error({ error }, 'Queue events error');
      this.emit('queue:error', error);
    });
  }

  /**
   * Check if the queue is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Queue not initialized. Call initialize() first.');
    }
  }

  /**
   * Check if job data matches the filter
   */
  private matchesFilter(jobData: CommandJobData, filter: CommandFilter): boolean {
    if (filter.agentId && jobData.agentId !== filter.agentId) {
      return false;
    }

    if (filter.userId && jobData.userId !== filter.userId) {
      return false;
    }

    if (filter.commandType && jobData.command.type !== filter.commandType) {
      return false;
    }

    if (filter.status && jobData.command.status !== filter.status) {
      return false;
    }

    if (filter.priority) {
      if (filter.priority.min !== undefined && jobData.priority < filter.priority.min) {
        return false;
      }
      if (filter.priority.max !== undefined && jobData.priority > filter.priority.max) {
        return false;
      }
    }

    if (filter.dateRange) {
      const commandTime = jobData.command.createdAt;
      if (commandTime < filter.dateRange.from || commandTime > filter.dateRange.to) {
        return false;
      }
    }

    return true;
  }
}