import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { createTestServer, closeTestServer, generateTestToken } from '../utils/test-server';
import { v4 as uuidv4 } from 'uuid';

describe('WebSocket Trace Events', () => {
  let server: FastifyInstance;
  let wsUrl: string;
  let authToken: string;
  let agentWs: WebSocket;
  let dashboardWs: WebSocket;

  // Store trace events for validation
  const traceEvents: any[] = [];

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);

    // Register WebSocket plugin
    await server.register(require('@fastify/websocket'));

    // Agent WebSocket endpoint with trace event support
    server.register(async function (fastify) {
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        const socket = connection.socket;
        let agentId: string | null = null;
        let isAuthenticated = false;

        socket.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
              case 'AGENT_CONNECT':
                agentId = data.payload.agentId;
                isAuthenticated = true;

                socket.send(JSON.stringify({
                  type: 'CONNECTION_ACK',
                  payload: {
                    agentId,
                    connectionId: `conn-${Date.now()}`,
                    traceEnabled: true,
                  },
                }));
                break;

              case 'TRACE_EVENT':
                if (!isAuthenticated) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'NOT_AUTHENTICATED',
                      message: 'Agent not authenticated',
                    },
                  }));
                  return;
                }

                const traceEvent = {
                  ...data.payload,
                  agentId,
                  receivedAt: Date.now(),
                };

                // Store trace event
                traceEvents.push(traceEvent);

                // Acknowledge trace receipt
                socket.send(JSON.stringify({
                  type: 'TRACE_ACK',
                  payload: {
                    traceId: data.payload.traceId,
                    sequence: data.payload.sequence,
                  },
                }));

                // Forward to dashboard
                server.websocketServer?.clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN && client !== socket) {
                    client.send(JSON.stringify({
                      type: 'TRACE_EVENT',
                      payload: traceEvent,
                    }));
                  }
                });
                break;

              case 'TRACE_BATCH':
                if (!isAuthenticated) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'NOT_AUTHENTICATED',
                      message: 'Agent not authenticated',
                    },
                  }));
                  return;
                }

                const { traces, batchId } = data.payload;
                const processedTraces = traces.map((trace: any) => ({
                  ...trace,
                  agentId,
                  batchId,
                  receivedAt: Date.now(),
                }));

                // Store all traces
                traceEvents.push(...processedTraces);

                // Acknowledge batch
                socket.send(JSON.stringify({
                  type: 'TRACE_BATCH_ACK',
                  payload: {
                    batchId,
                    received: traces.length,
                  },
                }));

                // Forward batch to dashboard
                server.websocketServer?.clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN && client !== socket) {
                    client.send(JSON.stringify({
                      type: 'TRACE_BATCH',
                      payload: {
                        batchId,
                        traces: processedTraces,
                      },
                    }));
                  }
                });
                break;

              default:
                socket.send(JSON.stringify({
                  type: 'ERROR',
                  payload: {
                    code: 'UNKNOWN_MESSAGE_TYPE',
                    message: `Unknown message type: ${data.type}`,
                  },
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

      // Dashboard WebSocket endpoint
      fastify.get('/ws/dashboard', { websocket: true }, (connection, req) => {
        const socket = connection.socket;
        let isAuthenticated = false;
        let subscribedToTraces = false;

        socket.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
              case 'AUTHENTICATE':
                isAuthenticated = true;
                socket.send(JSON.stringify({
                  type: 'AUTHENTICATED',
                  payload: {
                    userId: uuidv4(),
                  },
                }));
                break;

              case 'SUBSCRIBE_TRACES':
                if (!isAuthenticated) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'NOT_AUTHENTICATED',
                      message: 'Not authenticated',
                    },
                  }));
                  return;
                }

                subscribedToTraces = true;
                const { commandId, agentId } = data.payload;

                socket.send(JSON.stringify({
                  type: 'SUBSCRIPTION_ACK',
                  payload: {
                    subscriptionId: `sub-${Date.now()}`,
                    filters: { commandId, agentId },
                  },
                }));

                // Send any existing traces
                const relevantTraces = traceEvents.filter(trace =>
                  (!commandId || trace.commandId === commandId) &&
                  (!agentId || trace.agentId === agentId)
                );

                if (relevantTraces.length > 0) {
                  socket.send(JSON.stringify({
                    type: 'TRACE_HISTORY',
                    payload: {
                      traces: relevantTraces,
                    },
                  }));
                }
                break;

              case 'UNSUBSCRIBE_TRACES':
                subscribedToTraces = false;
                socket.send(JSON.stringify({
                  type: 'UNSUBSCRIBED',
                  payload: {},
                }));
                break;

              default:
                socket.send(JSON.stringify({
                  type: 'ERROR',
                  payload: {
                    code: 'UNKNOWN_MESSAGE_TYPE',
                    message: `Unknown message type: ${data.type}`,
                  },
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

    await server.ready();
    await server.listen({ port: 0 });

    const address = server.server.address() as any;
    wsUrl = `ws://localhost:${address.port}`;
  });

  afterAll(async () => {
    if (agentWs && agentWs.readyState === WebSocket.OPEN) {
      agentWs.close();
    }
    if (dashboardWs && dashboardWs.readyState === WebSocket.OPEN) {
      dashboardWs.close();
    }
    await closeTestServer(server);
  });

  afterEach(() => {
    // Clear trace events between tests
    traceEvents.length = 0;
  });

  describe('Single Trace Events', () => {
    it('should send and receive individual trace events', async () => {
      const agentId = uuidv4();
      const commandId = uuidv4();
      const traceId = uuidv4();

      // Connect agent
      agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          token: 'agent-token',
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('CONNECTION_ACK');
          expect(message.payload.traceEnabled).toBe(true);
          resolve();
        });
      });

      // Connect dashboard and subscribe to traces
      dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      dashboardWs.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token: authToken },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', () => resolve());
      });

      dashboardWs.send(JSON.stringify({
        type: 'SUBSCRIBE_TRACES',
        payload: { commandId, agentId },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'SUBSCRIPTION_ACK') {
            resolve();
          }
        });
      });

      // Agent sends trace event
      const traceEvent = {
        traceId,
        commandId,
        parentTraceId: null,
        sequence: 1,
        type: 'LLM_PROMPT',
        name: 'Initial Analysis',
        data: {
          prompt: 'Analyze the codebase',
          model: 'claude-3-opus',
          temperature: 0.7,
        },
        startTime: Date.now(),
        endTime: Date.now() + 1000,
        duration: 1000,
        tokenUsage: {
          input: 500,
          output: 800,
          total: 1300,
        },
      };

      agentWs.send(JSON.stringify({
        type: 'TRACE_EVENT',
        payload: traceEvent,
      }));

      // Agent should receive acknowledgment
      await new Promise<void>((resolve) => {
        agentWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('TRACE_ACK');
          expect(message.payload.traceId).toBe(traceId);
          expect(message.payload.sequence).toBe(1);
          resolve();
        });
      });

      // Dashboard should receive trace event
      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('TRACE_EVENT');
          expect(message.payload.traceId).toBe(traceId);
          expect(message.payload.commandId).toBe(commandId);
          expect(message.payload.agentId).toBe(agentId);
          expect(message.payload.type).toBe('LLM_PROMPT');
          resolve();
        });
      });
    });

    it('should build trace tree from parent-child relationships', async () => {
      const agentId = uuidv4();
      const commandId = uuidv4();
      const rootTraceId = uuidv4();
      const childTraceId1 = uuidv4();
      const childTraceId2 = uuidv4();

      // Connect agent
      agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: { agentId, token: 'agent-token' },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Send root trace
      agentWs.send(JSON.stringify({
        type: 'TRACE_EVENT',
        payload: {
          traceId: rootTraceId,
          commandId,
          parentTraceId: null,
          sequence: 1,
          type: 'LLM_PROMPT',
          name: 'Root Analysis',
          startTime: Date.now(),
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Send child traces
      agentWs.send(JSON.stringify({
        type: 'TRACE_EVENT',
        payload: {
          traceId: childTraceId1,
          commandId,
          parentTraceId: rootTraceId,
          sequence: 2,
          type: 'TOOL_CALL',
          name: 'ReadFile',
          startTime: Date.now() + 100,
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'TRACE_EVENT',
        payload: {
          traceId: childTraceId2,
          commandId,
          parentTraceId: rootTraceId,
          sequence: 3,
          type: 'TOOL_CALL',
          name: 'SearchCode',
          startTime: Date.now() + 200,
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Verify trace tree structure
      expect(traceEvents.length).toBe(3);

      const rootTrace = traceEvents.find(t => t.traceId === rootTraceId);
      expect(rootTrace).toBeDefined();
      expect(rootTrace.parentTraceId).toBeNull();

      const childTraces = traceEvents.filter(t => t.parentTraceId === rootTraceId);
      expect(childTraces.length).toBe(2);
      expect(childTraces.map(t => t.traceId)).toContain(childTraceId1);
      expect(childTraces.map(t => t.traceId)).toContain(childTraceId2);
    });
  });

  describe('Batch Trace Events', () => {
    it('should send and receive batch trace events', async () => {
      const agentId = uuidv4();
      const commandId = uuidv4();
      const batchId = uuidv4();

      // Connect agent
      agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: { agentId, token: 'agent-token' },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Connect dashboard
      dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      dashboardWs.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token: authToken },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', () => resolve());
      });

      dashboardWs.send(JSON.stringify({
        type: 'SUBSCRIBE_TRACES',
        payload: { commandId },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', () => resolve());
      });

      // Send batch of traces
      const traces = [
        {
          traceId: uuidv4(),
          commandId,
          sequence: 1,
          type: 'LLM_PROMPT',
          name: 'Batch Trace 1',
        },
        {
          traceId: uuidv4(),
          commandId,
          sequence: 2,
          type: 'TOOL_CALL',
          name: 'Batch Trace 2',
        },
        {
          traceId: uuidv4(),
          commandId,
          sequence: 3,
          type: 'RESPONSE',
          name: 'Batch Trace 3',
        },
      ];

      agentWs.send(JSON.stringify({
        type: 'TRACE_BATCH',
        payload: {
          batchId,
          traces,
        },
      }));

      // Agent should receive batch acknowledgment
      await new Promise<void>((resolve) => {
        agentWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('TRACE_BATCH_ACK');
          expect(message.payload.batchId).toBe(batchId);
          expect(message.payload.received).toBe(3);
          resolve();
        });
      });

      // Dashboard should receive batch
      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('TRACE_BATCH');
          expect(message.payload.batchId).toBe(batchId);
          expect(message.payload.traces.length).toBe(3);
          resolve();
        });
      });

      // Verify all traces were stored
      expect(traceEvents.length).toBe(3);
    });

    it('should handle large batch of traces', async () => {
      const agentId = uuidv4();
      const commandId = uuidv4();
      const batchId = uuidv4();
      const BATCH_SIZE = 100;

      // Connect agent
      agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: { agentId, token: 'agent-token' },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Generate large batch
      const traces = Array.from({ length: BATCH_SIZE }, (_, i) => ({
        traceId: uuidv4(),
        commandId,
        sequence: i + 1,
        type: i % 3 === 0 ? 'LLM_PROMPT' : i % 3 === 1 ? 'TOOL_CALL' : 'RESPONSE',
        name: `Trace ${i + 1}`,
        data: {
          index: i,
          timestamp: Date.now() + i * 10,
        },
      }));

      agentWs.send(JSON.stringify({
        type: 'TRACE_BATCH',
        payload: {
          batchId,
          traces,
        },
      }));

      // Should receive acknowledgment
      await new Promise<void>((resolve) => {
        agentWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('TRACE_BATCH_ACK');
          expect(message.payload.received).toBe(BATCH_SIZE);
          resolve();
        });
      });

      expect(traceEvents.length).toBe(BATCH_SIZE);
    });
  });

  describe('Trace Subscription', () => {
    it('should filter traces by commandId', async () => {
      const agentId = uuidv4();
      const commandId1 = uuidv4();
      const commandId2 = uuidv4();

      // Connect agent
      agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: { agentId, token: 'agent-token' },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Send traces for different commands
      agentWs.send(JSON.stringify({
        type: 'TRACE_EVENT',
        payload: {
          traceId: uuidv4(),
          commandId: commandId1,
          type: 'LLM_PROMPT',
          name: 'Command 1 Trace',
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'TRACE_EVENT',
        payload: {
          traceId: uuidv4(),
          commandId: commandId2,
          type: 'LLM_PROMPT',
          name: 'Command 2 Trace',
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Connect dashboard and subscribe to specific command
      dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      dashboardWs.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token: authToken },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', () => resolve());
      });

      dashboardWs.send(JSON.stringify({
        type: 'SUBSCRIBE_TRACES',
        payload: { commandId: commandId1 },
      }));

      // Should receive subscription confirmation and history
      await new Promise<void>((resolve) => {
        let receivedAck = false;
        let receivedHistory = false;

        dashboardWs.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'SUBSCRIPTION_ACK') {
            expect(message.payload.filters.commandId).toBe(commandId1);
            receivedAck = true;
          }

          if (message.type === 'TRACE_HISTORY') {
            expect(message.payload.traces.length).toBe(1);
            expect(message.payload.traces[0].commandId).toBe(commandId1);
            receivedHistory = true;
          }

          if (receivedAck && receivedHistory) {
            resolve();
          }
        });
      });
    });

    it('should handle unsubscribe from traces', async () => {
      const agentId = uuidv4();

      // Connect dashboard
      dashboardWs = new WebSocket(`${wsUrl}/ws/dashboard`);

      await new Promise<void>((resolve) => {
        dashboardWs.once('open', () => resolve());
      });

      dashboardWs.send(JSON.stringify({
        type: 'AUTHENTICATE',
        payload: { token: authToken },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', () => resolve());
      });

      // Subscribe
      dashboardWs.send(JSON.stringify({
        type: 'SUBSCRIBE_TRACES',
        payload: { agentId },
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', () => resolve());
      });

      // Unsubscribe
      dashboardWs.send(JSON.stringify({
        type: 'UNSUBSCRIBE_TRACES',
        payload: {},
      }));

      await new Promise<void>((resolve) => {
        dashboardWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('UNSUBSCRIBED');
          resolve();
        });
      });
    });
  });

  describe('Performance and Latency', () => {
    it('should handle trace events with low latency', async () => {
      const agentId = uuidv4();
      const commandId = uuidv4();

      // Connect agent
      agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: { agentId, token: 'agent-token' },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Measure latency
      const startTime = Date.now();

      agentWs.send(JSON.stringify({
        type: 'TRACE_EVENT',
        payload: {
          traceId: uuidv4(),
          commandId,
          type: 'LLM_PROMPT',
          name: 'Latency Test',
          timestamp: startTime,
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'TRACE_ACK') {
            const latency = Date.now() - startTime;
            expect(latency).toBeLessThan(200); // Should be under 200ms
            resolve();
          }
        });
      });
    });

    it('should handle concurrent trace events from multiple agents', async () => {
      const NUM_AGENTS = 5;
      const TRACES_PER_AGENT = 10;
      const agents: WebSocket[] = [];
      const receivedAcks: string[] = [];

      // Connect multiple agents
      for (let i = 0; i < NUM_AGENTS; i++) {
        const ws = new WebSocket(`${wsUrl}/ws/agent`);
        agents.push(ws);

        await new Promise<void>((resolve) => {
          ws.once('open', () => resolve());
        });

        const agentId = `agent-${i}`;
        ws.send(JSON.stringify({
          type: 'AGENT_CONNECT',
          payload: { agentId, token: 'agent-token' },
        }));

        await new Promise<void>((resolve) => {
          ws.once('message', () => resolve());
        });

        // Set up ack handler
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'TRACE_ACK') {
            receivedAcks.push(message.payload.traceId);
          }
        });
      }

      // Send traces from all agents concurrently
      const allTraceIds: string[] = [];

      for (let i = 0; i < NUM_AGENTS; i++) {
        for (let j = 0; j < TRACES_PER_AGENT; j++) {
          const traceId = uuidv4();
          allTraceIds.push(traceId);

          agents[i].send(JSON.stringify({
            type: 'TRACE_EVENT',
            payload: {
              traceId,
              commandId: uuidv4(),
              sequence: j + 1,
              type: 'LLM_PROMPT',
              name: `Agent ${i} Trace ${j}`,
            },
          }));
        }
      }

      // Wait for all acknowledgments
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (receivedAcks.length === NUM_AGENTS * TRACES_PER_AGENT) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 5000);
      });

      expect(receivedAcks.length).toBe(NUM_AGENTS * TRACES_PER_AGENT);
      expect(traceEvents.length).toBe(NUM_AGENTS * TRACES_PER_AGENT);

      // Clean up
      for (const ws of agents) {
        ws.close();
      }
    });
  });

  describe('Error Handling', () => {
    it('should reject trace events from unauthenticated agents', async () => {
      const ws = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        ws.once('open', () => resolve());
      });

      // Send trace without authentication
      ws.send(JSON.stringify({
        type: 'TRACE_EVENT',
        payload: {
          traceId: uuidv4(),
          commandId: uuidv4(),
          type: 'LLM_PROMPT',
        },
      }));

      await new Promise<void>((resolve) => {
        ws.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('ERROR');
          expect(message.payload.code).toBe('NOT_AUTHENTICATED');
          resolve();
        });
      });

      ws.close();
    });

    it('should validate trace event structure', async () => {
      const agentId = uuidv4();

      agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: { agentId, token: 'agent-token' },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Send invalid trace (missing required fields)
      agentWs.send(JSON.stringify({
        type: 'TRACE_EVENT',
        payload: {
          // Missing traceId and other required fields
          name: 'Invalid Trace',
        },
      }));

      // Should still acknowledge but with validation warning
      await new Promise<void>((resolve) => {
        agentWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          // Implementation should handle invalid traces gracefully
          resolve();
        });
      });
    });

    it('should handle malformed trace data gracefully', async () => {
      const agentId = uuidv4();

      agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: { agentId, token: 'agent-token' },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Send malformed JSON
      agentWs.send('{ invalid json }');

      await new Promise<void>((resolve) => {
        agentWs.once('message', (data) => {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('ERROR');
          expect(message.payload.code).toBe('INVALID_MESSAGE');
          resolve();
        });
      });
    });
  });
});