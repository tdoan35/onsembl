/**
 * @onsembl/trace-collector - LLM trace aggregation and tree visualization for Onsembl.ai Agent Control Center
 *
 * This package provides:
 * - Hierarchical trace tree building
 * - Performance metrics calculation
 * - Real-time trace aggregation
 * - Export utilities for flamegraphs and timelines
 * - Pattern analysis and bottleneck detection
 */

// Export core classes
export { TraceCollector } from './collector.js';
export { TreeBuilder } from './tree-builder.js';
export { MetricsCalculator } from './metrics.js';

// Export all types
export * from './types.js';

// Export version information
export const PACKAGE_VERSION = '0.1.0';

// Export commonly used interfaces for convenience
export type {
  TraceCollectorConfig,
  TraceAggregation,
  TraceStats,
  TraceStorage,
  TraceFilter,
  EnhancedTraceEntry,
  TraceUpdate,
  PerformanceAnalysis,
  FlameGraphNode,
  TimelineEvent,
  TraceExportOptions
} from './types.js';

export type {
  TraceCollectorEvents
} from './collector.js';

// Import types needed for MemoryTraceStorage
import type { TraceEntry } from '@onsembl/agent-protocol';
import type { TraceStorage, TraceFilter, TraceCollectorConfig } from './types.js';

// Default configuration
export const defaultTraceCollectorConfig: Partial<TraceCollectorConfig> = {
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
  }
};

/**
 * In-memory trace storage implementation for testing
 */
export class MemoryTraceStorage implements TraceStorage {
  private traces = new Map<string, TraceEntry>();

  async store(trace: TraceEntry): Promise<void> {
    this.traces.set(trace.id, trace);
  }

  async get(traceId: string): Promise<TraceEntry | null> {
    return this.traces.get(traceId) || null;
  }

  async getByCommand(commandId: string): Promise<TraceEntry[]> {
    return Array.from(this.traces.values()).filter(t => t.commandId === commandId);
  }

  async getByAgent(agentId: string, limit?: number): Promise<TraceEntry[]> {
    const results = Array.from(this.traces.values())
      .filter(t => t.agentId === agentId)
      .sort((a, b) => b.startedAt - a.startedAt);

    return limit ? results.slice(0, limit) : results;
  }

  async search(filter: TraceFilter, limit = 50, offset = 0): Promise<TraceEntry[]> {
    let results = Array.from(this.traces.values());

    // Apply filters
    if (filter.commandId) {
      results = results.filter(t => t.commandId === filter.commandId);
    }

    if (filter.agentId) {
      results = results.filter(t => t.agentId === filter.agentId);
    }

    if (filter.traceType) {
      results = results.filter(t => t.type === filter.traceType);
    }

    if (filter.name) {
      results = results.filter(t => t.name.includes(filter.name!));
    }

    if (filter.dateRange) {
      results = results.filter(t =>
        t.startedAt >= filter.dateRange!.from && t.startedAt <= filter.dateRange!.to
      );
    }

    if (filter.durationRange) {
      results = results.filter(t => {
        const duration = t.durationMs || 0;
        return duration >= filter.durationRange!.min && duration <= filter.durationRange!.max;
      });
    }

    if (filter.tokenRange) {
      results = results.filter(t => {
        const tokens = t.tokensUsed || 0;
        return tokens >= filter.tokenRange!.min && tokens <= filter.tokenRange!.max;
      });
    }

    if (filter.parentId !== undefined) {
      results = results.filter(t => t.parentId === filter.parentId);
    }

    // Sort by start time (newest first)
    results.sort((a, b) => b.startedAt - a.startedAt);

    // Apply pagination
    return results.slice(offset, offset + limit);
  }

  async delete(traceId: string): Promise<boolean> {
    return this.traces.delete(traceId);
  }

  async cleanup(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    const toDelete = Array.from(this.traces.entries())
      .filter(([_, trace]) => trace.startedAt < cutoff)
      .map(([id]) => id);

    toDelete.forEach(id => this.traces.delete(id));
    return toDelete.length;
  }

  // Utility methods for testing
  clear(): void {
    this.traces.clear();
  }

  size(): number {
    return this.traces.size;
  }
}