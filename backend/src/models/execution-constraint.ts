import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { Database } from '../types/database';
import { z } from 'zod';

// Enhanced ExecutionConstraint schema validation matching data model specification
export const ExecutionConstraintSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  time_limit_ms: z.number().int().positive().nullable().optional(),
  token_budget: z.number().int().positive().nullable().optional(),
  memory_limit_mb: z.number().int().positive().nullable().optional(),
  cpu_limit_percent: z.number().int().min(1).max(100).nullable().optional(),
  is_default: z.boolean().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// Type for constraint types used in evaluation
export type ConstraintType = 'MAX_TOKENS' | 'MAX_COST' | 'TIME_LIMIT' | 'MEMORY_LIMIT' | 'CPU_LIMIT';

// Type for constraint scope (for future extensibility)
export type ConstraintScope = 'GLOBAL' | 'AGENT' | 'COMMAND';

export type ExecutionConstraint = z.infer<typeof ExecutionConstraintSchema>;

// Interface for constraint evaluation context
export interface ConstraintEvaluationContext {
  current_tokens?: number;
  current_cost?: number;
  execution_time_ms?: number;
  memory_usage_mb?: number;
  cpu_usage_percent?: number;
}

// Interface for constraint evaluation result
export interface ConstraintEvaluationResult {
  isValid: boolean;
  violations: {
    type: ConstraintType;
    current: number;
    limit: number;
    message: string;
  }[];
}

// Custom error types for better error handling
export class ExecutionConstraintError extends Error {
  constructor(
    message: string,
    public code: string,
    public constraintId?: string
  ) {
    super(message);
    this.name = 'ExecutionConstraintError';
  }
}

export class ExecutionConstraintNotFoundError extends ExecutionConstraintError {
  constructor(constraintId: string) {
    super(`ExecutionConstraint with id ${constraintId} not found`, 'CONSTRAINT_NOT_FOUND', constraintId);
  }
}

export class ExecutionConstraintValidationError extends ExecutionConstraintError {
  constructor(message: string, public validationErrors?: z.ZodIssue[]) {
    super(message, 'CONSTRAINT_VALIDATION_ERROR');
  }
}

export class ExecutionConstraintViolationError extends ExecutionConstraintError {
  constructor(message: string, public violations: ConstraintEvaluationResult['violations']) {
    super(message, 'CONSTRAINT_VIOLATION');
  }
}

/**
 * ExecutionConstraintModel - Manages execution constraints for agent operations
 *
 * This model provides comprehensive functionality for managing execution limits
 * that control agent behavior during command execution. It supports different
 * constraint types including time limits, token budgets, memory limits, and CPU usage.
 *
 * Features:
 * - CRUD operations for execution constraints
 * - Real-time constraint evaluation against execution context
 * - Support for different constraint types (TIME_LIMIT, MAX_TOKENS, MEMORY_LIMIT, CPU_LIMIT)
 * - Validation of constraint configurations
 * - Real-time subscription to constraint changes
 * - Soft delete (disable) and hard delete operations
 *
 * Note: Currently adapts to the existing execution_constraints database schema
 * which stores agent-specific constraints. The model transforms this to support
 * the data model specification for reusable constraint profiles.
 *
 * @example
 * ```typescript
 * const model = new ExecutionConstraintModel(supabaseClient);
 *
 * // Create a new constraint
 * const constraint = await model.create({
 *   name: 'Standard Limit',
 *   description: 'Standard execution limits for production',
 *   time_limit_ms: 300000,
 *   token_budget: 1000,
 *   memory_limit_mb: 512,
 *   cpu_limit_percent: 80
 * });
 *
 * // Evaluate constraints
 * const result = await model.evaluate(constraint.id, {
 *   execution_time_ms: 250000,
 *   current_tokens: 800,
 *   memory_usage_mb: 400,
 *   cpu_usage_percent: 70
 * });
 *
 * if (!result.isValid) {
 *   console.log('Constraint violations:', result.violations);
 * }
 * ```
 */
export class ExecutionConstraintModel {
  private subscriptions: Map<string, RealtimeChannel> = new Map();

  constructor(private supabase: ReturnType<typeof createClient<Database>>) {}

  /**
   * Create a new execution constraint
   */
  async create(constraint: {
    name: string;
    description?: string | null;
    time_limit_ms?: number | null;
    token_budget?: number | null;
    memory_limit_mb?: number | null;
    cpu_limit_percent?: number | null;
    is_default?: boolean;
  }): Promise<any> {
    try {
      // Validate input using Zod schema
      const validated = ExecutionConstraintSchema.parse(constraint);

      // For now, we'll store constraints as agent-specific with null agent_id for global
      // This adapts to the current database schema
      const insertData = {
        agent_id: null, // Global constraint for now
        max_execution_time_ms: validated.time_limit_ms,
        max_memory_mb: validated.memory_limit_mb,
        max_cpu_percent: validated.cpu_limit_percent,
        // Store additional fields in environment_variables as workaround
        environment_variables: {
          name: validated.name,
          description: validated.description,
          token_budget: validated.token_budget,
          is_default: validated.is_default || false
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await (this.supabase as any)
        .from('execution_constraints')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new ExecutionConstraintError(`Failed to create execution constraint: ${error.message}`, 'DATABASE_ERROR');
      }

      return this.transformFromDatabase(data);
    } catch (error) {
      if (error instanceof ExecutionConstraintError) throw error;
      if (error instanceof z.ZodError) {
        throw new ExecutionConstraintValidationError('Invalid execution constraint data', error.issues);
      }
      throw new ExecutionConstraintError(`Unexpected error creating execution constraint: ${error}`, 'UNKNOWN_ERROR');
    }
  }

  /**
   * Find all active execution constraints
   */
  async findActive(): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('execution_constraints')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw new ExecutionConstraintError(`Failed to find active constraints: ${error.message}`, 'DATABASE_ERROR');
      }

      return data.map(row => this.transformFromDatabase(row));
    } catch (error) {
      if (error instanceof ExecutionConstraintError) throw error;
      throw new ExecutionConstraintError(`Unexpected error finding active constraints: ${error}`, 'UNKNOWN_ERROR');
    }
  }

  /**
   * Find constraint by ID
   */
  async findById(id: string): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('execution_constraints')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new ExecutionConstraintNotFoundError(id);
        }
        throw new ExecutionConstraintError(`Failed to find constraint: ${error.message}`, 'DATABASE_ERROR', id);
      }

      return this.transformFromDatabase(data);
    } catch (error) {
      if (error instanceof ExecutionConstraintError) throw error;
      throw new ExecutionConstraintError(`Unexpected error finding constraint: ${error}`, 'UNKNOWN_ERROR', id);
    }
  }

  /**
   * Find default constraint
   */
  async findDefault(): Promise<any | null> {
    try {
      const { data, error } = await this.supabase
        .from('execution_constraints')
        .select('*')
        .eq('environment_variables->>is_default', 'true')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new ExecutionConstraintError(`Failed to find default constraint: ${error.message}`, 'DATABASE_ERROR');
      }

      return data ? this.transformFromDatabase(data) : null;
    } catch (error) {
      if (error instanceof ExecutionConstraintError) throw error;
      throw new ExecutionConstraintError(`Unexpected error finding default constraint: ${error}`, 'UNKNOWN_ERROR');
    }
  }

  /**
   * Evaluate constraints against current context
   */
  async evaluate(constraintId: string, context: ConstraintEvaluationContext): Promise<ConstraintEvaluationResult> {
    try {
      const constraint = await this.findById(constraintId);
      const violations: ConstraintEvaluationResult['violations'] = [];

      // Check time limit
      if (constraint.time_limit_ms && context.execution_time_ms) {
        if (context.execution_time_ms > constraint.time_limit_ms) {
          violations.push({
            type: 'TIME_LIMIT',
            current: context.execution_time_ms,
            limit: constraint.time_limit_ms,
            message: `Execution time ${context.execution_time_ms}ms exceeds limit of ${constraint.time_limit_ms}ms`
          });
        }
      }

      // Check token budget
      if (constraint.token_budget && context.current_tokens) {
        if (context.current_tokens > constraint.token_budget) {
          violations.push({
            type: 'MAX_TOKENS',
            current: context.current_tokens,
            limit: constraint.token_budget,
            message: `Token usage ${context.current_tokens} exceeds budget of ${constraint.token_budget}`
          });
        }
      }

      // Check memory limit
      if (constraint.memory_limit_mb && context.memory_usage_mb) {
        if (context.memory_usage_mb > constraint.memory_limit_mb) {
          violations.push({
            type: 'MEMORY_LIMIT',
            current: context.memory_usage_mb,
            limit: constraint.memory_limit_mb,
            message: `Memory usage ${context.memory_usage_mb}MB exceeds limit of ${constraint.memory_limit_mb}MB`
          });
        }
      }

      // Check CPU limit
      if (constraint.cpu_limit_percent && context.cpu_usage_percent) {
        if (context.cpu_usage_percent > constraint.cpu_limit_percent) {
          violations.push({
            type: 'CPU_LIMIT',
            current: context.cpu_usage_percent,
            limit: constraint.cpu_limit_percent,
            message: `CPU usage ${context.cpu_usage_percent}% exceeds limit of ${constraint.cpu_limit_percent}%`
          });
        }
      }

      return {
        isValid: violations.length === 0,
        violations
      };
    } catch (error) {
      if (error instanceof ExecutionConstraintError) throw error;
      throw new ExecutionConstraintError(`Unexpected error evaluating constraint: ${error}`, 'UNKNOWN_ERROR', constraintId);
    }
  }

  /**
   * Update an existing constraint
   */
  async update(id: string, updates: {
    name?: string;
    description?: string | null;
    time_limit_ms?: number | null;
    token_budget?: number | null;
    memory_limit_mb?: number | null;
    cpu_limit_percent?: number | null;
    is_default?: boolean;
  }): Promise<any> {
    try {
      // Validate partial update data
      const validationResult = ExecutionConstraintSchema.partial().safeParse(updates);
      if (!validationResult.success) {
        throw new ExecutionConstraintValidationError(
          'Invalid constraint update data',
          validationResult.error.issues
        );
      }

      // Get current constraint to merge environment_variables
      const current = await this.findById(id);

      const updateData = {
        max_execution_time_ms: updates.time_limit_ms !== undefined ? updates.time_limit_ms : undefined,
        max_memory_mb: updates.memory_limit_mb !== undefined ? updates.memory_limit_mb : undefined,
        max_cpu_percent: updates.cpu_limit_percent !== undefined ? updates.cpu_limit_percent : undefined,
        environment_variables: {
          ...current.environment_variables,
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.token_budget !== undefined && { token_budget: updates.token_budget }),
          ...(updates.is_default !== undefined && { is_default: updates.is_default }),
        },
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await (this.supabase as any)
        .from('execution_constraints')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new ExecutionConstraintNotFoundError(id);
        }
        throw new ExecutionConstraintError(`Failed to update constraint: ${error.message}`, 'DATABASE_ERROR', id);
      }

      return this.transformFromDatabase(data);
    } catch (error) {
      if (error instanceof ExecutionConstraintError) throw error;
      throw new ExecutionConstraintError(`Unexpected error updating constraint: ${error}`, 'UNKNOWN_ERROR', id);
    }
  }

  /**
   * Disable a constraint (soft delete)
   */
  async disable(id: string): Promise<boolean> {
    try {
      // For now, we'll mark as disabled in environment_variables
      const { error } = await (this.supabase as any)
        .from('execution_constraints')
        .update({
          environment_variables: {
            disabled: true,
            disabled_at: new Date().toISOString()
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) {
        throw new ExecutionConstraintError(`Failed to disable constraint: ${error.message}`, 'DATABASE_ERROR', id);
      }

      return true;
    } catch (error) {
      if (error instanceof ExecutionConstraintError) throw error;
      throw new ExecutionConstraintError(`Unexpected error disabling constraint: ${error}`, 'UNKNOWN_ERROR', id);
    }
  }

  /**
   * Delete a constraint (hard delete)
   */
  async delete(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('execution_constraints')
        .delete()
        .eq('id', id);

      if (error) {
        throw new ExecutionConstraintError(`Failed to delete constraint: ${error.message}`, 'DATABASE_ERROR', id);
      }

      return true;
    } catch (error) {
      if (error instanceof ExecutionConstraintError) throw error;
      throw new ExecutionConstraintError(`Unexpected error deleting constraint: ${error}`, 'UNKNOWN_ERROR', id);
    }
  }

  /**
   * Find constraints by type
   */
  async findByType(type: ConstraintType): Promise<any[]> {
    try {
      const constraints = await this.findActive();

      return constraints.filter(constraint => {
        switch (type) {
          case 'TIME_LIMIT':
            return constraint.time_limit_ms !== null;
          case 'MAX_TOKENS':
            return constraint.token_budget !== null;
          case 'MEMORY_LIMIT':
            return constraint.memory_limit_mb !== null;
          case 'CPU_LIMIT':
            return constraint.cpu_limit_percent !== null;
          default:
            return false;
        }
      });
    } catch (error) {
      if (error instanceof ExecutionConstraintError) throw error;
      throw new ExecutionConstraintError(`Unexpected error finding constraints by type: ${error}`, 'UNKNOWN_ERROR');
    }
  }

  /**
   * Validate constraint configuration
   */
  validateConstraint(constraint: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check that at least one constraint is specified
    const hasConstraints = !!(
      constraint.time_limit_ms ||
      constraint.token_budget ||
      constraint.memory_limit_mb ||
      constraint.cpu_limit_percent
    );

    if (!hasConstraints) {
      errors.push('At least one constraint limit must be specified');
    }

    // Validate positive values
    if (constraint.time_limit_ms !== null && constraint.time_limit_ms <= 0) {
      errors.push('Time limit must be positive');
    }

    if (constraint.token_budget !== null && constraint.token_budget <= 0) {
      errors.push('Token budget must be positive');
    }

    if (constraint.memory_limit_mb !== null && constraint.memory_limit_mb <= 0) {
      errors.push('Memory limit must be positive');
    }

    if (constraint.cpu_limit_percent !== null && (constraint.cpu_limit_percent <= 0 || constraint.cpu_limit_percent > 100)) {
      errors.push('CPU limit must be between 1 and 100 percent');
    }

    // Validate reasonable limits
    if (constraint.time_limit_ms && constraint.time_limit_ms > 3600000) {
      errors.push('Time limit cannot exceed 1 hour (3,600,000ms)');
    }

    if (constraint.memory_limit_mb && constraint.memory_limit_mb > 32768) {
      errors.push('Memory limit cannot exceed 32GB (32,768MB)');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Subscribe to real-time constraint changes
   */
  subscribeToChanges(callback: (payload: any) => void): string {
    const subscriptionId = `constraint_changes_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const channel = this.supabase
      .channel(subscriptionId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'execution_constraints',
        },
        (payload) => {
          callback({
            eventType: payload.eventType,
            new: payload.new ? this.transformFromDatabase(payload.new) : undefined,
            old: payload.old ? this.transformFromDatabase(payload.old) : undefined,
          });
        }
      )
      .subscribe();

    this.subscriptions.set(subscriptionId, channel);
    return subscriptionId;
  }

  /**
   * Unsubscribe from real-time changes
   */
  unsubscribe(subscriptionId: string): void {
    const channel = this.subscriptions.get(subscriptionId);
    if (channel) {
      this.supabase.removeChannel(channel);
      this.subscriptions.delete(subscriptionId);
    }
  }

  /**
   * Unsubscribe from all real-time changes
   */
  unsubscribeAll(): void {
    this.subscriptions.forEach((channel) => {
      this.supabase.removeChannel(channel);
    });
    this.subscriptions.clear();
  }

  /**
   * Transform database row to constraint object
   * This adapts the current database schema to the expected constraint format
   */
  private transformFromDatabase(row: any): any {
    const envVars = row.environment_variables || {};

    return {
      id: row.id,
      name: envVars.name || `Constraint ${row.id.substring(0, 8)}`,
      description: envVars.description || null,
      time_limit_ms: row.max_execution_time_ms,
      token_budget: envVars.token_budget || null,
      memory_limit_mb: row.max_memory_mb,
      cpu_limit_percent: row.max_cpu_percent,
      is_default: envVars.is_default || false,
      created_at: row.created_at,
      updated_at: row.updated_at,
      // Include raw data for debugging
      _raw: row
    };
  }
}