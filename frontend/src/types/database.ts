// Database types generated from Supabase schema
// This file will be auto-generated in production using `supabase gen types`

export type Database = {
  public: {
    Tables: {
      agents: {
        Row: {
          id: string;
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
      command_presets: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          command: string;
          arguments: Record<string, any> | null;
          category: string | null;
          icon: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['command_presets']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['command_presets']['Insert']>;
      };
      trace_entries: {
        Row: {
          id: string;
          command_id: string | null;
          agent_id: string;
          parent_id: string | null;
          type: 'request' | 'response' | 'thought' | 'action' | 'observation' | 'error';
          content: Record<string, any>;
          metadata: Record<string, any> | null;
          timestamp: string;
          duration_ms: number | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['trace_entries']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['trace_entries']['Insert']>;
      };
      investigation_reports: {
        Row: {
          id: string;
          command_id: string;
          agent_id: string;
          title: string;
          summary: string;
          findings: Record<string, any>;
          recommendations: string[] | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['investigation_reports']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['investigation_reports']['Insert']>;
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          details: Record<string, any> | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>;
      };
      execution_constraints: {
        Row: {
          id: string;
          agent_id: string | null;
          max_execution_time: number | null;
          max_memory_mb: number | null;
          allowed_commands: string[] | null;
          blocked_commands: string[] | null;
          environment_variables: Record<string, string> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['execution_constraints']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['execution_constraints']['Insert']>;
      };
      command_queue: {
        Row: {
          id: string;
          command_id: string;
          agent_id: string | null;
          position: number;
          priority: number;
          estimated_duration_ms: number | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['command_queue']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['command_queue']['Insert']>;
      };
    };
    Views: {
      agent_statistics: {
        Row: {
          agent_id: string;
          total_commands: number;
          successful_commands: number;
          failed_commands: number;
          average_execution_time_ms: number;
          last_active: string;
        };
      };
      command_history: {
        Row: {
          id: string;
          agent_name: string;
          command: string;
          status: string;
          duration_ms: number | null;
          created_at: string;
        };
      };
    };
    Functions: {
      get_agent_availability: {
        Args: Record<string, never>;
        Returns: Array<{
          agent_id: string;
          agent_name: string;
          status: string;
          queue_length: number;
        }>;
      };
      calculate_command_priority: {
        Args: {
          command_type: string;
          user_priority?: number;
        };
        Returns: number;
      };
    };
    Enums: {
      agent_status: 'connected' | 'disconnected' | 'busy' | 'error';
      agent_type: 'claude' | 'gemini' | 'codex' | 'custom';
      command_status: 'pending' | 'queued' | 'executing' | 'completed' | 'failed' | 'cancelled';
      trace_entry_type: 'request' | 'response' | 'thought' | 'action' | 'observation' | 'error';
      terminal_output_type: 'stdout' | 'stderr' | 'system';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};