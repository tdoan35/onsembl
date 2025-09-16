/**
 * Trace tree builder for hierarchical trace visualization
 * Builds trace trees from flat trace events with parent-child relationships
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

export interface TraceBuilderOptions {
  sortByTimestamp?: boolean;
  validateParentRefs?: boolean;
  maxDepth?: number;
  includeOrphaned?: boolean;
}

export interface TraceBuilderStats {
  totalTraces: number;
  rootTraces: number;
  orphanedTraces: number;
  maxDepth: number;
  averageChildrenPerNode: number;
  buildTimeMs: number;
}

export class TraceTreeBuilder {
  private logger: Logger;
  private options: Required<TraceBuilderOptions>;

  constructor(logger: Logger, options: TraceBuilderOptions = {}) {
    this.logger = logger.child({ component: 'TraceTreeBuilder' });
    this.options = {
      sortByTimestamp: options.sortByTimestamp ?? true,
      validateParentRefs: options.validateParentRefs ?? true,
      maxDepth: options.maxDepth ?? 50,
      includeOrphaned: options.includeOrphaned ?? true,
      ...options
    };
  }

  /**
   * Build hierarchical trace trees from flat trace events
   */
  buildTree(
    traces: TraceEntry[],
    commandId?: string,
    agentId?: string
  ): { tree: TraceTree; stats: TraceBuilderStats } {
    const startTime = Date.now();

    if (traces.length === 0) {
      throw new Error('Cannot build tree from empty trace array');
    }

    // Filter traces if commandId/agentId specified
    let filteredTraces = traces;
    if (commandId || agentId) {
      filteredTraces = traces.filter(trace =>
        (!commandId || trace.commandId === commandId) &&
        (!agentId || trace.agentId === agentId)
      );
    }

    if (filteredTraces.length === 0) {
      throw new Error('No traces found matching the specified criteria');
    }

    // Sort traces by timestamp if requested
    if (this.options.sortByTimestamp) {
      filteredTraces.sort((a, b) => a.startedAt - b.startedAt);
    }

    // Create trace lookup map
    const traceMap = new Map<string, TraceEntry>();
    filteredTraces.forEach(trace => traceMap.set(trace.id, trace));

    // Validate parent references if requested
    if (this.options.validateParentRefs) {
      this.validateParentReferences(filteredTraces, traceMap);
    }

    // Calculate durations for traces that don't have them
    this.calculateMissingDurations(filteredTraces);

    // Build parent-child relationships
    const { rootTraces, childrenMap, orphanedTraces } = this.buildRelationships(
      filteredTraces,
      traceMap
    );

    // Build tree structure recursively
    const treeRoots = rootTraces.map(root => this.buildTraceNode(root, childrenMap, 0));

    // Include orphaned traces as separate roots if requested
    if (this.options.includeOrphaned && orphanedTraces.length > 0) {
      const orphanedRoots = orphanedTraces.map(orphan =>
        this.buildTraceNode(orphan, childrenMap, 0)
      );
      treeRoots.push(...orphanedRoots);
    }

    // Calculate tree statistics
    const maxDepth = this.calculateMaxDepth(treeRoots);
    const stats: TraceBuilderStats = {
      totalTraces: filteredTraces.length,
      rootTraces: rootTraces.length,
      orphanedTraces: orphanedTraces.length,
      maxDepth,
      averageChildrenPerNode: this.calculateAverageChildren(childrenMap),
      buildTimeMs: Date.now() - startTime
    };

    // Build final tree
    const firstTrace = filteredTraces[0];
    if (!firstTrace) {
      throw new Error('No traces available to build tree');
    }

    const tree: TraceTree = {
      commandId: firstTrace.commandId,
      agentId: firstTrace.agentId,
      rootTraces: treeRoots,
      totalDuration: this.calculateTotalDuration(filteredTraces),
      totalTokens: this.calculateTotalTokens(filteredTraces),
      createdAt: Math.min(...filteredTraces.map(t => t.startedAt)),
      updatedAt: Date.now()
    };

    this.logger.debug({
      commandId: tree.commandId,
      agentId: tree.agentId,
      stats
    }, 'Trace tree built successfully');

    return { tree, stats };
  }

  /**
   * Rebuild tree with different sorting or filtering options
   */
  rebuildTree(
    existingTree: TraceTree,
    newOptions: Partial<TraceBuilderOptions>
  ): { tree: TraceTree; stats: TraceBuilderStats } {
    // Flatten the existing tree back to trace entries
    const flatTraces = this.flattenTree(existingTree);

    // Apply new options
    const oldOptions = this.options;
    this.options = { ...this.options, ...newOptions };

    try {
      return this.buildTree(flatTraces, existingTree.commandId, existingTree.agentId);
    } finally {
      // Restore original options
      this.options = oldOptions;
    }
  }

  /**
   * Merge multiple trace entries into a single tree
   */
  mergeTrees(trees: TraceTree[]): { tree: TraceTree; stats: TraceBuilderStats } {
    if (trees.length === 0) {
      throw new Error('Cannot merge empty tree array');
    }

    if (trees.length === 1) {
      // Return stats for the single tree
      const singleTree = trees[0];
      if (!singleTree) {
        throw new Error('Single tree is undefined');
      }
      const flatTraces = this.flattenTree(singleTree);
      return this.buildTree(flatTraces, singleTree.commandId, singleTree.agentId);
    }

    // Flatten all trees and merge
    const allTraces: TraceEntry[] = [];
    trees.forEach(tree => {
      const flatTraces = this.flattenTree(tree);
      allTraces.push(...flatTraces);
    });

    // Use the first tree's identifiers as the base
    const baseTree = trees[0];
    if (!baseTree) {
      throw new Error('No base tree found');
    }
    return this.buildTree(allTraces, baseTree.commandId, baseTree.agentId);
  }

  /**
   * Get trace path from root to specific trace ID
   */
  getTracePath(tree: TraceTree, targetTraceId: string): TraceEntry[] | null {
    for (const root of tree.rootTraces) {
      const path = this.findTracePath(root, targetTraceId, []);
      if (path) {
        return path;
      }
    }
    return null;
  }

  /**
   * Find critical path (longest duration sequence) through tree
   */
  getCriticalPath(tree: TraceTree): TraceEntry[] {
    let longestPath: TraceEntry[] = [];
    let maxDuration = 0;

    for (const root of tree.rootTraces) {
      const path = this.findLongestPath(root, []);
      const pathDuration = path.reduce((sum, trace) => sum + (trace.durationMs || 0), 0);

      if (pathDuration > maxDuration) {
        maxDuration = pathDuration;
        longestPath = path;
      }
    }

    return longestPath;
  }

  /**
   * Calculate tree depth
   */
  private calculateMaxDepth(roots: TraceEntry[]): number {
    let maxDepth = 0;

    const calculateDepth = (trace: TraceEntry, depth: number): number => {
      let currentMax = depth;

      if (trace.children && trace.children.length > 0) {
        for (const child of trace.children) {
          const childDepth = calculateDepth(child, depth + 1);
          currentMax = Math.max(currentMax, childDepth);
        }
      }

      return currentMax;
    };

    for (const root of roots) {
      const depth = calculateDepth(root, 1);
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth;
  }

  /**
   * Validate parent references exist and aren't circular
   */
  private validateParentReferences(traces: TraceEntry[], traceMap: Map<string, TraceEntry>): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const checkCircular = (traceId: string): boolean => {
      if (recursionStack.has(traceId)) {
        this.logger.warn({ traceId }, 'Circular reference detected in trace tree');
        return true;
      }

      if (visited.has(traceId)) {
        return false;
      }

      visited.add(traceId);
      recursionStack.add(traceId);

      const trace = traceMap.get(traceId);
      if (trace?.parentId && traceMap.has(trace.parentId)) {
        if (checkCircular(trace.parentId)) {
          return true;
        }
      }

      recursionStack.delete(traceId);
      return false;
    };

    for (const trace of traces) {
      if (!visited.has(trace.id)) {
        checkCircular(trace.id);
      }
    }
  }

  /**
   * Calculate missing durations based on timestamps
   */
  private calculateMissingDurations(traces: TraceEntry[]): void {
    for (const trace of traces) {
      if (trace.durationMs === undefined && trace.completedAt && trace.startedAt) {
        trace.durationMs = trace.completedAt - trace.startedAt;
      }
    }
  }

  /**
   * Build parent-child relationships
   */
  private buildRelationships(
    traces: TraceEntry[],
    traceMap: Map<string, TraceEntry>
  ): {
    rootTraces: TraceEntry[];
    childrenMap: Map<string, TraceEntry[]>;
    orphanedTraces: TraceEntry[];
  } {
    const childrenMap = new Map<string, TraceEntry[]>();
    const rootTraces: TraceEntry[] = [];
    const orphanedTraces: TraceEntry[] = [];

    // Build children map
    for (const trace of traces) {
      if (!trace.parentId || !traceMap.has(trace.parentId)) {
        // This is either a root trace or an orphaned trace
        if (!trace.parentId) {
          rootTraces.push(trace);
        } else {
          orphanedTraces.push(trace);
        }
      } else {
        // This trace has a valid parent
        if (!childrenMap.has(trace.parentId)) {
          childrenMap.set(trace.parentId, []);
        }
        childrenMap.get(trace.parentId)!.push(trace);
      }
    }

    // Sort children by start time if enabled
    if (this.options.sortByTimestamp) {
      childrenMap.forEach(children => {
        children.sort((a, b) => a.startedAt - b.startedAt);
      });
    }

    return { rootTraces, childrenMap, orphanedTraces };
  }

  /**
   * Build trace node recursively
   */
  private buildTraceNode(
    trace: TraceEntry,
    childrenMap: Map<string, TraceEntry[]>,
    depth: number
  ): TraceEntry {
    if (depth >= this.options.maxDepth) {
      this.logger.warn({ traceId: trace.id, depth }, 'Max depth reached, truncating tree');
      return { ...trace, children: [] };
    }

    const children = childrenMap.get(trace.id) || [];
    return {
      ...trace,
      children: children.map(child => this.buildTraceNode(child, childrenMap, depth + 1))
    };
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

  /**
   * Calculate average children per node
   */
  private calculateAverageChildren(childrenMap: Map<string, TraceEntry[]>): number {
    if (childrenMap.size === 0) return 0;

    const totalChildren = Array.from(childrenMap.values())
      .reduce((sum, children) => sum + children.length, 0);

    return totalChildren / childrenMap.size;
  }

  /**
   * Flatten a tree back to trace entries
   */
  private flattenTree(tree: TraceTree): TraceEntry[] {
    const traces: TraceEntry[] = [];

    const flatten = (trace: TraceEntry) => {
      // Create a copy without children for the flat list
      const { children, ...flatTrace } = trace;
      traces.push(flatTrace as TraceEntry);

      if (children) {
        children.forEach(flatten);
      }
    };

    tree.rootTraces.forEach(flatten);
    return traces;
  }

  /**
   * Find path to specific trace ID
   */
  private findTracePath(
    trace: TraceEntry,
    targetId: string,
    currentPath: TraceEntry[]
  ): TraceEntry[] | null {
    const newPath = [...currentPath, trace];

    if (trace.id === targetId) {
      return newPath;
    }

    if (trace.children) {
      for (const child of trace.children) {
        const path = this.findTracePath(child, targetId, newPath);
        if (path) {
          return path;
        }
      }
    }

    return null;
  }

  /**
   * Find longest path from a given root
   */
  private findLongestPath(trace: TraceEntry, currentPath: TraceEntry[]): TraceEntry[] {
    const newPath = [...currentPath, trace];

    if (!trace.children || trace.children.length === 0) {
      return newPath;
    }

    let longestPath = newPath;
    let maxDuration = newPath.reduce((sum, t) => sum + (t.durationMs || 0), 0);

    for (const child of trace.children) {
      const childPath = this.findLongestPath(child, newPath);
      const childDuration = childPath.reduce((sum, t) => sum + (t.durationMs || 0), 0);

      if (childDuration > maxDuration) {
        maxDuration = childDuration;
        longestPath = childPath;
      }
    }

    return longestPath;
  }
}