import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import WebSocket from 'ws';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';

describe('Command Execution Flow Integration', () => {
  let app: FastifyInstance;
  let serverUrl: string;
  let dashboardWs: WebSocket;
  let agentWs: WebSocket;

  beforeAll(async () => {
    // Build and start the app
    app = await buildApp({ logger: false });
    await app.listen({ port: 0 });

    const address = app.server.address();
    const port = typeof address === 'object' ? address?.port : 3001;
    serverUrl = `ws://localhost:${port}/ws`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Clean up any existing connections
    if (dashboardWs && dashboardWs.readyState === WebSocket.OPEN) {
      dashboardWs.close();
    }
    if (agentWs && agentWs.readyState === WebSocket.OPEN) {
      agentWs.close();
    }
  });

  it('should execute command from dashboard to agent', async () => {
    const token = 'valid-test-token';
    const testCommand = 'echo "Hello World"';
    const testAgentId = 'test-agent-1';
    const testDashboardId = 'test-dashboard-1';

    const commandFlow = await new Promise<{
      requested: boolean;
      queued: boolean;
      executing: boolean;
      completed: boolean;
    }>((resolve) => {
      const result = {
        requested: false,
        queued: false,
        executing: false,
        completed: false
      };

      // Connect dashboard first
      dashboardWs = new WebSocket(serverUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      dashboardWs.on('open', () => {
        // Send dashboard connect
        const connectMessage: WebSocketMessage = {
          type: 'dashboard:connect',
          dashboardId: testDashboardId,
          timestamp: new Date().toISOString()
        };
        dashboardWs.send(JSON.stringify(connectMessage));

        // Connect agent
        agentWs = new WebSocket(serverUrl, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        agentWs.on('open', () => {
          // Send agent connect
          const agentConnectMessage: WebSocketMessage = {
            type: 'agent:connect',
            agentId: testAgentId,
            agentType: 'claude',
            timestamp: new Date().toISOString()
          };
          agentWs.send(JSON.stringify(agentConnectMessage));

          // Send command request from dashboard
          setTimeout(() => {
            const commandMessage: WebSocketMessage = {
              type: 'command:request',
              agentId: testAgentId,
              command: testCommand,
              args: [],
              timestamp: new Date().toISOString()
            };
            dashboardWs.send(JSON.stringify(commandMessage));
            result.requested = true;
          }, 100);
        });

        agentWs.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());

            if (message.type === 'command:execute') {
              result.executing = true;

              // Simulate command execution
              setTimeout(() => {
                const outputMessage: WebSocketMessage = {
                  type: 'terminal:output',
                  agentId: testAgentId,
                  output: {
                    type: 'stdout',
                    content: 'Hello World',
                    timestamp: new Date().toISOString()
                  },
                  timestamp: new Date().toISOString()
                };
                agentWs.send(JSON.stringify(outputMessage));

                // Send completion
                const completeMessage: WebSocketMessage = {
                  type: 'command:complete',
                  commandId: message.commandId,
                  agentId: testAgentId,
                  exitCode: 0,
                  timestamp: new Date().toISOString()
                };
                agentWs.send(JSON.stringify(completeMessage));
              }, 100);
            }
          } catch (error) {
            // Ignore parse errors
          }
        });
      });

      dashboardWs.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'command:queued') {
            result.queued = true;
          } else if (message.type === 'command:status' && message.status === 'completed') {
            result.completed = true;
            setTimeout(() => resolve(result), 100);
          }
        } catch (error) {
          // Ignore parse errors
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => resolve(result), 5000);
    });

    expect(commandFlow.requested).toBe(true);
    expect(commandFlow.queued).toBe(true);
    expect(commandFlow.executing).toBe(true);
    expect(commandFlow.completed).toBe(true);
  });
});
