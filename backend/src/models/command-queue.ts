/**
 * CommandQueue Model for Onsembl.ai Agent Control Center
 *
 * Implementation of T077: CommandQueue model with comprehensive queue management
 *
 * Database Schema (actual command_queue table):
 * - id: uuid (primary key)
 * - command_id: uuid (foreign key to commands table)
 * - agent_id: uuid (foreign key to agents table, nullable)
 * - position: number
 * - priority: number (0-100, higher = more priority)
 * - estimated_duration_ms: number (nullable)
 * - created_at: timestamp
 *
 * Note: This implementation adapts to the actual database schema while providing
 * the required queue management functionality. Additional fields like status,
 * metadata, etc. are managed through the related command record.
 */

import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { Database } from '../types/database';
import { z } from 'zod';

// Queue status types (derived from command status)
export type QueueStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';

// CommandQueue schema validation matching actual database schema
export const CommandQueueSchema = z.object({
  id: z.string().uuid().optional(),
  command_id: z.string().uuid(),
  agent_id: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0),
  priority: z.number().int().min(0).max(100).default(50),
  estimated_duration_ms: z.number().int().positive().nullable().optional(),
  created_at: z.string().datetime().optional(),
});

export type CommandQueue = z.infer<typeof CommandQueueSchema>;

// Type mappings from database types
export type CommandQueueRow = Database['public']['Tables']['command_queue']['Row'];
export type CommandQueueInsert = Database['public']['Tables']['command_queue']['Insert'];
export type CommandQueueUpdate = Database['public']['Tables']['command_queue']['Update'];

// Extended interface for queue items with command details
export interface QueueItemWithCommand extends CommandQueueRow {
  command?: {
    id: string;
    status: string;
    command: string;
    arguments: any;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
  };
}

// Real-time subscription callback types
export type QueueChangeCallback = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: CommandQueueRow;
  old?: CommandQueueRow;
}) => void;

// Custom error types for better error handling
export class CommandQueueError extends Error {
  constructor(
    message: string,
    public code: string,
    public queueId?: string
  ) {
    super(message);
    this.name = 'CommandQueueError';
  }
}

export class CommandQueueNotFoundError extends CommandQueueError {
  constructor(id: string) {
    super(`Queue item with id ${id} not found`, 'QUEUE_ITEM_NOT_FOUND', id);
  }
}

export class CommandQueueValidationError extends CommandQueueError {
  constructor(message: string, public validationErrors?: z.ZodIssue[]) {
    super(message, 'QUEUE_VALIDATION_ERROR');
  }
}

export class CommandQueueOperationError extends CommandQueueError {
  constructor(operation: string, message: string) {
    super(`Failed to ${operation}: ${message}`, 'QUEUE_OPERATION_ERROR');
  }
}

export class CommandQueueModel {
  private subscriptions: Map<string, RealtimeChannel> = new Map();

  constructor(private supabase: ReturnType<typeof createClient<Database>>) {}

  /**
   * Enqueue a command with priority queue logic
   * @param commandId Command UUID to enqueue
   * @param agentId Agent UUID (optional, can be null for global queue)
   * @param priority Priority level (0-100, higher = more priority)
   * @param estimatedDurationMs Estimated execution time in milliseconds
   * @returns Created queue item
   */
  async enqueue(
    commandId: string,
    agentId?: string | null,
    priority: number = 50,
    estimatedDurationMs?: number
  ): Promise<CommandQueueRow> {
    try {
      // Validate input
      const validated = CommandQueueSchema.parse({
        command_id: commandId,
        agent_id: agentId,
        priority,
        estimated_duration_ms: estimatedDurationMs,
        position: 0, // Will be calculated
      });

      // Calculate position based on priority and current queue
      const position = await this.calculateQueuePosition(agentId, priority);

      const insertData: CommandQueueInsert = {
        command_id: validated.command_id,
        agent_id: validated.agent_id,
        position,
        priority: validated.priority,
        estimated_duration_ms: validated.estimated_duration_ms,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await (this.supabase as any)
        .from('command_queue')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new CommandQueueOperationError('enqueue command', error.message);
      }

      // Reorder queue to maintain proper positioning
      await this.reorderQueue(agentId);

      return data;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new CommandQueueValidationError(
          'Invalid queue item data',
          error.issues
        );
      }
      if (error instanceof CommandQueueError) throw error;
      throw new CommandQueueOperationError('enqueue command', (error as Error).message);
    }
  }

  /**
   * Dequeue the highest priority command
   * @param agentId Agent UUID (optional, null for global queue)
   * @returns Next command to execute or null if queue is empty
   */
  async dequeue(agentId?: string | null): Promise<CommandQueueRow | null> {
    try {
      let query = this.supabase
        .from('command_queue')
        .select('*');

      if (agentId !== undefined) {
        if (agentId === null) {
          query = query.is('agent_id', null);
        } else {
          query = query.eq('agent_id', agentId);
        }
      }

      // Get highest priority item (priority DESC, position ASC, created_at ASC)
      const { data, error } = await query
        .order('priority', { ascending: false })
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new CommandQueueOperationError('dequeue command', error.message);
      }

      if (!data) {
        return null; // No items in queue
      }

      // Remove from queue
      await this.remove((data as CommandQueueRow).id);

      return data;
    } catch (error) {
      if (error instanceof CommandQueueError) throw error;
      throw new CommandQueueOperationError('dequeue command', (error as Error).message);
    }
  }

  /**
   * Peek at the next command without removing it
   * @param agentId Agent UUID (optional, null for global queue)
   * @returns Next command to execute or null if queue is empty
   */
  async peek(agentId?: string | null): Promise<CommandQueueRow | null> {
    try {
      let query = this.supabase
        .from('command_queue')
        .select('*');

      if (agentId !== undefined) {
        if (agentId === null) {
          query = query.is('agent_id', null);
        } else {
          query = query.eq('agent_id', agentId);
        }
      }

      const { data, error } = await query
        .order('priority', { ascending: false })
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new CommandQueueOperationError('peek at queue', error.message);
      }

      return data;
    } catch (error) {
      if (error instanceof CommandQueueError) throw error;
      throw new CommandQueueOperationError('peek at queue', (error as Error).message);
    }
  }

  /**
   * Remove a specific item from the queue
   * @param queueId Queue item UUID
   * @returns True if removed successfully
   */
  async remove(queueId: string): Promise<boolean> {
    try {
      // Get the item to determine agent_id for reordering
      const item = await this.findById(queueId);

      const { error } = await this.supabase
        .from('command_queue')
        .delete()
        .eq('id', queueId);

      if (error) {
        throw new CommandQueueOperationError('remove queue item', error.message);
      }

      // Reorder queue after removal
      await this.reorderQueue(item.agent_id);

      return true;
    } catch (error) {
      if (error instanceof CommandQueueError) throw error;
      throw new CommandQueueOperationError('remove queue item', (error as Error).message);
    }
  }

  /**
   * Reorder queue items by priority and update positions
   * @param agentId Agent UUID (optional, null for global queue)
   * @returns Promise that resolves when reordering is complete
   */
  async reorder(agentId?: string | null): Promise<void> {
    return this.reorderQueue(agentId);
  }

  /**
   * Get the position of a specific command in the queue
   * @param commandId Command UUID
   * @returns Queue position (1-based) or null if not in queue
   */
  async getPosition(commandId: string): Promise<number | null> {
    try {
      const { data, error } = await this.supabase
        .from('command_queue')
        .select('position, agent_id, priority')
        .eq('command_id', commandId)
        .maybeSingle();

      if (error) {
        throw new CommandQueueOperationError('get command position', error.message);
      }

      if (!data) {
        return null; // Command not in queue
      }

      // Count how many items are ahead of this one
      const queueItem = data as CommandQueueRow;
      let query = this.supabase
        .from('command_queue')
        .select('id');

      if (queueItem.agent_id !== null) {
        query = query.eq('agent_id', queueItem.agent_id);
      } else {
        query = query.is('agent_id', null);
      }

      const { data: ahead, error: countError } = await query
        .or(`priority.gt.${queueItem.priority},and(priority.eq.${queueItem.priority},position.lt.${queueItem.position})`);

      if (countError) {
        throw new CommandQueueOperationError('get command position', countError.message);
      }

      return (ahead?.length || 0) + 1;
    } catch (error) {
      if (error instanceof CommandQueueError) throw error;
      throw new CommandQueueOperationError('get command position', (error as Error).message);
    }
  }

  /**
   * Find queue item by ID
   * @param id Queue item UUID
   * @returns Queue item or throws error if not found
   */
  async findById(id: string): Promise<CommandQueueRow> {
    try {
      const { data, error } = await this.supabase
        .from('command_queue')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new CommandQueueNotFoundError(id);
        }
        throw new CommandQueueOperationError('find queue item by ID', error.message);
      }

      return data;
    } catch (error) {
      if (error instanceof CommandQueueError) throw error;
      throw new CommandQueueOperationError('find queue item by ID', (error as Error).message);
    }
  }

  /**
   * Get all queue items with optional filtering
   * @param filters Optional filters for agent_id, limit
   * @returns Array of queue items ordered by priority and position
   */
  async findAll(filters?: {
    agent_id?: string | null;
    limit?: number;
  }): Promise<CommandQueueRow[]> {
    try {
      let query = this.supabase.from('command_queue').select('*');

      if (filters?.agent_id !== undefined) {
        if (filters.agent_id === null) {
          query = query.is('agent_id', null);
        } else {
          query = query.eq('agent_id', filters.agent_id);
        }
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query
        .order('priority', { ascending: false })
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        throw new CommandQueueOperationError('find all queue items', error.message);
      }

      return data || [];
    } catch (error) {
      if (error instanceof CommandQueueError) throw error;
      throw new CommandQueueOperationError('find all queue items', (error as Error).message);
    }
  }

  /**
   * Get queue items with command details
   * @param agentId Agent UUID (optional, null for global queue)
   * @returns Array of queue items with command information
   */
  async getQueueWithCommands(agentId?: string | null): Promise<QueueItemWithCommand[]> {
    try {
      let query = this.supabase
        .from('command_queue')
        .select(`
          *,
          command:commands (
            id,
            status,
            command,
            arguments,
            created_at,
            started_at,
            completed_at,
            error
          )
        `);

      if (agentId !== undefined) {
        if (agentId === null) {
          query = query.is('agent_id', null);
        } else {
          query = query.eq('agent_id', agentId);
        }
      }

      const { data, error } = await query
        .order('priority', { ascending: false })
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        throw new CommandQueueOperationError('get queue with commands', error.message);
      }

      return (data as QueueItemWithCommand[]) || [];
    } catch (error) {
      if (error instanceof CommandQueueError) throw error;
      throw new CommandQueueOperationError('get queue with commands', (error as Error).message);
    }
  }

  /**
   * Get queue statistics
   * @param agentId Agent UUID (optional, null for global queue)
   * @returns Queue statistics object
   */
  async getQueueStats(agentId?: string | null): Promise<{
    total: number;
    avgPriority: number;
    estimatedTotalDuration: number;
    oldestItem: string | null;
  }> {
    try {
      let query = this.supabase.from('command_queue').select('*');

      if (agentId !== undefined) {
        if (agentId === null) {
          query = query.is('agent_id', null);
        } else {
          query = query.eq('agent_id', agentId);
        }
      }

      const { data, error } = await query;

      if (error) {
        throw new CommandQueueOperationError('get queue statistics', error.message);
      }

      const items = (data as CommandQueueRow[]) || [];
      const total = items.length;
      const avgPriority = total > 0 ? items.reduce((sum, item) => sum + item.priority, 0) / total : 0;
      const estimatedTotalDuration = items.reduce((sum, item) => sum + (item.estimated_duration_ms || 0), 0);
      const oldestItem = items.length > 0 ?
        items.reduce((oldest, item) =>
          new Date(item.created_at) < new Date(oldest.created_at) ? item : oldest
        ).created_at : null;

      return {
        total,
        avgPriority: Math.round(avgPriority * 100) / 100,
        estimatedTotalDuration,
        oldestItem,
      };
    } catch (error) {
      if (error instanceof CommandQueueError) throw error;
      throw new CommandQueueOperationError('get queue statistics', (error as Error).message);
    }
  }

  /**
   * Move a queue item to a new position
   * @param queueId Queue item UUID
   * @param newPriority New priority value
   * @returns Updated queue item
   */
  async updatePriority(queueId: string, newPriority: number): Promise<CommandQueueRow> {
    try {
      if (newPriority < 0 || newPriority > 100) {
        throw new CommandQueueValidationError('Priority must be between 0 and 100');
      }

      const item = await this.findById(queueId);

      const { data, error } = await (this.supabase as any)
        .from('command_queue')
        .update({ priority: newPriority })
        .eq('id', queueId)
        .select()
        .single();

      if (error) {
        throw new CommandQueueOperationError('update priority', error.message);
      }

      // Reorder queue after priority change
      await this.reorderQueue(item.agent_id);

      return data;
    } catch (error) {
      if (error instanceof CommandQueueError) throw error;
      throw new CommandQueueOperationError('update priority', (error as Error).message);
    }
  }

  /**
   * Subscribe to real-time queue changes
   * @param callback Callback function for queue changes
   * @param agentId Optional agent ID to filter changes
   * @returns Subscription ID for unsubscribing
   */
  subscribeToQueueChanges(callback: QueueChangeCallback, agentId?: string): string {
    const subscriptionId = `command_queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    let channel = this.supabase
      .channel(subscriptionId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'command_queue',
          ...(agentId && { filter: `agent_id=eq.${agentId}` })
        },
        (payload) => {
          callback({
            eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            new: payload.new as CommandQueueRow | undefined,
            old: payload.old as CommandQueueRow | undefined
          });
        }
      )
      .subscribe();

    this.subscriptions.set(subscriptionId, channel);
    return subscriptionId;
  }

  /**
   * Unsubscribe from real-time changes
   * @param subscriptionId Subscription ID returned from subscribe method
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
   * Clear all items from a queue
   * @param agentId Agent UUID (optional, null for global queue)
   * @returns Number of items removed
   */
  async clearQueue(agentId?: string | null): Promise<number> {
    try {
      const items = await this.findAll({ agent_id: agentId });
      const count = items.length;

      if (count > 0) {
        let deleteQuery = this.supabase.from('command_queue').delete();

        if (agentId !== undefined) {
          if (agentId === null) {
            deleteQuery = deleteQuery.is('agent_id', null);
          } else {
            deleteQuery = deleteQuery.eq('agent_id', agentId);
          }
        }

        const { error } = await deleteQuery;

        if (error) {
          throw new CommandQueueOperationError('clear queue', error.message);
        }
      }

      return count;
    } catch (error) {
      if (error instanceof CommandQueueError) throw error;
      throw new CommandQueueOperationError('clear queue', (error as Error).message);
    }
  }

  // Private helper methods

  /**
   * Calculate the appropriate queue position based on priority
   * @param agentId Agent UUID (optional, null for global queue)
   * @param priority Priority level
   * @returns Calculated position
   */
  private async calculateQueuePosition(agentId: string | null | undefined, priority: number): Promise<number> {
    try {
      let query = this.supabase
        .from('command_queue')
        .select('position');

      if (agentId !== undefined) {
        if (agentId === null) {
          query = query.is('agent_id', null);
        } else {
          query = query.eq('agent_id', agentId);
        }
      }

      const { data, error } = await query
        .gte('priority', priority)
        .order('priority', { ascending: false })
        .order('position', { ascending: true });

      if (error) {
        throw new CommandQueueOperationError('calculate queue position', error.message);
      }

      // Find the first gap in positions or append at the end
      const positions = ((data as CommandQueueRow[]) || []).map(item => item.position).sort((a, b) => a - b);

      for (let i = 1; i <= positions.length + 1; i++) {
        if (!positions.includes(i)) {
          return i;
        }
      }

      return positions.length + 1;
    } catch (error) {
      throw new CommandQueueOperationError('calculate queue position', (error as Error).message);
    }
  }

  /**
   * Reorder queue items to maintain proper priority-based positioning
   * @param agentId Agent UUID (optional, null for global queue)
   */
  private async reorderQueue(agentId: string | null | undefined): Promise<void> {
    try {
      const items = await this.findAll({ agent_id: agentId });

      // Sort by priority (desc), then by created_at (asc)
      const sortedItems = items.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority; // Higher priority first
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); // Older first for same priority
      });

      // Update positions
      for (let i = 0; i < sortedItems.length; i++) {
        const newPosition = i + 1;
        if (sortedItems[i].position !== newPosition) {
          await (this.supabase as any)
            .from('command_queue')
            .update({ position: newPosition })
            .eq('id', sortedItems[i].id);
        }
      }
    } catch (error) {
      throw new CommandQueueOperationError('reorder queue', (error as Error).message);
    }
  }
}