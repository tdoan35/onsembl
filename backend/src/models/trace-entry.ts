/**
 * TraceEntry Model for Onsembl.ai Agent Control Center
 *
 * Implementation of T073: TraceEntry model with comprehensive LLM trace operations
 *
 * Database Schema Requirements (as specified):
 * - id: uuid (primary key)
 * - command_id: uuid (foreign key to commands table)
 * - parent_id: uuid (self-referential foreign key)
 * - type: PROMPT | COMPLETION | TOOL_CALL | TOOL_RESULT
 * - model: string (e.g., "claude-3-opus", "gpt-4")
 * - prompt: text
 * - completion: text
 * - tokens_input: number
 * - tokens_output: number
 * - latency_ms: number
 * - metadata: json (tool names, parameters, etc.)
 * - created_at: timestamp
 *
 * Note: This model implements the T073 specification schema. The current database
 * migration has a different schema which may need to be updated to match these requirements.
 */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// TraceEntry types as per T073 requirements
export type TraceEntryType = 'PROMPT' | 'COMPLETION' | 'TOOL_CALL' | 'TOOL_RESULT';

// TraceEntry schema validation
export const TraceEntrySchema = z.object({
  id: z.string().uuid().optional(),
  command_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable().optional(),
  type: z.enum(['PROMPT', 'COMPLETION', 'TOOL_CALL', 'TOOL_RESULT']),
  model: z.string().min(1),
  prompt: z.string().nullable().optional(),
  completion: z.string().nullable().optional(),
  tokens_input: z.number().int().min(0).default(0),
  tokens_output: z.number().int().min(0).default(0),
  latency_ms: z.number().min(0),
  metadata: z.record(z.any()).optional(),
  created_at: z.string().datetime().optional(),
});

export type TraceEntry = z.infer<typeof TraceEntrySchema>;

// TraceEntry interfaces for database operations
export interface TraceEntryRow {
  id: string;
  command_id: string;
  parent_id: string | null;
  type: TraceEntryType;
  model: string;
  prompt: string | null;
  completion: string | null;
  tokens_input: number;
  tokens_output: number;
  latency_ms: number;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface TraceEntryInsert {
  id?: string;
  command_id: string;
  parent_id?: string | null;
  type: TraceEntryType;
  model: string;
  prompt?: string | null;
  completion?: string | null;
  tokens_input?: number;
  tokens_output?: number;
  latency_ms: number;
  metadata?: Record<string, any> | null;
  created_at?: string;
}

export interface TraceEntryUpdate {
  id?: string;
  command_id?: string;
  parent_id?: string | null;
  type?: TraceEntryType;
  model?: string;
  prompt?: string | null;
  completion?: string | null;
  tokens_input?: number;
  tokens_output?: number;
  latency_ms?: number;
  metadata?: Record<string, any> | null;
  created_at?: string;
}

// Tree node interface for hierarchical trace representation
export interface TraceTreeNode extends TraceEntryRow {
  children: TraceTreeNode[];
  depth: number;
  total_tokens: number;
  total_cost: number;
}

// Metrics interface for trace analysis
export interface TraceMetrics {
  total_entries: number;
  total_tokens_input: number;
  total_tokens_output: number;
  total_latency_ms: number;
  average_latency_ms: number;
  total_cost: number;
  model_breakdown: Record<string, {
    count: number;
    tokens_input: number;
    tokens_output: number;
    cost: number;
  }>;
  type_breakdown: Record<TraceEntryType, {
    count: number;
    tokens: number;
    latency_ms: number;
  }>;
}

// Custom error types for better error handling
export class TraceEntryNotFoundError extends Error {
  constructor(id: string) {
    super(`TraceEntry with id ${id} not found`);
    this.name = 'TraceEntryNotFoundError';
  }
}

export class TraceEntryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TraceEntryValidationError';
  }
}

export class TraceEntryOperationError extends Error {
  constructor(operation: string, message: string) {
    super(`Failed to ${operation}: ${message}`);
    this.name = 'TraceEntryOperationError';
  }
}

export class TraceTreeBuildError extends Error {
  constructor(commandId: string, message: string) {
    super(`Failed to build trace tree for command ${commandId}: ${message}`);
    this.name = 'TraceTreeBuildError';
  }
}

/**
 * Model pricing for cost calculations (tokens per dollar)
 * Based on common LLM pricing as of 2024
 */
const MODEL_PRICING: Record<string, { input_cost_per_1k: number; output_cost_per_1k: number }> = {
  'claude-3-opus': { input_cost_per_1k: 0.015, output_cost_per_1k: 0.075 },
  'claude-3-sonnet': { input_cost_per_1k: 0.003, output_cost_per_1k: 0.015 },
  'claude-3-haiku': { input_cost_per_1k: 0.00025, output_cost_per_1k: 0.00125 },
  'gpt-4': { input_cost_per_1k: 0.03, output_cost_per_1k: 0.06 },
  'gpt-4-turbo': { input_cost_per_1k: 0.01, output_cost_per_1k: 0.03 },
  'gpt-3.5-turbo': { input_cost_per_1k: 0.0005, output_cost_per_1k: 0.0015 },
  'gemini-pro': { input_cost_per_1k: 0.0005, output_cost_per_1k: 0.0015 },
  'gemini-pro-vision': { input_cost_per_1k: 0.00025, output_cost_per_1k: 0.00025 },
};

export class TraceEntryModel {
  constructor(private supabase: ReturnType<typeof createClient>) {}

  /**
   * Creates a new trace entry in the database
   * @param traceEntry TraceEntry data to insert
   * @returns Created trace entry with generated ID and timestamps
   */
  async create(traceEntry: TraceEntryInsert): Promise<TraceEntryRow> {
    try {
      // Validate input using Zod schema
      const validated = TraceEntrySchema.parse({
        ...traceEntry,
        tokens_input: traceEntry.tokens_input ?? 0,
        tokens_output: traceEntry.tokens_output ?? 0,
      });

      const now = new Date().toISOString();
      const insertData: TraceEntryInsert = {
        command_id: validated.command_id,
        parent_id: validated.parent_id || null,
        type: validated.type,
        model: validated.model,
        prompt: validated.prompt || null,
        completion: validated.completion || null,
        tokens_input: validated.tokens_input,
        tokens_output: validated.tokens_output,
        latency_ms: validated.latency_ms,
        metadata: validated.metadata || null,
        created_at: now,
      };

      const { data, error } = await (this.supabase as any)
        .from('trace_entries')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new TraceEntryOperationError('create trace entry', error.message);
      }

      return data as TraceEntryRow;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new TraceEntryValidationError(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }

  /**
   * Finds trace entries by command ID
   * @param commandId Command UUID
   * @returns Array of trace entries for the command
   */
  async findByCommandId(commandId: string): Promise<TraceEntryRow[]> {
    try {
      const { data, error } = await this.supabase
        .from('trace_entries')
        .select('*')
        .eq('command_id', commandId)
        .order('created_at', { ascending: true });

      if (error) {
        throw new TraceEntryOperationError('find trace entries by command ID', error.message);
      }

      return (data as TraceEntryRow[]) || [];
    } catch (error) {
      throw new TraceEntryOperationError('find trace entries by command ID', (error as Error).message);
    }
  }

  /**
   * Builds a hierarchical trace tree for a command
   * @param commandId Command UUID
   * @returns Array of root trace tree nodes with nested children
   */
  async buildTree(commandId: string): Promise<TraceTreeNode[]> {
    try {
      const traceEntries = await this.findByCommandId(commandId);

      if (traceEntries.length === 0) {
        return [];
      }

      // Create a map for O(1) lookup
      const entryMap = new Map<string, TraceTreeNode>();
      const rootNodes: TraceTreeNode[] = [];

      // Initialize all entries as tree nodes
      traceEntries.forEach(entry => {
        const treeNode: TraceTreeNode = {
          ...entry,
          children: [],
          depth: 0,
          total_tokens: entry.tokens_input + entry.tokens_output,
          total_cost: this.calculateCost(entry.model, entry.tokens_input, entry.tokens_output),
        };
        entryMap.set(entry.id, treeNode);
      });

      // Build the tree structure
      traceEntries.forEach(entry => {
        const node = entryMap.get(entry.id)!;

        if (entry.parent_id && entryMap.has(entry.parent_id)) {
          const parent = entryMap.get(entry.parent_id)!;
          parent.children.push(node);
          node.depth = parent.depth + 1;
        } else {
          // This is a root node
          rootNodes.push(node);
        }
      });

      // Calculate aggregated metrics for parent nodes
      this.calculateAggregatedMetrics(rootNodes);

      return rootNodes;
    } catch (error) {
      throw new TraceTreeBuildError(commandId, (error as Error).message);
    }
  }

  /**
   * Gets comprehensive metrics for trace entries of a command
   * @param commandId Command UUID
   * @returns Detailed metrics object with breakdowns
   */
  async getMetrics(commandId: string): Promise<TraceMetrics> {
    try {
      const traceEntries = await this.findByCommandId(commandId);

      const metrics: TraceMetrics = {
        total_entries: traceEntries.length,
        total_tokens_input: 0,
        total_tokens_output: 0,
        total_latency_ms: 0,
        average_latency_ms: 0,
        total_cost: 0,
        model_breakdown: {},
        type_breakdown: {} as Record<TraceEntryType, {
          count: number;
          tokens: number;
          latency_ms: number;
        }>,
      };

      if (traceEntries.length === 0) {
        return metrics;
      }

      // Calculate totals and breakdowns
      traceEntries.forEach(entry => {
        // Overall totals
        metrics.total_tokens_input += entry.tokens_input;
        metrics.total_tokens_output += entry.tokens_output;
        metrics.total_latency_ms += entry.latency_ms;

        const entryCost = this.calculateCost(entry.model, entry.tokens_input, entry.tokens_output);
        metrics.total_cost += entryCost;

        // Model breakdown
        if (!metrics.model_breakdown[entry.model]) {
          metrics.model_breakdown[entry.model] = {
            count: 0,
            tokens_input: 0,
            tokens_output: 0,
            cost: 0,
          };
        }
        const modelBreakdown = metrics.model_breakdown[entry.model];
        modelBreakdown.count++;
        modelBreakdown.tokens_input += entry.tokens_input;
        modelBreakdown.tokens_output += entry.tokens_output;
        modelBreakdown.cost += entryCost;

        // Type breakdown
        if (!metrics.type_breakdown[entry.type]) {
          metrics.type_breakdown[entry.type] = {
            count: 0,
            tokens: 0,
            latency_ms: 0,
          };
        }
        const typeBreakdown = metrics.type_breakdown[entry.type];
        typeBreakdown.count++;
        typeBreakdown.tokens += entry.tokens_input + entry.tokens_output;
        typeBreakdown.latency_ms += entry.latency_ms;
      });

      // Calculate averages
      metrics.average_latency_ms = metrics.total_latency_ms / metrics.total_entries;

      return metrics;
    } catch (error) {
      throw new TraceEntryOperationError('get trace metrics', (error as Error).message);
    }
  }

  /**
   * Finds a trace entry by ID
   * @param id TraceEntry UUID
   * @returns TraceEntry data or throws TraceEntryNotFoundError
   */
  async findById(id: string): Promise<TraceEntryRow> {
    try {
      const { data, error } = await this.supabase
        .from('trace_entries')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new TraceEntryNotFoundError(id);
        }
        throw new TraceEntryOperationError('find trace entry by ID', error.message);
      }

      return data as TraceEntryRow;
    } catch (error) {
      if (error instanceof TraceEntryNotFoundError) {
        throw error;
      }
      throw new TraceEntryOperationError('find trace entry by ID', (error as Error).message);
    }
  }

  /**
   * Updates a trace entry
   * @param id TraceEntry UUID
   * @param updates Partial trace entry data to update
   * @returns Updated trace entry data
   */
  async update(id: string, updates: TraceEntryUpdate): Promise<TraceEntryRow> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('trace_entries')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new TraceEntryNotFoundError(id);
        }
        throw new TraceEntryOperationError('update trace entry', error.message);
      }

      return data as TraceEntryRow;
    } catch (error) {
      if (error instanceof TraceEntryNotFoundError) {
        throw error;
      }
      throw new TraceEntryOperationError('update trace entry', (error as Error).message);
    }
  }

  /**
   * Deletes a trace entry and all its children
   * @param id TraceEntry UUID
   * @returns Promise that resolves when deletion is complete
   */
  async delete(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('trace_entries')
        .delete()
        .eq('id', id);

      if (error) {
        throw new TraceEntryOperationError('delete trace entry', error.message);
      }
    } catch (error) {
      throw new TraceEntryOperationError('delete trace entry', (error as Error).message);
    }
  }

  /**
   * Finds all trace entries with optional filtering
   * @param filters Optional filters for command_id, type, model, parent_id, limit, offset
   * @returns Array of trace entries
   */
  async findAll(filters?: {
    command_id?: string;
    type?: TraceEntryType;
    model?: string;
    parent_id?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<TraceEntryRow[]> {
    try {
      let query = this.supabase.from('trace_entries').select('*');

      if (filters?.command_id) {
        query = query.eq('command_id', filters.command_id);
      }

      if (filters?.type) {
        query = query.eq('type', filters.type);
      }

      if (filters?.model) {
        query = query.eq('model', filters.model);
      }

      if (filters?.parent_id !== undefined) {
        if (filters.parent_id === null) {
          query = query.is('parent_id', null);
        } else {
          query = query.eq('parent_id', filters.parent_id);
        }
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      if (filters?.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error } = await query.order('created_at', { ascending: true });

      if (error) {
        throw new TraceEntryOperationError('find all trace entries', error.message);
      }

      return (data as TraceEntryRow[]) || [];
    } catch (error) {
      throw new TraceEntryOperationError('find all trace entries', (error as Error).message);
    }
  }

  /**
   * Calculates cost for a model based on token usage
   * @param model Model name
   * @param tokensInput Input tokens
   * @param tokensOutput Output tokens
   * @returns Cost in dollars
   */
  private calculateCost(model: string, tokensInput: number, tokensOutput: number): number {
    const pricing = MODEL_PRICING[model.toLowerCase()];
    if (!pricing) {
      // Default pricing if model not found
      return 0;
    }

    const inputCost = (tokensInput / 1000) * pricing.input_cost_per_1k;
    const outputCost = (tokensOutput / 1000) * pricing.output_cost_per_1k;

    return inputCost + outputCost;
  }

  /**
   * Recursively calculates aggregated metrics for tree nodes
   * @param nodes Array of tree nodes to process
   */
  private calculateAggregatedMetrics(nodes: TraceTreeNode[]): void {
    nodes.forEach(node => {
      if (node.children.length > 0) {
        // Recursively calculate children first
        this.calculateAggregatedMetrics(node.children);

        // Aggregate metrics from children
        node.total_tokens = node.tokens_input + node.tokens_output;
        node.total_cost = this.calculateCost(node.model, node.tokens_input, node.tokens_output);

        node.children.forEach(child => {
          node.total_tokens += child.total_tokens;
          node.total_cost += child.total_cost;
        });
      }
    });
  }

  /**
   * Gets trace entry statistics for a command or all commands
   * @param commandId Optional command UUID to filter by
   * @returns Trace entry statistics object
   */
  async getTraceStats(commandId?: string): Promise<{
    total: number;
    by_type: Record<TraceEntryType, number>;
    by_model: Record<string, number>;
    avg_latency_ms: number;
    total_tokens: number;
    total_cost: number;
  }> {
    try {
      const filters: { command_id?: string } = {};
      if (commandId) {
        filters.command_id = commandId;
      }

      const traceEntries = await this.findAll(filters);

      const stats = {
        total: traceEntries.length,
        by_type: {} as Record<TraceEntryType, number>,
        by_model: {} as Record<string, number>,
        avg_latency_ms: 0,
        total_tokens: 0,
        total_cost: 0,
      };

      if (traceEntries.length === 0) {
        return stats;
      }

      let totalLatency = 0;

      traceEntries.forEach(entry => {
        // Type breakdown
        stats.by_type[entry.type] = (stats.by_type[entry.type] || 0) + 1;

        // Model breakdown
        stats.by_model[entry.model] = (stats.by_model[entry.model] || 0) + 1;

        // Totals
        totalLatency += entry.latency_ms;
        stats.total_tokens += entry.tokens_input + entry.tokens_output;
        stats.total_cost += this.calculateCost(entry.model, entry.tokens_input, entry.tokens_output);
      });

      stats.avg_latency_ms = totalLatency / traceEntries.length;

      return stats;
    } catch (error) {
      throw new TraceEntryOperationError('get trace stats', (error as Error).message);
    }
  }
}