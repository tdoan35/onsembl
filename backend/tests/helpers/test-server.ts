import Fastify, { FastifyInstance } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../../src/types/database';

export interface TestContext {
  server: FastifyInstance;
  supabase: ReturnType<typeof createClient<Database>>;
  cleanup: () => Promise<void>;
}

export async function createTestServer(): Promise<TestContext> {
  const server = Fastify({
    logger: false,
  });

  // Initialize Supabase test client
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Register plugins and routes will be done in individual tests

  const cleanup = async () => {
    await server.close();
  };

  return {
    server,
    supabase,
    cleanup,
  };
}

export async function authenticateTestUser(supabase: ReturnType<typeof createClient>) {
  const { data: { user }, error } = await supabase.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'testpassword123',
  });

  if (error && error.message.includes('Invalid login')) {
    // Create test user if it doesn't exist
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: 'test@example.com',
      password: 'testpassword123',
    });

    if (signUpError) throw signUpError;
    return signUpData.session?.access_token;
  }

  if (error) throw error;

  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

export function generateTestAgent(overrides?: Partial<any>) {
  return {
    name: 'test-agent',
    type: 'claude' as const,
    status: 'online' as const,
    version: '1.0.0',
    capabilities: ['code_execution', 'file_operations'],
    ...overrides,
  };
}

export function generateTestCommand(agentId: string, overrides?: Partial<any>) {
  return {
    agent_id: agentId,
    command: 'echo "test"',
    arguments: {},
    priority: 1,
    ...overrides,
  };
}