/**
 * AuditLog Model for Onsembl.ai Agent Control Center
 *
 * Implementation of T075: AuditLog model with comprehensive audit trail storage
 *
 * Database Schema (from migration 007_audit_logs.sql):
 * - id: uuid (primary key)
 * - user_id: uuid (nullable, references auth.users)
 * - action: text (required, max 100 chars)
 * - resource_type: text (required, max 50 chars) - maps to entity_type
 * - resource_id: text (nullable, max 100 chars) - maps to entity_id
 * - details: jsonb (required, default {})
 * - ip_address: inet (nullable)
 * - user_agent: text (nullable, max 1000 chars)
 * - created_at: timestamptz (required, default NOW())
 *
 * Features:
 * - 30-day automatic retention policy
 * - Support for different event types via action field
 * - Comprehensive search and filtering capabilities
 * - Immutable audit entries (no updates/deletes allowed)
 */

import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';
import { z } from 'zod';

// Event types for better type safety
export type AuditEventType =
  | 'AGENT_CONNECTED'
  | 'AGENT_DISCONNECTED'
  | 'COMMAND_EXECUTED'
  | 'COMMAND_QUEUED'
  | 'COMMAND_COMPLETED'
  | 'COMMAND_FAILED'
  | 'COMMAND_CANCELLED'
  | 'EMERGENCY_STOP'
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'SYSTEM_STARTED'
  | 'SYSTEM_STOPPED'
  | 'CONFIG_UPDATED'
  | 'PRESET_CREATED'
  | 'PRESET_UPDATED'
  | 'PRESET_DELETED'
  | 'TRACE_CREATED'
  | 'INVESTIGATION_STARTED'
  | 'INVESTIGATION_COMPLETED';

// Entity types for categorization
export type AuditEntityType =
  | 'AGENT'
  | 'COMMAND'
  | 'SYSTEM'
  | 'USER'
  | 'PRESET'
  | 'TRACE'
  | 'INVESTIGATION'
  | 'TERMINAL';

// AuditLog schema validation
export const AuditLogSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid().nullable().optional(),
  action: z.string().min(1).max(100),
  resource_type: z.string().min(1).max(50),
  resource_id: z.string().max(100).nullable().optional(),
  details: z.record(z.any()).default({}),
  ip_address: z.string().nullable().optional(),
  user_agent: z.string().max(1000).nullable().optional(),
  created_at: z.string().datetime().optional(),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

// Type mappings for database compatibility
export type AuditLogRow = Database['public']['Tables']['audit_logs']['Row'];
export type AuditLogInsert = Database['public']['Tables']['audit_logs']['Insert'];
export type AuditLogUpdate = Database['public']['Tables']['audit_logs']['Update'];

// Enhanced AuditLog interface matching requirements
export interface AuditLogEntry {
  id: string;
  event_type: string; // Maps to action
  entity_type: string; // Maps to resource_type
  entity_id: string | null; // Maps to resource_id
  user_id: string | null;
  action: string;
  details: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Search filters interface
export interface AuditLogFilters {
  user_id?: string;
  entity_type?: string;
  entity_id?: string;
  action?: string;
  event_type?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

// Custom error types for better error handling
export class AuditLogError extends Error {
  constructor(
    message: string,
    public code: string,
    public auditId?: string
  ) {
    super(message);
    this.name = 'AuditLogError';
  }
}

export class AuditLogNotFoundError extends AuditLogError {
  constructor(auditId: string) {
    super(`Audit log with id ${auditId} not found`, 'AUDIT_LOG_NOT_FOUND', auditId);
  }
}

export class AuditLogValidationError extends AuditLogError {
  constructor(message: string, public validationErrors?: z.ZodIssue[]) {
    super(message, 'AUDIT_LOG_VALIDATION_ERROR');
  }
}

export class AuditLogOperationError extends AuditLogError {
  constructor(operation: string, message: string) {
    super(`Failed to ${operation}: ${message}`, 'AUDIT_LOG_OPERATION_ERROR');
  }
}

export class AuditLogModel {
  constructor(private supabase: ReturnType<typeof createClient<Database>>) {}

  /**
   * Creates a new audit log entry
   * @param entry Audit log data to insert
   * @returns Created audit log with generated ID and timestamp
   */
  async create(entry: {
    event_type: AuditEventType;
    entity_type: AuditEntityType;
    entity_id?: string | null;
    user_id?: string | null;
    action?: string;
    details?: Record<string, any>;
    ip_address?: string | null;
    user_agent?: string | null;
  }): Promise<AuditLogEntry> {
    try {
      // Validate input using Zod schema
      const validated = AuditLogSchema.parse({
        user_id: entry.user_id,
        action: entry.action || entry.event_type,
        resource_type: entry.entity_type,
        resource_id: entry.entity_id,
        details: entry.details || {},
        ip_address: entry.ip_address,
        user_agent: entry.user_agent,
      });

      const insertData: AuditLogInsert = {
        user_id: validated.user_id,
        action: validated.action,
        resource_type: validated.resource_type,
        resource_id: validated.resource_id,
        details: validated.details,
        ip_address: validated.ip_address,
        user_agent: validated.user_agent,
      };

      const { data, error } = await (this.supabase as any)
        .from('audit_logs')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new AuditLogOperationError('create audit log', error.message);
      }

      return this.mapToAuditLogEntry(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new AuditLogValidationError(
          `Validation failed: ${error.errors.map(e => e.message).join(', ')}`,
          error.issues
        );
      }
      if (error instanceof AuditLogError) throw error;
      throw new AuditLogOperationError('create audit log', (error as Error).message);
    }
  }

  /**
   * Finds audit logs by entity (resource)
   * @param entityType Type of entity to search for
   * @param entityId Optional specific entity ID to filter by
   * @param limit Number of results to return (default 100)
   * @returns Array of audit log entries
   */
  async findByEntity(
    entityType: AuditEntityType | string,
    entityId?: string,
    limit: number = 100
  ): Promise<AuditLogEntry[]> {
    try {
      let query = this.supabase
        .from('audit_logs')
        .select('*')
        .eq('resource_type', entityType);

      if (entityId) {
        query = query.eq('resource_id', entityId);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new AuditLogOperationError('find audit logs by entity', error.message);
      }

      return (data || []).map(item => this.mapToAuditLogEntry(item));
    } catch (error) {
      if (error instanceof AuditLogError) throw error;
      throw new AuditLogOperationError('find audit logs by entity', (error as Error).message);
    }
  }

  /**
   * Finds audit logs by user
   * @param userId User ID to search for
   * @param limit Number of results to return (default 100)
   * @returns Array of audit log entries
   */
  async findByUser(userId: string, limit: number = 100): Promise<AuditLogEntry[]> {
    try {
      const { data, error } = await this.supabase
        .from('audit_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new AuditLogOperationError('find audit logs by user', error.message);
      }

      return (data || []).map(item => this.mapToAuditLogEntry(item));
    } catch (error) {
      if (error instanceof AuditLogError) throw error;
      throw new AuditLogOperationError('find audit logs by user', (error as Error).message);
    }
  }

  /**
   * Finds audit logs within a date range
   * @param startDate Start of date range (ISO string)
   * @param endDate End of date range (ISO string)
   * @param filters Optional additional filters
   * @returns Array of audit log entries
   */
  async findByDateRange(
    startDate: string,
    endDate: string,
    filters?: Omit<AuditLogFilters, 'start_date' | 'end_date'>
  ): Promise<AuditLogEntry[]> {
    try {
      let query = this.supabase
        .from('audit_logs')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      // Apply additional filters
      if (filters?.user_id) {
        query = query.eq('user_id', filters.user_id);
      }

      if (filters?.entity_type) {
        query = query.eq('resource_type', filters.entity_type);
      }

      if (filters?.entity_id) {
        query = query.eq('resource_id', filters.entity_id);
      }

      if (filters?.action) {
        query = query.eq('action', filters.action);
      }

      if (filters?.event_type) {
        query = query.eq('action', filters.event_type);
      }

      const limit = filters?.limit || 100;
      const offset = filters?.offset || 0;

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new AuditLogOperationError('find audit logs by date range', error.message);
      }

      return (data || []).map(item => this.mapToAuditLogEntry(item));
    } catch (error) {
      if (error instanceof AuditLogError) throw error;
      throw new AuditLogOperationError('find audit logs by date range', (error as Error).message);
    }
  }

  /**
   * Advanced search of audit logs with multiple filters
   * @param filters Search filters
   * @returns Array of audit log entries
   */
  async search(filters: AuditLogFilters): Promise<AuditLogEntry[]> {
    try {
      // Use the built-in search function for complex queries
      const { data, error } = await (this.supabase as any)
        .rpc('search_audit_logs', {
          p_user_id: filters.user_id || null,
          p_action: filters.action || filters.event_type || null,
          p_resource_type: filters.entity_type || null,
          p_resource_id: filters.entity_id || null,
          p_start_date: filters.start_date || null,
          p_end_date: filters.end_date || null,
          p_limit: filters.limit || 100,
        });

      if (error) {
        throw new AuditLogOperationError('search audit logs', error.message);
      }

      return (data || []).map(item => this.mapToAuditLogEntry(item));
    } catch (error) {
      if (error instanceof AuditLogError) throw error;
      throw new AuditLogOperationError('search audit logs', (error as Error).message);
    }
  }

  /**
   * Gets audit log statistics
   * @param filters Optional filters to apply
   * @returns Statistics object with counts by action/event type
   */
  async getStatistics(filters?: {
    user_id?: string;
    entity_type?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<{
    total: number;
    by_action: Record<string, number>;
    by_entity_type: Record<string, number>;
    unique_users: number;
  }> {
    try {
      let query = this.supabase.from('audit_logs').select('action, resource_type, user_id');

      if (filters?.user_id) {
        query = query.eq('user_id', filters.user_id);
      }

      if (filters?.entity_type) {
        query = query.eq('resource_type', filters.entity_type);
      }

      if (filters?.start_date) {
        query = query.gte('created_at', filters.start_date);
      }

      if (filters?.end_date) {
        query = query.lte('created_at', filters.end_date);
      }

      const { data, error } = await query;

      if (error) {
        throw new AuditLogOperationError('get audit log statistics', error.message);
      }

      const stats = {
        total: data?.length || 0,
        by_action: {} as Record<string, number>,
        by_entity_type: {} as Record<string, number>,
        unique_users: 0,
      };

      const uniqueUsers = new Set<string>();

      data?.forEach((row: any) => {
        // Count by action
        if (row.action) {
          stats.by_action[row.action] = (stats.by_action[row.action] || 0) + 1;
        }

        // Count by entity type (resource_type)
        if (row.resource_type) {
          stats.by_entity_type[row.resource_type] = (stats.by_entity_type[row.resource_type] || 0) + 1;
        }

        // Track unique users
        if (row.user_id) {
          uniqueUsers.add(row.user_id);
        }
      });

      stats.unique_users = uniqueUsers.size;

      return stats;
    } catch (error) {
      if (error instanceof AuditLogError) throw error;
      throw new AuditLogOperationError('get audit log statistics', (error as Error).message);
    }
  }

  /**
   * Prunes old audit logs according to 30-day retention policy
   * @returns Number of deleted records
   */
  async prune(): Promise<number> {
    try {
      const { data, error } = await (this.supabase as any)
        .rpc('cleanup_old_audit_logs');

      if (error) {
        throw new AuditLogOperationError('prune old audit logs', error.message);
      }

      return data || 0;
    } catch (error) {
      if (error instanceof AuditLogError) throw error;
      throw new AuditLogOperationError('prune old audit logs', (error as Error).message);
    }
  }

  /**
   * Gets the count of audit logs older than the retention period
   * @param retentionDays Number of days for retention (default 30)
   * @returns Count of logs that would be pruned
   */
  async getPruneableCount(retentionDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

      const { count, error } = await this.supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .lt('created_at', cutoffDate);

      if (error) {
        throw new AuditLogOperationError('get pruneable count', error.message);
      }

      return count || 0;
    } catch (error) {
      if (error instanceof AuditLogError) throw error;
      throw new AuditLogOperationError('get pruneable count', (error as Error).message);
    }
  }

  /**
   * Convenience method to log common audit events
   * @param eventType Type of event to log
   * @param entityType Type of entity involved
   * @param entityId ID of the entity
   * @param userId ID of the user performing the action
   * @param details Additional details about the event
   * @param metadata Request metadata (IP, user agent)
   * @returns Created audit log entry
   */
  async logEvent(
    eventType: AuditEventType,
    entityType: AuditEntityType,
    entityId: string,
    userId?: string,
    details?: Record<string, any>,
    metadata?: {
      ip_address?: string;
      user_agent?: string;
    }
  ): Promise<AuditLogEntry> {
    return this.create({
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      user_id: userId,
      details: details || {},
      ip_address: metadata?.ip_address,
      user_agent: metadata?.user_agent,
    });
  }

  /**
   * Maps database row to AuditLogEntry interface
   * @param row Database row
   * @returns AuditLogEntry object
   */
  private mapToAuditLogEntry(row: AuditLogRow): AuditLogEntry {
    return {
      id: row.id,
      event_type: row.action, // Map action to event_type
      entity_type: row.resource_type || 'UNKNOWN', // Map resource_type to entity_type
      entity_id: row.resource_id,
      user_id: row.user_id,
      action: row.action,
      details: (row.details as Record<string, any>) || {},
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      created_at: row.created_at,
    };
  }
}