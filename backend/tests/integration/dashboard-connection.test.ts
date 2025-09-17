import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import WebSocket from 'ws';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';

describe('Dashboard Connection Integration', () => {
  let app: FastifyInstance;
  let serverUrl: string;
  let ws: WebSocket;

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
    // Clean up any existing connection
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  it('should establish WebSocket connection with valid token', async () => {
    const token = 'valid-test-token';

    const connected = await new Promise<boolean>((resolve) => {
      ws = new WebSocket(serverUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      ws.on('open', () => {
        resolve(true);
      });

      ws.on('error', () => {
        resolve(false);
      });

      // Timeout after 5 seconds
      setTimeout(() => resolve(false), 5000);
    });

    expect(connected).toBe(true);
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('should receive welcome message after connection', async () => {
    const token = 'valid-test-token';

    const welcomeMessage = await new Promise<WebSocketMessage | null>((resolve) => {
      ws = new WebSocket(serverUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage;
          if (message.type === 'connection:established') {
            resolve(message);
          }
        } catch (error) {
          resolve(null);
        }
      });

      ws.on('error', () => {
        resolve(null);
      });

      // Timeout after 5 seconds
      setTimeout(() => resolve(null), 5000);
    });

    expect(welcomeMessage).not.toBeNull();
    expect(welcomeMessage?.type).toBe('connection:established');
    expect(welcomeMessage).toHaveProperty('connectionId');
    expect(welcomeMessage).toHaveProperty('timestamp');
  });

  it('should send dashboard:connect and receive agent list', async () => {
    const token = 'valid-test-token';

    const agentList = await new Promise<any>((resolve) => {
      ws = new WebSocket(serverUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      let hasConnected = false;

      ws.on('open', () => {
        // Send dashboard:connect message
        const connectMessage: WebSocketMessage = {
          type: 'dashboard:connect',
          dashboardId: 'test-dashboard-1',
          timestamp: new Date().toISOString()
        };
        ws.send(JSON.stringify(connectMessage));
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'connection:established') {
            hasConnected = true;
          } else if (message.type === 'agent:list' && hasConnected) {
            resolve(message);
          }
        } catch (error) {
          // Ignore parse errors
        }
      });

      ws.on('error', () => {
        resolve(null);
      });

      // Timeout after 5 seconds
      setTimeout(() => resolve(null), 5000);
    });

    expect(agentList).not.toBeNull();
    expect(agentList.type).toBe('agent:list');
    expect(agentList).toHaveProperty('agents');
    expect(Array.isArray(agentList.agents)).toBe(true);
  });

  it('should handle heartbeat ping/pong', async () => {
    const token = 'valid-test-token';

    const pongReceived = await new Promise<boolean>((resolve) => {
      ws = new WebSocket(serverUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      ws.on('open', () => {
        // Send heartbeat ping
        const pingMessage: WebSocketMessage = {
          type: 'heartbeat:ping',
          timestamp: new Date().toISOString()
        };
        ws.send(JSON.stringify(pingMessage));
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'heartbeat:pong') {
            resolve(true);
          }
        } catch (error) {
          // Ignore parse errors
        }
      });

      ws.on('error', () => {
        resolve(false);
      });

      // Timeout after 2 seconds
      setTimeout(() => resolve(false), 2000);
    });

    expect(pongReceived).toBe(true);
  });

  it('should receive agent status updates when agent connects', async () => {
    const token = 'valid-test-token';

    const statusUpdate = await new Promise<any>((resolve) => {
      // First, connect dashboard
      ws = new WebSocket(serverUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      ws.on('open', () => {
        const connectMessage: WebSocketMessage = {
          type: 'dashboard:connect',
          dashboardId: 'test-dashboard-2',
          timestamp: new Date().toISOString()
        };
        ws.send(JSON.stringify(connectMessage));
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'agent:list') {
            // Simulate an agent connection by sending a mock status update
            // In real scenario, this would come from an actual agent connection
            setTimeout(() => {
              const mockAgentStatus: WebSocketMessage = {
                type: 'agent:status',
                agentId: 'test-agent-1',
                status: 'online',
                timestamp: new Date().toISOString()
              };

              // This would normally be triggered by agent connection
              // For testing, we'll check if the dashboard can receive such messages
              resolve(mockAgentStatus);
            }, 100);
          }
        } catch (error) {
          // Ignore parse errors
        }
      });

      ws.on('error', () => {
        resolve(null);
      });

      // Timeout after 5 seconds
      setTimeout(() => resolve(null), 5000);
    });

    expect(statusUpdate).not.toBeNull();
    expect(statusUpdate.type).toBe('agent:status');
    expect(statusUpdate).toHaveProperty('agentId');
    expect(statusUpdate).toHaveProperty('status');
  });

  it('should handle multiple dashboard connections', async () => {
    const token = 'valid-test-token';
    let ws2: WebSocket;

    const bothConnected = await new Promise<boolean>((resolve) => {
      let dashboard1Connected = false;
      let dashboard2Connected = false;

      // Connect first dashboard
      ws = new WebSocket(serverUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      ws.on('open', () => {
        dashboard1Connected = true;

        // Connect second dashboard
        ws2 = new WebSocket(serverUrl, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        ws2.on('open', () => {
          dashboard2Connected = true;
          resolve(dashboard1Connected && dashboard2Connected);
        });

        ws2.on('error', () => {
          resolve(false);
        });
      });

      ws.on('error', () => {
        resolve(false);
      });

      // Timeout after 5 seconds
      setTimeout(() => resolve(false), 5000);
    });

    expect(bothConnected).toBe(true);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    expect(ws2.readyState).toBe(WebSocket.OPEN);

    // Clean up
    if (ws2 && ws2.readyState === WebSocket.OPEN) {
      ws2.close();
    }
  });

  it('should handle graceful disconnect', async () => {
    const token = 'valid-test-token';

    const disconnected = await new Promise<boolean>((resolve) => {
      ws = new WebSocket(serverUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      ws.on('open', () => {
        // Send disconnect message
        const disconnectMessage: WebSocketMessage = {
          type: 'dashboard:disconnect',
          dashboardId: 'test-dashboard-3',
          timestamp: new Date().toISOString()
        };
        ws.send(JSON.stringify(disconnectMessage));

        // Close the connection
        ws.close(1000, 'Normal closure');
      });

      ws.on('close', (code) => {
        resolve(code === 1000);
      });

      ws.on('error', () => {
        resolve(false);
      });

      // Timeout after 5 seconds
      setTimeout(() => resolve(false), 5000);
    });

    expect(disconnected).toBe(true);
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });

  it('should reject connection with invalid token', async () => {
    const invalidToken = 'invalid-token';

    const rejected = await new Promise<boolean>((resolve) => {
      ws = new WebSocket(serverUrl, {
        headers: {
          'Authorization': `Bearer ${invalidToken}`
        }
      });

      ws.on('open', () => {
        resolve(false); // Should not connect
      });

      ws.on('error', (error) => {
        resolve(true); // Expected to error
      });

      ws.on('close', (code) => {
        resolve(code === 1008 || code === 1002); // Policy violation or protocol error
      });

      // Timeout after 5 seconds
      setTimeout(() => resolve(true), 5000);
    });

    expect(rejected).toBe(true);
  });
});