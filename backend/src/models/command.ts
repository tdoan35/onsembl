/**
 * Command Model for Onsembl.ai Agent Control Center
 *
 * Implementation of T070: Command model with comprehensive CRUD operations
 *
 * Database Schema Requirements:
 * - id: uuid (primary key)
 * - agent_id: uuid (foreign key to agents table)
 * - type: NATURAL | INVESTIGATE | REVIEW | PLAN | SYNTHESIZE
 * - prompt: text
 * - status: QUEUED | RUNNING | COMPLETED | CANCELLED | FAILED
 * - priority: number (0-100)
 * - queue_position: number
 * - started_at: timestamp
 * - completed_at: timestamp
 * - error: text
 * - metadata: json
 * - created_at: timestamp
 * - updated_at: timestamp
 *
 * Note: This model implements the T070 specification schema. The current database
 * schema in Database types may need to be updated to match these requirements.
 */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Command types as per T070 requirements
export type CommandType = 'NATURAL' | 'INVESTIGATE' | 'REVIEW' | 'PLAN' | 'SYNTHESIZE';
export type CommandStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';

// Command schema validation
export const CommandSchema = z.object({
  id: z.string().uuid().optional(),
  agent_id: z.string().uuid(),
  type: z.enum(['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE']),
  prompt: z.string().min(1),
  status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED']),
  priority: z.number().int().min(0).max(100).default(50),
  queue_position: z.number().int().min(0).optional(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  error: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type Command = z.infer<typeof CommandSchema>;

// Command interfaces for database operations
export interface CommandRow {
  id: string;
  agent_id: string;
  type: CommandType;
  prompt: string;
  status: CommandStatus;
  priority: number;
  queue_position: number | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface CommandInsert {
  id?: string;
  agent_id: string;
  type: CommandType;
  prompt: string;
  status?: CommandStatus;
  priority?: number;
  queue_position?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: string;
  updated_at?: string;
}

export interface CommandUpdate {
  id?: string;
  agent_id?: string;
  type?: CommandType;
  prompt?: string;
  status?: CommandStatus;
  priority?: number;
  queue_position?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: string;
  updated_at?: string;
}

// Custom error types for better error handling
export class CommandNotFoundError extends Error {
  constructor(id: string) {
    super(`Command with id ${id} not found`);
    this.name = 'CommandNotFoundError';
  }
}

export class CommandValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandValidationError';
  }
}

export class CommandOperationError extends Error {
  constructor(operation: string, message: string) {
    super(`Failed to ${operation}: ${message}`);
    this.name = 'CommandOperationError';
  }
}

export class CommandModel {
  constructor(private supabase: ReturnType<typeof createClient>) {}

  /**
   * Creates a new command in the database
   * @param command Command data to insert
   * @returns Created command with generated ID and timestamps
   */
  async create(command: CommandInsert): Promise<CommandRow> {
    try {
      // Validate input using Zod schema
      const validated = CommandSchema.parse({
        ...command,
        status: command.status || 'QUEUED',
        priority: command.priority ?? 50,
      });

      // Calculate queue position if not provided
      let queuePosition = command.queue_position;
      if (queuePosition === undefined || queuePosition === null) {
        queuePosition = await this.getNextQueuePosition(command.agent_id);
      }

      const now = new Date().toISOString();
      const insertData: CommandInsert = {
        agent_id: validated.agent_id,
        type: validated.type,
        prompt: validated.prompt,
        status: validated.status || 'QUEUED',
        priority: validated.priority ?? 50,
        queue_position: queuePosition,
        created_at: now,
        updated_at: now,
        ...(validated.metadata && { metadata: validated.metadata }),
      };

      const { data, error } = await (this.supabase as any)
        .from('commands')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new CommandOperationError('create command', error.message);
      }

      return data as CommandRow;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new CommandValidationError(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }

  /**
   * Finds a command by ID
   * @param id Command UUID
   * @returns Command data or throws CommandNotFoundError
   */
  async findById(id: string): Promise<CommandRow> {
    try {
      const { data, error } = await this.supabase
        .from('commands')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new CommandNotFoundError(id);
        }
        throw new CommandOperationError('find command by ID', error.message);
      }

      return data as CommandRow;
    } catch (error) {
      if (error instanceof CommandNotFoundError) {
        throw error;
      }
      throw new CommandOperationError('find command by ID', (error as Error).message);
    }
  }

  /**
   * Finds all commands with optional filtering
   * @param filters Optional filters for agent_id, status, type, limit, offset
   * @returns Array of commands
   */
  async findAll(filters?: {
    agent_id?: string;
    status?: CommandStatus;
    type?: CommandType;
    limit?: number;
    offset?: number;
  }): Promise<CommandRow[]> {
    try {
      let query = this.supabase.from('commands').select('*');

      if (filters?.agent_id) {
        query = query.eq('agent_id', filters.agent_id);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.type) {
        query = query.eq('type', filters.type);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      if (filters?.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error } = await query
        .order('queue_position', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        throw new CommandOperationError('find all commands', error.message);
      }

      return (data as CommandRow[]) || [];
    } catch (error) {
      throw new CommandOperationError('find all commands', (error as Error).message);
    }
  }

  /**
   * Updates a command
   * @param id Command UUID
   * @param updates Partial command data to update
   * @returns Updated command data
   */
  async update(id: string, updates: CommandUpdate): Promise<CommandRow> {
    try {
      // Ensure updated_at is set
      const updateData = {
        ...updates,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await (this.supabase as any)
        .from('commands')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new CommandNotFoundError(id);
        }
        throw new CommandOperationError('update command', error.message);
      }

      return data as CommandRow;
    } catch (error) {
      if (error instanceof CommandNotFoundError) {
        throw error;
      }
      throw new CommandOperationError('update command', (error as Error).message);
    }
  }

  /**
   * Cancels a command by setting its status to CANCELLED
   * @param id Command UUID
   * @returns Updated command data
   */
  async cancel(id: string): Promise<CommandRow> {
    try {
      const updates: CommandUpdate = {
        status: 'CANCELLED',
        completed_at: new Date().toISOString(),
      };

      return await this.update(id, updates);
    } catch (error) {
      throw new CommandOperationError('cancel command', (error as Error).message);
    }
  }

  /**
   * Marks a command as completed
   * @param id Command UUID
   * @param metadata Optional metadata to store with completion
   * @returns Updated command data
   */
  async complete(id: string, metadata?: Record<string, any>): Promise<CommandRow> {
    try {
      const updates: CommandUpdate = {
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        metadata: metadata || undefined,
      };

      return await this.update(id, updates);
    } catch (error) {
      throw new CommandOperationError('complete command', (error as Error).message);
    }
  }

  /**
   * Marks a command as failed with error details
   * @param id Command UUID
   * @param error Error message
   * @param metadata Optional metadata to store with failure
   * @returns Updated command data
   */
  async fail(id: string, error: string, metadata?: Record<string, any>): Promise<CommandRow> {
    try {
      const updates: CommandUpdate = {
        status: 'FAILED',
        completed_at: new Date().toISOString(),
        error,
        metadata: metadata || undefined,
      };

      return await this.update(id, updates);
    } catch (error) {
      throw new CommandOperationError('fail command', (error as Error).message);
    }
  }

  /**
   * Starts a command by setting status to RUNNING and recording start time
   * @param id Command UUID
   * @returns Updated command data
   */
  async start(id: string): Promise<CommandRow> {
    try {
      const updates: CommandUpdate = {
        status: 'RUNNING',
        started_at: new Date().toISOString(),
      };

      return await this.update(id, updates);
    } catch (error) {
      throw new CommandOperationError('start command', (error as Error).message);
    }
  }

  /**
   * Gets queued commands for an agent ordered by priority and queue position
   * @param agentId Agent UUID
   * @returns Array of queued commands
   */
  async getQueuedCommands(agentId: string): Promise<CommandRow[]> {
    try {
      const { data, error } = await this.supabase
        .from('commands')
        .select('*')
        .eq('agent_id', agentId)
        .eq('status', 'QUEUED')
        .order('priority', { ascending: false })
        .order('queue_position', { ascending: true });

      if (error) {
        throw new CommandOperationError('get queued commands', error.message);
      }

      return (data as CommandRow[]) || [];
    } catch (error) {
      throw new CommandOperationError('get queued commands', (error as Error).message);
    }
  }

  /**
   * Gets running commands for an agent
   * @param agentId Agent UUID
   * @returns Array of running commands
   */
  async getRunningCommands(agentId: string): Promise<CommandRow[]> {
    try {
      const { data, error } = await this.supabase
        .from('commands')
        .select('*')
        .eq('agent_id', agentId)
        .eq('status', 'RUNNING')
        .order('started_at', { ascending: true });

      if (error) {
        throw new CommandOperationError('get running commands', error.message);
      }

      return (data as CommandRow[]) || [];
    } catch (error) {
      throw new CommandOperationError('get running commands', (error as Error).message);
    }
  }

  /**
   * Updates queue positions for commands
   * @param agentId Agent UUID
   * @returns Promise that resolves when queue positions are updated
   */
  async updateQueuePositions(agentId: string): Promise<void> {
    try {
      const queuedCommands = await this.getQueuedCommands(agentId);

      // Update queue positions based on current order
      for (let i = 0; i < queuedCommands.length; i++) {
        await this.update(queuedCommands[i].id, { queue_position: i + 1 });
      }
    } catch (error) {
      throw new CommandOperationError('update queue positions', (error as Error).message);
    }
  }

  /**
   * Gets the next available queue position for an agent
   * @param agentId Agent UUID
   * @returns Next queue position number
   */
  async getNextQueuePosition(agentId: string): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('commands')
        .select('queue_position')
        .eq('agent_id', agentId)
        .eq('status', 'QUEUED')
        .order('queue_position', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new CommandOperationError('get next queue position', error.message);
      }

      return data ? ((data as any).queue_position || 0) + 1 : 1;
    } catch (error) {
      throw new CommandOperationError('get next queue position', (error as Error).message);
    }
  }

  /**
   * Gets command statistics for an agent or all agents
   * @param agentId Optional agent UUID to filter by
   * @returns Command statistics object
   */
  async getCommandStats(agentId?: string): Promise<{
    total: number;
    queued: number;
    running: number;
    completed: number;
    cancelled: number;
    failed: number;
  }> {
    try {
      let query = this.supabase.from('commands').select('status');

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data, error } = await query;

      if (error) {
        throw new CommandOperationError('get command stats', error.message);
      }

      const stats = {
        total: 0,
        queued: 0,
        running: 0,
        completed: 0,
        cancelled: 0,
        failed: 0,
      };

      data?.forEach((row: any) => {
        const status = row.status as CommandStatus;
        if (status in stats) {
          stats[status.toLowerCase() as keyof typeof stats]++;
        }
        stats.total++;
      });

      return stats;
    } catch (error) {
      throw new CommandOperationError('get command stats', (error as Error).message);
    }
  }
}