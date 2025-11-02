/**
 * CommandService with BullMQ queue management - T079 Implementation
 *
 * This service orchestrates command execution with comprehensive queue management,
 * integrating CommandModel, CommandQueueModel, and BullMQ for priority-based
 * command processing with terminal output streaming and trace collection.
 */

import { createClient } from '@supabase/supabase-js';
import { FastifyInstance } from 'fastify';
import { Database } from '../types/database';
import { CommandModel, CommandRow, CommandInsert, CommandType, CommandStatus } from '../models/command';
import { CommandQueueModel, CommandQueueRow } from '../models/command-queue';
import { TerminalOutputModel } from '../models/terminal-output';
import { TraceEntryModel } from '../models/trace-entry';
import { EventEmitter } from 'events';
import { Queue, Worker } from 'bullmq';

// BullMQ job data interfaces
export interface CommandJobData {
  command: CommandRow;
  agentId: string;
  userId: string;
  priority: number;
  executionConstraints?: {
    timeLimitMs?: number;
    tokenBudget?: number;
  };
  interruptReason?: string;
}

export interface CommandJobResult {
  success: boolean;
  commandId: string;
  agentId: string;
  executionTime: number;
  tokensUsed: number;
  error?: string;
  output?: string;
}

export interface InterruptRequest {
  commandId: string;
  reason: string;
  force: boolean;
  timeout?: number;
}

export interface InterruptResult {
  success: boolean;
  commandId: string;
  wasInterrupted: boolean;
  reason?: string;
  error?: string;
}

export interface CommandServiceEvents {
  'command:created': (command: CommandRow) => void;
  'command:queued': (command: CommandRow, queueItem: CommandQueueRow) => void;
  'command:started': (command: CommandRow) => void;
  'command:completed': (command: CommandRow) => void;
  'command:failed': (command: CommandRow, error: string) => void;
  'command:cancelled': (command: CommandRow) => void;
  'command:interrupted': (command: CommandRow, reason: string) => void;
  'terminal:output': (commandId: string, output: any) => void;
  'trace:added': (commandId: string, trace: any) => void;
  'queue:position:updated': (commandId: string, position: number) => void;
}

export class CommandService extends EventEmitter {
  private commandModel: CommandModel;
  private commandQueueModel: CommandQueueModel;
  private terminalOutputModel: TerminalOutputModel;
  private traceEntryModel: TraceEntryModel;
  private commandQueue: Queue;
  private priorityQueues: Map<string, Queue>; // Agent-specific priority queues
  private queueWorkers: Map<string, Worker>; // BullMQ workers
  private terminalOutputs: Map<string, any[]>;
  private traceEntries: Map<string, any[]>;
  private activeCommands: Map<string, { abortController: AbortController; startTime: number; priority: number }>;

  constructor(
    private supabase: ReturnType<typeof createClient<Database>>,
    private fastify: FastifyInstance,
    private redisConnection: any // Redis connection for BullMQ
  ) {
    super();
    this.commandModel = new CommandModel(supabase);
    this.commandQueueModel = new CommandQueueModel(supabase);
    this.terminalOutputModel = new TerminalOutputModel(supabase);
    this.traceEntryModel = new TraceEntryModel(supabase);

    // Initialize BullMQ queue
    this.commandQueue = new Queue('command-execution', {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        delay: 0,
      },
    });

    this.priorityQueues = new Map();
    this.queueWorkers = new Map();
    this.terminalOutputs = new Map();
    this.traceEntries = new Map();
    this.activeCommands = new Map();

    this.setupQueueEventHandlers();
    this.setupQueueWorkers();
  }

  /**
   * Creates a new command and adds it to the queue
   */
  async createCommand(agentId: string, data: Partial<CommandInsert>): Promise<{ command: CommandRow; queueItem: CommandQueueRow }> {
    try {
      // Create command record
      const command = await this.commandModel.create({
        agent_id: agentId,
        type: (data.type as CommandType) || 'NATURAL',
        prompt: data.prompt || (data as any).command || '',
        status: 'QUEUED' as CommandStatus,
        priority: data.priority || 50,
        metadata: data.metadata || {},
      });

      // Add to queue for execution
      const queueItem = await this.enqueueCommand(command.id, agentId, data.priority || 50);

      this.emit('command:created', command);
      this.emit('command:queued', command, queueItem);

      if (this.fastify.log && typeof this.fastify.log.info === 'function') {
        this.fastify.log.info({ commandId: command.id, agentId, priority: data.priority }, 'Command created and queued');
      }

      return { command, queueItem };
    } catch (error) {
      if (this.fastify.log && typeof this.fastify.log.error === 'function') {
        this.fastify.log.error({ error, agentId }, 'Failed to create command');
      }
      throw error;
    }
  }

  /**
   * Gets a command by ID
   */
  async getCommand(id: string): Promise<CommandRow> {
    return this.commandModel.findById(id);
  }

  /**
   * Gets commands with optional filtering
   */
  async getCommands(filters?: {
    agent_id?: string;
    status?: CommandStatus;
    type?: CommandType;
    limit?: number;
    offset?: number;
  }): Promise<CommandRow[]> {
    return this.commandModel.findAll(filters);
  }

  /**
   * Gets a command with queue position info
   */
  async getCommandWithQueueInfo(id: string): Promise<{ command: CommandRow; queuePosition?: number }> {
    const command = await this.commandModel.findById(id);
    let queuePosition: number | null = null;

    if (command.status === 'QUEUED') {
      queuePosition = await this.commandQueueModel.getPosition(id);
    }

    return { command, queuePosition: queuePosition || undefined };
  }

  /**
   * Fetch commands that are currently active or waiting in the queue.
   * Used by the dashboard to seed initial command state after websocket init.
   */
  async getActiveCommands(): Promise<Array<{
    id: string;
    agentId: string;
    status: CommandStatus;
    progress?: number | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
  }>> {
    try {
      const [running, queued] = await Promise.all([
        this.commandModel.findAll({ status: 'RUNNING' as CommandStatus }),
        this.commandModel.findAll({ status: 'QUEUED' as CommandStatus }),
      ]);

      const combine = [...running, ...queued];

      return combine.map(command => ({
        id: command.id,
        agentId: command.agent_id,
        status: command.status,
        progress: typeof command.metadata === 'object' && command.metadata !== null
          ? (command.metadata as Record<string, any>)?.progress ?? null
          : null,
        startedAt: command.started_at ? new Date(command.started_at) : null,
        completedAt: command.completed_at ? new Date(command.completed_at) : null,
      }));
    } catch (error) {
      this.fastify.log.error({ error }, 'Failed to fetch active commands for dashboard');
      return [];
    }
  }

  /**
   * Executes a command (moves from queue to processing)
   */
  async executeCommand(commandId: string): Promise<CommandRow> {
    try {
      // Get command and validate it's ready for execution
      const command = await this.commandModel.findById(commandId);
      if (command.status !== 'QUEUED') {
        throw new Error(`Command ${commandId} is not queued for execution (status: ${command.status})`);
      }

      // Start execution
      const updatedCommand = await this.commandModel.start(commandId);
      const abortController = new AbortController();

      this.activeCommands.set(commandId, {
        abortController,
        startTime: Date.now(),
        priority: updatedCommand.priority
      });

      this.emit('command:started', updatedCommand);

      if (this.fastify.log && typeof this.fastify.log.info === 'function') {
        this.fastify.log.info({ commandId }, 'Command execution started');
      }

      // Queue the command for BullMQ processing
      const jobData: CommandJobData = {
        command: updatedCommand,
        agentId: updatedCommand.agent_id,
        userId: 'system', // TODO: Get from context
        priority: updatedCommand.priority,
        executionConstraints: undefined, // TODO: Add constraint support
      };

      await this.commandQueue.add(
        `execute-${commandId}`,
        jobData,
        {
          priority: updatedCommand.priority,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );

      return updatedCommand;
    } catch (error) {
      if (this.fastify.log && typeof this.fastify.log.error === 'function') {
        this.fastify.log.error({ error, commandId }, 'Failed to execute command');
      }
      throw error;
    }
  }

  /**
   * Completes a command with the execution result
   */
  async completeCommand(commandId: string, result: CommandJobResult): Promise<CommandRow> {
    try {
      // Clean up active command tracking
      this.activeCommands.delete(commandId);

      // Update command status based on result
      let command: CommandRow;
      if (result.success) {
        command = await this.commandModel.complete(commandId, {
          output: result.output,
          tokensUsed: result.tokensUsed,
          executionTime: result.executionTime,
        });
        this.emit('command:completed', command);
      } else {
        command = await this.commandModel.fail(commandId, result.error || 'Unknown error', {
          executionTime: result.executionTime,
          tokensUsed: result.tokensUsed,
        });
        this.emit('command:failed', command, result.error || 'Unknown error');
      }

      // Store terminal outputs and traces
      await this.flushCommandData(commandId);

      if (this.fastify.log && typeof this.fastify.log.info === 'function') {
        this.fastify.log.info({
          commandId,
          success: result.success,
          executionTime: result.executionTime,
          tokensUsed: result.tokensUsed
        }, 'Command completed');
      }

      return command;
    } catch (error) {
      if (this.fastify.log && typeof this.fastify.log.error === 'function') {
        this.fastify.log.error({ error, commandId }, 'Failed to complete command');
      }
      throw error;
    }
  }

  /**
   * Cancels a command
   */
  async cancelCommand(commandId: string, reason?: string): Promise<CommandRow> {
    try {
      // Remove from queue if still queued
      try {
        const queueItem = await this.supabase
          .from('command_queue')
          .select('*')
          .eq('command_id', commandId)
          .maybeSingle();

        if (queueItem.data) {
          await this.commandQueueModel.remove(queueItem.data.id);
        }
      } catch (error) {
        // Queue item might not exist, continue with cancellation
      }

      // Cancel running command if active
      const activeCommand = this.activeCommands.get(commandId);
      if (activeCommand) {
        activeCommand.abortController.abort();
        this.activeCommands.delete(commandId);
      }

      // Update command status
      const command = await this.commandModel.cancel(commandId);

      // Clean up memory
      this.terminalOutputs.delete(commandId);
      this.traceEntries.delete(commandId);

      this.emit('command:cancelled', command);

      if (this.fastify.log && typeof this.fastify.log.info === 'function') {
        this.fastify.log.info({ commandId, reason }, 'Command cancelled');
      }

      return command;
    } catch (error) {
      if (this.fastify.log && typeof this.fastify.log.error === 'function') {
        this.fastify.log.error({ error, commandId }, 'Failed to cancel command');
      }
      throw error;
    }
  }

  /**
   * Interrupts a running command
   */
  async interruptCommand(request: InterruptRequest): Promise<InterruptResult> {
    try {
      const { commandId, reason, force, timeout = 30000 } = request;
      const command = await this.commandModel.findById(commandId);

      if (command.status !== 'RUNNING') {
        return {
          success: false,
          commandId,
          wasInterrupted: false,
          error: `Command is not running (status: ${command.status})`,
        };
      }

      const activeCommand = this.activeCommands.get(commandId);
      if (!activeCommand) {
        return {
          success: false,
          commandId,
          wasInterrupted: false,
          error: 'Command not found in active commands',
        };
      }

      // Signal interruption
      activeCommand.abortController.abort();

      // Wait for graceful shutdown or force after timeout
      const result = await this.waitForInterruption(commandId, reason, timeout);

      if (result.wasInterrupted) {
        const updatedCommand = await this.commandModel.findById(commandId);
        this.emit('command:interrupted', updatedCommand, reason);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        commandId: request.commandId,
        wasInterrupted: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Enqueues a command for processing
   */
  async enqueueCommand(commandId: string, agentId: string, priority: number = 50, estimatedDurationMs?: number): Promise<CommandQueueRow> {
    try {
      return await this.commandQueueModel.enqueue(commandId, agentId, priority, estimatedDurationMs);
    } catch (error) {
      if (this.fastify.log && typeof this.fastify.log.error === 'function') {
        this.fastify.log.error({ error, commandId, agentId }, 'Failed to enqueue command');
      }
      throw error;
    }
  }

  /**
   * Gets command output (terminal outputs)
   */
  async getCommandOutput(commandId: string, limit: number = 100): Promise<any[]> {
    try {
      // Get live outputs from memory first
      const liveOutputs = this.terminalOutputs.get(commandId) || [];

      // Get persisted outputs from database
      const persistedOutputs = await this.terminalOutputModel.findByCommandId(commandId, limit);

      // Combine and sort by timestamp
      const allOutputs = [...persistedOutputs, ...liveOutputs]
        .sort((a, b) => new Date(a.timestamp || a.created_at).getTime() - new Date(b.timestamp || b.created_at).getTime());

      return allOutputs.slice(-limit); // Return most recent outputs
    } catch (error) {
      if (this.fastify.log && typeof this.fastify.log.error === 'function') {
        this.fastify.log.error({ error, commandId }, 'Failed to get command output');
      }
      throw error;
    }
  }

  /**
   * Gets queue status for an agent
   */
  async getQueueStatus(agentId?: string): Promise<{
    pending: CommandRow[];
    running: CommandRow[];
    stats: { total: number; avgPriority: number; estimatedTotalDuration: number; oldestItem: string | null };
  }> {
    try {
      const queueStats = await this.commandQueueModel.getQueueStats(agentId);
      const pendingCommands = await this.commandModel.findAll({ agent_id: agentId, status: 'QUEUED' });
      const runningCommands = await this.commandModel.findAll({ agent_id: agentId, status: 'RUNNING' });

      return {
        pending: pendingCommands,
        running: runningCommands,
        stats: queueStats,
      };
    } catch (error) {
      if (this.fastify.log && typeof this.fastify.log.error === 'function') {
        this.fastify.log.error({ error, agentId }, 'Failed to get queue status');
      }
      throw error;
    }
  }

  /**
   * Updates command priority
   */
  async updateCommandPriority(commandId: string, newPriority: number): Promise<{ command: CommandRow; queueItem?: CommandQueueRow }> {
    try {
      // Update command priority
      const command = await this.commandModel.update(commandId, { priority: newPriority });

      // Update queue priority if command is still queued
      let queueItem: CommandQueueRow | undefined;
      if (command.status === 'QUEUED') {
        const queueData = await this.supabase
          .from('command_queue')
          .select('*')
          .eq('command_id', commandId)
          .maybeSingle();

        if (queueData.data) {
          queueItem = await this.commandQueueModel.updatePriority(queueData.data.id, newPriority);
          const newPosition = await this.commandQueueModel.getPosition(commandId);
          if (newPosition) {
            this.emit('queue:position:updated', commandId, newPosition);
          }
        }
      }

      if (this.fastify.log && typeof this.fastify.log.info === 'function') {
        this.fastify.log.info({ commandId, newPriority }, 'Command priority updated');
      }

      return { command, queueItem };
    } catch (error) {
      if (this.fastify.log && typeof this.fastify.log.error === 'function') {
        this.fastify.log.error({ error, commandId, newPriority }, 'Failed to update command priority');
      }
      throw error;
    }
  }

  /**
   * Appends terminal output for streaming
   */
  async appendTerminalOutput(commandId: string, output: {
    agentId: string;
    output: string;
    type: 'stdout' | 'stderr' | 'system';
    sequence: number;
    timestamp: string;
  }): Promise<void> {
    // Store in memory for batching
    if (!this.terminalOutputs.has(commandId)) {
      this.terminalOutputs.set(commandId, []);
    }

    this.terminalOutputs.get(commandId)!.push(output);

    // Emit event for real-time streaming
    this.emit('terminal:output', commandId, output);

    // Batch save every 10 outputs
    const outputs = this.terminalOutputs.get(commandId)!;
    if (outputs.length >= 10) {
      await this.saveTerminalOutputs(commandId, outputs);
      this.terminalOutputs.set(commandId, []);
    }
  }

  /**
   * Adds a trace entry
   */
  async addTraceEntry(entry: {
    commandId: string;
    agentId: string;
    parentId?: string;
    type: string;
    content: any;
    metadata?: any;
  }): Promise<void> {
    // Store in memory for batching
    if (!this.traceEntries.has(entry.commandId)) {
      this.traceEntries.set(entry.commandId, []);
    }

    this.traceEntries.get(entry.commandId)!.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });

    // Emit event for real-time updates
    this.emit('trace:added', entry.commandId, entry);

    // Batch save every 5 entries
    const traces = this.traceEntries.get(entry.commandId)!;
    if (traces.length >= 5) {
      await this.saveTraceEntries(entry.commandId, traces);
      this.traceEntries.set(entry.commandId, []);
    }
  }

  /**
   * Gets the trace tree for a command
   */
  async getTraceTree(commandId: string): Promise<any[]> {
    try {
      const entries = await this.traceEntryModel.findByCommandId(commandId);
      return this.buildTraceTree(entries);
    } catch (error) {
      if (this.fastify.log && typeof this.fastify.log.error === 'function') {
        this.fastify.log.error({ error, commandId }, 'Failed to get trace tree');
      }
      throw error;
    }
  }

  /**
   * Gets command statistics
   */
  async getCommandStats(agentId?: string) {
    return this.commandModel.getCommandStats(agentId);
  }

  /**
   * Gets the next command for an agent
   */
  async getNextCommand(agentId: string): Promise<CommandRow | null> {
    try {
      // Use queue model to get next command based on priority
      const queueItem = await this.commandQueueModel.peek(agentId);
      if (!queueItem) {
        return null;
      }

      return await this.commandModel.findById(queueItem.command_id);
    } catch (error) {
      if (this.fastify.log && typeof this.fastify.log.error === 'function') {
        this.fastify.log.error({ error, agentId }, 'Failed to get next command');
      }
      throw error;
    }
  }

  /**
   * Dequeues the next command for processing
   */
  async dequeueNextCommand(agentId?: string): Promise<{ command: CommandRow; queueItem: CommandQueueRow } | null> {
    try {
      const queueItem = await this.commandQueueModel.dequeue(agentId);
      if (!queueItem) {
        return null;
      }

      const command = await this.commandModel.findById(queueItem.command_id);
      return { command, queueItem };
    } catch (error) {
      if (this.fastify.log && typeof this.fastify.log.error === 'function') {
        this.fastify.log.error({ error, agentId }, 'Failed to dequeue next command');
      }
      throw error;
    }
  }

  /**
   * Gets service health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeCommands: number;
    queuedCommands: number;
    memoryUsage: { outputs: number; traces: number };
    uptime: number;
  }> {
    try {
      const queueStats = await this.commandQueueModel.getQueueStats();
      const activeCommandCount = this.activeCommands.size;
      const outputsInMemory = Array.from(this.terminalOutputs.values()).reduce((sum, outputs) => sum + outputs.length, 0);
      const tracesInMemory = Array.from(this.traceEntries.values()).reduce((sum, traces) => sum + traces.length, 0);

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (activeCommandCount > 10 || queueStats.total > 100) {
        status = 'degraded';
      }
      if (activeCommandCount > 50 || queueStats.total > 500) {
        status = 'unhealthy';
      }

      return {
        status,
        activeCommands: activeCommandCount,
        queuedCommands: queueStats.total,
        memoryUsage: {
          outputs: outputsInMemory,
          traces: tracesInMemory,
        },
        uptime: process.uptime(),
      };
    } catch (error) {
      if (this.fastify.log && typeof this.fastify.log.error === 'function') {
        this.fastify.log.error({ error }, 'Failed to get health status');
      }
      return {
        status: 'unhealthy',
        activeCommands: 0,
        queuedCommands: 0,
        memoryUsage: { outputs: 0, traces: 0 },
        uptime: 0,
      };
    }
  }

  /**
   * Cleanup service resources
   */
  async cleanup(): Promise<void> {
    try {
      // Save any remaining outputs and traces
      for (const [commandId, outputs] of this.terminalOutputs.entries()) {
        if (outputs.length > 0) {
          await this.saveTerminalOutputs(commandId, outputs);
        }
      }

      for (const [commandId, traces] of this.traceEntries.entries()) {
        if (traces.length > 0) {
          await this.saveTraceEntries(commandId, traces);
        }
      }

      // Cleanup active commands
      for (const [commandId, activeCommand] of this.activeCommands.entries()) {
        activeCommand.abortController.abort();
        try {
          await this.commandModel.fail(commandId, 'Service cleanup - command aborted');
        } catch (error) {
          // Log error but continue cleanup
        }
      }

      // Clear all maps
      this.terminalOutputs.clear();
      this.traceEntries.clear();
      this.activeCommands.clear();

      // Cleanup queue model subscriptions
      this.commandQueueModel.unsubscribeAll();

      // Close all workers
      for (const [name, worker] of this.queueWorkers.entries()) {
        try {
          await worker.close();
          this.fastify.log.info({ workerName: name }, 'Worker closed');
        } catch (error) {
          this.fastify.log.error({ error, workerName: name }, 'Error closing worker');
        }
      }
      this.queueWorkers.clear();

      // Close all priority queues
      for (const [agentId, queue] of this.priorityQueues.entries()) {
        try {
          await queue.close();
          this.fastify.log.info({ agentId }, 'Agent queue closed');
        } catch (error) {
          this.fastify.log.error({ error, agentId }, 'Error closing agent queue');
        }
      }
      this.priorityQueues.clear();

      // Close main BullMQ queue
      await this.commandQueue.close();

      if (this.fastify.log && typeof this.fastify.log.info === 'function') {
        this.fastify.log.info('CommandService cleanup completed');
      }
    } catch (error) {
      if (this.fastify.log && typeof this.fastify.log.error === 'function') {
        this.fastify.log.error({ error }, 'Error during CommandService cleanup');
      }
      throw error;
    }
  }

  // Private helper methods

  /**
   * Set up BullMQ workers for command processing
   */
  private setupQueueWorkers(): void {
    // Create main command worker
    const mainWorker = new Worker('command-execution', async (job) => {
      const jobData = job.data as CommandJobData;
      return this.processCommand(jobData, job);
    }, {
      connection: this.redisConnection,
      concurrency: parseInt(process.env['QUEUE_CONCURRENCY'] || '5', 10),
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    // Set up worker event handlers
    mainWorker.on('completed', (job, result: CommandJobResult) => {
      this.fastify.log.info({
        jobId: job.id,
        commandId: result.commandId,
        executionTime: result.executionTime
      }, 'Job completed successfully');
    });

    mainWorker.on('failed', (job, error) => {
      this.fastify.log.error({
        jobId: job?.id,
        error: error.message,
        stack: error.stack
      }, 'Job failed');
    });

    mainWorker.on('stalled', (jobId) => {
      this.fastify.log.warn({ jobId }, 'Job stalled');
    });

    mainWorker.on('error', (error) => {
      this.fastify.log.error({ error: error.message }, 'Worker error');
    });

    this.queueWorkers.set('main', mainWorker);

    // Set up queue health monitoring
    this.setupQueueHealthMonitoring();
  }

  /**
   * Process a command job
   */
  private async processCommand(jobData: CommandJobData, job: any): Promise<CommandJobResult> {
    const startTime = Date.now();
    const { command, agentId } = jobData;

    try {
      // Update job progress
      await job.updateProgress(10);

      // Simulate command processing (replace with actual command execution logic)
      this.fastify.log.info({
        commandId: command.id,
        agentId,
        type: command.type,
        prompt: command.prompt?.substring(0, 100)
      }, 'Processing command');

      // Update progress
      await job.updateProgress(50);

      // Simulate some processing time
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update progress
      await job.updateProgress(80);

      // Final processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Complete
      await job.updateProgress(100);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        commandId: command.id,
        agentId,
        executionTime,
        tokensUsed: Math.floor(Math.random() * 1000), // Simulated
        output: `Command ${command.id} executed successfully`,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        commandId: command.id,
        agentId,
        executionTime,
        tokensUsed: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Set up queue health monitoring
   */
  private setupQueueHealthMonitoring(): void {
    // Monitor queue health every 30 seconds
    setInterval(async () => {
      try {
        const waiting = await this.commandQueue.getWaiting();
        const active = await this.commandQueue.getActive();
        const completed = await this.commandQueue.getCompleted();
        const failed = await this.commandQueue.getFailed();

        this.fastify.log.debug({
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length
        }, 'Queue health status');

        // Emit queue status event
        this.emit('queue:health', {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          timestamp: new Date().toISOString(),
        });

        // Alert on high queue depth
        if (waiting.length > 50) {
          this.fastify.log.warn({
            queueDepth: waiting.length
          }, 'High queue depth detected');
        }

        // Clean old jobs periodically
        if (completed.length > 200) {
          await this.commandQueue.clean(24 * 60 * 60 * 1000, 100, 'completed'); // Clean completed jobs older than 24h
        }

        if (failed.length > 100) {
          await this.commandQueue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed'); // Clean failed jobs older than 7 days
        }
      } catch (error) {
        this.fastify.log.error({ error: (error as Error).message }, 'Queue health monitoring error');
      }
    }, 30000);
  }

  /**
   * Get detailed queue metrics
   */
  async getQueueMetrics(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
    throughput: { completed: number; failed: number };
  }> {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.commandQueue.getWaiting(),
        this.commandQueue.getActive(),
        this.commandQueue.getCompleted(),
        this.commandQueue.getFailed(),
        this.commandQueue.getDelayed(),
      ]);

      const isPaused = await this.commandQueue.isPaused();

      // Calculate throughput for last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentCompleted = completed.filter(job =>
        job.finishedOn && new Date(job.finishedOn) > oneHourAgo
      );
      const recentFailed = failed.filter(job =>
        job.failedReason && job.finishedOn && new Date(job.finishedOn) > oneHourAgo
      );

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: isPaused ? 1 : 0,
        throughput: {
          completed: recentCompleted.length,
          failed: recentFailed.length,
        },
      };
    } catch (error) {
      this.fastify.log.error({ error: (error as Error).message }, 'Failed to get queue metrics');
      throw error;
    }
  }

  /**
   * Create agent-specific priority queue
   */
  async createAgentQueue(agentId: string): Promise<void> {
    if (this.priorityQueues.has(agentId)) {
      return; // Queue already exists
    }

    const agentQueue = new Queue(`agent-${agentId}`, {
      connection: this.redisConnection,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    });

    const agentWorker = new Worker(`agent-${agentId}`, async (job) => {
      const jobData = job.data as CommandJobData;
      return this.processCommand(jobData, job);
    }, {
      connection: this.redisConnection,
      concurrency: 2, // Lower concurrency for agent-specific queues
    });

    this.priorityQueues.set(agentId, agentQueue);
    this.queueWorkers.set(`agent-${agentId}`, agentWorker);

    this.fastify.log.info({ agentId }, 'Created agent-specific queue');
  }

  private setupQueueEventHandlers(): void {
    // Handle job completion
    this.commandQueue.on('completed', async (job, result: CommandJobResult) => {
      try {
        await this.completeCommand(result.commandId, result);
      } catch (error) {
        // Handle completion error
      }
    });

    // Handle job failure
    this.commandQueue.on('failed', async (job, error) => {
      try {
        const jobData = job.data as CommandJobData;
        const result: CommandJobResult = {
          success: false,
          commandId: jobData.command.id,
          agentId: jobData.agentId || 'unknown',
          executionTime: Date.now() - (this.activeCommands.get(jobData.command.id)?.startTime || Date.now()),
          tokensUsed: 0,
          error: error.message,
        };
        await this.completeCommand(jobData.command.id, result);
      } catch (completionError) {
        // Handle error in error handling
      }
    });

    // Handle job stall (timeout)
    this.commandQueue.on('stalled', async (job) => {
      try {
        const jobData = job.data as CommandJobData;
        const result: CommandJobResult = {
          success: false,
          commandId: jobData.command.id,
          agentId: jobData.agentId || 'unknown',
          executionTime: Date.now() - (this.activeCommands.get(jobData.command.id)?.startTime || Date.now()),
          tokensUsed: 0,
          error: 'Command execution stalled/timeout',
        };
        await this.completeCommand(jobData.command.id, result);
      } catch (error) {
        // Handle stall error
      }
    });
  }

  private async waitForInterruption(commandId: string, reason: string, timeout: number): Promise<InterruptResult> {
    return new Promise<InterruptResult>((resolve) => {
      const checkComplete = () => {
        const cmd = this.activeCommands.get(commandId);
        if (!cmd) {
          resolve({
            success: true,
            commandId,
            wasInterrupted: true,
            reason,
          });
        }
      };

      const interval = setInterval(checkComplete, 100);

      setTimeout(() => {
        clearInterval(interval);
        if (this.activeCommands.has(commandId)) {
          // Force cleanup
          this.activeCommands.delete(commandId);
          this.commandModel.fail(commandId, `Command interrupted: ${reason}`);
        }
        resolve({
          success: true,
          commandId,
          wasInterrupted: true,
          reason: `${reason} (forced)`,
        });
      }, timeout);
    });
  }

  private async flushCommandData(commandId: string): Promise<void> {
    // Store terminal outputs to database
    const outputs = this.terminalOutputs.get(commandId);
    if (outputs && outputs.length > 0) {
      await this.saveTerminalOutputs(commandId, outputs);
      this.terminalOutputs.delete(commandId);
    }

    // Store trace entries to database
    const traces = this.traceEntries.get(commandId);
    if (traces && traces.length > 0) {
      await this.saveTraceEntries(commandId, traces);
      this.traceEntries.delete(commandId);
    }
  }

  private async saveTerminalOutputs(commandId: string, outputs: any[]): Promise<void> {
    try {
      const insertData = outputs.map((output) => ({
        command_id: commandId,
        agent_id: output.agentId,
        output: output.output,
        type: output.type,
        sequence_number: output.sequence || 0,
        timestamp: output.timestamp,
      }));

      // Use direct Supabase insert to avoid model dependencies
      const { error } = await this.supabase
        .from('terminal_outputs')
        .insert(insertData);

      if (error) throw error;
    } catch (error) {
      // Log error but don't throw to avoid breaking command completion
      if (this.fastify.log && typeof this.fastify.log.error === 'function') {
        this.fastify.log.error({ error, commandId }, 'Failed to save terminal outputs');
      }
    }
  }

  private async saveTraceEntries(commandId: string, traces: any[]): Promise<void> {
    try {
      const insertData = traces.map((trace) => ({
        command_id: commandId,
        agent_id: trace.agentId,
        parent_id: trace.parentId,
        entry_type: trace.type,
        content: trace.content,
        metadata: trace.metadata,
        timestamp: trace.timestamp,
      }));

      // Use direct Supabase insert to avoid model dependencies
      const { error } = await this.supabase
        .from('trace_entries')
        .insert(insertData);

      if (error) throw error;
    } catch (error) {
      // Log error but don't throw to avoid breaking command completion
      if (this.fastify.log && typeof this.fastify.log.error === 'function') {
        this.fastify.log.error({ error, commandId }, 'Failed to save trace entries');
      }
    }
  }

  private buildTraceTree(entries: any[]): any[] {
    const map = new Map();
    const roots: any[] = [];

    // First pass: create all nodes
    entries.forEach((entry) => {
      map.set(entry.id, {
        ...entry,
        children: [],
      });
    });

    // Second pass: build tree
    entries.forEach((entry) => {
      if (entry.parent_id) {
        const parent = map.get(entry.parent_id);
        if (parent) {
          parent.children.push(map.get(entry.id));
        }
      } else {
        roots.push(map.get(entry.id));
      }
    });

    return roots;
  }
}
