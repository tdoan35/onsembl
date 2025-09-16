/**
 * Type definitions for the trace collector system
 */

import type { TraceEntry, TraceType, TraceTree } from '@onsembl/agent-protocol';

// Extended trace entry with additional metadata
export interface EnhancedTraceEntry extends TraceEntry {
  depth: number;
  path: string;
  isRoot: boolean;
  childCount: number;
  totalDuration?: number;
  totalTokens?: number;
  errorCount: number;
  successCount: number;
}

// Trace collection statistics
export interface TraceStats {
  totalTraces: number;
  totalDuration: number;
  totalTokens: number;
  averageDepth: number;
  maxDepth: number;
  errorRate: number;
  tracesByType: Record<TraceType, number>;
  performanceMetrics: {
    p50Duration: number;
    p95Duration: number;
    p99Duration: number;
    minDuration: number;
    maxDuration: number;
  };
}

// Trace search and filtering
export interface TraceFilter {
  commandId?: string;
  agentId?: string;
  traceType?: TraceType;
  name?: string;
  dateRange?: {
    from: number;
    to: number;
  };
  durationRange?: {
    min: number;
    max: number;
  };
  tokenRange?: {
    min: number;
    max: number;
  };
  hasError?: boolean;
  parentId?: string;
  depth?: {
    min: number;
    max: number;
  };
}

// Trace export formats
export interface TraceExportOptions {
  format: 'json' | 'csv' | 'flamegraph' | 'timeline';
  includeContent?: boolean;
  maxDepth?: number;
  minDuration?: number;
  compress?: boolean;
}

// Performance analysis results
export interface PerformanceAnalysis {
  hotPaths: Array<{
    path: string;
    count: number;
    totalDuration: number;
    averageDuration: number;
    tokens: number;
  }>;
  bottlenecks: Array<{
    traceId: string;
    name: string;
    duration: number;
    percentOfTotal: number;
    recommendation: string;
  }>;
  patterns: Array<{
    type: 'SEQUENTIAL' | 'PARALLEL' | 'RECURSIVE' | 'CHAIN';
    description: string;
    frequency: number;
    efficiency: number;
  }>;
  recommendations: Array<{
    category: 'PERFORMANCE' | 'STRUCTURE' | 'TOKENS' | 'ERRORS';
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    title: string;
    description: string;
    impact: string;
  }>;
}

// Trace collection configuration
export interface TraceCollectorConfig {
  maxTraceDepth: number;
  maxTracesPerCommand: number;
  retentionPeriodMs: number;
  enableRealTimeAnalysis: boolean;
  performanceThresholds: {
    slowTraceMs: number;
    verySlowTraceMs: number;
    highTokenUsage: number;
  };
  exportLimits: {
    maxExportSize: number;
    maxExportDepth: number;
  };
}

// Trace aggregation result
export interface TraceAggregation {
  commandId: string;
  agentId: string;
  tree: TraceTree;
  stats: TraceStats;
  analysis?: PerformanceAnalysis;
  createdAt: number;
  updatedAt: number;
}

// Real-time trace update
export interface TraceUpdate {
  type: 'ADDED' | 'UPDATED' | 'COMPLETED' | 'ERROR';
  traceEntry: EnhancedTraceEntry;
  commandId: string;
  agentId: string;
  timestamp: number;
}

// Trace storage interface
export interface TraceStorage {
  store(trace: TraceEntry): Promise<void>;
  get(traceId: string): Promise<TraceEntry | null>;
  getByCommand(commandId: string): Promise<TraceEntry[]>;
  getByAgent(agentId: string, limit?: number): Promise<TraceEntry[]>;
  search(filter: TraceFilter, limit?: number, offset?: number): Promise<TraceEntry[]>;
  delete(traceId: string): Promise<boolean>;
  cleanup(olderThanMs: number): Promise<number>;
}

// Flamegraph data structure
export interface FlameGraphNode {
  name: string;
  value: number;
  children?: FlameGraphNode[];
  color?: string;
  tooltip?: string;
  metadata?: {
    traceId: string;
    type: TraceType;
    tokens?: number;
    error?: boolean;
  };
}

// Timeline data structure
export interface TimelineEvent {
  id: string;
  name: string;
  start: number;
  end: number;
  duration: number;
  type: TraceType;
  level: number;
  color: string;
  children: TimelineEvent[];
  metadata: {
    traceId: string;
    tokens?: number;
    error?: boolean;
    content?: any;
  };
}