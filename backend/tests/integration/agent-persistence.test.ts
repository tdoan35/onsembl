/**
 * Integration test for agent persistence with Supabase
 * Tests agent data storage and retrieval with database
 */

import { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

describe('Agent Persistence with Supabase', () => {
  let server: FastifyInstance;
  let supabase: SupabaseClient | null = null;
  const testAgentId = `test-agent-${Date.now()}`;

  beforeAll(async () => {
    // Setup Supabase client if configured
    if (process.env['SUPABASE_URL'] && process.env['SUPABASE_ANON_KEY']) {
      supabase = createClient(
        process.env['SUPABASE_URL'],
        process.env['SUPABASE_ANON_KEY']
      );
    }
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }

    // Cleanup test data if Supabase is available
    if (supabase) {
      try {
        await supabase
          .from('agents')
          .delete()
          .eq('id', testAgentId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Agent CRUD operations', () => {
    it('should persist agent registration to database', async () => {
      if (!process.env['SUPABASE_URL'] || !process.env['SUPABASE_ANON_KEY']) {
        console.log('Skipping: Supabase not configured');
        return;
      }

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      // Register an agent
      const registerResponse = await server.inject({
        method: 'POST',
        url: '/api/agents/register',
        headers: {
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json'
        },
        payload: {
          id: testAgentId,
          name: 'Test Agent',
          type: 'claude',
          capabilities: ['code', 'terminal']
        }
      });

      expect(registerResponse.statusCode).toBe(201);

      // Verify agent was persisted
      const { data: agents, error } = await supabase!
        .from('agents')
        .select('*')
        .eq('id', testAgentId);

      expect(error).toBeNull();
      expect(agents).toHaveLength(1);
      expect(agents![0]).toMatchObject({
        id: testAgentId,
        name: 'Test Agent',
        type: 'claude'
      });
    });

    it('should retrieve persisted agents from database', async () => {
      if (!process.env['SUPABASE_URL'] || !process.env['SUPABASE_ANON_KEY']) {
        console.log('Skipping: Supabase not configured');
        return;
      }

      // Insert test agent directly to database
      const { error: insertError } = await supabase!
        .from('agents')
        .insert({
          id: testAgentId,
          name: 'Persisted Agent',
          type: 'gemini',
          status: 'idle',
          capabilities: ['code'],
          created_at: new Date().toISOString()
        });

      expect(insertError).toBeNull();

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      // Fetch agents via API
      const response = await server.inject({
        method: 'GET',
        url: '/api/agents',
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(200);
      const agents = JSON.parse(response.body);

      const testAgent = agents.find((a: any) => a.id === testAgentId);
      expect(testAgent).toBeDefined();
      expect(testAgent).toMatchObject({
        id: testAgentId,
        name: 'Persisted Agent',
        type: 'gemini'
      });
    });

    it('should update agent status in database', async () => {
      if (!process.env['SUPABASE_URL'] || !process.env['SUPABASE_ANON_KEY']) {
        console.log('Skipping: Supabase not configured');
        return;
      }

      // Insert test agent
      await supabase!
        .from('agents')
        .insert({
          id: testAgentId,
          name: 'Status Test Agent',
          type: 'codex',
          status: 'idle',
          created_at: new Date().toISOString()
        });

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      // Update agent status
      const updateResponse = await server.inject({
        method: 'PATCH',
        url: `/api/agents/${testAgentId}/status`,
        headers: {
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json'
        },
        payload: {
          status: 'busy',
          currentCommand: 'test-command'
        }
      });

      expect(updateResponse.statusCode).toBe(200);

      // Verify status was updated in database
      const { data: agents, error } = await supabase!
        .from('agents')
        .select('status, current_command')
        .eq('id', testAgentId)
        .single();

      expect(error).toBeNull();
      expect(agents).toMatchObject({
        status: 'busy',
        current_command: 'test-command'
      });
    });

    it('should delete agent from database', async () => {
      if (!process.env['SUPABASE_URL'] || !process.env['SUPABASE_ANON_KEY']) {
        console.log('Skipping: Supabase not configured');
        return;
      }

      // Insert test agent
      await supabase!
        .from('agents')
        .insert({
          id: testAgentId,
          name: 'Delete Test Agent',
          type: 'claude',
          status: 'idle',
          created_at: new Date().toISOString()
        });

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      // Delete agent
      const deleteResponse = await server.inject({
        method: 'DELETE',
        url: `/api/agents/${testAgentId}`,
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });

      expect(deleteResponse.statusCode).toBe(204);

      // Verify agent was deleted
      const { data: agents, error } = await supabase!
        .from('agents')
        .select('*')
        .eq('id', testAgentId);

      expect(error).toBeNull();
      expect(agents).toHaveLength(0);
    });
  });

  describe('Database connection failures', () => {
    it('should handle database connection loss gracefully', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      // Set invalid database URL to simulate connection failure
      process.env['SUPABASE_URL'] = 'https://invalid.supabase.co';
      process.env['SUPABASE_ANON_KEY'] = 'invalid-key';

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      // Try to fetch agents - should fail gracefully
      const response = await server.inject({
        method: 'GET',
        url: '/api/agents',
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });

      expect([503, 500]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
    });

    it('should use in-memory fallback when database unavailable', async () => {
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_ANON_KEY'];

      delete process.env['SUPABASE_URL'];
      delete process.env['SUPABASE_ANON_KEY'];

      server = await buildServer({
        logger: false,
        disableRequestLogging: true,
        fallbackToMemory: true // Enable in-memory fallback
      });

      await server.listen({ port: 0 });

      // Register agent to in-memory store
      const registerResponse = await server.inject({
        method: 'POST',
        url: '/api/agents/register',
        headers: {
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json'
        },
        payload: {
          id: 'memory-agent',
          name: 'Memory Agent',
          type: 'claude'
        }
      });

      expect(registerResponse.statusCode).toBe(201);

      // Fetch agents from in-memory store
      const fetchResponse = await server.inject({
        method: 'GET',
        url: '/api/agents',
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });

      expect(fetchResponse.statusCode).toBe(200);
      const agents = JSON.parse(fetchResponse.body);
      expect(agents).toContainEqual(
        expect.objectContaining({
          id: 'memory-agent',
          name: 'Memory Agent'
        })
      );

      // Note: Data is not persisted between server restarts
      await server.close();

      const newServer = await buildServer({
        logger: false,
        disableRequestLogging: true,
        fallbackToMemory: true
      });

      await newServer.listen({ port: 0 });

      const newFetchResponse = await newServer.inject({
        method: 'GET',
        url: '/api/agents',
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });

      const newAgents = JSON.parse(newFetchResponse.body);
      expect(newAgents).not.toContainEqual(
        expect.objectContaining({
          id: 'memory-agent'
        })
      );

      await newServer.close();

      // Restore env vars
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
    });
  });

  describe('Agent heartbeat persistence', () => {
    it('should persist agent heartbeats to database', async () => {
      if (!process.env['SUPABASE_URL'] || !process.env['SUPABASE_ANON_KEY']) {
        console.log('Skipping: Supabase not configured');
        return;
      }

      // Insert test agent
      await supabase!
        .from('agents')
        .insert({
          id: testAgentId,
          name: 'Heartbeat Agent',
          type: 'claude',
          status: 'idle',
          last_ping_at: null,
          created_at: new Date().toISOString()
        });

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      // Send heartbeat
      const heartbeatResponse = await server.inject({
        method: 'POST',
        url: `/api/agents/${testAgentId}/heartbeat`,
        headers: {
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json'
        },
        payload: {
          metrics: {
            cpu: 45,
            memory: 2048,
            uptime: 3600
          }
        }
      });

      expect(heartbeatResponse.statusCode).toBe(200);

      // Verify heartbeat was persisted
      const { data: agent, error } = await supabase!
        .from('agents')
        .select('last_ping_at, health_metrics')
        .eq('id', testAgentId)
        .single();

      expect(error).toBeNull();
      expect(agent!.last_ping_at).toBeDefined();
      expect(agent!.health_metrics).toMatchObject({
        cpu: 45,
        memory: 2048,
        uptime: 3600
      });
    });
  });

  describe('Transaction support', () => {
    it('should rollback on transaction failure', async () => {
      if (!process.env['SUPABASE_URL'] || !process.env['SUPABASE_ANON_KEY']) {
        console.log('Skipping: Supabase not configured');
        return;
      }

      server = await buildServer({
        logger: false,
        disableRequestLogging: true
      });

      await server.listen({ port: 0 });

      // Try to create agent with invalid data that will cause transaction to fail
      const response = await server.inject({
        method: 'POST',
        url: '/api/agents/register',
        headers: {
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json'
        },
        payload: {
          id: testAgentId,
          name: 'Transaction Test',
          type: 'invalid-type', // This should cause validation to fail
          capabilities: ['invalid-capability']
        }
      });

      expect(response.statusCode).toBe(400);

      // Verify nothing was persisted
      const { data: agents } = await supabase!
        .from('agents')
        .select('*')
        .eq('id', testAgentId);

      expect(agents).toHaveLength(0);
    });
  });
});