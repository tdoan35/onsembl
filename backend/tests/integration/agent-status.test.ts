import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { createTestServer, closeTestServer, generateTestToken } from '../utils/test-server';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';

describe('Integration: Agent Connection and Status Display', () => {
  let server: FastifyInstance;
  let wsUrl: string;
  let apiUrl: string;
  let authToken: string;

  // Store agent states
  const agentStates = new Map<string, any>();

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);

    // Register WebSocket plugin
    await server.register(require('@fastify/websocket'));

    // Mock Supabase realtime updates
    const realtimeUpdates: any[] = [];

    // Agent WebSocket endpoint
    server.register(async function (fastify) {
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        const socket = connection.socket;
        let agentId: string | null = null;

        socket.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
              case 'AGENT_CONNECT':
                agentId = data.payload.agentId;

                // Update agent state
                const agentState = {
                  id: agentId,
                  name: data.payload.name,
                  type: data.payload.type,
                  status: 'ONLINE',
                  activityState: 'IDLE',
                  hostMachine: data.payload.hostMachine || 'localhost',
                  version: data.payload.version || '1.0.0',
                  capabilities: data.payload.capabilities || [],
                  lastSeen: new Date().toISOString(),
                  connectionTime: new Date().toISOString(),
                  metrics: {
                    cpuUsage: 0,
                    memoryUsage: 0,
                    activeCommands: 0,
                  },
                };

                agentStates.set(agentId, agentState);

                // Send connection acknowledgment
                socket.send(JSON.stringify({
                  type: 'CONNECTION_ACK',
                  payload: {
                    agentId,
                    connectionId: `conn-${Date.now()}`,
                    serverTime: new Date().toISOString(),
                  },
                }));

                // Simulate Supabase realtime update
                realtimeUpdates.push({
                  type: 'INSERT',
                  table: 'agents',
                  record: agentState,
                });

                // Broadcast status update to dashboards
                server.websocketServer?.clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN && client !== socket) {
                    client.send(JSON.stringify({
                      type: 'AGENT_STATUS_UPDATE',
                      payload: agentState,
                    }));
                  }
                });
                break;

              case 'AGENT_HEARTBEAT':
                if (!agentId) return;

                const agent = agentStates.get(agentId);
                if (agent) {
                  agent.lastSeen = new Date().toISOString();
                  if (data.payload.metrics) {
                    agent.metrics = { ...agent.metrics, ...data.payload.metrics };
                  }
                  agentStates.set(agentId, agent);
                }

                socket.send(JSON.stringify({
                  type: 'HEARTBEAT_ACK',
                  payload: {
                    timestamp: data.payload.timestamp,
                    serverTime: new Date().toISOString(),
                  },
                }));
                break;

              case 'AGENT_STATUS_CHANGE':
                if (!agentId) return;

                const updatedAgent = agentStates.get(agentId);
                if (updatedAgent) {
                  updatedAgent.status = data.payload.status;
                  updatedAgent.activityState = data.payload.activityState || updatedAgent.activityState;
                  updatedAgent.lastSeen = new Date().toISOString();
                  agentStates.set(agentId, updatedAgent);

                  // Broadcast update
                  server.websocketServer?.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN && client !== socket) {
                      client.send(JSON.stringify({
                        type: 'AGENT_STATUS_UPDATE',
                        payload: updatedAgent,
                      }));
                    }
                  });
                }
                break;
            }
          } catch (error) {
            socket.send(JSON.stringify({
              type: 'ERROR',
              payload: {
                code: 'INVALID_MESSAGE',
                message: 'Invalid JSON message',
              },
            }));
          }
        });

        socket.on('close', () => {
          if (agentId) {
            const agent = agentStates.get(agentId);
            if (agent) {
              agent.status = 'OFFLINE';
              agent.disconnectedAt = new Date().toISOString();
              agentStates.set(agentId, agent);

              // Broadcast disconnection
              server.websocketServer?.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'AGENT_STATUS_UPDATE',
                    payload: agent,
                  }));
                }
              });
            }
          }
        });
      });

      // Dashboard WebSocket endpoint
      fastify.get('/ws/dashboard', { websocket: true }, (connection, req) => {
        const socket = connection.socket;

        socket.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());

            if (data.type === 'SUBSCRIBE_AGENTS') {
              // Send current agent states
              const agents = Array.from(agentStates.values());
              socket.send(JSON.stringify({
                type: 'AGENTS_SNAPSHOT',
                payload: { agents },
              }));
            }
          } catch (error) {
            socket.send(JSON.stringify({
              type: 'ERROR',
              payload: {
                code: 'INVALID_MESSAGE',
                message: 'Invalid JSON message',
              },
            }));
          }
        });
      });
    });

    // REST API endpoints
    server.get('/agents', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      const agents = Array.from(agentStates.values());
      return reply.code(200).send({ agents });
    });

    server.get('/agents/:id', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const agent = agentStates.get(id);

      if (!agent) {
        return reply.code(404).send({
          error: 'Agent not found',
        });
      }

      return reply.code(200).send(agent);
    });

    await server.ready();
    await server.listen({ port: 0 });

    const address = server.server.address() as any;
    wsUrl = `ws://localhost:${address.port}`;
    apiUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    agentStates.clear();
    await closeTestServer(server);
  });

  afterEach(() => {
    agentStates.clear();
  });

  describe('Agent Connection Flow', () => {
    it('should show agent as ONLINE when connected', async () => {
      const agentId = uuidv4();
      const agentName = 'test-agent-1';
      const agentType = 'CLAUDE';

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          name: agentName,
          type: agentType,
          token: 'agent-token',
          version: '1.0.0',
          capabilities: ['code_execution', 'file_management'],
        },
      }));

      // Wait for connection acknowledgment
      await new Promise<void>((resolve) => {
        agentWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('CONNECTION_ACK');
          expect(message.payload.agentId).toBe(agentId);
          resolve();
        });
      });

      // Check agent status via REST API
      const response = await server.inject({
        method: 'GET',
        url: `/agents/${agentId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const agent = response.json();

      expect(agent.id).toBe(agentId);
      expect(agent.name).toBe(agentName);
      expect(agent.type).toBe(agentType);
      expect(agent.status).toBe('ONLINE');
      expect(agent.activityState).toBe('IDLE');
      expect(agent.capabilities).toContain('code_execution');

      agentWs.close();
    });

    it('should update agent status to OFFLINE on disconnection', async () => {
      const agentId = uuidv4();

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          name: 'disconnect-test',
          type: 'GEMINI',
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Verify agent is online
      let response = await server.inject({
        method: 'GET',
        url: `/agents/${agentId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('ONLINE');

      // Disconnect agent
      agentWs.close();

      // Wait a bit for status update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify agent is offline
      response = await server.inject({
        method: 'GET',
        url: `/agents/${agentId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const agent = response.json();
      expect(agent.status).toBe('OFFLINE');
      expect(agent.disconnectedAt).toBeDefined();
    });

    it('should track multiple agents independently', async () => {
      const agents = [
        { id: uuidv4(), name: 'agent-1', type: 'CLAUDE' },
        { id: uuidv4(), name: 'agent-2', type: 'GEMINI' },
        { id: uuidv4(), name: 'agent-3', type: 'CODEX' },
      ];

      const connections: WebSocket[] = [];

      // Connect all agents
      for (const agent of agents) {
        const ws = new WebSocket(`${wsUrl}/ws/agent`);
        connections.push(ws);

        await new Promise<void>((resolve) => {
          ws.once('open', () => resolve());
        });

        ws.send(JSON.stringify({
          type: 'AGENT_CONNECT',
          payload: {
            agentId: agent.id,
            name: agent.name,
            type: agent.type,
            token: 'agent-token',
          },
        }));

        await new Promise<void>((resolve) => {
          ws.once('message', () => resolve());
        });
      }

      // Check all agents are online
      const response = await server.inject({
        method: 'GET',
        url: '/agents',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.agents).toHaveLength(3);
      body.agents.forEach((agent: any) => {
        expect(agent.status).toBe('ONLINE');
        expect(agents.map(a => a.id)).toContain(agent.id);
      });

      // Disconnect one agent
      connections[0].close();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Check status update
      const statusResponse = await server.inject({
        method: 'GET',
        url: '/agents',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const updatedAgents = statusResponse.json().agents;
      const offlineAgent = updatedAgents.find((a: any) => a.id === agents[0].id);
      const onlineAgents = updatedAgents.filter((a: any) => a.id !== agents[0].id);

      expect(offlineAgent.status).toBe('OFFLINE');
      onlineAgents.forEach((agent: any) => {
        expect(agent.status).toBe('ONLINE');
      });

      // Clean up
      connections.slice(1).forEach(ws => ws.close());
    });
  });

  describe('Real-time Status Updates', () => {
    it('should broadcast agent status changes to dashboard', async () => {
      const agentId = uuidv4();

      // Connect dashboard
      const dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      // Subscribe to agents
      dashboardWs.send(JSON.stringify({
        type: 'SUBSCRIBE_AGENTS',
      }));

      // Should receive initial snapshot
      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('AGENTS_SNAPSHOT');
          expect(message.payload.agents).toEqual([]);
          resolve();
        });
      });

      // Set up listener for status update
      const statusUpdatePromise = new Promise<any>((resolve) => {
        dashboardWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'AGENT_STATUS_UPDATE') {
            resolve(message.payload);
          }
        });
      });

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          name: 'broadcast-test',
          type: 'CLAUDE',
          token: 'agent-token',
        },
      }));

      // Dashboard should receive status update
      const statusUpdate = await statusUpdatePromise;
      expect(statusUpdate.id).toBe(agentId);
      expect(statusUpdate.status).toBe('ONLINE');

      agentWs.close();
      dashboardWs.close();
    });

    it('should update activity state when agent processes commands', async () => {
      const agentId = uuidv4();

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          name: 'activity-test',
          type: 'CLAUDE',
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Update activity state to PROCESSING
      agentWs.send(JSON.stringify({
        type: 'AGENT_STATUS_CHANGE',
        payload: {
          status: 'ONLINE',
          activityState: 'PROCESSING',
        },
      }));

      await new Promise(resolve => setTimeout(resolve, 100));

      // Check updated state
      const response = await server.inject({
        method: 'GET',
        url: `/agents/${agentId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const agent = response.json();
      expect(agent.activityState).toBe('PROCESSING');

      agentWs.close();
    });
  });

  describe('Agent Heartbeat and Metrics', () => {
    it('should update agent metrics from heartbeat', async () => {
      const agentId = uuidv4();

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          name: 'metrics-test',
          type: 'CLAUDE',
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Send heartbeat with metrics
      agentWs.send(JSON.stringify({
        type: 'AGENT_HEARTBEAT',
        payload: {
          timestamp: new Date().toISOString(),
          metrics: {
            cpuUsage: 45.5,
            memoryUsage: 67.8,
            activeCommands: 2,
          },
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'HEARTBEAT_ACK') {
            resolve();
          }
        });
      });

      // Check metrics were updated
      const response = await server.inject({
        method: 'GET',
        url: `/agents/${agentId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const agent = response.json();
      expect(agent.metrics.cpuUsage).toBe(45.5);
      expect(agent.metrics.memoryUsage).toBe(67.8);
      expect(agent.metrics.activeCommands).toBe(2);

      agentWs.close();
    });

    it('should track last seen timestamp', async () => {
      const agentId = uuidv4();

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          name: 'lastseen-test',
          type: 'CLAUDE',
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      const initialTime = Date.now();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 500));

      // Send heartbeat
      agentWs.send(JSON.stringify({
        type: 'AGENT_HEARTBEAT',
        payload: {
          timestamp: new Date().toISOString(),
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Check last seen was updated
      const response = await server.inject({
        method: 'GET',
        url: `/agents/${agentId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const agent = response.json();
      const lastSeenTime = new Date(agent.lastSeen).getTime();
      expect(lastSeenTime).toBeGreaterThan(initialTime);

      agentWs.close();
    });
  });

  describe('Agent Type and Capabilities', () => {
    it('should track different agent types', async () => {
      const agentTypes = ['CLAUDE', 'GEMINI', 'CODEX'];
      const connections: WebSocket[] = [];

      for (const type of agentTypes) {
        const ws = new WebSocket(`${wsUrl}/ws/agent`);
        connections.push(ws);

        await new Promise<void>((resolve) => {
          ws.once('open', () => resolve());
        });

        ws.send(JSON.stringify({
          type: 'AGENT_CONNECT',
          payload: {
            agentId: uuidv4(),
            name: `${type.toLowerCase()}-agent`,
            type,
            token: 'agent-token',
            capabilities: type === 'CLAUDE'
              ? ['code_execution', 'file_management', 'web_search']
              : type === 'GEMINI'
              ? ['code_execution', 'image_processing']
              : ['code_completion'],
          },
        }));

        await new Promise<void>((resolve) => {
          ws.once('message', () => resolve());
        });
      }

      // Check all agent types
      const response = await server.inject({
        method: 'GET',
        url: '/agents',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const types = new Set(body.agents.map((a: any) => a.type));
      expect(types.size).toBe(3);
      expect(Array.from(types)).toEqual(expect.arrayContaining(agentTypes));

      // Check capabilities
      const claudeAgent = body.agents.find((a: any) => a.type === 'CLAUDE');
      expect(claudeAgent.capabilities).toContain('web_search');

      // Clean up
      connections.forEach(ws => ws.close());
    });
  });

  describe('Error Scenarios', () => {
    it('should handle agent reconnection', async () => {
      const agentId = uuidv4();

      // First connection
      let agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          name: 'reconnect-test',
          type: 'CLAUDE',
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Disconnect
      agentWs.close();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Reconnect with same ID
      agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          name: 'reconnect-test',
          type: 'CLAUDE',
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Check agent is online again
      const response = await server.inject({
        method: 'GET',
        url: `/agents/${agentId}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('ONLINE');

      agentWs.close();
    });
  });
});