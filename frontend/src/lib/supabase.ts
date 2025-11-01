import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client for use in Client Components
export const supabase = createClientComponentClient<Database>();

// Standard client for use in Server Components and API routes
export const supabaseClient = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  },
);

// Auth helpers
export const auth = {
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  },

  async signUp(email: string, password: string, metadata?: Record<string, any>) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });

    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  async getUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  },

  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback);
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

  unsubscribe(subscription: any) {
    supabase.removeChannel(subscription);
  },
};

// Storage helpers
export const storage = {
  async uploadAgentLog(file: File, agentId: string) {
    const fileName = `${agentId}/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from('agent-logs')
      .upload(fileName, file);

    if (error) throw error;
    return data;
  },

  async uploadCommandOutput(file: File, commandId: string) {
    const fileName = `${commandId}/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from('command-outputs')
      .upload(fileName, file);

    if (error) throw error;
    return data;
  },

  async uploadTraceExport(file: File, traceId: string) {
    const fileName = `${traceId}/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from('trace-exports')
      .upload(fileName, file);

    if (error) throw error;
    return data;
  },

  async getPublicUrl(bucket: string, path: string) {
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    return data.publicUrl;
  },

  async downloadFile(bucket: string, path: string) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path);

    if (error) throw error;
    return data;
  },
};

export default supabase;