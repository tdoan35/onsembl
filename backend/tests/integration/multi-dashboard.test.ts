import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';

describe('Multi-Dashboard Synchronization', () => {
  let app: FastifyInstance;
  let serverUrl: string;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.listen({ port: 0 });
    const address = app.server.address();
    const port = typeof address === 'object' ? address?.port : 3001;
    serverUrl = `ws://localhost:${port}/ws`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should sync agent status across multiple dashboards', async () => {
    const token = 'valid-test-token';
    let ws1: WebSocket;
    let ws2: WebSocket;

    const bothReceived = await new Promise<boolean>((resolve) => {
      let dashboard1Received = false;
      let dashboard2Received = false;

      // Connect first dashboard
      ws1 = new WebSocket(serverUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      ws1.on('open', () => {
        const connectMessage: WebSocketMessage = {
          type: 'dashboard:connect',
          dashboardId: 'dashboard-1',
          timestamp: new Date().toISOString()
        };
        ws1.send(JSON.stringify(connectMessage));

        // Connect second dashboard
        ws2 = new WebSocket(serverUrl, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        ws2.on('open', () => {
          const connectMessage2: WebSocketMessage = {
            type: 'dashboard:connect',
            dashboardId: 'dashboard-2',
            timestamp: new Date().toISOString()
          };
          ws2.send(JSON.stringify(connectMessage2));

          // Simulate agent status update
          setTimeout(() => {
            const statusUpdate: WebSocketMessage = {
              type: 'agent:status',
              agentId: 'test-agent',
              status: 'online',
              timestamp: new Date().toISOString()
            };
            ws1.send(JSON.stringify(statusUpdate));
          }, 200);
        });

        ws2.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'agent:status') {
            dashboard2Received = true;
            if (dashboard1Received) resolve(true);
          }
        });
      });

      ws1.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'agent:status') {
          dashboard1Received = true;
          if (dashboard2Received) resolve(true);
        }
      });

      setTimeout(() => resolve(false), 5000);
    });

    expect(bothReceived).toBe(true);
    if (ws1!) ws1.close();
    if (ws2!) ws2.close();
  });
});
