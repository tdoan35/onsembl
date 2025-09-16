/**
 * Main trace collector implementation
 */

import { EventEmitter } from 'events';
import { Logger } from 'pino';
import type { TraceEntry } from '@onsembl/agent-protocol';
import { TreeBuilder } from './tree-builder.js';
import { MetricsCalculator } from './metrics.js';
import type {
  TraceCollectorConfig,
  TraceAggregation,
  TraceStats,
  TraceStorage,
  TraceFilter,
  EnhancedTraceEntry,
  TraceUpdate,
  PerformanceAnalysis
} from './types.js';

export interface TraceCollectorEvents {
  'trace:added': (trace: EnhancedTraceEntry) => void;
  'trace:updated': (trace: EnhancedTraceEntry) => void;
  'trace:completed': (aggregation: TraceAggregation) => void;
  'trace:error': (error: Error, traceId?: string) => void;
  'command:completed': (commandId: string, aggregation: TraceAggregation) => void;
}

export class TraceCollector extends EventEmitter {
  private storage: TraceStorage;
  private treeBuilder: TreeBuilder;
  private metricsCalculator: MetricsCalculator;
  private logger: Logger;
  private config: TraceCollectorConfig;
  private activeCommands = new Map<string, TraceEntry[]>();
  private commandTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    storage: TraceStorage,
    logger: Logger,
    config: Partial<TraceCollectorConfig> = {}
  ) {
    super();
    this.storage = storage;
    this.logger = logger.child({ component: 'TraceCollector' });
    this.treeBuilder = new TreeBuilder(logger);
    this.metricsCalculator = new MetricsCalculator();
    this.config = {
      maxTraceDepth: 20,
      maxTracesPerCommand: 1000,
      retentionPeriodMs: 30 * 24 * 60 * 60 * 1000, // 30 days
      enableRealTimeAnalysis: true,
      performanceThresholds: {
        slowTraceMs: 1000,
        verySlowTraceMs: 5000,
        highTokenUsage: 1000
      },
      exportLimits: {
        maxExportSize: 10 * 1024 * 1024, // 10MB
        maxExportDepth: 50
      },
      ...config
    };
  }

  /**
   * Add a trace entry to the collection
   */
  async addTrace(trace: TraceEntry): Promise<void> {
    try {
      // Validate trace depth
      const depth = await this.calculateTraceDepth(trace);
      if (depth > this.config.maxTraceDepth) {
        this.logger.warn(
          { traceId: trace.id, depth, maxDepth: this.config.maxTraceDepth },
          'Trace depth exceeds maximum, skipping'
        );
        return;
      }

      // Store the trace
      await this.storage.store(trace);

      // Add to active command tracking
      if (!this.activeCommands.has(trace.commandId)) {
        this.activeCommands.set(trace.commandId, []);
      }

      const commandTraces = this.activeCommands.get(trace.commandId)!;

      // Check command trace limit
      if (commandTraces.length >= this.config.maxTracesPerCommand) {
        this.logger.warn(
          { commandId: trace.commandId, traceCount: commandTraces.length },
          'Command trace limit exceeded, removing oldest trace'
        );
        commandTraces.shift();
      }

      commandTraces.push(trace);

      // Create enhanced trace entry
      const enhancedTrace = await this.enhanceTrace(trace);

      // Emit trace added event
      this.emit('trace:added', enhancedTrace);

      // Set up command completion timer if this is the first trace
      if (commandTraces.length === 1) {
        this.setupCommandTimer(trace.commandId);
      }

      // If trace is completed, check if command is complete
      if (trace.completedAt) {
        await this.checkCommandCompletion(trace.commandId);
      }

      this.logger.debug(
        { traceId: trace.id, commandId: trace.commandId },
        'Trace added successfully'
      );

    } catch (error) {
      this.logger.error(
        { error, traceId: trace.id },
        'Failed to add trace'
      );
      this.emit('trace:error', error instanceof Error ? error : new Error(String(error)), trace.id);
      throw error;
    }
  }

  /**
   * Update an existing trace entry
   */
  async updateTrace(traceId: string, updates: Partial<TraceEntry>): Promise<void> {
    try {
      const existingTrace = await this.storage.get(traceId);
      if (!existingTrace) {
        throw new Error(`Trace ${traceId} not found`);
      }

      const updatedTrace: TraceEntry = {
        ...existingTrace,
        ...updates,
        id: traceId // Ensure ID cannot be changed
      };

      await this.storage.store(updatedTrace);

      // Update in active commands
      const commandTraces = this.activeCommands.get(updatedTrace.commandId);
      if (commandTraces) {
        const index = commandTraces.findIndex(t => t.id === traceId);
        if (index >= 0) {
          commandTraces[index] = updatedTrace;
        }
      }

      const enhancedTrace = await this.enhanceTrace(updatedTrace);
      this.emit('trace:updated', enhancedTrace);

      // Check if command is complete after update
      if (updatedTrace.completedAt) {
        await this.checkCommandCompletion(updatedTrace.commandId);
      }

      this.logger.debug({ traceId }, 'Trace updated successfully');

    } catch (error) {
      this.logger.error({ error, traceId }, 'Failed to update trace');
      this.emit('trace:error', error instanceof Error ? error : new Error(String(error)), traceId);
      throw error;
    }
  }

  /**
   * Get trace aggregation for a command
   */
  async getCommandAggregation(commandId: string): Promise<TraceAggregation | null> {
    try {
      const traces = await this.storage.getByCommand(commandId);
      if (traces.length === 0) {
        return null;
      }

      const tree = this.treeBuilder.buildTree(traces);
      const stats = this.metricsCalculator.calculateStats(traces);

      let analysis: PerformanceAnalysis | undefined;
      if (this.config.enableRealTimeAnalysis) {
        analysis = this.metricsCalculator.analyzePerformance(traces, tree);
      }

      const aggregation: TraceAggregation = {
        commandId,
        agentId: traces[0].agentId,
        tree,
        stats,
        analysis,
        createdAt: Math.min(...traces.map(t => t.startedAt)),
        updatedAt: Date.now()
      };

      return aggregation;

    } catch (error) {
      this.logger.error({ error, commandId }, 'Failed to get command aggregation');
      throw error;
    }
  }

  /**
   * Search traces with filtering
   */
  async searchTraces(
    filter: TraceFilter,
    limit = 50,
    offset = 0
  ): Promise<EnhancedTraceEntry[]> {
    try {
      const traces = await this.storage.search(filter, limit, offset);
      const enhancedTraces = await Promise.all(
        traces.map(trace => this.enhanceTrace(trace))
      );

      return enhancedTraces;

    } catch (error) {
      this.logger.error({ error, filter }, 'Failed to search traces');
      throw error;
    }
  }

  /**
   * Get aggregated statistics for an agent
   */
  async getAgentStats(agentId: string, limit = 1000): Promise<TraceStats> {
    try {
      const traces = await this.storage.getByAgent(agentId, limit);
      return this.metricsCalculator.calculateStats(traces);

    } catch (error) {
      this.logger.error({ error, agentId }, 'Failed to get agent stats');
      throw error;
    }
  }

  /**
   * Clean up old traces
   */
  async cleanup(): Promise<number> {
    try {
      const cutoffTime = Date.now() - this.config.retentionPeriodMs;
      const cleanedCount = await this.storage.cleanup(cutoffTime);

      this.logger.info(
        { cleanedCount, retentionPeriodMs: this.config.retentionPeriodMs },
        'Trace cleanup completed'
      );

      return cleanedCount;

    } catch (error) {
      this.logger.error({ error }, 'Failed to cleanup traces');
      throw error;
    }
  }

  /**
   * Get real-time updates for a command
   */
  subscribeToCommand(commandId: string): EventEmitter {
    const emitter = new EventEmitter();

    const onTraceAdded = (trace: EnhancedTraceEntry) => {
      if (trace.commandId === commandId) {
        emitter.emit('update', {
          type: 'ADDED',
          traceEntry: trace,
          commandId,
          agentId: trace.agentId,
          timestamp: Date.now()
        } as TraceUpdate);
      }
    };

    const onTraceUpdated = (trace: EnhancedTraceEntry) => {
      if (trace.commandId === commandId) {
        emitter.emit('update', {
          type: 'UPDATED',
          traceEntry: trace,
          commandId,
          agentId: trace.agentId,
          timestamp: Date.now()
        } as TraceUpdate);
      }
    };

    const onCommandCompleted = (completedCommandId: string, aggregation: TraceAggregation) => {
      if (completedCommandId === commandId) {
        emitter.emit('completed', aggregation);
      }
    };

    this.on('trace:added', onTraceAdded);
    this.on('trace:updated', onTraceUpdated);
    this.on('command:completed', onCommandCompleted);

    // Cleanup function
    const unsubscribe = () => {
      this.off('trace:added', onTraceAdded);
      this.off('trace:updated', onTraceUpdated);
      this.off('command:completed', onCommandCompleted);
    };

    emitter.on('unsubscribe', unsubscribe);

    return emitter;
  }

  /**
   * Calculate the depth of a trace in the tree
   */
  private async calculateTraceDepth(trace: TraceEntry): Promise<number> {
    let depth = 0;
    let currentParentId = trace.parentId;

    while (currentParentId && depth < this.config.maxTraceDepth) {
      const parent = await this.storage.get(currentParentId);
      if (!parent) break;

      depth++;
      currentParentId = parent.parentId;
    }

    return depth;
  }

  /**
   * Enhance a trace entry with additional metadata
   */
  private async enhanceTrace(trace: TraceEntry): Promise<EnhancedTraceEntry> {
    const depth = await this.calculateTraceDepth(trace);
    const commandTraces = await this.storage.getByCommand(trace.commandId);

    // Calculate path from root
    const pathComponents: string[] = [];
    let current: TraceEntry | null = trace;

    while (current && pathComponents.length < 10) { // Limit path length
      pathComponents.unshift(current.name);
      if (current.parentId) {
        current = await this.storage.get(current.parentId);
      } else {
        break;
      }
    }

    const path = pathComponents.join(' → ');

    // Count children
    const childCount = commandTraces.filter(t => t.parentId === trace.id).length;

    // Calculate totals if this trace has children
    let totalDuration = trace.durationMs || 0;
    let totalTokens = trace.tokensUsed || 0;
    let errorCount = 0;
    let successCount = trace.completedAt ? 1 : 0;

    const children = commandTraces.filter(t => t.parentId === trace.id);
    for (const child of children) {
      const enhanced = await this.enhanceTrace(child);
      totalDuration += enhanced.totalDuration || enhanced.durationMs || 0;
      totalTokens += enhanced.totalTokens || enhanced.tokensUsed || 0;
      errorCount += enhanced.errorCount;
      successCount += enhanced.successCount;
    }

    return {
      ...trace,
      depth,
      path,
      isRoot: !trace.parentId,
      childCount,
      totalDuration,
      totalTokens,
      errorCount,
      successCount
    };
  }

  /**
   * Setup a timer to automatically complete a command if no new traces arrive
   */
  private setupCommandTimer(commandId: string): void {
    // Clear existing timer
    const existingTimer = this.commandTimers.get(commandId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer for 30 seconds
    const timer = setTimeout(async () => {
      await this.checkCommandCompletion(commandId, true);
    }, 30000);

    this.commandTimers.set(commandId, timer);
  }

  /**
   * Check if a command is complete and emit aggregation
   */
  private async checkCommandCompletion(commandId: string, forceComplete = false): Promise<void> {
    const commandTraces = this.activeCommands.get(commandId);
    if (!commandTraces || commandTraces.length === 0) {
      return;
    }

    // Check if all traces are completed or force completion
    const allCompleted = forceComplete || commandTraces.every(trace => trace.completedAt);

    if (allCompleted) {
      try {
        const aggregation = await this.getCommandAggregation(commandId);
        if (aggregation) {
          this.emit('command:completed', commandId, aggregation);
          this.emit('trace:completed', aggregation);

          // Cleanup
          this.activeCommands.delete(commandId);
          const timer = this.commandTimers.get(commandId);
          if (timer) {
            clearTimeout(timer);
            this.commandTimers.delete(commandId);
          }

          this.logger.info(
            { commandId, traceCount: commandTraces.length },
            'Command trace collection completed'
          );
        }
      } catch (error) {
        this.logger.error(
          { error, commandId },
          'Failed to complete command aggregation'
        );
        this.emit('trace:error', error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}