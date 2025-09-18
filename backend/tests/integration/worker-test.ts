/**
 * Quick test to verify BullMQ worker is processing commands
 */

import { CommandService } from '../../src/services/command.service.js';
import { createClient } from '@supabase/supabase-js';
import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

async function testWorker() {
  console.log('Testing BullMQ Worker...\n');

  // Setup Redis connection
  const redisConnection = new Redis(process.env['REDIS_URL'] || 'redis://localhost:6379', {
    maxRetriesPerRequest: null
  });

  // Setup Supabase client - use service key to bypass RLS
  const supabaseUrl = process.env['SUPABASE_URL'] || 'http://127.0.0.1:54321';
  const supabaseKey = process.env['SUPABASE_SERVICE_KEY'] || process.env['SUPABASE_ANON_KEY'] || '';

  if (!supabaseKey) {
    console.error('❌ No Supabase key found. Set SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Create mock Fastify instance with logger
  const mockFastify = {
    log: {
      info: (obj: any, msg?: string) => console.log('ℹ️', msg || '', obj),
      error: (obj: any, msg?: string) => console.error('❌', msg || '', obj),
      warn: (obj: any, msg?: string) => console.warn('⚠️', msg || '', obj),
      debug: (obj: any, msg?: string) => console.log('🔍', msg || '', obj),
    }
  } as FastifyInstance;

  // Create CommandService
  const commandService = new CommandService(supabase, mockFastify, redisConnection);

  console.log('✅ CommandService created with worker\n');

  // Listen for events
  commandService.on('command:created', (command) => {
    console.log('📝 Command created:', command.id);
  });

  commandService.on('command:queued', (command, queueItem) => {
    console.log('📋 Command queued:', command.id, 'Position:', queueItem.position);
  });

  commandService.on('command:started', (command) => {
    console.log('🚀 Command started:', command.id);
  });

  commandService.on('command:completed', (command) => {
    console.log('✅ Command completed:', command.id);
  });

  commandService.on('command:failed', (command, error) => {
    console.log('❌ Command failed:', command.id, error);
  });

  // Create test agent first
  console.log('Creating test agent...\n');

  const testAgentId = 'a1b2c3d4-e5f6-4789-0123-456789abcdef';

  // Insert agent directly into database
  const { error: agentError } = await supabase
    .from('agents')
    .upsert({
      id: testAgentId,
      name: 'Test Worker Agent',
      type: 'claude',
      status: 'connected',
      last_ping: new Date().toISOString()
    });

  if (agentError) {
    console.log('Note: Agent might already exist:', agentError.message);
  }

  // Create a test command
  console.log('Creating test command...\n');

  const { command, queueItem } = await commandService.createCommand(testAgentId, {
    type: 'NATURAL',
    prompt: 'Test command to verify worker is processing',
    priority: 100
  });

  console.log(`Command created: ${command.id}`);
  console.log(`Queue position: ${queueItem.position}\n`);

  // Execute the command (this should trigger the worker)
  console.log('Executing command...\n');
  await commandService.executeCommand(command.id);

  // Get queue metrics
  const metrics = await commandService.getQueueMetrics();
  console.log('\nQueue Metrics:', metrics);

  // Wait for processing
  console.log('\nWaiting for worker to process command...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Check final command status
  const finalCommand = await commandService.getCommand(command.id);
  console.log('\nFinal command status:', finalCommand.status);
  console.log('Command details:', {
    id: finalCommand.id,
    status: finalCommand.status,
    created_at: finalCommand.created_at,
    started_at: finalCommand.started_at,
    completed_at: finalCommand.completed_at,
    error: finalCommand.error
  });

  // Cleanup
  console.log('\nCleaning up...');
  await commandService.cleanup();
  await redisConnection.quit();

  console.log('✅ Test complete!');
  process.exit(0);
}

// Run the test
testWorker().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});