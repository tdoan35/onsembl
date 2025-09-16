/**
 * Enhanced Command queue implementation using BullMQ
 *
 * Features:
 * - Priority-based queueing (0-100 scale)
 * - Queue position tracking with real-time updates
 * - Command cancellation with automatic position recalculation
 * - Max queue size enforcement
 * - Graceful shutdown and error handling
 * - Comprehensive metrics and monitoring
 * - Redis connection management with automatic reconnection
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
  'job:removed': (jobId: string, commandId: string) => void;
  'queue:drained': () => void;
  'queue:paused': () => void;
  'queue:resumed': () => void;
  'queue:error': (error: Error) => void;
  'queue:full': (rejectedCommand: QueuedCommand) => void;
  'position:updated': (commandId: string, position: number) => void;
}

export class QueueManager extends EventEmitter {
  private queue: Queue<CommandJobData, CommandJobResult>;
  private queueEvents: QueueEvents;
  private logger: Logger;
  private isInitialized = false;
  private isShuttingDown = false;
  private maxQueueSize: number;

  constructor(logger: Logger, maxQueueSize = 1000) {
    super();
    this.logger = logger.child({ component: 'QueueManager' });
    this.maxQueueSize = maxQueueSize;
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
      // Create the queue with enhanced options
      this.queue = new Queue<CommandJobData, CommandJobResult>(
        config.queue.name,
        {
          connection: redisOptions,
          defaultJobOptions: {
            ...config.queue.defaultJobOptions,
            // Enhanced job options for better reliability
            removeOnComplete: 50, // Keep more completed jobs for metrics
            removeOnFail: 25,     // Keep failed jobs for debugging
          }
        }
      );

      // Create queue events listener
      this.queueEvents = new QueueEvents(config.queue.name, {
        connection: redisOptions
      });

      // Set up event listeners
      this.setupEventListeners();

      // Test Redis connection with timeout
      await Promise.race([
        this.queue.waitUntilReady(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis connection timeout')), 10000)
        )
      ]);

      this.isInitialized = true;
      this.logger.info('QueueManager initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize QueueManager');
      throw error;
    }
  }

  /**
   * Add a command to the queue with priority and queue size enforcement
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

    // Check queue size limit
    const queueSize = await this.getQueueSize();
    if (queueSize >= this.maxQueueSize) {
      this.logger.warn(
        { commandId: command.id, queueSize, maxQueueSize: this.maxQueueSize },
        'Queue is full, rejecting command'
      );
      this.emit('queue:full', command);
      throw new Error(`Queue is full (${queueSize}/${this.maxQueueSize}). Cannot add new command.`);
    }

    const config = ConfigManager.get();
    // Ensure priority is within 0-100 range
    const priority = Math.max(0, Math.min(100, options.priority || config.priorities.normal));

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
      removeOnFail: config.queue.defaultJobOptions.removeOnFail,
      // Add unique job ID to prevent duplicates
      jobId: `cmd-${command.id}-${Date.now()}`
    };

    try {
      const job = await this.queue.add(
        `command-${command.id}`,
        jobData,
        jobOptions
      );

      this.logger.info(
        {
          commandId: command.id,
          jobId: job.id,
          priority,
          queueSize: queueSize + 1,
          userId: options.userId,
          agentId: options.agentId
        },
        'Command added to queue'
      );

      // Update positions for all waiting jobs
      await this.updateQueuePositions();

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
   * Get current queue size (waiting + active + delayed jobs)
   */
  async getQueueSize(): Promise<number> {
    this.ensureInitialized();

    try {
      const [waiting, active, delayed] = await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getActiveCount(),
        this.queue.getDelayedCount()
      ]);

      return waiting + active + delayed;
    } catch (error) {
      this.logger.error({ error }, 'Failed to get queue size');
      return 0;
    }
  }

  /**
   * Get command position in queue (1-based index)
   */
  async getCommandPosition(commandId: string): Promise<number | null> {
    this.ensureInitialized();

    try {
      const waitingJobs = await this.queue.getWaiting();
      const position = waitingJobs.findIndex(job => job.data.command.id === commandId);
      return position === -1 ? null : position + 1;
    } catch (error) {
      this.logger.error({ error, commandId }, 'Failed to get command position');
      return null;
    }
  }

  /**
   * Update queue positions for all waiting jobs
   */
  private async updateQueuePositions(): Promise<void> {
    try {
      const waitingJobs = await this.queue.getWaiting();

      for (let i = 0; i < waitingJobs.length; i++) {
        const job = waitingJobs[i];
        if (job) {
          const position = i + 1;
          this.emit('position:updated', job.data.command.id, position);
        }
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to update queue positions');
    }
  }

  /**
   * Get command job by command ID
   */
  async getCommand(commandId: string): Promise<Job<CommandJobData> | null> {
    this.ensureInitialized();

    try {
      const jobs = await this.queue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed']);
      return jobs.find(job => job.data.command.id === commandId) || null;
    } catch (error) {
      this.logger.error({ error, commandId }, 'Failed to get command from queue');
      throw error;
    }
  }

  /**
   * Remove a command from the queue and update positions
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
      this.emit('job:removed', job.id!, commandId);

      // Update positions for remaining waiting jobs
      await this.updateQueuePositions();

      return true;
    } catch (error) {
      this.logger.error({ error, commandId }, 'Failed to remove command from queue');
      throw error;
    }
  }

  /**
   * Interrupt a running command with enhanced error handling
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
      const isWaiting = await job.isWaiting();

      if (!isActive && !isWaiting) {
        return {
          success: false,
          commandId: request.commandId,
          wasInterrupted: false,
          error: 'Command is not currently active or waiting'
        };
      }

      // For forced interruption or waiting jobs, remove immediately
      if (request.force || isWaiting) {
        await job.remove();

        this.logger.info(
          { commandId: request.commandId, reason: request.reason, force: request.force },
          'Command interrupted'
        );

        // Update positions for remaining jobs
        if (isWaiting) {
          await this.updateQueuePositions();
        }

        return {
          success: true,
          commandId: request.commandId,
          wasInterrupted: true,
          reason: request.reason
        };
      }

      // For active jobs, attempt graceful interruption with timeout
      const timeoutMs = request.timeout || 5000;

      try {
        // Add interrupt reason to job data for processor to handle
        await job.updateData({
          ...job.data,
          interruptReason: request.reason
        });

        // Wait for graceful shutdown or timeout
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Interrupt timeout')), timeoutMs)
        );

        await Promise.race([
          job.waitUntilFinished(this.queueEvents),
          timeoutPromise
        ]);

        return {
          success: true,
          commandId: request.commandId,
          wasInterrupted: true,
          reason: request.reason
        };
      } catch (timeoutError) {
        // Force removal if graceful interruption times out
        await job.remove();

        return {
          success: true,
          commandId: request.commandId,
          wasInterrupted: true,
          reason: `${request.reason} (forced after timeout)`
        };
      }
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
   * Get comprehensive queue metrics
   */
  async getMetrics(): Promise<QueueMetrics> {
    this.ensureInitialized();

    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed()
      ]);

      // Calculate average wait and processing times from recent jobs
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
        totalJobs: waiting.length + active.length + completed.length + failed.length + delayed.length,
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
   * Get commands with filtering and pagination
   */
  async getCommands(filter: CommandFilter = {}, limit = 50, offset = 0): Promise<QueuedCommand[]> {
    this.ensureInitialized();

    try {
      const jobs = await this.queue.getJobs(
        ['waiting', 'active', 'completed', 'failed', 'delayed'],
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
    this.emit('queue:paused');
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    this.ensureInitialized();
    await this.queue.resume();
    this.logger.info('Queue resumed');
    this.emit('queue:resumed');
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
   * Graceful shutdown with proper cleanup
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized || this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Starting graceful queue shutdown');

    try {
      // Pause the queue to prevent new jobs
      await this.queue.pause();

      // Wait for active jobs to complete (with timeout)
      const activeJobs = await this.queue.getActive();
      if (activeJobs.length > 0) {
        this.logger.info({ activeJobs: activeJobs.length }, 'Waiting for active jobs to complete');

        const completionPromises = activeJobs.map(job =>
          job.waitUntilFinished(this.queueEvents).catch(() => {}) // Ignore errors, just wait for completion
        );

        // Wait for jobs to complete or timeout after 30 seconds
        await Promise.race([
          Promise.all(completionPromises),
          new Promise(resolve => setTimeout(resolve, 30000))
        ]);
      }

      // Close connections
      await Promise.all([
        this.queue.close(),
        this.queueEvents.close()
      ]);

      this.isInitialized = false;
      this.logger.info('Queue shutdown completed');
    } catch (error) {
      this.logger.error({ error }, 'Error during queue shutdown');
      throw error;
    } finally {
      this.isShuttingDown = false;
    }
  }

  /**
   * Legacy alias for shutdown method
   */
  async close(): Promise<void> {
    return this.shutdown();
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
      throw new Error('QueueManager not initialized. Call initialize() first.');
    }
    if (this.isShuttingDown) {
      throw new Error('QueueManager is shutting down. Cannot perform operations.');
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

// Export legacy CommandQueue class as alias for backward compatibility
export const CommandQueue = QueueManager;