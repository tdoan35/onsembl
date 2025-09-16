/**
 * Command job processor using BullMQ Worker
 */

import { Worker, Job } from 'bullmq';
import { EventEmitter } from 'events';
import { Logger } from 'pino';
import { ConfigManager } from './config.js';
import type {
  CommandJobData,
  CommandJobResult,
  AgentAvailability
} from './types.js';

export interface ProcessorEvents {
  'job:started': (job: Job<CommandJobData>) => void;
  'job:progress': (job: Job<CommandJobData>, progress: number) => void;
  'job:completed': (job: Job<CommandJobData>, result: CommandJobResult) => void;
  'job:failed': (job: Job<CommandJobData>, error: Error) => void;
  'worker:ready': () => void;
  'worker:error': (error: Error) => void;
}

export type CommandProcessor = (job: Job<CommandJobData>) => Promise<CommandJobResult>;

export class CommandQueueProcessor extends EventEmitter {
  private worker: Worker<CommandJobData, CommandJobResult>;
  private logger: Logger;
  private isRunning = false;
  private agentAvailability = new Map<string, AgentAvailability>();

  constructor(
    private processor: CommandProcessor,
    logger: Logger
  ) {
    super();
    this.logger = logger.child({ component: 'CommandQueueProcessor' });
  }

  /**
   * Start the worker to process jobs
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    const config = ConfigManager.get();
    const redisOptions = ConfigManager.getRedisOptions();

    try {
      this.worker = new Worker<CommandJobData, CommandJobResult>(
        config.queue.name,
        this.createJobHandler(),
        {
          connection: redisOptions,
          concurrency: config.queue.concurrency || 10,
          maxStalledCount: config.queue.maxStalledCount || 1,
          stalledInterval: config.queue.stalledInterval || 30000
        }
      );

      this.setupWorkerEventListeners();

      await this.worker.waitUntilReady();

      this.isRunning = true;
      this.logger.info('Command queue processor started');
      this.emit('worker:ready');
    } catch (error) {
      this.logger.error({ error }, 'Failed to start command queue processor');
      throw error;
    }
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.worker.close();
      this.isRunning = false;
      this.logger.info('Command queue processor stopped');
    } catch (error) {
      this.logger.error({ error }, 'Failed to stop command queue processor');
      throw error;
    }
  }

  /**
   * Update agent availability
   */
  updateAgentAvailability(agentId: string, availability: AgentAvailability): void {
    this.agentAvailability.set(agentId, availability);
    this.logger.debug(
      { agentId, availability },
      'Agent availability updated'
    );
  }

  /**
   * Remove agent from availability tracking
   */
  removeAgent(agentId: string): void {
    this.agentAvailability.delete(agentId);
    this.logger.debug({ agentId }, 'Agent removed from availability tracking');
  }

  /**
   * Get available agents for command execution
   */
  getAvailableAgents(): AgentAvailability[] {
    return Array.from(this.agentAvailability.values())
      .filter(agent => agent.isAvailable);
  }

  /**
   * Find the best available agent for a command
   */
  findBestAgent(commandJobData: CommandJobData): AgentAvailability | null {
    const availableAgents = this.getAvailableAgents();

    if (availableAgents.length === 0) {
      return null;
    }

    // If a specific agent is requested, check if it's available
    if (commandJobData.agentId) {
      const requestedAgent = availableAgents.find(
        agent => agent.agentId === commandJobData.agentId
      );
      return requestedAgent || null;
    }

    // Sort by health score and queue length (prefer higher health, lower queue)
    return availableAgents.sort((a, b) => {
      const healthDiff = b.healthScore - a.healthScore;
      if (Math.abs(healthDiff) > 10) {
        return healthDiff;
      }
      return a.queuedCommands - b.queuedCommands;
    })[0] || null;
  }

  /**
   * Get processor statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      totalAgents: this.agentAvailability.size,
      availableAgents: this.getAvailableAgents().length,
      workerConcurrency: this.worker ? this.worker.opts.concurrency : 0
    };
  }

  /**
   * Create the job handler function
   */
  private createJobHandler() {
    return async (job: Job<CommandJobData>): Promise<CommandJobResult> => {
      this.logger.info(
        { jobId: job.id, commandId: job.data.command.id },
        'Processing command job'
      );

      this.emit('job:started', job);

      try {
        // Check if job has been cancelled or interrupted
        if (job.data.interruptReason) {
          throw new Error(`Job interrupted: ${job.data.interruptReason}`);
        }

        // Find an available agent if not specified
        if (!job.data.agentId) {
          const bestAgent = this.findBestAgent(job.data);
          if (!bestAgent) {
            throw new Error('No available agents for command execution');
          }
          job.data.agentId = bestAgent.agentId;
        }

        // Validate agent is still available
        const agent = this.agentAvailability.get(job.data.agentId!);
        if (!agent || !agent.isAvailable) {
          throw new Error(`Agent ${job.data.agentId} is not available`);
        }

        // Mark agent as busy
        this.updateAgentAvailability(job.data.agentId!, {
          ...agent,
          isAvailable: false,
          currentCommandId: job.data.command.id,
          queuedCommands: agent.queuedCommands + 1
        });

        // Execute the command using the provided processor
        const result = await this.processor(job);

        // Mark agent as available again
        this.updateAgentAvailability(job.data.agentId!, {
          ...agent,
          isAvailable: true,
          currentCommandId: undefined,
          queuedCommands: Math.max(0, agent.queuedCommands - 1)
        });

        this.logger.info(
          { jobId: job.id, commandId: job.data.command.id, result },
          'Command job completed successfully'
        );

        this.emit('job:completed', job, result);
        return result;

      } catch (error) {
        // Mark agent as available again on error
        if (job.data.agentId) {
          const agent = this.agentAvailability.get(job.data.agentId);
          if (agent) {
            this.updateAgentAvailability(job.data.agentId, {
              ...agent,
              isAvailable: true,
              currentCommandId: undefined,
              queuedCommands: Math.max(0, agent.queuedCommands - 1)
            });
          }
        }

        this.logger.error(
          { jobId: job.id, commandId: job.data.command.id, error },
          'Command job failed'
        );

        this.emit('job:failed', job, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    };
  }

  /**
   * Setup event listeners for the worker
   */
  private setupWorkerEventListeners(): void {
    this.worker.on('progress', (job, progress) => {
      this.logger.debug(
        { jobId: job.id, progress },
        'Job progress update'
      );
      this.emit('job:progress', job, progress);
    });

    this.worker.on('error', (error) => {
      this.logger.error({ error }, 'Worker error');
      this.emit('worker:error', error);
    });

    this.worker.on('stalled', (jobId) => {
      this.logger.warn({ jobId }, 'Job stalled');
    });

    this.worker.on('ready', () => {
      this.logger.info('Worker ready');
    });

    this.worker.on('closing', () => {
      this.logger.info('Worker closing');
    });

    this.worker.on('closed', () => {
      this.logger.info('Worker closed');
    });
  }
}

/**
 * Factory function to create a command processor with agent communication
 */
export function createAgentCommandProcessor(
  sendCommandToAgent: (agentId: string, command: any) => Promise<any>,
  logger: Logger
): CommandProcessor {
  return async (job: Job<CommandJobData>): Promise<CommandJobResult> => {
    const { command, agentId, executionConstraints } = job.data;
    const startTime = Date.now();

    if (!agentId) {
      throw new Error('No agent assigned to command');
    }

    try {
      // Send command to agent
      const agentResponse = await sendCommandToAgent(agentId, {
        commandId: command.id,
        content: command.content,
        type: command.type,
        priority: command.priority,
        executionConstraints
      });

      const executionTime = Date.now() - startTime;

      // Update job progress
      await job.updateProgress(100);

      return {
        success: true,
        commandId: command.id,
        agentId,
        executionTime,
        tokensUsed: agentResponse.tokensUsed || 0,
        output: agentResponse.output
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        commandId: command.id,
        agentId,
        executionTime,
        tokensUsed: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  };
}

/**
 * Default mock processor for testing
 */
export function createMockProcessor(logger: Logger): CommandProcessor {
  return async (job: Job<CommandJobData>): Promise<CommandJobResult> => {
    const { command } = job.data;
    const startTime = Date.now();

    // Simulate processing time based on command type
    const processingTime = {
      'NATURAL': 2000,
      'INVESTIGATE': 5000,
      'REVIEW': 3000,
      'PLAN': 4000,
      'SYNTHESIZE': 6000
    }[command.type] || 2000;

    // Simulate progress updates
    const progressSteps = 5;
    for (let i = 1; i <= progressSteps; i++) {
      await new Promise(resolve => setTimeout(resolve, processingTime / progressSteps));
      await job.updateProgress((i / progressSteps) * 100);
    }

    const executionTime = Date.now() - startTime;

    logger.info(
      { commandId: command.id, executionTime },
      'Mock command processed'
    );

    return {
      success: true,
      commandId: command.id,
      agentId: job.data.agentId || 'mock-agent',
      executionTime,
      tokensUsed: Math.floor(Math.random() * 1000) + 100,
      output: `Mock output for command: ${command.content}`
    };
  };
}