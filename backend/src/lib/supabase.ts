import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { config } from '../config/index.js';

// Database types will be generated from Supabase schema
export type Database = {
  public: {
    Tables: {
      agents: {
        Row: {
          id: string;
          user_id: string; // Added for auth
          name: string;
          type: 'claude' | 'gemini' | 'codex' | 'custom';
          status: 'connected' | 'disconnected' | 'busy' | 'error';
          last_ping: string | null;
          metadata: Record<string, any> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['agents']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['agents']['Insert']>;
      };
      commands: {
        Row: {
          id: string;
          user_id: string; // Added for auth
          agent_id: string;
          command: string;
          arguments: Record<string, any> | null;
          status: 'pending' | 'queued' | 'executing' | 'completed' | 'failed' | 'cancelled';
          priority: number;
          result: Record<string, any> | null;
          error: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['commands']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['commands']['Insert']>;
      };
      terminal_outputs: {
        Row: {
          id: string;
          command_id: string;
          agent_id: string;
          type: 'stdout' | 'stderr' | 'system';
          content: string;
          timestamp: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['terminal_outputs']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['terminal_outputs']['Insert']>;
      };
      user_profiles: {
        Row: {
          id: string;
          username: string | null;
          avatar_url: string | null;
          full_name: string | null;
          bio: string | null;
          preferences: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['user_profiles']['Insert']>;
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          event_type: string;
          event_data: Record<string, any>;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      agent_status: 'connected' | 'disconnected' | 'busy' | 'error';
      agent_type: 'claude' | 'gemini' | 'codex' | 'custom';
      command_status: 'pending' | 'queued' | 'executing' | 'completed' | 'failed' | 'cancelled';
    };
  };
};

// Create Supabase client
export const supabase = createClient<Database>(
  config.supabaseUrl || 'http://127.0.0.1:54321',
  config.supabaseAnonKey || '',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  },
);

// Service role client for admin operations
export const supabaseAdmin = createClient<Database>(
  config.supabaseUrl || 'http://127.0.0.1:54321',
  config.supabaseServiceKey || config.supabaseAnonKey || '',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

// Helper functions for common operations
export const db = {
  // Agent operations
  agents: {
    async create(agent: Database['public']['Tables']['agents']['Insert']) {
      const { data, error } = await supabase
        .from('agents')
        .insert(agent)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async update(id: string, updates: Database['public']['Tables']['agents']['Update']) {
      const { data, error } = await supabase
        .from('agents')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async get(id: string) {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    },

    async list() {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },

    async updateStatus(id: string, status: Database['public']['Enums']['agent_status']) {
      return this.update(id, { status, last_ping: new Date().toISOString() });
    },
  },

  // Command operations
  commands: {
    async create(command: Database['public']['Tables']['commands']['Insert']) {
      const { data, error } = await supabase
        .from('commands')
        .insert(command)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async update(id: string, updates: Database['public']['Tables']['commands']['Update']) {
      const { data, error } = await supabase
        .from('commands')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async getQueue(agentId?: string) {
      let query = supabase
        .from('commands')
        .select('*')
        .in('status', ['pending', 'queued'])
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true });
      
      if (agentId) {
        query = query.eq('agent_id', agentId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  },

  // Terminal output operations
  terminalOutputs: {
    async create(output: Database['public']['Tables']['terminal_outputs']['Insert']) {
      const { data, error } = await supabase
        .from('terminal_outputs')
        .insert(output)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async getByCommand(commandId: string) {
      const { data, error } = await supabase
        .from('terminal_outputs')
        .select('*')
        .eq('command_id', commandId)
        .order('timestamp', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  },
};

// Realtime subscriptions
export const realtime = {
  subscribeToAgents(callback: (payload: any) => void) {
    return supabase
      .channel('agents')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agents' },
        callback,
      )
      .subscribe();
  },

  subscribeToCommands(callback: (payload: any) => void, agentId?: string) {
    const channel = supabase.channel('commands');
    
    if (agentId) {
      return channel
        .on(
          'postgres_changes',
          { 
            event: '*', 
            schema: 'public', 
            table: 'commands',
            filter: `agent_id=eq.${agentId}`,
          },
          callback,
        )
        .subscribe();
    }
    
    return channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'commands' },
        callback,
      )
      .subscribe();
  },

  subscribeToTerminalOutput(commandId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`terminal-${commandId}`)
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'terminal_outputs',
          filter: `command_id=eq.${commandId}`,
        },
        callback,
      )
      .subscribe();
  },
};

// Authentication helpers
export const auth = {
  /**
   * Validate a JWT token and return user data
   * @param token - JWT token to validate
   * @returns User data if valid, null if invalid
   */
  async validateToken(token: string): Promise<User | null> {
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

      if (error || !user) {
        return null;
      }

      return user;
    } catch (error) {
      console.error('Token validation error:', error);
      return null;
    }
  },

  /**
   * Get user by ID using service role
   * @param userId - User ID to fetch
   * @returns User data if found
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

      if (error) {
        console.error('Error fetching user:', error);
        return null;
      }

      return data.user;
    } catch (error) {
      console.error('Error in getUserById:', error);
      return null;
    }
  },

  /**
   * Extract user ID from JWT token without verification
   * @param token - JWT token
   * @returns User ID if extractable, null otherwise
   */
  extractUserIdFromToken(token: string): string | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      return payload.sub || null;
    } catch {
      return null;
    }
  },
};

// User profile operations
export const profiles = {
  /**
   * Create or update user profile
   * @param userId - User ID
   * @param profile - Profile data to upsert
   */
  async upsert(userId: string, profile: any) {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id: userId,
        ...profile,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  },

  /**
   * Get user profile by ID
   * @param userId - User ID
   */
  async get(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Profile doesn't exist
        return null;
      }
      throw error;
    }

    return data;
  },
};

// Audit logging operations
export const audit = {
  /**
   * Log an audit event
   * @param event - Audit event data
   */
  async log(event: {
    user_id?: string;
    event_type: string;
    event_data: any;
    ip_address?: string;
    user_agent?: string;
  }) {
    const { error } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        ...event,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Failed to log audit event:', error);
    }
  },
};

// Export JWT secret for validation middleware
export const getJWTSecret = (): string => {
  const secret = config.supabaseJwtSecret || process.env['SUPABASE_JWT_SECRET'];
  if (!secret && process.env['NODE_ENV'] !== 'test') {
    throw new Error('SUPABASE_JWT_SECRET is required for JWT validation');
  }
  return secret || 'test-secret';
};

export default supabase;