import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';
import { z } from 'zod';

// Agent schema validation
export const AgentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  type: z.enum(['claude', 'gemini', 'codex', 'custom']),
  status: z.enum(['online', 'offline', 'executing', 'error', 'maintenance']),
  version: z.string(),
  capabilities: z.array(z.string()),
  last_ping: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type Agent = z.infer<typeof AgentSchema>;
export type AgentInsert = Database['public']['Tables']['agents']['Insert'];
export type AgentUpdate = Database['public']['Tables']['agents']['Update'];
export type AgentRow = Database['public']['Tables']['agents']['Row'];

export class AgentModel {
  constructor(private supabase: ReturnType<typeof createClient<Database>>) {}

  async findAll(filters?: { status?: string; type?: string }) {
    let query = this.supabase.from('agents').select('*');

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.type) {
      query = query.eq('type', filters.type);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async findById(id: string) {
    const { data, error } = await this.supabase
      .from('agents')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async create(agent: AgentInsert) {
    const validated = AgentSchema.parse(agent);

    const { data, error } = await this.supabase
      .from('agents')
      .insert(validated)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, updates: AgentUpdate) {
    const { data, error } = await this.supabase
      .from('agents')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateStatus(id: string, status: Agent['status']) {
    return this.update(id, { status });
  }

  async updateLastPing(id: string) {
    return this.update(id, {
      last_ping: new Date().toISOString(),
      status: 'online'
    });
  }

  async delete(id: string) {
    const { error } = await this.supabase
      .from('agents')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  async findByConnectionId(connectionId: string) {
    // This would typically query a connections table or use metadata
    const { data, error } = await this.supabase
      .from('agents')
      .select('*')
      .eq('metadata->>connectionId', connectionId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getOnlineAgents() {
    return this.findAll({ status: 'online' });
  }

  async getAgentsByType(type: Agent['type']) {
    return this.findAll({ type });
  }

  async countByStatus() {
    const { data, error } = await this.supabase
      .from('agents')
      .select('status, count(*)')
      .group('status');

    if (error) throw error;

    return data?.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count as string, 10);
      return acc;
    }, {} as Record<string, number>);
  }

  async checkHealth(id: string) {
    const agent = await this.findById(id);
    if (!agent) return null;

    const lastPingTime = agent.last_ping ? new Date(agent.last_ping).getTime() : 0;
    const now = Date.now();
    const timeSinceLastPing = now - lastPingTime;

    // Consider unhealthy if no ping for more than 90 seconds
    const isHealthy = timeSinceLastPing < 90000;

    if (!isHealthy && agent.status === 'online') {
      await this.updateStatus(id, 'offline');
    }

    return {
      id: agent.id,
      healthy: isHealthy,
      lastPing: agent.last_ping,
      timeSinceLastPing,
      status: agent.status,
    };
  }
}