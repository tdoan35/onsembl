/**
 * Trace tree building functionality
 */

import { Logger } from 'pino';
import type { TraceEntry, TraceTree } from '@onsembl/agent-protocol';
import type { FlameGraphNode, TimelineEvent } from './types.js';

export class TreeBuilder {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'TreeBuilder' });
  }

  /**
   * Build a hierarchical tree from flat trace entries
   */
  buildTree(traces: TraceEntry[]): TraceTree {
    if (traces.length === 0) {
      throw new Error('Cannot build tree from empty trace array');
    }

    // Create a map for quick lookups
    const traceMap = new Map<string, TraceEntry>();
    traces.forEach(trace => traceMap.set(trace.id, trace));

    // Find root traces (those without parents or with non-existent parents)
    const rootTraces = traces.filter(trace =>
      !trace.parentId || !traceMap.has(trace.parentId)
    );

    if (rootTraces.length === 0) {
      this.logger.warn('No root traces found, using first trace as root');
      rootTraces.push(traces[0]);
    }

    // Build children map
    const childrenMap = new Map<string, TraceEntry[]>();
    traces.forEach(trace => {
      if (trace.parentId && traceMap.has(trace.parentId)) {
        if (!childrenMap.has(trace.parentId)) {
          childrenMap.set(trace.parentId, []);
        }
        childrenMap.get(trace.parentId)!.push(trace);
      }
    });

    // Sort children by start time
    childrenMap.forEach(children => {
      children.sort((a, b) => a.startedAt - b.startedAt);
    });

    // Recursively build tree structure
    const buildTraceTree = (trace: TraceEntry): TraceEntry => {
      const children = childrenMap.get(trace.id) || [];
      return {
        ...trace,
        children: children.map(buildTraceTree)
      };
    };

    // Build the tree starting from the first root
    const rootTrace = rootTraces[0];
    const tree: TraceTree = {
      commandId: rootTrace.commandId,
      agentId: rootTrace.agentId,
      rootTraces: rootTraces.map(buildTraceTree),
      totalDuration: this.calculateTotalDuration(traces),
      totalTokens: this.calculateTotalTokens(traces),
      createdAt: Math.min(...traces.map(t => t.startedAt)),
      updatedAt: Date.now()
    };

    this.logger.debug(
      {
        commandId: tree.commandId,
        rootCount: rootTraces.length,
        totalTraces: traces.length
      },
      'Tree built successfully'
    );

    return tree;
  }

  /**
   * Convert trace tree to flamegraph format
   */
  toFlameGraph(tree: TraceTree): FlameGraphNode {
    const rootTrace = tree.rootTraces[0];

    return this.buildFlameGraphNode(rootTrace);
  }

  /**
   * Convert trace tree to timeline format
   */
  toTimeline(tree: TraceTree): TimelineEvent[] {
    return tree.rootTraces.map((root, index) =>
      this.buildTimelineEvent(root, 0)
    );
  }

  /**
   * Get the critical path (longest duration path) through the tree
   */
  getCriticalPath(tree: TraceTree): TraceEntry[] {
    const criticalPath: TraceEntry[] = [];
    let current = tree.rootTraces[0];

    while (current) {
      criticalPath.push(current);

      // Find the child with the longest duration
      if (current.children && current.children.length > 0) {
        current = current.children.reduce((longest, child) =>
          (child.durationMs || 0) > (longest.durationMs || 0) ? child : longest
        );
      } else {
        break;
      }
    }

    return criticalPath;
  }

  /**
   * Calculate tree depth
   */
  getTreeDepth(tree: TraceTree): number {
    const calculateDepth = (trace: TraceEntry, depth = 0): number => {
      if (!trace.children || trace.children.length === 0) {
        return depth;
      }

      return Math.max(
        ...trace.children.map(child => calculateDepth(child, depth + 1))
      );
    };

    return Math.max(
      ...tree.rootTraces.map(root => calculateDepth(root))
    );
  }

  /**
   * Get all leaf nodes (traces with no children)
   */
  getLeafNodes(tree: TraceTree): TraceEntry[] {
    const leaves: TraceEntry[] = [];

    const collectLeaves = (trace: TraceEntry) => {
      if (!trace.children || trace.children.length === 0) {
        leaves.push(trace);
      } else {
        trace.children.forEach(collectLeaves);
      }
    };

    tree.rootTraces.forEach(collectLeaves);
    return leaves;
  }

  /**
   * Find traces matching a predicate
   */
  findTraces(tree: TraceTree, predicate: (trace: TraceEntry) => boolean): TraceEntry[] {
    const matches: TraceEntry[] = [];

    const search = (trace: TraceEntry) => {
      if (predicate(trace)) {
        matches.push(trace);
      }

      if (trace.children) {
        trace.children.forEach(search);
      }
    };

    tree.rootTraces.forEach(search);
    return matches;
  }

  /**
   * Get trace path from root to specific trace ID
   */
  getTracePath(tree: TraceTree, traceId: string): TraceEntry[] | null {
    const findPath = (trace: TraceEntry, path: TraceEntry[] = []): TraceEntry[] | null => {
      const currentPath = [...path, trace];

      if (trace.id === traceId) {
        return currentPath;
      }

      if (trace.children) {
        for (const child of trace.children) {
          const foundPath = findPath(child, currentPath);
          if (foundPath) {
            return foundPath;
          }
        }
      }

      return null;
    };

    for (const root of tree.rootTraces) {
      const path = findPath(root);
      if (path) {
        return path;
      }
    }

    return null;
  }

  /**
   * Build a flamegraph node from a trace entry
   */
  private buildFlameGraphNode(trace: TraceEntry): FlameGraphNode {
    const duration = trace.durationMs || 0;
    const hasError = !trace.completedAt && trace.startedAt + duration < Date.now();

    const node: FlameGraphNode = {
      name: trace.name,
      value: duration,
      tooltip: `${trace.name}: ${duration}ms`,
      color: this.getFlameGraphColor(trace.type, hasError),
      metadata: {
        traceId: trace.id,
        type: trace.type,
        tokens: trace.tokensUsed,
        error: hasError
      }
    };

    if (trace.children && trace.children.length > 0) {
      node.children = trace.children.map(child => this.buildFlameGraphNode(child));
    }

    return node;
  }

  /**
   * Build a timeline event from a trace entry
   */
  private buildTimelineEvent(trace: TraceEntry, level: number): TimelineEvent {
    const start = trace.startedAt;
    const end = trace.completedAt || start + (trace.durationMs || 0);
    const duration = end - start;
    const hasError = !trace.completedAt && start + duration < Date.now();

    const event: TimelineEvent = {
      id: trace.id,
      name: trace.name,
      start,
      end,
      duration,
      type: trace.type,
      level,
      color: this.getTimelineColor(trace.type, hasError),
      children: [],
      metadata: {
        traceId: trace.id,
        tokens: trace.tokensUsed,
        error: hasError,
        content: trace.content
      }
    };

    if (trace.children && trace.children.length > 0) {
      event.children = trace.children.map(child =>
        this.buildTimelineEvent(child, level + 1)
      );
    }

    return event;
  }

  /**
   * Get color for flamegraph based on trace type and error status
   */
  private getFlameGraphColor(type: string, hasError: boolean): string {
    if (hasError) {
      return '#dc2626'; // Red for errors
    }

    switch (type) {
      case 'LLM_PROMPT':
        return '#3b82f6'; // Blue
      case 'TOOL_CALL':
        return '#10b981'; // Green
      case 'RESPONSE':
        return '#f59e0b'; // Yellow
      default:
        return '#6b7280'; // Gray
    }
  }

  /**
   * Get color for timeline based on trace type and error status
   */
  private getTimelineColor(type: string, hasError: boolean): string {
    if (hasError) {
      return '#fca5a5'; // Light red for errors
    }

    switch (type) {
      case 'LLM_PROMPT':
        return '#93c5fd'; // Light blue
      case 'TOOL_CALL':
        return '#6ee7b7'; // Light green
      case 'RESPONSE':
        return '#fcd34d'; // Light yellow
      default:
        return '#d1d5db'; // Light gray
    }
  }

  /**
   * Calculate total duration across all traces
   */
  private calculateTotalDuration(traces: TraceEntry[]): number {
    return traces.reduce((total, trace) => total + (trace.durationMs || 0), 0);
  }

  /**
   * Calculate total tokens across all traces
   */
  private calculateTotalTokens(traces: TraceEntry[]): number {
    return traces.reduce((total, trace) => total + (trace.tokensUsed || 0), 0);
  }
}