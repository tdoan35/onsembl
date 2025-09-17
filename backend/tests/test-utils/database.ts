import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../src/types/database';

let supabaseClient: SupabaseClient<Database> | null = null;

export async function setupTestDatabase() {
  // Create Supabase client
  supabaseClient = createClient<Database>(
    process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  );

  // Clean up any existing test data
  await cleanupTestDatabase();

  // Create test user
  const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
    email: 'test@example.com',
    password: 'testpassword123',
    email_confirm: true,
  });

  if (authError && !authError.message.includes('already been registered')) {
    throw authError;
  }

  return supabaseClient;
}

export async function cleanupTestDatabase() {
  if (!supabaseClient) return;

  try {
    // Clean up test data in reverse order of dependencies
    await supabaseClient.from('trace_entries').delete().match({ id: { neq: '00000000-0000-0000-0000-000000000000' } });
    await supabaseClient.from('terminal_outputs').delete().match({ id: { neq: '00000000-0000-0000-0000-000000000000' } });
    await supabaseClient.from('commands').delete().match({ id: { neq: '00000000-0000-0000-0000-000000000000' } });
    await supabaseClient.from('agents').delete().match({ id: { neq: '00000000-0000-0000-0000-000000000000' } });
    await supabaseClient.from('command_presets').delete().match({ id: { neq: '00000000-0000-0000-0000-000000000000' } });
    await supabaseClient.from('investigation_reports').delete().match({ id: { neq: '00000000-0000-0000-0000-000000000000' } });
    await supabaseClient.from('audit_logs').delete().match({ id: { neq: '00000000-0000-0000-0000-000000000000' } });
  } catch (error) {
    console.error('Error cleaning up test database:', error);
  }
}

export function getTestSupabaseClient() {
  if (!supabaseClient) {
    throw new Error('Test database not initialized. Call setupTestDatabase first.');
  }
  return supabaseClient;
}