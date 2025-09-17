/**
 * TerminalOutput Model for Onsembl.ai Agent Control Center
 *
 * Implementation of T071: TerminalOutput model with comprehensive terminal output management
 *
 * Database Schema (from migration 003_terminal_outputs.sql):
 * - id: uuid (primary key)
 * - command_id: uuid (foreign key to commands table)
 * - agent_id: uuid (foreign key to agents table)
 * - type: 'stdout' | 'stderr' | 'system'
 * - content: text (max 100KB per entry)
 * - timestamp: timestamptz (when output was generated)
 * - created_at: timestamptz (when record was created)
 *
 * Features:
 * - ANSI color code support in metadata
 * - Chunking for large outputs (100KB per chunk)
 * - Real-time streaming support
 * - Efficient querying with proper indexing
 * - Batch operations for performance
 */

import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { Database } from '../types/database';
import { z } from 'zod';

// Terminal output types as per database schema
export type TerminalOutputType = 'stdout' | 'stderr' | 'system';

// Enhanced schema validation with ANSI color code support
export const TerminalOutputSchema = z.object({
  id: z.string().uuid().optional(),
  command_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  type: z.enum(['stdout', 'stderr', 'system']),
  content: z.string().max(100000), // 100KB limit as per database constraint
  sequence: z.number().int().min(0).optional(), // For ordering, derived from timestamp
  timestamp: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(), // For ANSI codes, formatting, chunking info
  created_at: z.string().datetime().optional(),
});

export type TerminalOutput = z.infer<typeof TerminalOutputSchema>;

// Database type mappings - using the actual database schema structure
export interface TerminalOutputRow {
  id: string;
  command_id: string;
  agent_id: string;
  output: string;
  type: 'stdout' | 'stderr' | 'system';
  timestamp: string;
  created_at: string;
}

export interface TerminalOutputInsert {
  id?: string;
  command_id: string;
  agent_id: string;
  output: string;
  type: 'stdout' | 'stderr' | 'system';
  timestamp: string;
  created_at?: string;
}

export interface TerminalOutputUpdate {
  id?: string;
  command_id?: string;
  agent_id?: string;
  output?: string;
  type?: 'stdout' | 'stderr' | 'system';
  timestamp?: string;
  created_at?: string;
}

// Enhanced interfaces for ANSI color code and chunking support
export interface TerminalOutputMetadata {
  // ANSI color codes and formatting
  ansi_codes?: {
    foreground_color?: string;
    background_color?: string;
    text_style?: ('bold' | 'italic' | 'underline' | 'strikethrough')[];
    reset_codes?: string[];
  };
  // Chunking information for large outputs
  chunking?: {
    chunk_index: number;
    total_chunks: number;
    original_size: number;
    is_continuation: boolean;
  };
  // Performance metrics
  processing?: {
    parsed_at?: string;
    chunk_duration_ms?: number;
  };
}

// Streaming callback types
export type TerminalOutputChangeCallback = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: TerminalOutputRow;
  old?: TerminalOutputRow;
}) => void;

// Custom error types for better error handling
export class TerminalOutputError extends Error {
  constructor(
    message: string,
    public code: string,
    public commandId?: string,
    public agentId?: string
  ) {
    super(message);
    this.name = 'TerminalOutputError';
  }
}

export class TerminalOutputNotFoundError extends TerminalOutputError {
  constructor(id: string) {
    super(`Terminal output with id ${id} not found`, 'TERMINAL_OUTPUT_NOT_FOUND', undefined, undefined);
  }
}

export class TerminalOutputValidationError extends TerminalOutputError {
  constructor(message: string, public validationErrors?: z.ZodIssue[]) {
    super(message, 'TERMINAL_OUTPUT_VALIDATION_ERROR');
  }
}

export class TerminalOutputChunkingError extends TerminalOutputError {
  constructor(message: string, commandId?: string) {
    super(message, 'TERMINAL_OUTPUT_CHUNKING_ERROR', commandId);
  }
}

/**
 * TerminalOutput Model Class
 *
 * Provides comprehensive terminal output management with:
 * - CRUD operations
 * - Real-time streaming
 * - ANSI color code support
 * - Automatic chunking for large outputs
 * - Batch operations for performance
 */
export class TerminalOutputModel {
  private subscriptions: Map<string, RealtimeChannel> = new Map();
  private readonly CHUNK_SIZE = 100000; // 100KB chunks as per database constraint

  constructor(private supabase: ReturnType<typeof createClient<Database>>) {}

  /**
   * Create a single terminal output entry
   * @param terminalOutput Terminal output data to insert
   * @returns Created terminal output with generated ID and timestamps
   */
  async create(terminalOutput: Omit<TerminalOutputInsert, 'id' | 'created_at'>): Promise<TerminalOutputRow> {
    try {
      // Validate input using Zod schema
      const validated = TerminalOutputSchema.parse({
        ...terminalOutput,
        timestamp: terminalOutput.timestamp || new Date().toISOString(),
      });

      const now = new Date().toISOString();
      const insertData: TerminalOutputInsert = {
        command_id: validated.command_id,
        agent_id: validated.agent_id,
        type: validated.type as Database['public']['Tables']['terminal_outputs']['Insert']['type'],
        output: validated.content, // Map 'content' to 'output' for database compatibility
        timestamp: validated.timestamp || now,
        created_at: now,
      };

      const { data, error } = await (this.supabase as any)
        .from('terminal_outputs')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new TerminalOutputError(
          `Failed to create terminal output: ${error.message}`,
          'DATABASE_ERROR',
          terminalOutput.command_id,
          terminalOutput.agent_id
        );
      }

      return data as TerminalOutputRow;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new TerminalOutputValidationError(
          `Validation failed: ${error.errors.map(e => e.message).join(', ')}`,
          error.issues
        );
      }
      if (error instanceof TerminalOutputError) throw error;
      throw new TerminalOutputError(
        `Unexpected error creating terminal output: ${error}`,
        'UNKNOWN_ERROR',
        terminalOutput.command_id,
        terminalOutput.agent_id
      );
    }
  }

  /**
   * Find terminal outputs by command ID with optional filtering
   * @param commandId Command UUID
   * @param filters Optional filters for type, limit, offset, since timestamp
   * @returns Array of terminal outputs ordered by timestamp
   */
  async findByCommandId(
    commandId: string,
    filters?: {
      type?: TerminalOutputType;
      limit?: number;
      offset?: number;
      since?: string; // ISO timestamp
    }
  ): Promise<TerminalOutputRow[]> {
    try {
      let query = this.supabase
        .from('terminal_outputs')
        .select('*')
        .eq('command_id', commandId);

      if (filters?.type) {
        query = query.eq('type', filters.type);
      }

      if (filters?.since) {
        query = query.gt('timestamp', filters.since);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      if (filters?.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error } = await query.order('timestamp', { ascending: true });

      if (error) {
        throw new TerminalOutputError(
          `Failed to find terminal outputs by command ID: ${error.message}`,
          'DATABASE_ERROR',
          commandId
        );
      }

      return data || [];
    } catch (error) {
      if (error instanceof TerminalOutputError) throw error;
      throw new TerminalOutputError(
        `Unexpected error finding terminal outputs: ${error}`,
        'UNKNOWN_ERROR',
        commandId
      );
    }
  }

  /**
   * Create multiple terminal outputs in a single transaction (batch operation)
   * @param terminalOutputs Array of terminal output data
   * @returns Array of created terminal outputs
   */
  async createBatch(
    terminalOutputs: Omit<TerminalOutputInsert, 'id' | 'created_at'>[]
  ): Promise<TerminalOutputRow[]> {
    if (terminalOutputs.length === 0) {
      return [];
    }

    try {
      const now = new Date().toISOString();
      const insertData: TerminalOutputInsert[] = terminalOutputs.map((output, index) => {
        // Validate each entry
        const validated = TerminalOutputSchema.parse({
          ...output,
          content: output.output || '', // Handle both 'content' and 'output' fields
          timestamp: output.timestamp || new Date(Date.now() + index).toISOString(), // Slight offset for ordering
        });

        return {
          command_id: validated.command_id,
          agent_id: validated.agent_id,
          type: validated.type as Database['public']['Tables']['terminal_outputs']['Insert']['type'],
          output: validated.content,
          timestamp: validated.timestamp || new Date(Date.now() + index).toISOString(),
          created_at: now,
        };
      });

      const { data, error } = await (this.supabase as any)
        .from('terminal_outputs')
        .insert(insertData)
        .select();

      if (error) {
        throw new TerminalOutputError(
          `Failed to create batch terminal outputs: ${error.message}`,
          'DATABASE_ERROR'
        );
      }

      return (data || []) as TerminalOutputRow[];
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new TerminalOutputValidationError(
          `Batch validation failed: ${error.errors.map(e => e.message).join(', ')}`,
          error.issues
        );
      }
      if (error instanceof TerminalOutputError) throw error;
      throw new TerminalOutputError(
        `Unexpected error creating batch terminal outputs: ${error}`,
        'UNKNOWN_ERROR'
      );
    }
  }

  /**
   * Stream terminal outputs for a command in real-time
   * @param commandId Command UUID to stream outputs for
   * @param callback Callback function called when new outputs arrive
   * @param options Optional filtering options
   * @returns Subscription ID for managing the stream
   */
  stream(
    commandId: string,
    callback: TerminalOutputChangeCallback,
    options?: {
      type?: TerminalOutputType;
      includeExisting?: boolean;
    }
  ): string {
    const subscriptionId = `terminal_output_${commandId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // If includeExisting is true, first send existing outputs
    if (options?.includeExisting) {
      this.findByCommandId(commandId, { type: options.type })
        .then((existingOutputs) => {
          existingOutputs.forEach((output) => {
            callback({
              eventType: 'INSERT',
              new: output,
              old: undefined,
            });
          });
        })
        .catch((error) => {
          console.error('Error fetching existing terminal outputs for streaming:', error);
        });
    }

    // Set up real-time subscription
    let channel = this.supabase
      .channel(subscriptionId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'terminal_outputs',
          filter: `command_id=eq.${commandId}${options?.type ? `,type=eq.${options.type}` : ''}`,
        },
        (payload) => {
          callback({
            eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            new: payload.new as TerminalOutputRow | undefined,
            old: payload.old as TerminalOutputRow | undefined,
          });
        }
      )
      .subscribe();

    this.subscriptions.set(subscriptionId, channel);
    return subscriptionId;
  }

  /**
   * Unsubscribe from real-time terminal output stream
   * @param subscriptionId Subscription ID returned from stream()
   */
  unsubscribe(subscriptionId: string): void {
    const channel = this.subscriptions.get(subscriptionId);
    if (channel) {
      this.supabase.removeChannel(channel);
      this.subscriptions.delete(subscriptionId);
    }
  }

  /**
   * Unsubscribe from all active streams
   */
  unsubscribeAll(): void {
    this.subscriptions.forEach((channel) => {
      this.supabase.removeChannel(channel);
    });
    this.subscriptions.clear();
  }

  /**
   * Create terminal output with automatic chunking for large content
   * @param terminalOutput Terminal output data
   * @param content Large content to be chunked
   * @param metadata Optional metadata including ANSI color codes
   * @returns Array of created terminal output chunks
   */
  async createWithChunking(
    terminalOutput: Omit<TerminalOutputInsert, 'id' | 'created_at' | 'output'>,
    content: string,
    metadata?: TerminalOutputMetadata
  ): Promise<TerminalOutputRow[]> {
    try {
      if (content.length <= this.CHUNK_SIZE) {
        // Single chunk - no need for chunking
        return [await this.create({
          ...terminalOutput,
          output: content,
        })];
      }

      // Multiple chunks needed
      const chunks: string[] = [];
      for (let i = 0; i < content.length; i += this.CHUNK_SIZE) {
        chunks.push(content.slice(i, i + this.CHUNK_SIZE));
      }

      const chunkInserts = chunks.map((chunk, index) => {
        const chunkMetadata: TerminalOutputMetadata = {
          ...metadata,
          chunking: {
            chunk_index: index,
            total_chunks: chunks.length,
            original_size: content.length,
            is_continuation: index > 0,
          },
        };

        return {
          ...terminalOutput,
          output: chunk,
          timestamp: new Date(Date.now() + index * 100).toISOString(), // Slight offset for proper ordering
        };
      });

      return await this.createBatch(chunkInserts);
    } catch (error) {
      if (error instanceof TerminalOutputError) throw error;
      throw new TerminalOutputChunkingError(
        `Failed to create chunked terminal output: ${error}`,
        terminalOutput.command_id
      );
    }
  }

  /**
   * Get terminal output statistics for a command
   * @param commandId Command UUID
   * @returns Statistics object with counts and sizes
   */
  async getStats(commandId: string): Promise<{
    total_entries: number;
    stdout_entries: number;
    stderr_entries: number;
    system_entries: number;
    total_size_bytes: number;
    first_output_at: string | null;
    last_output_at: string | null;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('terminal_outputs')
        .select('type, output, timestamp')
        .eq('command_id', commandId)
        .order('timestamp', { ascending: true });

      if (error) {
        throw new TerminalOutputError(
          `Failed to get terminal output stats: ${error.message}`,
          'DATABASE_ERROR',
          commandId
        );
      }

      const outputs = (data || []) as TerminalOutputRow[];
      const stats = {
        total_entries: outputs.length,
        stdout_entries: outputs.filter(o => o.type === 'stdout').length,
        stderr_entries: outputs.filter(o => o.type === 'stderr').length,
        system_entries: outputs.filter(o => o.type === 'system').length,
        total_size_bytes: outputs.reduce((sum, o) => sum + (o.output?.length || 0), 0),
        first_output_at: outputs.length > 0 ? outputs[0].timestamp : null,
        last_output_at: outputs.length > 0 ? outputs[outputs.length - 1].timestamp : null,
      };

      return stats;
    } catch (error) {
      if (error instanceof TerminalOutputError) throw error;
      throw new TerminalOutputError(
        `Unexpected error getting terminal output stats: ${error}`,
        'UNKNOWN_ERROR',
        commandId
      );
    }
  }

  /**
   * Delete all terminal outputs for a command
   * @param commandId Command UUID
   * @returns Number of deleted entries
   */
  async deleteByCommandId(commandId: string): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('terminal_outputs')
        .delete()
        .eq('command_id', commandId)
        .select('id');

      if (error) {
        throw new TerminalOutputError(
          `Failed to delete terminal outputs: ${error.message}`,
          'DATABASE_ERROR',
          commandId
        );
      }

      return (data || []).length;
    } catch (error) {
      if (error instanceof TerminalOutputError) throw error;
      throw new TerminalOutputError(
        `Unexpected error deleting terminal outputs: ${error}`,
        'UNKNOWN_ERROR',
        commandId
      );
    }
  }

  /**
   * Parse ANSI color codes from terminal content
   * @param content Raw terminal content with ANSI codes
   * @returns Parsed metadata and clean content
   */
  static parseAnsiCodes(content: string): {
    content: string;
    metadata: TerminalOutputMetadata;
  } {
    const ansiRegex = /\x1B\[[0-9;]*[mK]/g;
    const codes = content.match(ansiRegex) || [];
    const cleanContent = content.replace(ansiRegex, '');

    const metadata: TerminalOutputMetadata = {
      ansi_codes: {
        reset_codes: codes,
      },
    };

    return { content: cleanContent, metadata };
  }

  /**
   * Reconstruct chunked content from multiple terminal output entries
   * @param commandId Command UUID
   * @returns Reconstructed content string
   */
  async reconstructChunkedContent(commandId: string): Promise<string> {
    try {
      const outputs = await this.findByCommandId(commandId);

      // Sort by timestamp to ensure proper order
      const sortedOutputs = outputs.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      return sortedOutputs.map(output => output.output).join('');
    } catch (error) {
      if (error instanceof TerminalOutputError) throw error;
      throw new TerminalOutputError(
        `Failed to reconstruct chunked content: ${error}`,
        'UNKNOWN_ERROR',
        commandId
      );
    }
  }
}