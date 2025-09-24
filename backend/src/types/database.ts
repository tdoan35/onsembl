export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      agents: {
        Row: {
          id: string
          user_id: string
          name: string
          type: 'claude' | 'gemini' | 'codex' | 'custom'
          status: 'online' | 'offline' | 'executing' | 'error' | 'maintenance'
          version: string
          capabilities: string[]
          last_ping: string | null
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type: 'claude' | 'gemini' | 'codex' | 'custom'
          status?: 'online' | 'offline' | 'executing' | 'error' | 'maintenance'
          version: string
          capabilities?: string[]
          last_ping?: string | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: 'claude' | 'gemini' | 'codex' | 'custom'
          status?: 'online' | 'offline' | 'executing' | 'error' | 'maintenance'
          version?: string
          capabilities?: string[]
          last_ping?: string | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      commands: {
        Row: {
          id: string
          user_id: string
          agent_id: string
          command: string
          arguments: Json | null
          status: 'pending' | 'queued' | 'executing' | 'completed' | 'failed' | 'cancelled'
          priority: number
          result: Json | null
          error: string | null
          started_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          agent_id: string
          command: string
          arguments?: Json | null
          status?: 'pending' | 'queued' | 'executing' | 'completed' | 'failed' | 'cancelled'
          priority?: number
          result?: Json | null
          error?: string | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          agent_id?: string
          command?: string
          arguments?: Json | null
          status?: 'pending' | 'queued' | 'executing' | 'completed' | 'failed' | 'cancelled'
          priority?: number
          result?: Json | null
          error?: string | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      terminal_outputs: {
        Row: {
          id: string
          command_id: string
          agent_id: string
          output: string
          type: 'stdout' | 'stderr' | 'system'
          timestamp: string
          created_at: string
        }
        Insert: {
          id?: string
          command_id: string
          agent_id: string
          output: string
          type: 'stdout' | 'stderr' | 'system'
          timestamp: string
          created_at?: string
        }
        Update: {
          id?: string
          command_id?: string
          agent_id?: string
          output?: string
          type?: 'stdout' | 'stderr' | 'system'
          timestamp?: string
          created_at?: string
        }
      }
      command_presets: {
        Row: {
          id: string
          name: string
          description: string | null
          command: string
          arguments: Json | null
          category: string | null
          is_public: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          command: string
          arguments?: Json | null
          category?: string | null
          is_public?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          command?: string
          arguments?: Json | null
          category?: string | null
          is_public?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      trace_entries: {
        Row: {
          id: string
          command_id: string | null
          agent_id: string
          parent_id: string | null
          type: 'request' | 'response' | 'thought' | 'action' | 'observation' | 'error'
          content: Json
          metadata: Json | null
          timestamp: string
          duration_ms: number | null
          created_at: string
        }
        Insert: {
          id?: string
          command_id?: string | null
          agent_id: string
          parent_id?: string | null
          type: 'request' | 'response' | 'thought' | 'action' | 'observation' | 'error'
          content: Json
          metadata?: Json | null
          timestamp: string
          duration_ms?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          command_id?: string | null
          agent_id?: string
          parent_id?: string | null
          type?: 'request' | 'response' | 'thought' | 'action' | 'observation' | 'error'
          content?: Json
          metadata?: Json | null
          timestamp?: string
          duration_ms?: number | null
          created_at?: string
        }
      }
      investigation_reports: {
        Row: {
          id: string
          command_id: string
          agent_id: string
          title: string
          summary: string
          findings: Json
          recommendations: string[] | null
          created_at: string
        }
        Insert: {
          id?: string
          command_id: string
          agent_id: string
          title: string
          summary: string
          findings: Json
          recommendations?: string[] | null
          created_at?: string
        }
        Update: {
          id?: string
          command_id?: string
          agent_id?: string
          title?: string
          summary?: string
          findings?: Json
          recommendations?: string[] | null
          created_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string | null
          action: string
          resource_type: string | null
          resource_id: string | null
          details: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          action: string
          resource_type?: string | null
          resource_id?: string | null
          details?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          action?: string
          resource_type?: string | null
          resource_id?: string | null
          details?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
      }
      execution_constraints: {
        Row: {
          id: string
          agent_id: string
          max_concurrent_commands: number | null
          max_cpu_percent: number | null
          max_memory_mb: number | null
          max_execution_time_ms: number | null
          allowed_commands: string[] | null
          blocked_commands: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agent_id: string
          max_concurrent_commands?: number | null
          max_cpu_percent?: number | null
          max_memory_mb?: number | null
          max_execution_time_ms?: number | null
          allowed_commands?: string[] | null
          blocked_commands?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agent_id?: string
          max_concurrent_commands?: number | null
          max_cpu_percent?: number | null
          max_memory_mb?: number | null
          max_execution_time_ms?: number | null
          allowed_commands?: string[] | null
          blocked_commands?: string[] | null
          created_at?: string
          updated_at?: string
        }
      }
      command_queue: {
        Row: {
          id: string
          command_id: string
          agent_id: string | null
          position: number
          priority: number
          estimated_duration_ms: number | null
          created_at: string
        }
        Insert: {
          id?: string
          command_id: string
          agent_id?: string | null
          position: number
          priority?: number
          estimated_duration_ms?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          command_id?: string
          agent_id?: string | null
          position?: number
          priority?: number
          estimated_duration_ms?: number | null
          created_at?: string
        }
      }
      cli_tokens: {
        Row: {
          id: string
          user_id: string
          device_code: string
          user_code: string
          access_token: string | null
          refresh_token: string | null
          expires_at: string | null
          refresh_expires_at: string | null
          is_revoked: boolean
          scopes: string[]
          device_name: string | null
          last_used_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          device_code: string
          user_code: string
          access_token?: string | null
          refresh_token?: string | null
          expires_at?: string | null
          refresh_expires_at?: string | null
          is_revoked?: boolean
          scopes?: string[]
          device_name?: string | null
          last_used_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          device_code?: string
          user_code?: string
          access_token?: string | null
          refresh_token?: string | null
          expires_at?: string | null
          refresh_expires_at?: string | null
          is_revoked?: boolean
          scopes?: string[]
          device_name?: string | null
          last_used_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_trace_tree: {
        Args: { p_command_id: string }
        Returns: {
          id: string
          parent_id: string | null
          type: string
          content: Json
          metadata: Json | null
          timestamp: string
          duration_ms: number | null
          depth: number
        }[]
      }
      search_investigation_reports: {
        Args: {
          search_text: string
          agent_filter?: string
          limit_count?: number
        }
        Returns: {
          id: string
          command_id: string
          agent_id: string
          title: string
          summary: string
          findings: Json
          recommendations: string[] | null
          created_at: string
          rank: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}