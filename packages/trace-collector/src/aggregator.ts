/**
 * Trace aggregator for metrics calculation and summary statistics
 * Aggregates metrics from trace trees including token counts, durations, and performance analysis
 */

import { Logger } from 'pino';

// Temporary local types until agent-protocol package exports are fixed
type TraceType = 'LLM_PROMPT' | 'TOOL_CALL' | 'RESPONSE';

interface TraceEntry {
  id: string;
  commandId: string;
  agentId: string;
  parentId: string | null;
  type: TraceType;
  name: string;
  content: Record<string, any>;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  tokensUsed?: number;
  children?: TraceEntry[];
}

interface TraceTree {
  commandId: string;
  agentId: string;
  rootTraces: TraceEntry[];
  totalDuration: number;
  totalTokens: number;
  createdAt: number;
  updatedAt: number;
}

export interface AggregationOptions {
  includePercentiles?: boolean;
  calculateHotPaths?: boolean;
  groupByType?: boolean;
  timeWindowMs?: number;
  minSampleSize?: number;
}

export interface TraceMetrics {
  // Count metrics
  totalTraces: number;
  tracesByType: Record<TraceType, number>;
  errorCount: number;
  successCount: number;
  incompleteCount: number;

  // Duration metrics
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  durationPercentiles?: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };

  // Token metrics
  totalTokens: number;
  averageTokens: number;
  minTokens: number;
  maxTokens: number;
  tokensByType: Record<TraceType, number>;

  // Tree structure metrics
  maxDepth: number;
  averageDepth: number;
  totalLeafNodes: number;
  averageBranchingFactor: number;

  // Performance metrics
  errorRate: number;
  throughputPerSecond: number;
  concurrencyLevel: number;
}

export interface HotPath {
  path: string[];
  frequency: number;
  totalDuration: number;
  averageDuration: number;
  totalTokens: number;
  errorRate: number;
  rank: number;
}

export interface TypeGrouping {
  type: TraceType;
  count: number;
  totalDuration: number;
  averageDuration: number;
  totalTokens: number;
  averageTokens: number;
  errorRate: number;
  percentage: number;
}

export interface TimeWindowMetrics {
  windowStart: number;
  windowEnd: number;
  windowDurationMs: number;
  metrics: TraceMetrics;
  traceCount: number;
  peakConcurrency: number;
}

export interface AggregationResult {
  metrics: TraceMetrics;
  hotPaths?: HotPath[];
  typeGroupings?: TypeGrouping[];
  timeWindows?: TimeWindowMetrics[];
  summary: {
    totalCommands: number;
    totalAgents: number;
    timeRange: {
      start: number;
      end: number;
      durationMs: number;
    };
    topBottlenecks: Array<{
      traceId: string;
      name: string;
      type: TraceType;
      duration: number;
      percentOfTotal: number;
    }>;
  };
}

export class TraceAggregator {
  private logger: Logger;
  private options: Required<AggregationOptions>;

  constructor(logger: Logger, options: AggregationOptions = {}) {
    this.logger = logger.child({ component: 'TraceAggregator' });
    this.options = {
      includePercentiles: options.includePercentiles ?? true,
      calculateHotPaths: options.calculateHotPaths ?? true,
      groupByType: options.groupByType ?? true,
      timeWindowMs: options.timeWindowMs ?? 60000, // 1 minute windows
      minSampleSize: options.minSampleSize ?? 10,
      ...options
    };
  }

  /**
   * Aggregate metrics from multiple trace trees
   */
  aggregateTrees(trees: TraceTree[]): AggregationResult {
    if (trees.length === 0) {
      throw new Error('Cannot aggregate empty tree array');
    }

    this.logger.debug({ treeCount: trees.length }, 'Starting tree aggregation');

    // Flatten all trees to get individual traces
    const allTraces = this.flattenTrees(trees);
    const timeRange = this.calculateTimeRange(allTraces);

    // Calculate base metrics
    const metrics = this.calculateMetrics(allTraces, timeRange);

    // Calculate optional aggregations
    const result: AggregationResult = {
      metrics,
      summary: {
        totalCommands: new Set(trees.map(t => t.commandId)).size,
        totalAgents: new Set(trees.map(t => t.agentId)).size,
        timeRange,
        topBottlenecks: this.findTopBottlenecks(allTraces, 5)
      }
    };

    if (this.options.calculateHotPaths) {
      result.hotPaths = this.calculateHotPaths(trees);
    }

    if (this.options.groupByType) {
      result.typeGroupings = this.groupByType(allTraces);
    }

    if (this.options.timeWindowMs > 0) {
      result.timeWindows = this.calculateTimeWindows(allTraces, timeRange);
    }

    this.logger.debug({
      totalTraces: allTraces.length,
      totalDuration: metrics.totalDuration,
      errorRate: metrics.errorRate
    }, 'Tree aggregation completed');

    return result;
  }

  /**
   * Aggregate metrics from a single trace tree
   */
  aggregateTree(tree: TraceTree): AggregationResult {
    return this.aggregateTrees([tree]);
  }

  /**
   * Calculate incremental metrics for streaming updates
   */
  updateMetrics(
    existingMetrics: TraceMetrics,
    newTraces: TraceEntry[]
  ): TraceMetrics {
    if (newTraces.length === 0) {
      return existingMetrics;
    }

    const newTraceMetrics = this.calculateMetrics(newTraces, {
      start: Math.min(...newTraces.map(t => t.startedAt)),
      end: Math.max(...newTraces.map(t => t.completedAt || t.startedAt)),
      durationMs: 0
    });

    // Merge metrics
    const totalTraces = existingMetrics.totalTraces + newTraceMetrics.totalTraces;
    const totalDuration = existingMetrics.totalDuration + newTraceMetrics.totalDuration;
    const totalTokens = existingMetrics.totalTokens + newTraceMetrics.totalTokens;

    return {
      ...existingMetrics,
      totalTraces,
      totalDuration,
      totalTokens,
      averageDuration: totalDuration / totalTraces,
      averageTokens: totalTokens / totalTraces,
      minDuration: Math.min(existingMetrics.minDuration, newTraceMetrics.minDuration),
      maxDuration: Math.max(existingMetrics.maxDuration, newTraceMetrics.maxDuration),
      minTokens: Math.min(existingMetrics.minTokens, newTraceMetrics.minTokens),
      maxTokens: Math.max(existingMetrics.maxTokens, newTraceMetrics.maxTokens),
      errorCount: existingMetrics.errorCount + newTraceMetrics.errorCount,
      successCount: existingMetrics.successCount + newTraceMetrics.successCount,
      incompleteCount: existingMetrics.incompleteCount + newTraceMetrics.incompleteCount,
      errorRate: (existingMetrics.errorCount + newTraceMetrics.errorCount) / totalTraces,
      // Merge type counts
      tracesByType: this.mergeTypeCounts(existingMetrics.tracesByType, newTraceMetrics.tracesByType),
      tokensByType: this.mergeTypeCounts(existingMetrics.tokensByType, newTraceMetrics.tokensByType),
      // Other metrics would need recalculation for accuracy
      maxDepth: Math.max(existingMetrics.maxDepth, newTraceMetrics.maxDepth),
      averageDepth: (existingMetrics.averageDepth + newTraceMetrics.averageDepth) / 2, // Approximation
      totalLeafNodes: existingMetrics.totalLeafNodes + newTraceMetrics.totalLeafNodes,
      averageBranchingFactor: (existingMetrics.averageBranchingFactor + newTraceMetrics.averageBranchingFactor) / 2,
      throughputPerSecond: existingMetrics.throughputPerSecond, // Would need time window for accuracy
      concurrencyLevel: Math.max(existingMetrics.concurrencyLevel, newTraceMetrics.concurrencyLevel)
    };
  }

  /**
   * Calculate performance trends over time
   */
  calculateTrends(
    historicalResults: Array<{ timestamp: number; result: AggregationResult }>
  ): {
    durationTrend: 'improving' | 'degrading' | 'stable';
    errorRateTrend: 'improving' | 'degrading' | 'stable';
    throughputTrend: 'improving' | 'degrading' | 'stable';
    tokenEfficiencyTrend: 'improving' | 'degrading' | 'stable';
  } {
    if (historicalResults.length < 2) {
      return {
        durationTrend: 'stable',
        errorRateTrend: 'stable',
        throughputTrend: 'stable',
        tokenEfficiencyTrend: 'stable'
      };
    }

    const recent = historicalResults.slice(-3); // Last 3 data points
    const older = historicalResults.slice(-6, -3); // Previous 3 data points

    const recentAvg = {
      duration: recent.reduce((sum, r) => sum + r.result.metrics.averageDuration, 0) / recent.length,
      errorRate: recent.reduce((sum, r) => sum + r.result.metrics.errorRate, 0) / recent.length,
      throughput: recent.reduce((sum, r) => sum + r.result.metrics.throughputPerSecond, 0) / recent.length,
      tokenEfficiency: recent.reduce((sum, r) => sum + (r.result.metrics.averageTokens / Math.max(r.result.metrics.averageDuration, 1)), 0) / recent.length
    };

    const olderAvg = {
      duration: older.reduce((sum, r) => sum + r.result.metrics.averageDuration, 0) / Math.max(older.length, 1),
      errorRate: older.reduce((sum, r) => sum + r.result.metrics.errorRate, 0) / Math.max(older.length, 1),
      throughput: older.reduce((sum, r) => sum + r.result.metrics.throughputPerSecond, 0) / Math.max(older.length, 1),
      tokenEfficiency: older.reduce((sum, r) => sum + (r.result.metrics.averageTokens / Math.max(r.result.metrics.averageDuration, 1)), 0) / Math.max(older.length, 1)
    };

    const threshold = 0.05; // 5% change threshold

    return {
      durationTrend: this.getTrend(recentAvg.duration, olderAvg.duration, threshold, true),
      errorRateTrend: this.getTrend(recentAvg.errorRate, olderAvg.errorRate, threshold, true),
      throughputTrend: this.getTrend(recentAvg.throughput, olderAvg.throughput, threshold, false),
      tokenEfficiencyTrend: this.getTrend(recentAvg.tokenEfficiency, olderAvg.tokenEfficiency, threshold, false)
    };
  }

  /**
   * Calculate basic metrics from trace array
   */
  private calculateMetrics(traces: TraceEntry[], timeRange: { start: number; end: number; durationMs: number }): TraceMetrics {
    if (traces.length === 0) {
      return this.getEmptyMetrics();
    }

    // Duration calculations
    const durations = traces.map(t => t.durationMs || 0).filter(d => d > 0);
    const tokens = traces.map(t => t.tokensUsed || 0);

    // Count by type
    const tracesByType = this.countByType(traces);
    const tokensByType = this.sumTokensByType(traces);

    // Error calculations
    const errorCount = traces.filter(t => !t.completedAt && (t.durationMs || 0) > 0).length;
    const successCount = traces.filter(t => t.completedAt).length;
    const incompleteCount = traces.length - errorCount - successCount;

    // Tree structure metrics
    const { maxDepth, averageDepth, totalLeafNodes, averageBranchingFactor } = this.calculateStructureMetrics(traces);

    const metrics: TraceMetrics = {
      totalTraces: traces.length,
      tracesByType,
      errorCount,
      successCount,
      incompleteCount,
      totalDuration: durations.reduce((sum, d) => sum + d, 0),
      averageDuration: durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0,
      minDuration: durations.length > 0 ? Math.min(...durations) : 0,
      maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
      totalTokens: tokens.reduce((sum, t) => sum + t, 0),
      averageTokens: tokens.length > 0 ? tokens.reduce((sum, t) => sum + t, 0) / tokens.length : 0,
      minTokens: tokens.length > 0 ? Math.min(...tokens) : 0,
      maxTokens: tokens.length > 0 ? Math.max(...tokens) : 0,
      tokensByType,
      maxDepth,
      averageDepth,
      totalLeafNodes,
      averageBranchingFactor,
      errorRate: traces.length > 0 ? errorCount / traces.length : 0,
      throughputPerSecond: timeRange.durationMs > 0 ? (traces.length * 1000) / timeRange.durationMs : 0,
      concurrencyLevel: this.calculateConcurrency(traces)
    };

    // Calculate percentiles if requested
    if (this.options.includePercentiles && durations.length >= this.options.minSampleSize) {
      metrics.durationPercentiles = this.calculatePercentiles(durations);
    }

    return metrics;
  }

  /**
   * Calculate hot paths through trace trees
   */
  private calculateHotPaths(trees: TraceTree[]): HotPath[] {
    const pathMap = new Map<string, {
      frequency: number;
      totalDuration: number;
      totalTokens: number;
      errorCount: number;
    }>();

    // Extract paths from each tree
    trees.forEach(tree => {
      tree.rootTraces.forEach(root => {
        this.extractPaths(root, [], pathMap);
      });
    });

    // Convert to hot paths and sort by frequency
    const hotPaths: HotPath[] = Array.from(pathMap.entries()).map(([pathStr, data], index) => ({
      path: pathStr.split(' -> '),
      frequency: data.frequency,
      totalDuration: data.totalDuration,
      averageDuration: data.totalDuration / data.frequency,
      totalTokens: data.totalTokens,
      errorRate: data.errorCount / data.frequency,
      rank: index + 1
    }));

    return hotPaths
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20) // Top 20 hot paths
      .map((path, index) => ({ ...path, rank: index + 1 }));
  }

  /**
   * Group traces by type with statistics
   */
  private groupByType(traces: TraceEntry[]): TypeGrouping[] {
    const typeStats = new Map<TraceType, {
      count: number;
      totalDuration: number;
      totalTokens: number;
      errorCount: number;
    }>();

    traces.forEach(trace => {
      const stats = typeStats.get(trace.type) || {
        count: 0,
        totalDuration: 0,
        totalTokens: 0,
        errorCount: 0
      };

      stats.count++;
      stats.totalDuration += trace.durationMs || 0;
      stats.totalTokens += trace.tokensUsed || 0;
      if (!trace.completedAt && (trace.durationMs || 0) > 0) {
        stats.errorCount++;
      }

      typeStats.set(trace.type, stats);
    });

    const totalTraces = traces.length;
    return Array.from(typeStats.entries()).map(([type, stats]) => ({
      type,
      count: stats.count,
      totalDuration: stats.totalDuration,
      averageDuration: stats.totalDuration / stats.count,
      totalTokens: stats.totalTokens,
      averageTokens: stats.totalTokens / stats.count,
      errorRate: stats.errorCount / stats.count,
      percentage: (stats.count / totalTraces) * 100
    }));
  }

  /**
   * Calculate metrics in time windows
   */
  private calculateTimeWindows(traces: TraceEntry[], timeRange: { start: number; end: number; durationMs: number }): TimeWindowMetrics[] {
    const windowSize = this.options.timeWindowMs;
    const windows: TimeWindowMetrics[] = [];

    for (let windowStart = timeRange.start; windowStart < timeRange.end; windowStart += windowSize) {
      const windowEnd = Math.min(windowStart + windowSize, timeRange.end);
      const windowTraces = traces.filter(t =>
        t.startedAt >= windowStart && t.startedAt < windowEnd
      );

      if (windowTraces.length > 0) {
        const windowMetrics = this.calculateMetrics(windowTraces, {
          start: windowStart,
          end: windowEnd,
          durationMs: windowEnd - windowStart
        });

        windows.push({
          windowStart,
          windowEnd,
          windowDurationMs: windowEnd - windowStart,
          metrics: windowMetrics,
          traceCount: windowTraces.length,
          peakConcurrency: this.calculateConcurrency(windowTraces)
        });
      }
    }

    return windows;
  }

  /**
   * Utility methods
   */
  private flattenTrees(trees: TraceTree[]): TraceEntry[] {
    const traces: TraceEntry[] = [];

    const flatten = (trace: TraceEntry) => {
      traces.push(trace);
      if (trace.children) {
        trace.children.forEach(flatten);
      }
    };

    trees.forEach(tree => {
      tree.rootTraces.forEach(flatten);
    });

    return traces;
  }

  private calculateTimeRange(traces: TraceEntry[]): { start: number; end: number; durationMs: number } {
    if (traces.length === 0) {
      return { start: 0, end: 0, durationMs: 0 };
    }

    const start = Math.min(...traces.map(t => t.startedAt));
    const end = Math.max(...traces.map(t => t.completedAt || t.startedAt));
    return { start, end, durationMs: end - start };
  }

  private countByType(traces: TraceEntry[]): Record<TraceType, number> {
    return traces.reduce((counts, trace) => {
      counts[trace.type] = (counts[trace.type] || 0) + 1;
      return counts;
    }, {} as Record<TraceType, number>);
  }

  private sumTokensByType(traces: TraceEntry[]): Record<TraceType, number> {
    return traces.reduce((totals, trace) => {
      totals[trace.type] = (totals[trace.type] || 0) + (trace.tokensUsed || 0);
      return totals;
    }, {} as Record<TraceType, number>);
  }

  private calculateStructureMetrics(traces: TraceEntry[]): {
    maxDepth: number;
    averageDepth: number;
    totalLeafNodes: number;
    averageBranchingFactor: number;
  } {
    let maxDepth = 0;
    let totalDepth = 0;
    let leafNodes = 0;
    let totalBranching = 0;
    let branchingNodes = 0;

    const calculateDepth = (trace: TraceEntry, depth: number) => {
      maxDepth = Math.max(maxDepth, depth);
      totalDepth += depth;

      if (!trace.children || trace.children.length === 0) {
        leafNodes++;
      } else {
        totalBranching += trace.children.length;
        branchingNodes++;
        trace.children.forEach(child => calculateDepth(child, depth + 1));
      }
    };

    traces.filter(t => !t.parentId).forEach(root => calculateDepth(root, 1));

    return {
      maxDepth,
      averageDepth: traces.length > 0 ? totalDepth / traces.length : 0,
      totalLeafNodes: leafNodes,
      averageBranchingFactor: branchingNodes > 0 ? totalBranching / branchingNodes : 0
    };
  }

  private calculateConcurrency(traces: TraceEntry[]): number {
    const events: Array<{ time: number; type: 'start' | 'end' }> = [];

    traces.forEach(trace => {
      events.push({ time: trace.startedAt, type: 'start' });
      if (trace.completedAt) {
        events.push({ time: trace.completedAt, type: 'end' });
      }
    });

    events.sort((a, b) => a.time - b.time);

    let currentConcurrency = 0;
    let maxConcurrency = 0;

    events.forEach(event => {
      if (event.type === 'start') {
        currentConcurrency++;
        maxConcurrency = Math.max(maxConcurrency, currentConcurrency);
      } else {
        currentConcurrency--;
      }
    });

    return maxConcurrency;
  }

  private calculatePercentiles(values: number[]): { p50: number; p90: number; p95: number; p99: number } {
    const sorted = [...values].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      p50: sorted[Math.floor(len * 0.5)] || 0,
      p90: sorted[Math.floor(len * 0.9)] || 0,
      p95: sorted[Math.floor(len * 0.95)] || 0,
      p99: sorted[Math.floor(len * 0.99)] || 0
    };
  }

  private extractPaths(
    trace: TraceEntry,
    currentPath: string[],
    pathMap: Map<string, { frequency: number; totalDuration: number; totalTokens: number; errorCount: number }>
  ): void {
    const newPath = [...currentPath, trace.name];
    const pathStr = newPath.join(' -> ');

    const stats = pathMap.get(pathStr) || {
      frequency: 0,
      totalDuration: 0,
      totalTokens: 0,
      errorCount: 0
    };

    stats.frequency++;
    stats.totalDuration += trace.durationMs || 0;
    stats.totalTokens += trace.tokensUsed || 0;
    if (!trace.completedAt && (trace.durationMs || 0) > 0) {
      stats.errorCount++;
    }

    pathMap.set(pathStr, stats);

    if (trace.children) {
      trace.children.forEach(child => this.extractPaths(child, newPath, pathMap));
    }
  }

  private findTopBottlenecks(traces: TraceEntry[], limit: number): Array<{
    traceId: string;
    name: string;
    type: TraceType;
    duration: number;
    percentOfTotal: number;
  }> {
    const totalDuration = traces.reduce((sum, t) => sum + (t.durationMs || 0), 0);

    return traces
      .filter(t => (t.durationMs || 0) > 0)
      .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
      .slice(0, limit)
      .map(trace => ({
        traceId: trace.id,
        name: trace.name,
        type: trace.type,
        duration: trace.durationMs || 0,
        percentOfTotal: totalDuration > 0 ? ((trace.durationMs || 0) / totalDuration) * 100 : 0
      }));
  }

  private mergeTypeCounts(
    existing: Record<TraceType, number>,
    newCounts: Record<TraceType, number>
  ): Record<TraceType, number> {
    const merged = { ...existing };
    Object.entries(newCounts).forEach(([type, count]) => {
      merged[type as TraceType] = (merged[type as TraceType] || 0) + count;
    });
    return merged;
  }

  private getTrend(recent: number, older: number, threshold: number, lowerIsBetter: boolean): 'improving' | 'degrading' | 'stable' {
    const change = Math.abs(recent - older) / Math.max(older, 1);
    if (change < threshold) return 'stable';

    const isImproving = lowerIsBetter ? recent < older : recent > older;
    return isImproving ? 'improving' : 'degrading';
  }

  private getEmptyMetrics(): TraceMetrics {
    return {
      totalTraces: 0,
      tracesByType: {} as Record<TraceType, number>,
      errorCount: 0,
      successCount: 0,
      incompleteCount: 0,
      totalDuration: 0,
      averageDuration: 0,
      minDuration: 0,
      maxDuration: 0,
      totalTokens: 0,
      averageTokens: 0,
      minTokens: 0,
      maxTokens: 0,
      tokensByType: {} as Record<TraceType, number>,
      maxDepth: 0,
      averageDepth: 0,
      totalLeafNodes: 0,
      averageBranchingFactor: 0,
      errorRate: 0,
      throughputPerSecond: 0,
      concurrencyLevel: 0
    };
  }
}