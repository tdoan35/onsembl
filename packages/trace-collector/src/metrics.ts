/**
 * Performance metrics calculation for trace analysis
 */

import type { TraceEntry, TraceTree, TraceType } from '@onsembl/agent-protocol';
import type { TraceStats, PerformanceAnalysis } from './types.js';

export class MetricsCalculator {
  /**
   * Calculate comprehensive statistics for a set of traces
   */
  calculateStats(traces: TraceEntry[]): TraceStats {
    if (traces.length === 0) {
      return this.getEmptyStats();
    }

    const durations = traces
      .map(t => t.durationMs || 0)
      .filter(d => d > 0)
      .sort((a, b) => a - b);

    const tokens = traces.reduce((sum, t) => sum + (t.tokensUsed || 0), 0);
    const errorCount = traces.filter(t => this.isErrorTrace(t)).length;
    const completedTraces = traces.filter(t => t.completedAt).length;
    const depths = traces.map(t => this.calculateTraceDepth(t, traces));

    // Calculate percentiles
    const percentile = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0;
      const index = Math.ceil(arr.length * p) - 1;
      return arr[Math.max(0, index)];
    };

    // Group traces by type
    const tracesByType: Record<TraceType, number> = {
      LLM_PROMPT: 0,
      TOOL_CALL: 0,
      RESPONSE: 0
    };

    traces.forEach(trace => {
      if (trace.type in tracesByType) {
        tracesByType[trace.type]++;
      }
    });

    return {
      totalTraces: traces.length,
      totalDuration: durations.reduce((sum, d) => sum + d, 0),
      totalTokens: tokens,
      averageDepth: depths.length > 0 ? depths.reduce((sum, d) => sum + d, 0) / depths.length : 0,
      maxDepth: Math.max(...depths, 0),
      errorRate: traces.length > 0 ? errorCount / traces.length : 0,
      tracesByType,
      performanceMetrics: {
        p50Duration: percentile(durations, 0.5),
        p95Duration: percentile(durations, 0.95),
        p99Duration: percentile(durations, 0.99),
        minDuration: durations.length > 0 ? durations[0] : 0,
        maxDuration: durations.length > 0 ? durations[durations.length - 1] : 0
      }
    };
  }

  /**
   * Analyze performance patterns and bottlenecks
   */
  analyzePerformance(traces: TraceEntry[], tree: TraceTree): PerformanceAnalysis {
    const hotPaths = this.findHotPaths(traces);
    const bottlenecks = this.findBottlenecks(traces);
    const patterns = this.identifyPatterns(tree);
    const recommendations = this.generateRecommendations(traces, tree);

    return {
      hotPaths,
      bottlenecks,
      patterns,
      recommendations
    };
  }

  /**
   * Find frequently executed paths that consume significant time
   */
  private findHotPaths(traces: TraceEntry[]): Array<{
    path: string;
    count: number;
    totalDuration: number;
    averageDuration: number;
    tokens: number;
  }> {
    const pathMap = new Map<string, {
      count: number;
      totalDuration: number;
      tokens: number;
    }>();

    // Build path strings for each trace
    traces.forEach(trace => {
      const path = this.buildTracePath(trace, traces);
      if (path && trace.durationMs) {
        const existing = pathMap.get(path) || { count: 0, totalDuration: 0, tokens: 0 };
        pathMap.set(path, {
          count: existing.count + 1,
          totalDuration: existing.totalDuration + trace.durationMs,
          tokens: existing.tokens + (trace.tokensUsed || 0)
        });
      }
    });

    // Convert to array and sort by total duration
    return Array.from(pathMap.entries())
      .map(([path, stats]) => ({
        path,
        count: stats.count,
        totalDuration: stats.totalDuration,
        averageDuration: stats.totalDuration / stats.count,
        tokens: stats.tokens
      }))
      .filter(item => item.count > 1) // Only paths that appear multiple times
      .sort((a, b) => b.totalDuration - a.totalDuration)
      .slice(0, 10); // Top 10 hot paths
  }

  /**
   * Find performance bottlenecks (slowest individual traces)
   */
  private findBottlenecks(traces: TraceEntry[]): Array<{
    traceId: string;
    name: string;
    duration: number;
    percentOfTotal: number;
    recommendation: string;
  }> {
    const totalDuration = traces.reduce((sum, t) => sum + (t.durationMs || 0), 0);

    return traces
      .filter(t => t.durationMs && t.durationMs > 0)
      .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
      .slice(0, 5) // Top 5 slowest traces
      .map(trace => ({
        traceId: trace.id,
        name: trace.name,
        duration: trace.durationMs || 0,
        percentOfTotal: totalDuration > 0 ? ((trace.durationMs || 0) / totalDuration) * 100 : 0,
        recommendation: this.getBottleneckRecommendation(trace)
      }));
  }

  /**
   * Identify execution patterns in the trace tree
   */
  private identifyPatterns(tree: TraceTree): Array<{
    type: 'SEQUENTIAL' | 'PARALLEL' | 'RECURSIVE' | 'CHAIN';
    description: string;
    frequency: number;
    efficiency: number;
  }> {
    const patterns: Array<{
      type: 'SEQUENTIAL' | 'PARALLEL' | 'RECURSIVE' | 'CHAIN';
      description: string;
      frequency: number;
      efficiency: number;
    }> = [];

    // Analyze each root trace
    tree.rootTraces.forEach(root => {
      const subPatterns = this.analyzeTracePatterns(root);
      patterns.push(...subPatterns);
    });

    // Aggregate similar patterns
    const aggregated = new Map<string, {
      type: 'SEQUENTIAL' | 'PARALLEL' | 'RECURSIVE' | 'CHAIN';
      description: string;
      count: number;
      totalEfficiency: number;
    }>();

    patterns.forEach(pattern => {
      const key = `${pattern.type}:${pattern.description}`;
      const existing = aggregated.get(key) || {
        type: pattern.type,
        description: pattern.description,
        count: 0,
        totalEfficiency: 0
      };

      aggregated.set(key, {
        ...existing,
        count: existing.count + 1,
        totalEfficiency: existing.totalEfficiency + pattern.efficiency
      });
    });

    return Array.from(aggregated.values())
      .map(item => ({
        type: item.type,
        description: item.description,
        frequency: item.count,
        efficiency: item.totalEfficiency / item.count
      }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(traces: TraceEntry[], tree: TraceTree): Array<{
    category: 'PERFORMANCE' | 'STRUCTURE' | 'TOKENS' | 'ERRORS';
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    title: string;
    description: string;
    impact: string;
  }> {
    const recommendations: Array<{
      category: 'PERFORMANCE' | 'STRUCTURE' | 'TOKENS' | 'ERRORS';
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      title: string;
      description: string;
      impact: string;
    }> = [];

    // Performance recommendations
    const slowTraces = traces.filter(t => (t.durationMs || 0) > 5000);
    if (slowTraces.length > 0) {
      recommendations.push({
        category: 'PERFORMANCE',
        priority: 'HIGH',
        title: 'Optimize Slow Operations',
        description: `${slowTraces.length} traces take longer than 5 seconds to complete`,
        impact: 'Reducing these times could improve overall response speed by 20-40%'
      });
    }

    // Token usage recommendations
    const highTokenTraces = traces.filter(t => (t.tokensUsed || 0) > 1000);
    if (highTokenTraces.length > 0) {
      recommendations.push({
        category: 'TOKENS',
        priority: 'MEDIUM',
        title: 'Optimize Token Usage',
        description: `${highTokenTraces.length} traces use more than 1000 tokens`,
        impact: 'Token optimization could reduce costs by 15-30%'
      });
    }

    // Error rate recommendations
    const errorTraces = traces.filter(t => this.isErrorTrace(t));
    if (errorTraces.length > 0) {
      const errorRate = errorTraces.length / traces.length;
      if (errorRate > 0.1) {
        recommendations.push({
          category: 'ERRORS',
          priority: 'HIGH',
          title: 'Reduce Error Rate',
          description: `${(errorRate * 100).toFixed(1)}% of traces result in errors`,
          impact: 'Fixing errors could improve reliability and reduce retry overhead'
        });
      }
    }

    // Structure recommendations
    const maxDepth = Math.max(...traces.map(t => this.calculateTraceDepth(t, traces)));
    if (maxDepth > 10) {
      recommendations.push({
        category: 'STRUCTURE',
        priority: 'MEDIUM',
        title: 'Reduce Call Depth',
        description: `Maximum trace depth is ${maxDepth}, which may indicate overly complex call chains`,
        impact: 'Flattening deep call chains could improve performance and debuggability'
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Analyze patterns within a single trace
   */
  private analyzeTracePatterns(trace: TraceEntry): Array<{
    type: 'SEQUENTIAL' | 'PARALLEL' | 'RECURSIVE' | 'CHAIN';
    description: string;
    frequency: number;
    efficiency: number;
  }> {
    const patterns: Array<{
      type: 'SEQUENTIAL' | 'PARALLEL' | 'RECURSIVE' | 'CHAIN';
      description: string;
      frequency: number;
      efficiency: number;
    }> = [];

    if (!trace.children || trace.children.length === 0) {
      return patterns;
    }

    // Check for sequential pattern
    if (trace.children.length > 1) {
      const isSequential = this.isSequentialExecution(trace.children);
      if (isSequential) {
        patterns.push({
          type: 'SEQUENTIAL',
          description: `${trace.children.length} sequential operations`,
          frequency: 1,
          efficiency: this.calculateSequentialEfficiency(trace.children)
        });
      }
    }

    // Check for recursive pattern
    if (this.isRecursivePattern(trace)) {
      patterns.push({
        type: 'RECURSIVE',
        description: `Recursive calls in ${trace.name}`,
        frequency: 1,
        efficiency: this.calculateRecursiveEfficiency(trace)
      });
    }

    // Check for chain pattern
    if (this.isChainPattern(trace)) {
      patterns.push({
        type: 'CHAIN',
        description: `Linear chain of ${this.getChainLength(trace)} operations`,
        frequency: 1,
        efficiency: this.calculateChainEfficiency(trace)
      });
    }

    // Recursively analyze children
    trace.children.forEach(child => {
      patterns.push(...this.analyzeTracePatterns(child));
    });

    return patterns;
  }

  /**
   * Calculate trace depth in the tree
   */
  private calculateTraceDepth(trace: TraceEntry, allTraces: TraceEntry[]): number {
    let depth = 0;
    let currentParentId = trace.parentId;

    while (currentParentId) {
      const parent = allTraces.find(t => t.id === currentParentId);
      if (!parent) break;
      depth++;
      currentParentId = parent.parentId;
    }

    return depth;
  }

  /**
   * Build a path string for a trace
   */
  private buildTracePath(trace: TraceEntry, allTraces: TraceEntry[]): string | null {
    const pathComponents: string[] = [];
    let current: TraceEntry | undefined = trace;

    while (current && pathComponents.length < 5) {
      pathComponents.unshift(current.name);
      if (current.parentId) {
        current = allTraces.find(t => t.id === current!.parentId);
      } else {
        break;
      }
    }

    return pathComponents.length > 1 ? pathComponents.join(' → ') : null;
  }

  /**
   * Check if a trace resulted in an error
   */
  private isErrorTrace(trace: TraceEntry): boolean {
    // A trace is considered an error if it started but never completed
    // and enough time has passed that it should have completed
    if (!trace.completedAt && trace.durationMs) {
      const expectedCompletion = trace.startedAt + trace.durationMs;
      return Date.now() > expectedCompletion + 30000; // 30 second grace period
    }
    return false;
  }

  /**
   * Get recommendation for a bottleneck trace
   */
  private getBottleneckRecommendation(trace: TraceEntry): string {
    if (trace.type === 'LLM_PROMPT') {
      return 'Consider optimizing prompt size or using streaming responses';
    }
    if (trace.type === 'TOOL_CALL') {
      return 'Tool execution may benefit from caching or parallel execution';
    }
    return 'Consider breaking this operation into smaller, parallelizable tasks';
  }

  /**
   * Check if children execute sequentially
   */
  private isSequentialExecution(children: TraceEntry[]): boolean {
    for (let i = 1; i < children.length; i++) {
      const prev = children[i - 1];
      const current = children[i];

      if (prev.completedAt && current.startedAt < prev.completedAt) {
        return false; // Overlap indicates parallel execution
      }
    }
    return true;
  }

  /**
   * Check if trace shows recursive pattern
   */
  private isRecursivePattern(trace: TraceEntry): boolean {
    if (!trace.children) return false;

    return trace.children.some(child =>
      child.name === trace.name || child.type === trace.type
    );
  }

  /**
   * Check if trace shows chain pattern
   */
  private isChainPattern(trace: TraceEntry): boolean {
    let current = trace;
    let depth = 0;

    while (current.children && current.children.length === 1) {
      current = current.children[0];
      depth++;
    }

    return depth >= 3; // Chain of at least 3 operations
  }

  /**
   * Get length of chain pattern
   */
  private getChainLength(trace: TraceEntry): number {
    let current = trace;
    let length = 1;

    while (current.children && current.children.length === 1) {
      current = current.children[0];
      length++;
    }

    return length;
  }

  /**
   * Calculate efficiency metrics for different patterns
   */
  private calculateSequentialEfficiency(children: TraceEntry[]): number {
    const totalTime = children.reduce((sum, child) => sum + (child.durationMs || 0), 0);
    const actualTime = Math.max(...children.map(c => (c.completedAt || 0) - c.startedAt));
    return actualTime > 0 ? (totalTime / actualTime) * 100 : 0;
  }

  private calculateRecursiveEfficiency(trace: TraceEntry): number {
    // Recursive efficiency based on whether recursion reduces work
    const childDurations = trace.children?.map(c => c.durationMs || 0) || [];
    const avgChildDuration = childDurations.reduce((sum, d) => sum + d, 0) / childDurations.length;
    return trace.durationMs ? (avgChildDuration / trace.durationMs) * 100 : 0;
  }

  private calculateChainEfficiency(trace: TraceEntry): number {
    // Chain efficiency based on how much overhead is added
    const chainLength = this.getChainLength(trace);
    const totalDuration = trace.durationMs || 0;
    return chainLength > 0 ? Math.max(0, 100 - (chainLength * 10)) : 0; // Penalize long chains
  }

  /**
   * Get empty stats structure
   */
  private getEmptyStats(): TraceStats {
    return {
      totalTraces: 0,
      totalDuration: 0,
      totalTokens: 0,
      averageDepth: 0,
      maxDepth: 0,
      errorRate: 0,
      tracesByType: {
        LLM_PROMPT: 0,
        TOOL_CALL: 0,
        RESPONSE: 0
      },
      performanceMetrics: {
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        minDuration: 0,
        maxDuration: 0
      }
    };
  }
}