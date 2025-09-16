import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';
import { z } from 'zod';

// Command schema validation
export const CommandSchema = z.object({
  id: z.string().uuid().optional(),
  agent_id: z.string().uuid(),
  command: z.string().min(1),
  arguments: z.record(z.any()).optional(),
  status: z.enum(['pending', 'queued', 'executing', 'completed', 'failed', 'cancelled']),
  priority: z.number().int().min(0).max(10).default(1),
  result: z.any().optional(),
  error: z.string().optional(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type Command = z.infer<typeof CommandSchema>;
export type CommandInsert = Database['public']['Tables']['commands']['Insert'];
export type CommandUpdate = Database['public']['Tables']['commands']['Update'];
export type CommandRow = Database['public']['Tables']['commands']['Row'];

export class CommandModel {
  constructor(private supabase: ReturnType<typeof createClient<Database>>) {}

  async findAll(filters?: {
    agent_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    let query = this.supabase.from('commands').select('*');

    if (filters?.agent_id) {
      query = query.eq('agent_id', filters.agent_id);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async findById(id: string) {
    const { data, error } = await this.supabase
      .from('commands')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async create(command: CommandInsert) {
    const validated = CommandSchema.parse(command);

    const { data, error } = await this.supabase
      .from('commands')
      .insert({
        ...validated,
        status: validated.status || 'pending',
        priority: validated.priority || 1,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, updates: CommandUpdate) {
    const { data, error } = await this.supabase
      .from('commands')
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

  async updateStatus(id: string, status: Command['status'], result?: any, error?: string) {
    const updates: CommandUpdate = { status };

    if (status === 'executing') {
      updates.started_at = new Date().toISOString();
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      updates.completed_at = new Date().toISOString();
      if (result !== undefined) updates.result = result;
      if (error !== undefined) updates.error = error;
    }

    return this.update(id, updates);
  }

  async delete(id: string) {
    const { error } = await this.supabase
      .from('commands')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  async getActiveCommands(agentId?: string) {
    const filters = {
      status: 'executing',
      agent_id: agentId,
    };

    return this.findAll(filters);
  }

  async getPendingCommands(agentId?: string) {
    let query = this.supabase
      .from('commands')
      .select('*')
      .in('status', ['pending', 'queued']);

    if (agentId) {
      query = query.eq('agent_id', agentId);
    }

    const { data, error } = await query
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  }

  async getNextCommand(agentId: string) {
    const { data, error } = await this.supabase
      .from('commands')
      .select('*')
      .eq('agent_id', agentId)
      .in('status', ['pending', 'queued'])
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getCommandHistory(agentId: string, limit = 50) {
    const { data, error } = await this.supabase
      .from('commands')
      .select('*')
      .eq('agent_id', agentId)
      .in('status', ['completed', 'failed', 'cancelled'])
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  async getCommandStats(agentId?: string) {
    let query = this.supabase.from('commands').select('status, count(*)');

    if (agentId) {
      query = query.eq('agent_id', agentId);
    }

    const { data, error } = await query.group('status');

    if (error) throw error;

    const stats = {
      total: 0,
      pending: 0,
      queued: 0,
      executing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    data?.forEach((row) => {
      const count = parseInt(row.count as string, 10);
      stats[row.status as keyof typeof stats] = count;
      stats.total += count;
    });

    return stats;
  }

  async calculateAverageExecutionTime(agentId?: string, days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    let query = this.supabase
      .from('commands')
      .select('started_at, completed_at')
      .eq('status', 'completed')
      .gte('completed_at', since.toISOString());

    if (agentId) {
      query = query.eq('agent_id', agentId);
    }

    const { data, error } = await query;

    if (error) throw error;

    if (!data || data.length === 0) {
      return null;
    }

    const durations = data
      .filter((cmd) => cmd.started_at && cmd.completed_at)
      .map((cmd) => {
        const start = new Date(cmd.started_at!).getTime();
        const end = new Date(cmd.completed_at!).getTime();
        return end - start;
      });

    if (durations.length === 0) {
      return null;
    }

    const average = durations.reduce((sum, dur) => sum + dur, 0) / durations.length;
    return Math.round(average);
  }
}