/**
 * CommandPreset Model for Onsembl.ai Agent Control Center
 *
 * Implementation of T072: CommandPreset model with comprehensive CRUD operations
 *
 * Database Schema Requirements (per T072 specification):
 * - id: uuid (primary key)
 * - name: string
 * - description: text
 * - category: string
 * - type: NATURAL | INVESTIGATE | REVIEW | PLAN | SYNTHESIZE
 * - prompt_template: text (supports {{variables}})
 * - variables: json array of variable definitions
 * - priority: number (0-100)
 * - is_public: boolean
 * - usage_count: number
 * - created_by: uuid
 * - created_at: timestamp
 * - updated_at: timestamp
 *
 * Note: The current database schema in Database types may need to be updated
 * to match these requirements. This model implements the T072 specification.
 */

import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { Database } from '../types/database';
import { z } from 'zod';

// CommandPreset types as per T072 requirements
export type CommandPresetType = 'NATURAL' | 'INVESTIGATE' | 'REVIEW' | 'PLAN' | 'SYNTHESIZE';

// Variable definition schema for template variables
export const VariableDefinitionSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'select']),
  description: z.string().optional(),
  required: z.boolean().default(true),
  default_value: z.any().optional(),
  options: z.array(z.string()).optional(), // For select type
  validation: z.object({
    min_length: z.number().optional(),
    max_length: z.number().optional(),
    pattern: z.string().optional(),
    min_value: z.number().optional(),
    max_value: z.number().optional(),
  }).optional(),
});

export type VariableDefinition = z.infer<typeof VariableDefinitionSchema>;

// CommandPreset schema validation
export const CommandPresetSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  category: z.string().min(1).max(50),
  type: z.enum(['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE']),
  prompt_template: z.string().min(1),
  variables: z.array(VariableDefinitionSchema).default([]),
  priority: z.number().int().min(0).max(100).default(50),
  is_public: z.boolean().default(false),
  usage_count: z.number().int().min(0).default(0),
  created_by: z.string().uuid(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type CommandPreset = z.infer<typeof CommandPresetSchema>;

// Database row interfaces (based on T072 specification)
export interface CommandPresetRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  type: CommandPresetType;
  prompt_template: string;
  variables: VariableDefinition[] | null;
  priority: number;
  is_public: boolean;
  usage_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CommandPresetInsert {
  id?: string;
  name: string;
  description?: string | null;
  category: string;
  type: CommandPresetType;
  prompt_template: string;
  variables?: VariableDefinition[] | null;
  priority?: number;
  is_public?: boolean;
  usage_count?: number;
  created_by: string;
  created_at?: string;
  updated_at?: string;
}

export interface CommandPresetUpdate {
  id?: string;
  name?: string;
  description?: string | null;
  category?: string;
  type?: CommandPresetType;
  prompt_template?: string;
  variables?: VariableDefinition[] | null;
  priority?: number;
  is_public?: boolean;
  usage_count?: number;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

// Template execution context for variable substitution
export interface TemplateExecutionContext {
  variables: Record<string, any>;
  agent_id?: string;
  user_id?: string;
  metadata?: Record<string, any>;
}

// Real-time subscription callback types
export type CommandPresetChangeCallback = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: CommandPresetRow;
  old?: CommandPresetRow;
}) => void;

// Custom error types for better error handling
export class CommandPresetError extends Error {
  constructor(
    message: string,
    public code: string,
    public presetId?: string
  ) {
    super(message);
    this.name = 'CommandPresetError';
  }
}

export class CommandPresetNotFoundError extends CommandPresetError {
  constructor(id: string) {
    super(`CommandPreset with id ${id} not found`, 'PRESET_NOT_FOUND', id);
  }
}

export class CommandPresetValidationError extends CommandPresetError {
  constructor(message: string, public validationErrors?: z.ZodIssue[]) {
    super(message, 'PRESET_VALIDATION_ERROR');
  }
}

export class TemplateExecutionError extends CommandPresetError {
  constructor(message: string, presetId?: string) {
    super(message, 'TEMPLATE_EXECUTION_ERROR', presetId);
  }
}

export class CommandPresetModel {
  private subscriptions: Map<string, RealtimeChannel> = new Map();

  constructor(private supabase: ReturnType<typeof createClient<Database>>) {}

  /**
   * Find all command presets with optional filtering
   */
  async findAll(filters?: {
    category?: string | string[];
    type?: CommandPresetType | CommandPresetType[];
    is_public?: boolean;
    created_by?: string;
    search?: string; // Search in name and description
    limit?: number;
    offset?: number;
  }): Promise<CommandPresetRow[]> {
    try {
      let query = this.supabase.from('command_presets').select('*');

      if (filters?.category) {
        if (Array.isArray(filters.category)) {
          query = query.in('category', filters.category);
        } else {
          query = query.eq('category', filters.category);
        }
      }

      if (filters?.type) {
        if (Array.isArray(filters.type)) {
          query = query.in('type', filters.type);
        } else {
          query = query.eq('type', filters.type);
        }
      }

      if (filters?.is_public !== undefined) {
        query = query.eq('is_public', filters.is_public);
      }

      if (filters?.created_by) {
        query = query.eq('created_by', filters.created_by);
      }

      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      if (filters?.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error } = await query
        .order('usage_count', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        throw new CommandPresetError(`Failed to find presets: ${error.message}`, 'DATABASE_ERROR');
      }

      return data as CommandPresetRow[];
    } catch (error) {
      if (error instanceof CommandPresetError) throw error;
      throw new CommandPresetError(`Unexpected error finding presets: ${error}`, 'UNKNOWN_ERROR');
    }
  }

  /**
   * Find preset by ID
   */
  async findById(id: string): Promise<CommandPresetRow> {
    try {
      const { data, error } = await this.supabase
        .from('command_presets')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new CommandPresetNotFoundError(id);
        }
        throw new CommandPresetError(`Failed to find preset: ${error.message}`, 'DATABASE_ERROR', id);
      }

      return data as CommandPresetRow;
    } catch (error) {
      if (error instanceof CommandPresetError) throw error;
      throw new CommandPresetError(`Unexpected error finding preset: ${error}`, 'UNKNOWN_ERROR', id);
    }
  }

  /**
   * Create a new command preset
   */
  async create(preset: CommandPresetInsert): Promise<CommandPresetRow> {
    try {
      // Validate input using Zod schema
      const validated = CommandPresetSchema.parse(preset);

      const now = new Date().toISOString();
      const insertData: CommandPresetInsert = {
        name: validated.name,
        description: validated.description || null,
        category: validated.category,
        type: validated.type,
        prompt_template: validated.prompt_template,
        variables: validated.variables.length > 0 ? validated.variables : null,
        priority: validated.priority ?? 50,
        is_public: validated.is_public ?? false,
        usage_count: 0,
        created_by: validated.created_by,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await (this.supabase as any)
        .from('command_presets')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new CommandPresetError(`Failed to create preset: ${error.message}`, 'DATABASE_ERROR');
      }

      return data as CommandPresetRow;
    } catch (error) {
      if (error instanceof CommandPresetError) throw error;
      if (error instanceof z.ZodError) {
        throw new CommandPresetValidationError('Invalid preset data', error.issues);
      }
      throw new CommandPresetError(`Unexpected error creating preset: ${error}`, 'UNKNOWN_ERROR');
    }
  }

  /**
   * Update an existing preset
   */
  async update(id: string, updates: CommandPresetUpdate): Promise<CommandPresetRow> {
    try {
      // Validate partial update data
      const validationResult = CommandPresetSchema.partial().safeParse(updates);
      if (!validationResult.success) {
        throw new CommandPresetValidationError(
          'Invalid preset update data',
          validationResult.error.issues
        );
      }

      const updateData = {
        ...updates,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await (this.supabase as any)
        .from('command_presets')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new CommandPresetNotFoundError(id);
        }
        throw new CommandPresetError(`Failed to update preset: ${error.message}`, 'DATABASE_ERROR', id);
      }

      return data as CommandPresetRow;
    } catch (error) {
      if (error instanceof CommandPresetError) throw error;
      throw new CommandPresetError(`Unexpected error updating preset: ${error}`, 'UNKNOWN_ERROR', id);
    }
  }

  /**
   * Delete a preset
   */
  async delete(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('command_presets')
        .delete()
        .eq('id', id);

      if (error) {
        throw new CommandPresetError(`Failed to delete preset: ${error.message}`, 'DATABASE_ERROR', id);
      }

      return true;
    } catch (error) {
      if (error instanceof CommandPresetError) throw error;
      throw new CommandPresetError(`Unexpected error deleting preset: ${error}`, 'UNKNOWN_ERROR', id);
    }
  }

  /**
   * Execute a preset by rendering the template with provided variables
   */
  async execute(
    id: string,
    context: TemplateExecutionContext
  ): Promise<{
    preset: CommandPresetRow;
    rendered_prompt: string;
    execution_metadata: Record<string, any>;
  }> {
    try {
      const preset = await this.findById(id);

      // Validate required variables
      const missingVariables: string[] = [];
      const providedVariables = context.variables || {};

      if (preset.variables) {
        for (const variable of preset.variables) {
          if (variable.required && !(variable.name in providedVariables)) {
            missingVariables.push(variable.name);
          }
        }
      }

      if (missingVariables.length > 0) {
        throw new TemplateExecutionError(
          `Missing required variables: ${missingVariables.join(', ')}`,
          id
        );
      }

      // Render template with variable substitution
      const rendered_prompt = this.renderTemplate(preset.prompt_template, providedVariables);

      // Increment usage count
      await this.incrementUsageCount(id);

      return {
        preset,
        rendered_prompt,
        execution_metadata: {
          executed_at: new Date().toISOString(),
          variables_used: Object.keys(providedVariables),
          agent_id: context.agent_id,
          user_id: context.user_id,
          additional_metadata: context.metadata,
        },
      };
    } catch (error) {
      if (error instanceof CommandPresetError) throw error;
      throw new TemplateExecutionError(`Failed to execute preset: ${error}`, id);
    }
  }

  /**
   * Get presets by category
   */
  async findByCategory(category: string): Promise<CommandPresetRow[]> {
    return this.findAll({ category });
  }

  /**
   * Get public presets
   */
  async getPublicPresets(): Promise<CommandPresetRow[]> {
    return this.findAll({ is_public: true });
  }

  /**
   * Get presets created by a specific user
   */
  async findByCreator(userId: string): Promise<CommandPresetRow[]> {
    return this.findAll({ created_by: userId });
  }

  /**
   * Get popular presets (by usage count)
   */
  async getPopularPresets(limit: number = 10): Promise<CommandPresetRow[]> {
    try {
      const { data, error } = await this.supabase
        .from('command_presets')
        .select('*')
        .eq('is_public', true)
        .order('usage_count', { ascending: false })
        .limit(limit);

      if (error) {
        throw new CommandPresetError(`Failed to get popular presets: ${error.message}`, 'DATABASE_ERROR');
      }

      return data as CommandPresetRow[];
    } catch (error) {
      if (error instanceof CommandPresetError) throw error;
      throw new CommandPresetError(`Unexpected error getting popular presets: ${error}`, 'UNKNOWN_ERROR');
    }
  }

  /**
   * Get all available categories
   */
  async getCategories(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('command_presets')
        .select('category')
        .not('category', 'is', null);

      if (error) {
        throw new CommandPresetError(`Failed to get categories: ${error.message}`, 'DATABASE_ERROR');
      }

      // Extract unique categories
      const categorySet = new Set<string>();
      data?.forEach((row: any) => {
        if (row.category) {
          categorySet.add(row.category);
        }
      });
      return Array.from(categorySet).sort();
    } catch (error) {
      if (error instanceof CommandPresetError) throw error;
      throw new CommandPresetError(`Unexpected error getting categories: ${error}`, 'UNKNOWN_ERROR');
    }
  }

  /**
   * Search presets by text (name and description)
   */
  async search(
    query: string,
    filters?: {
      category?: string;
      type?: CommandPresetType;
      is_public?: boolean;
      created_by?: string;
    }
  ): Promise<CommandPresetRow[]> {
    return this.findAll({
      ...filters,
      search: query,
    });
  }

  /**
   * Subscribe to real-time preset changes
   */
  subscribeToChanges(callback: CommandPresetChangeCallback, presetId?: string): string {
    const subscriptionId = `preset_changes_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    let channel = this.supabase
      .channel(subscriptionId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'command_presets',
          ...(presetId && { filter: `id=eq.${presetId}` })
        },
        (payload) => {
          callback({
            eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            new: payload.new as CommandPresetRow | undefined,
            old: payload.old as CommandPresetRow | undefined
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
   * Private helper method to render template with variable substitution
   */
  private renderTemplate(template: string, variables: Record<string, any>): string {
    let rendered = template;

    // Replace {{variable}} patterns
    const variablePattern = /\{\{(\w+)\}\}/g;
    rendered = rendered.replace(variablePattern, (match, variableName) => {
      if (variableName in variables) {
        return String(variables[variableName]);
      }
      return match; // Keep original if variable not found
    });

    return rendered;
  }

  /**
   * Private helper method to increment usage count
   */
  private async incrementUsageCount(id: string): Promise<void> {
    try {
      // Use manual increment for now since RPC may not exist
      const preset = await this.findById(id);
      await this.update(id, { usage_count: preset.usage_count + 1 });
    } catch (error) {
      // Log but don't fail - usage count is not critical
      console.warn(`Failed to increment usage count for preset ${id}:`, error);
    }
  }

  /**
   * Validate template variables against schema
   */
  validateTemplate(preset: CommandPresetRow, variables: Record<string, any>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!preset.variables) {
      return { valid: true, errors: [] };
    }

    for (const variable of preset.variables) {
      const value = variables[variable.name];

      // Check required variables
      if (variable.required && (value === undefined || value === null || value === '')) {
        errors.push(`Variable '${variable.name}' is required`);
        continue;
      }

      // Skip validation if variable is not provided and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      switch (variable.type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`Variable '${variable.name}' must be a string`);
          } else if (variable.validation) {
            const val = variable.validation;
            if (val.min_length && value.length < val.min_length) {
              errors.push(`Variable '${variable.name}' must be at least ${val.min_length} characters`);
            }
            if (val.max_length && value.length > val.max_length) {
              errors.push(`Variable '${variable.name}' must be at most ${val.max_length} characters`);
            }
            if (val.pattern && !new RegExp(val.pattern).test(value)) {
              errors.push(`Variable '${variable.name}' does not match required pattern`);
            }
          }
          break;
        case 'number':
          if (typeof value !== 'number' && !Number.isFinite(Number(value))) {
            errors.push(`Variable '${variable.name}' must be a number`);
          } else {
            const numValue = typeof value === 'number' ? value : Number(value);
            if (variable.validation) {
              const val = variable.validation;
              if (val.min_value !== undefined && numValue < val.min_value) {
                errors.push(`Variable '${variable.name}' must be at least ${val.min_value}`);
              }
              if (val.max_value !== undefined && numValue > val.max_value) {
                errors.push(`Variable '${variable.name}' must be at most ${val.max_value}`);
              }
            }
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
            errors.push(`Variable '${variable.name}' must be a boolean`);
          }
          break;
        case 'select':
          if (variable.options && !variable.options.includes(String(value))) {
            errors.push(`Variable '${variable.name}' must be one of: ${variable.options.join(', ')}`);
          }
          break;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get preset statistics
   */
  async getStats(): Promise<{
    total: number;
    by_category: Record<string, number>;
    by_type: Record<CommandPresetType, number>;
    public_count: number;
    total_usage: number;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('command_presets')
        .select('category, type, is_public, usage_count');

      if (error) {
        throw new CommandPresetError(`Failed to get preset stats: ${error.message}`, 'DATABASE_ERROR');
      }

      const stats = {
        total: data?.length || 0,
        by_category: {} as Record<string, number>,
        by_type: {} as Record<CommandPresetType, number>,
        public_count: 0,
        total_usage: 0,
      };

      data?.forEach((row: any) => {
        // Count by category
        if (row.category) {
          stats.by_category[row.category] = (stats.by_category[row.category] || 0) + 1;
        }

        // Count by type
        if (row.type) {
          stats.by_type[row.type as CommandPresetType] = (stats.by_type[row.type as CommandPresetType] || 0) + 1;
        }

        // Count public presets
        if (row.is_public) {
          stats.public_count++;
        }

        // Sum usage count
        stats.total_usage += row.usage_count || 0;
      });

      return stats;
    } catch (error) {
      if (error instanceof CommandPresetError) throw error;
      throw new CommandPresetError(`Unexpected error getting preset stats: ${error}`, 'UNKNOWN_ERROR');
    }
  }
}