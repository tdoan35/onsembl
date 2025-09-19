import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { Database } from '../types/database';
import { z } from 'zod';

// Enhanced Agent schema validation matching database schema
export const AgentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  type: z.enum(['claude', 'gemini', 'codex', 'custom']),
  status: z.enum(['online', 'offline', 'executing', 'error', 'maintenance']),
  version: z.string(),
  capabilities: z.array(z.string()),
  last_ping: z.string().datetime().nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// Type mappings for compatibility with T069 requirements
export type AgentType = 'claude' | 'gemini' | 'codex' | 'custom';
export type AgentStatus = 'online' | 'offline' | 'executing' | 'error' | 'maintenance';
type DbAgentStatus = 'connected' | 'disconnected' | 'busy' | 'error';

// Legacy mapping for backward compatibility with T069 spec
export const LegacyStatusMap: Record<AgentStatus, string> = {
  'online': 'IDLE',
  'offline': 'STOPPED',
  'executing': 'BUSY',
  'error': 'ERROR',
  'maintenance': 'STOPPED'
};

export const LegacyTypeMap: Record<AgentType, string> = {
  'claude': 'CLAUDE',
  'gemini': 'GEMINI',
  'codex': 'CODEX',
  'custom': 'CUSTOM'
};

export type Agent = z.infer<typeof AgentSchema>;
export type AgentInsert = Database['public']['Tables']['agents']['Insert'];
export type AgentUpdate = Database['public']['Tables']['agents']['Update'];
export type AgentRow = Database['public']['Tables']['agents']['Row'];

// Agent metadata interface for type safety
export interface AgentMetadata {
  memory_usage?: number;
  version?: string;
  capabilities?: string[];
  connection_id?: string;
  last_error?: string;
  performance_metrics?: {
    commands_executed?: number;
    average_response_time?: number;
    uptime?: number;
  };
}

// Real-time subscription callback types
export type AgentChangeCallback = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: AgentRow;
  old?: AgentRow;
}) => void;

// Custom error types for better error handling
export class AgentError extends Error {
  constructor(
    message: string,
    public code: string,
    public agentId?: string
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class AgentNotFoundError extends AgentError {
  constructor(agentId: string) {
    super(`Agent with id ${agentId} not found`, 'AGENT_NOT_FOUND', agentId);
  }
}

export class AgentValidationError extends AgentError {
  constructor(message: string, public validationErrors?: z.ZodIssue[]) {
    super(message, 'AGENT_VALIDATION_ERROR');
  }
}

export class AgentModel {
  private subscriptions: Map<string, RealtimeChannel> = new Map();

  constructor(private supabase: ReturnType<typeof createClient<Database>>) {}

  private toDbStatus(status?: AgentStatus | DbAgentStatus | null): DbAgentStatus {
    if (!status) return 'disconnected';
    switch (status) {
      case 'connected':
      case 'disconnected':
      case 'busy':
      case 'error':
        return status;
    }
    switch (status) {
      case 'online':
        return 'connected';
      case 'executing':
        return 'busy';
      case 'error':
        return 'error';
      case 'maintenance':
        return 'disconnected';
      case 'offline':
      default:
        return 'disconnected';
    }
  }

  /**
   * Find all agents with optional filtering
   */
  async findAll(filters?: {
    status?: AgentStatus | AgentStatus[];
    type?: AgentType | AgentType[];
    connected?: boolean;
  }) {
    try {
      let query = this.supabase.from('agents').select('*');

      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters?.type) {
        if (Array.isArray(filters.type)) {
          query = query.in('type', filters.type);
        } else {
          query = query.eq('type', filters.type);
        }
      }

      if (filters?.connected !== undefined) {
        // Derive connected status from last_ping and current time
        const cutoffTime = new Date(Date.now() - 90000).toISOString(); // 90 seconds ago
        if (filters.connected) {
          query = query.gt('last_ping', cutoffTime);
        } else {
          query = query.or(`last_ping.is.null,last_ping.lt.${cutoffTime}`);
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        throw new AgentError(`Failed to find agents: ${error.message}`, 'DATABASE_ERROR');
      }

      return data;
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError(`Unexpected error finding agents: ${error}`, 'UNKNOWN_ERROR');
    }
  }

  /**
   * Find agent by ID
   */
  async findById(id: string): Promise<AgentRow> {
    try {
      const { data, error } = await this.supabase
        .from('agents')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new AgentNotFoundError(id);
        }
        throw new AgentError(`Failed to find agent: ${error.message}`, 'DATABASE_ERROR', id);
      }

      return data;
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError(`Unexpected error finding agent: ${error}`, 'UNKNOWN_ERROR', id);
    }
  }

  /**
   * Find agent by unique name
   */
  async findByName(name: string): Promise<AgentRow> {
    try {
      const { data, error } = await this.supabase
        .from('agents')
        .select('*')
        .eq('name', name)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new AgentNotFoundError(name);
        }
        throw new AgentError(`Failed to find agent by name: ${error.message}`, 'DATABASE_ERROR');
      }

      return data;
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError(`Unexpected error finding agent by name: ${error}`, 'UNKNOWN_ERROR');
    }
  }

  /**
   * Create a new agent
   */
  async create(agent: AgentInsert): Promise<AgentRow> {
    try {
      // Validate input using Zod schema (if provided fields are valid)
      const validated = AgentSchema.parse(agent);

      const insertData: Partial<AgentRow> & { metadata?: Record<string, any> } = {
        name: validated.name,
        type: validated.type as any,
        status: this.toDbStatus(validated.status as AgentStatus) as any,
        metadata: (validated.metadata as Record<string, any>) || {},
        created_at: new Date().toISOString() as any,
        updated_at: new Date().toISOString() as any,
      };

      if (validated.last_ping) {
        insertData.last_ping = validated.last_ping as any;
      }

      const { data, error } = await (this.supabase as any)
        .from('agents')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new AgentError(`Failed to create agent: ${error.message}`, 'DATABASE_ERROR');
      }

      return data;
    } catch (error) {
      if (error instanceof AgentError) throw error;
      if (error instanceof z.ZodError) {
        throw new AgentValidationError('Invalid agent data', error.issues);
      }
      throw new AgentError(`Unexpected error creating agent: ${error}`, 'UNKNOWN_ERROR');
    }
  }

  /**
   * Update an existing agent
   */
  async update(id: string, updates: AgentUpdate): Promise<AgentRow> {
    try {
      const allowedKeys = new Set(['name', 'type', 'status', 'last_ping', 'metadata']);
      const updateData: Record<string, any> = {};

      Object.entries(updates).forEach(([key, value]) => {
        if (!allowedKeys.has(key) || value === undefined) {
          return;
        }

        if (key === 'status') {
          updateData.status = this.toDbStatus(value as AgentStatus);
        } else {
          updateData[key] = value;
        }
      });

      updateData.updated_at = new Date().toISOString();

      const { data, error } = await (this.supabase as any)
        .from('agents')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new AgentNotFoundError(id);
        }
        throw new AgentError(`Failed to update agent: ${error.message}`, 'DATABASE_ERROR', id);
      }

      return data;
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError(`Unexpected error updating agent: ${error}`, 'UNKNOWN_ERROR', id);
    }
  }

  /**
   * Update agent status
   */
  async updateStatus(id: string, status: AgentStatus): Promise<AgentRow> {
    return this.update(id, { status: this.toDbStatus(status) } as any);
  }

  /**
   * Update agent last heartbeat (equivalent to last_ping)
   */
  async updateLastHeartbeat(id: string): Promise<AgentRow> {
    return this.update(id, {
      last_ping: new Date().toISOString(),
      status: this.toDbStatus('online')
    });
  }

  /**
   * Update last ping (maintaining compatibility)
   */
  async updateLastPing(id: string): Promise<AgentRow> {
    return this.updateLastHeartbeat(id);
  }

  /**
   * Delete an agent
   */
  async delete(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('agents')
        .delete()
        .eq('id', id);

      if (error) {
        throw new AgentError(`Failed to delete agent: ${error.message}`, 'DATABASE_ERROR', id);
      }

      return true;
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError(`Unexpected error deleting agent: ${error}`, 'UNKNOWN_ERROR', id);
    }
  }

  /**
   * Find agent by connection ID (using metadata)
   */
  async findByConnectionId(connectionId: string): Promise<AgentRow | null> {
    try {
      const { data, error } = await this.supabase
        .from('agents')
        .select('*')
        .eq('metadata->>connection_id', connectionId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new AgentError(
          `Failed to find agent by connection ID: ${error.message}`,
          'DATABASE_ERROR'
        );
      }

      return data || null;
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError(
        `Unexpected error finding agent by connection ID: ${error}`,
        'UNKNOWN_ERROR'
      );
    }
  }

  /**
   * Get all online agents
   */
  async getOnlineAgents(): Promise<AgentRow[]> {
    return this.findAll({ status: 'online' });
  }

  /**
   * Get agents by type
   */
  async getAgentsByType(type: AgentType): Promise<AgentRow[]> {
    return this.findAll({ type });
  }

  /**
   * Get connected agents (those with recent heartbeat)
   */
  async getConnectedAgents(): Promise<AgentRow[]> {
    return this.findAll({ connected: true });
  }

  /**
   * Count agents by status
   */
  async countByStatus(): Promise<Record<AgentStatus, number>> {
    try {
      const { data, error } = await this.supabase
        .from('agents')
        .select('status')
        .order('status');

      if (error) {
        throw new AgentError(`Failed to count agents by status: ${error.message}`, 'DATABASE_ERROR');
      }

      // Count manually since Supabase aggregation can be tricky
      const statusCounts: Record<AgentStatus, number> = {
        online: 0,
        offline: 0,
        executing: 0,
        error: 0,
        maintenance: 0
      };

      data?.forEach((agent: AgentRow) => {
        if (agent.status in statusCounts) {
          statusCounts[agent.status as AgentStatus]++;
        }
      });

      return statusCounts;
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError(`Unexpected error counting agents by status: ${error}`, 'UNKNOWN_ERROR');
    }
  }

  /**
   * Check agent health and update status if needed
   */
  async checkHealth(id: string) {
    try {
      const agent = await this.findById(id);

      const lastPingTime = agent.last_ping ? new Date(agent.last_ping).getTime() : 0;
      const now = Date.now();
      const timeSinceLastPing = now - lastPingTime;

      // Consider unhealthy if no ping for more than 90 seconds
      const isHealthy = timeSinceLastPing < 90000;
      const connected = isHealthy;

      // Auto-update status if agent went offline
      if (!isHealthy && agent.status === 'online') {
        await this.updateStatus(id, 'offline');
      }

      return {
        id: agent.id,
        healthy: isHealthy,
        connected,
        lastPing: agent.last_ping,
        lastHeartbeat: agent.last_ping, // Alias for compatibility
        timeSinceLastPing,
        status: agent.status,
        name: agent.name,
        type: agent.type
      };
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError(`Unexpected error checking agent health: ${error}`, 'UNKNOWN_ERROR', id);
    }
  }

  /**
   * Subscribe to real-time agent status changes
   */
  subscribeToStatusChanges(callback: AgentChangeCallback, agentId?: string): string {
    const subscriptionId = `agent_status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    let channel = this.supabase
      .channel(subscriptionId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agents',
          ...(agentId && { filter: `id=eq.${agentId}` })
        },
        (payload) => {
          callback({
            eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            new: payload.new as AgentRow | undefined,
            old: payload.old as AgentRow | undefined
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
   * Bulk update agents (useful for maintenance operations)
   */
  async bulkUpdateStatus(agentIds: string[], status: AgentStatus): Promise<AgentRow[]> {
    try {
      const updateData = {
        status,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await (this.supabase as any)
        .from('agents')
        .update(updateData)
        .in('id', agentIds)
        .select();

      if (error) {
        throw new AgentError(`Failed to bulk update agents: ${error.message}`, 'DATABASE_ERROR');
      }

      return data;
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError(`Unexpected error bulk updating agents: ${error}`, 'UNKNOWN_ERROR');
    }
  }

  /**
   * Get agents with stale heartbeats (for cleanup tasks)
   */
  async getStaleAgents(thresholdMinutes: number = 5): Promise<AgentRow[]> {
    try {
      const cutoffTime = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();

      const { data, error } = await this.supabase
        .from('agents')
        .select('*')
        .or(`last_ping.is.null,last_ping.lt.${cutoffTime}`)
        .in('status', ['online', 'executing']);

      if (error) {
        throw new AgentError(`Failed to find stale agents: ${error.message}`, 'DATABASE_ERROR');
      }

      return data;
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError(`Unexpected error finding stale agents: ${error}`, 'UNKNOWN_ERROR');
    }
  }
}
