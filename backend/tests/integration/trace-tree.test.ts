import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { createTestServer, closeTestServer, generateTestToken } from '../utils/test-server';
import { v4 as uuidv4 } from 'uuid';

interface TraceEvent {
  id: string;
  commandId: string;
  agentId: string;
  parentId: string | null;
  type: 'LLM_PROMPT' | 'TOOL_CALL' | 'RESPONSE';
  name: string;
  content: any;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  tokenUsage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  metadata?: Record<string, any>;
}

describe('Integration: Trace Tree Generation', () => {
  let server: FastifyInstance;
  let wsUrl: string;
  let apiUrl: string;
  let authToken: string;

  // Store trace events for tree generation
  const traceEvents: TraceEvent[] = [];
  const traceIndex = new Map<string, TraceEvent>();

  beforeAll(async () => {
    server = createTestServer({ withAuth: true });
    authToken = generateTestToken(server);

    // Register WebSocket plugin
    await server.register(require('@fastify/websocket'));

    // Agent WebSocket endpoint with trace collection
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
                if (!isAuthenticated || !agentId) {
                  socket.send(JSON.stringify({
                    type: 'ERROR',
                    payload: {
                      code: 'NOT_AUTHENTICATED',
                      message: 'Agent not authenticated',
                    },
                  }));
                  return;
                }

                const traceEvent: TraceEvent = {
                  id: data.payload.id || uuidv4(),
                  commandId: data.payload.commandId,
                  agentId,
                  parentId: data.payload.parentId || null,
                  type: data.payload.type,
                  name: data.payload.name,
                  content: data.payload.content || {},
                  startedAt: data.payload.startedAt || new Date().toISOString(),
                  completedAt: data.payload.completedAt || null,
                  durationMs: data.payload.durationMs || null,
                  tokenUsage: data.payload.tokenUsage,
                  metadata: data.payload.metadata,
                };

                // Store trace event
                traceEvents.push(traceEvent);
                traceIndex.set(traceEvent.id, traceEvent);

                // Acknowledge trace receipt
                socket.send(JSON.stringify({
                  type: 'TRACE_ACK',
                  payload: {
                    traceId: traceEvent.id,
                    timestamp: new Date().toISOString(),
                  },
                }));
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
      });
    });

    // Build trace tree function
    function buildTraceTree(commandId: string, level?: string): any {
      const commandTraces = traceEvents.filter(trace => trace.commandId === commandId);

      // Filter by level if specified
      let filteredTraces = commandTraces;
      if (level) {
        // For this test, we'll simulate filtering by treating certain trace types as different levels
        const levelMap = {
          'info': ['LLM_PROMPT', 'RESPONSE'],
          'debug': ['TOOL_CALL'],
          'error': [] // Would contain error traces in real implementation
        };
        const allowedTypes = levelMap[level as keyof typeof levelMap] || [];
        filteredTraces = commandTraces.filter(trace => allowedTypes.includes(trace.type));
      }

      // Build hierarchy
      const rootTraces = filteredTraces.filter(trace => !trace.parentId);

      function buildChildren(parentId: string): any[] {
        const children = filteredTraces
          .filter(trace => trace.parentId === parentId)
          .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

        return children.map(child => ({
          ...child,
          children: buildChildren(child.id)
        }));
      }

      const tree = rootTraces.map(root => ({
        ...root,
        children: buildChildren(root.id)
      }));

      // Calculate aggregated metrics
      const totalTokens = {
        input: commandTraces.reduce((sum, trace) => sum + (trace.tokenUsage?.input || 0), 0),
        output: commandTraces.reduce((sum, trace) => sum + (trace.tokenUsage?.output || 0), 0),
        total: 0
      };
      totalTokens.total = totalTokens.input + totalTokens.output;

      const avgLatency = commandTraces
        .filter(trace => trace.durationMs !== null)
        .reduce((sum, trace, _, arr) => sum + (trace.durationMs || 0) / arr.length, 0);

      return {
        traces: tree,
        metadata: {
          totalTraces: filteredTraces.length,
          totalTokenUsage: totalTokens,
          averageLatency: Math.round(avgLatency),
          traceTypes: [...new Set(filteredTraces.map(t => t.type))],
        }
      };
    }

    // REST API endpoint for getting trace tree
    server.get('/commands/:commandId/traces', {
      preHandler: server.authenticate,
    }, async (request, reply) => {
      const { commandId } = request.params as { commandId: string };
      const { level } = request.query as { level?: string };

      const traceTree = buildTraceTree(commandId, level);
      return reply.code(200).send(traceTree);
    });

    await server.ready();
    await server.listen({ port: 0 });

    const address = server.server.address() as any;
    wsUrl = `ws://localhost:${address.port}`;
    apiUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  afterEach(() => {
    // Clear trace data between tests
    traceEvents.length = 0;
    traceIndex.clear();
  });

  describe('Trace Tree Construction', () => {
    it('should build hierarchical trace tree from parent-child relationships', async () => {
      // Test 6 from quickstart.md: Hierarchical view of LLM calls and tool usage
      const agentId = uuidv4();
      const commandId = uuidv4();

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

      await new Promise<void>((resolve) => {
        agentWs.once('open', () => resolve());
      });

      agentWs.send(JSON.stringify({
        type: 'AGENT_CONNECT',
        payload: {
          agentId,
          name: 'trace-tree-agent',
          type: 'CLAUDE',
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

      // Send trace events forming a tree structure
      const rootTraceId = uuidv4();
      const tool1TraceId = uuidv4();
      const tool2TraceId = uuidv4();
      const nestedToolTraceId = uuidv4();
      const responseTraceId = uuidv4();

      // Root LLM call
      agentWs.send(JSON.stringify({
        type: 'TRACE_EVENT',
        payload: {
          id: rootTraceId,
          commandId,
          parentId: null,
          type: 'LLM_PROMPT',
          name: 'Analyze Directory Structure',
          content: {
            prompt: 'Analyze the current directory structure and identify key files',
            model: 'claude-3-opus',
            temperature: 0.7,
          },
          startedAt: new Date(Date.now() - 5000).toISOString(),
          completedAt: new Date(Date.now() - 4000).toISOString(),
          durationMs: 1000,
          tokenUsage: {
            input: 150,
            output: 300,
            total: 450,
          },
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // First tool call (child of root)
      agentWs.send(JSON.stringify({
        type: 'TRACE_EVENT',
        payload: {
          id: tool1TraceId,
          commandId,
          parentId: rootTraceId,
          type: 'TOOL_CALL',
          name: 'Read Directory',
          content: {
            tool: 'ls',
            args: ['-la', './'],
          },
          startedAt: new Date(Date.now() - 4000).toISOString(),
          completedAt: new Date(Date.now() - 3800).toISOString(),
          durationMs: 200,
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Second tool call (child of root)
      agentWs.send(JSON.stringify({
        type: 'TRACE_EVENT',
        payload: {
          id: tool2TraceId,
          commandId,
          parentId: rootTraceId,
          type: 'TOOL_CALL',
          name: 'Find Key Files',
          content: {
            tool: 'find',
            args: ['.', '-name', '*.json', '-o', '-name', '*.md'],
          },
          startedAt: new Date(Date.now() - 3700).toISOString(),
          completedAt: new Date(Date.now() - 3400).toISOString(),
          durationMs: 300,
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Nested tool call (child of second tool)
      agentWs.send(JSON.stringify({
        type: 'TRACE_EVENT',
        payload: {
          id: nestedToolTraceId,
          commandId,
          parentId: tool2TraceId,
          type: 'TOOL_CALL',
          name: 'Read Package.json',
          content: {
            tool: 'cat',
            args: ['package.json'],
          },
          startedAt: new Date(Date.now() - 3400).toISOString(),
          completedAt: new Date(Date.now() - 3200).toISOString(),
          durationMs: 200,
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Final response (child of root)
      agentWs.send(JSON.stringify({
        type: 'TRACE_EVENT',
        payload: {
          id: responseTraceId,
          commandId,
          parentId: rootTraceId,
          type: 'RESPONSE',
          name: 'Analysis Complete',
          content: {
            summary: 'Directory analysis complete with key files identified',
            fileCount: 25,
            directories: ['src', 'tests', 'docs'],
          },
          startedAt: new Date(Date.now() - 3000).toISOString(),
          completedAt: new Date(Date.now() - 2500).toISOString(),
          durationMs: 500,
          tokenUsage: {
            input: 200,
            output: 400,
            total: 600,
          },
        },
      }));

      await new Promise<void>((resolve) => {
        agentWs.once('message', () => resolve());
      });

      // Query the trace tree endpoint
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandId}/traces`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const traceTree = response.json();

      // Verify hierarchical structure
      expect(traceTree.traces).toHaveLength(1); // One root trace
      const rootTrace = traceTree.traces[0];

      expect(rootTrace.id).toBe(rootTraceId);
      expect(rootTrace.type).toBe('LLM_PROMPT');
      expect(rootTrace.name).toBe('Analyze Directory Structure');
      expect(rootTrace.parentId).toBeNull();
      expect(rootTrace.children).toHaveLength(3); // Two tool calls + one response

      // Verify first-level children
      const tool1 = rootTrace.children.find((c: any) => c.id === tool1TraceId);
      const tool2 = rootTrace.children.find((c: any) => c.id === tool2TraceId);
      const response1 = rootTrace.children.find((c: any) => c.id === responseTraceId);

      expect(tool1).toBeDefined();
      expect(tool1.type).toBe('TOOL_CALL');
      expect(tool1.name).toBe('Read Directory');
      expect(tool1.children).toHaveLength(0);

      expect(tool2).toBeDefined();
      expect(tool2.type).toBe('TOOL_CALL');
      expect(tool2.name).toBe('Find Key Files');
      expect(tool2.children).toHaveLength(1); // Has nested tool call

      expect(response1).toBeDefined();
      expect(response1.type).toBe('RESPONSE');
      expect(response1.name).toBe('Analysis Complete');

      // Verify nested tool call
      const nestedTool = tool2.children[0];
      expect(nestedTool.id).toBe(nestedToolTraceId);
      expect(nestedTool.type).toBe('TOOL_CALL');
      expect(nestedTool.name).toBe('Read Package.json');
      expect(nestedTool.parentId).toBe(tool2TraceId);

      agentWs.close();
    });

    it('should aggregate metrics correctly across the trace tree', async () => {
      const agentId = uuidv4();
      const commandId = uuidv4();

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

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

      // Send multiple traces with token usage and timing
      const traces = [
        {
          id: uuidv4(),
          commandId,
          type: 'LLM_PROMPT',
          name: 'Initial Query',
          durationMs: 1200,
          tokenUsage: { input: 100, output: 200, total: 300 },
        },
        {
          id: uuidv4(),
          commandId,
          type: 'TOOL_CALL',
          name: 'Search Files',
          durationMs: 500,
          tokenUsage: { input: 50, output: 75, total: 125 },
        },
        {
          id: uuidv4(),
          commandId,
          type: 'LLM_PROMPT',
          name: 'Follow-up Analysis',
          durationMs: 800,
          tokenUsage: { input: 150, output: 300, total: 450 },
        },
        {
          id: uuidv4(),
          commandId,
          type: 'RESPONSE',
          name: 'Final Response',
          durationMs: 300,
          tokenUsage: { input: 75, output: 125, total: 200 },
        },
      ];

      for (const trace of traces) {
        agentWs.send(JSON.stringify({
          type: 'TRACE_EVENT',
          payload: {
            ...trace,
            parentId: null,
            content: {},
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        }));

        await new Promise<void>((resolve) => {
          agentWs.once('message', () => resolve());
        });
      }

      // Query trace tree
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandId}/traces`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const traceTree = response.json();

      // Verify aggregated metrics
      expect(traceTree.metadata.totalTraces).toBe(4);
      expect(traceTree.metadata.totalTokenUsage.input).toBe(375); // 100+50+150+75
      expect(traceTree.metadata.totalTokenUsage.output).toBe(700); // 200+75+300+125
      expect(traceTree.metadata.totalTokenUsage.total).toBe(1075); // 375+700
      expect(traceTree.metadata.averageLatency).toBe(700); // (1200+500+800+300)/4
      expect(traceTree.metadata.traceTypes).toContain('LLM_PROMPT');
      expect(traceTree.metadata.traceTypes).toContain('TOOL_CALL');
      expect(traceTree.metadata.traceTypes).toContain('RESPONSE');

      agentWs.close();
    });

    it('should filter traces by level (info, debug, error)', async () => {
      const agentId = uuidv4();
      const commandId = uuidv4();

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

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

      // Send traces of different types
      const traces = [
        {
          id: uuidv4(),
          commandId,
          type: 'LLM_PROMPT',
          name: 'Main Query',
        },
        {
          id: uuidv4(),
          commandId,
          type: 'TOOL_CALL',
          name: 'Debug Tool Call',
        },
        {
          id: uuidv4(),
          commandId,
          type: 'RESPONSE',
          name: 'Response',
        },
        {
          id: uuidv4(),
          commandId,
          type: 'TOOL_CALL',
          name: 'Another Debug Call',
        },
      ];

      for (const trace of traces) {
        agentWs.send(JSON.stringify({
          type: 'TRACE_EVENT',
          payload: {
            ...trace,
            parentId: null,
            content: {},
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: 100,
          },
        }));

        await new Promise<void>((resolve) => {
          agentWs.once('message', () => resolve());
        });
      }

      // Test info level filtering (LLM_PROMPT + RESPONSE)
      const infoResponse = await server.inject({
        method: 'GET',
        url: `/commands/${commandId}/traces?level=info`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(infoResponse.statusCode).toBe(200);
      const infoTree = infoResponse.json();
      expect(infoTree.metadata.totalTraces).toBe(2); // 1 LLM_PROMPT + 1 RESPONSE
      expect(infoTree.metadata.traceTypes).toContain('LLM_PROMPT');
      expect(infoTree.metadata.traceTypes).toContain('RESPONSE');
      expect(infoTree.metadata.traceTypes).not.toContain('TOOL_CALL');

      // Test debug level filtering (TOOL_CALL only)
      const debugResponse = await server.inject({
        method: 'GET',
        url: `/commands/${commandId}/traces?level=debug`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(debugResponse.statusCode).toBe(200);
      const debugTree = debugResponse.json();
      expect(debugTree.metadata.totalTraces).toBe(2); // 2 TOOL_CALLs
      expect(debugTree.metadata.traceTypes).toContain('TOOL_CALL');
      expect(debugTree.metadata.traceTypes).not.toContain('LLM_PROMPT');
      expect(debugTree.metadata.traceTypes).not.toContain('RESPONSE');

      agentWs.close();
    });

    it('should handle complex nested trace hierarchies', async () => {
      const agentId = uuidv4();
      const commandId = uuidv4();

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

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

      // Create a more complex hierarchy:
      // Root LLM
      // ├── Tool A
      // │   ├── Sub-tool A1
      // │   └── Sub-tool A2
      // ├── Tool B
      // └── Response

      const rootId = uuidv4();
      const toolAId = uuidv4();
      const toolBId = uuidv4();
      const subToolA1Id = uuidv4();
      const subToolA2Id = uuidv4();
      const responseId = uuidv4();

      const traces = [
        { id: rootId, parentId: null, type: 'LLM_PROMPT', name: 'Root Analysis' },
        { id: toolAId, parentId: rootId, type: 'TOOL_CALL', name: 'Tool A' },
        { id: subToolA1Id, parentId: toolAId, type: 'TOOL_CALL', name: 'Sub-tool A1' },
        { id: subToolA2Id, parentId: toolAId, type: 'TOOL_CALL', name: 'Sub-tool A2' },
        { id: toolBId, parentId: rootId, type: 'TOOL_CALL', name: 'Tool B' },
        { id: responseId, parentId: rootId, type: 'RESPONSE', name: 'Final Response' },
      ];

      for (const trace of traces) {
        agentWs.send(JSON.stringify({
          type: 'TRACE_EVENT',
          payload: {
            ...trace,
            commandId,
            content: {},
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: 100,
          },
        }));

        await new Promise<void>((resolve) => {
          agentWs.once('message', () => resolve());
        });
      }

      // Query trace tree
      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandId}/traces`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const traceTree = response.json();

      // Verify structure
      expect(traceTree.traces).toHaveLength(1); // One root
      const root = traceTree.traces[0];
      expect(root.id).toBe(rootId);
      expect(root.children).toHaveLength(3); // Tool A, Tool B, Response

      const toolA = root.children.find((c: any) => c.id === toolAId);
      expect(toolA).toBeDefined();
      expect(toolA.children).toHaveLength(2); // Sub-tool A1, A2

      const subToolA1 = toolA.children.find((c: any) => c.id === subToolA1Id);
      const subToolA2 = toolA.children.find((c: any) => c.id === subToolA2Id);
      expect(subToolA1).toBeDefined();
      expect(subToolA2).toBeDefined();

      const toolB = root.children.find((c: any) => c.id === toolBId);
      expect(toolB).toBeDefined();
      expect(toolB.children).toHaveLength(0);

      expect(traceTree.metadata.totalTraces).toBe(6);

      agentWs.close();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing command traces gracefully', async () => {
      const nonExistentCommandId = uuidv4();

      const response = await server.inject({
        method: 'GET',
        url: `/commands/${nonExistentCommandId}/traces`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const traceTree = response.json();
      expect(traceTree.traces).toHaveLength(0);
      expect(traceTree.metadata.totalTraces).toBe(0);
    });

    it('should require authentication for trace access', async () => {
      const commandId = uuidv4();

      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandId}/traces`,
        // No authorization header
      });

      expect(response.statusCode).toBe(401);
    });

    it('should handle invalid trace level filters', async () => {
      const commandId = uuidv4();

      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandId}/traces?level=invalid`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      // Should return empty results for invalid level
      const traceTree = response.json();
      expect(traceTree.traces).toHaveLength(0);
    });
  });

  describe('Performance', () => {
    it('should handle large trace trees efficiently', async () => {
      const agentId = uuidv4();
      const commandId = uuidv4();

      // Connect agent
      const agentWs = new WebSocket(`${wsUrl}/ws/agent`);

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

      // Create a large number of traces
      const TRACE_COUNT = 100;
      const traces = Array.from({ length: TRACE_COUNT }, (_, i) => ({
        id: uuidv4(),
        commandId,
        parentId: i === 0 ? null : (i % 10 === 0 ? null : traces[Math.floor(i / 10)]?.id),
        type: ['LLM_PROMPT', 'TOOL_CALL', 'RESPONSE'][i % 3] as any,
        name: `Trace ${i}`,
        content: {},
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Math.floor(Math.random() * 1000),
      }));

      // Send all traces
      for (const trace of traces) {
        agentWs.send(JSON.stringify({
          type: 'TRACE_EVENT',
          payload: trace,
        }));

        await new Promise<void>((resolve) => {
          agentWs.once('message', () => resolve());
        });
      }

      // Measure query performance
      const startTime = Date.now();

      const response = await server.inject({
        method: 'GET',
        url: `/commands/${commandId}/traces`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      const queryTime = Date.now() - startTime;

      expect(response.statusCode).toBe(200);
      const traceTree = response.json();
      expect(traceTree.metadata.totalTraces).toBe(TRACE_COUNT);

      // Should process large trace trees quickly
      expect(queryTime).toBeLessThan(1000); // Under 1 second

      agentWs.close();
    });
  });
});