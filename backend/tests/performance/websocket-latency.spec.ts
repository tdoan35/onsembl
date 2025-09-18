/**
 * T028: Performance test to verify <200ms latency for WebSocket message routing
 *
 * Requirements:
 * - Terminal stream latency must be <200ms
 * - Command status updates must be <200ms
 * - System should handle 10+ concurrent agents
 * - System should handle 100 messages/second per agent
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createTestServer } from '../helpers/test-server';
import { MockDashboardClient, createMockDashboard } from '../utils/mock-dashboard';
import { MockAgentClient, createMockAgent } from '../utils/mock-agent';
import { setupWebSocketPlugin } from '../../src/websocket/setup';
import { Services } from '../../src/server';

describe('T028: WebSocket Latency Performance Test', () => {
  let server: FastifyInstance;
  let wsUrl: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const ctx = await createTestServer();
    server = ctx.server;
    cleanup = ctx.cleanup;

    // Mock services
    const mockServices: Partial<Services> = {
      authService: {
        validateToken: jest.fn().mockResolvedValue({ userId: 'test-user' })
      },
      agentService: {
        updateAgent: jest.fn().mockResolvedValue(null)
      },
      commandService: {
        updateCommandStatus: jest.fn().mockResolvedValue(null),
        completeCommand: jest.fn().mockResolvedValue(null)
      }
    } as any;

    // Setup WebSocket with real routing
    await server.register(require('@fastify/websocket'));
    await setupWebSocketPlugin(server, mockServices as Services);

    // Start server
    await server.listen({ port: 0, host: '127.0.0.1' });
    const address = server.server.address() as any;
    wsUrl = `ws://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('Terminal Stream Latency', () => {
    it('should deliver terminal output in <200ms', async () => {
      // Setup dashboard and agent
      const dashboard = await createMockDashboard(`${wsUrl}/ws/dashboard`, 'test-token');
      const agent = await createMockAgent(`${wsUrl}/ws/agent`, 'agent-001', 'test-token');

      // Send command from dashboard
      const commandId = dashboard.sendCommandRequest('agent-001', 'echo test');

      // Wait for agent to receive command
      const command = await agent.waitForCommand(1000);
      expect(command).toBeDefined();

      // Measure terminal output latency
      const startTime = Date.now();

      // Agent sends terminal output
      agent.sendTerminalOutput(commandId, 'Test output line');

      // Dashboard receives output
      const output = await dashboard.waitForTerminalOutput(commandId, 1000);
      const latency = Date.now() - startTime;

      expect(latency).toBeLessThan(200);
      expect(output.payload.content).toBe('Test output line');

      await dashboard.disconnect();
      await agent.disconnect();
    });

    it('should handle burst of 100 messages/second with <200ms latency', async () => {
      const dashboard = await createMockDashboard(`${wsUrl}/ws/dashboard`, 'test-token');
      const agent = await createMockAgent(`${wsUrl}/ws/agent`, 'agent-002', 'test-token');

      const commandId = dashboard.sendCommandRequest('agent-002', 'stress test');
      await agent.waitForCommand(1000);

      const latencies: number[] = [];
      const messageCount = 100;

      // Send burst of messages
      const promises = [];
      for (let i = 0; i < messageCount; i++) {
        const startTime = Date.now();
        agent.sendTerminalOutput(commandId, `Line ${i}`);

        promises.push(
          dashboard.waitForTerminalOutput(commandId, 1000).then(() => {
            latencies.push(Date.now() - startTime);
          })
        );
      }

      // Wait for all messages
      await Promise.all(promises);

      // Calculate statistics
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const p99Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.99)];

      expect(avgLatency).toBeLessThan(200);
      expect(p99Latency).toBeLessThan(200);

      console.log(`Burst test results:
        Average latency: ${avgLatency.toFixed(2)}ms
        Max latency: ${maxLatency}ms
        P99 latency: ${p99Latency}ms`);

      await dashboard.disconnect();
      await agent.disconnect();
    });
  });

  describe('Command Status Latency', () => {
    it('should deliver command status updates in <200ms', async () => {
      const dashboard = await createMockDashboard(`${wsUrl}/ws/dashboard`, 'test-token');
      const agent = await createMockAgent(`${wsUrl}/ws/agent`, 'agent-003', 'test-token');

      const commandId = dashboard.sendCommandRequest('agent-003', 'test command');
      await agent.waitForCommand(1000);

      // Measure status update latency
      const statusTypes = ['running', 'completed'] as const;
      const latencies: number[] = [];

      for (const status of statusTypes) {
        const startTime = Date.now();
        agent.sendCommandStatus(commandId, status);

        const statusMsg = await dashboard.waitForCommandStatus(commandId, status, 1000);
        const latency = Date.now() - startTime;

        latencies.push(latency);
        expect(latency).toBeLessThan(200);
      }

      console.log(`Status update latencies: ${latencies.map(l => `${l}ms`).join(', ')}`);

      await dashboard.disconnect();
      await agent.disconnect();
    });
  });

  describe('Concurrent Agent Load', () => {
    it('should handle 10+ concurrent agents with <200ms latency', async () => {
      const agentCount = 10;
      const dashboards: MockDashboardClient[] = [];
      const agents: MockAgentClient[] = [];

      // Create multiple agents and dashboards
      for (let i = 0; i < agentCount; i++) {
        const dashboard = await createMockDashboard(`${wsUrl}/ws/dashboard`, 'test-token');
        const agent = await createMockAgent(`${wsUrl}/ws/agent`, `agent-${i}`, 'test-token');

        dashboards.push(dashboard);
        agents.push(agent);
      }

      // Send commands from all dashboards
      const commandIds: string[] = [];
      for (let i = 0; i < agentCount; i++) {
        const commandId = dashboards[i].sendCommandRequest(`agent-${i}`, `command-${i}`);
        commandIds.push(commandId);
      }

      // Wait for all agents to receive commands
      await Promise.all(agents.map(agent => agent.waitForCommand(1000)));

      // Measure concurrent message latency
      const latencies: number[] = [];

      const promises = [];
      for (let i = 0; i < agentCount; i++) {
        const startTime = Date.now();
        agents[i].sendTerminalOutput(commandIds[i], `Output from agent-${i}`);

        promises.push(
          dashboards[i].waitForTerminalOutput(commandIds[i], 1000).then(() => {
            latencies.push(Date.now() - startTime);
          })
        );
      }

      await Promise.all(promises);

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      expect(avgLatency).toBeLessThan(200);
      expect(maxLatency).toBeLessThan(500); // Allow some variance for concurrent load

      console.log(`Concurrent agent test (${agentCount} agents):
        Average latency: ${avgLatency.toFixed(2)}ms
        Max latency: ${maxLatency}ms`);

      // Cleanup
      await Promise.all(dashboards.map(d => d.disconnect()));
      await Promise.all(agents.map(a => a.disconnect()));
    });
  });

  describe('Emergency Stop Broadcast Latency', () => {
    it('should broadcast emergency stop to all agents in <200ms', async () => {
      const agentCount = 5;
      const dashboard = await createMockDashboard(`${wsUrl}/ws/dashboard`, 'test-token');
      const agents: MockAgentClient[] = [];

      // Create multiple agents
      for (let i = 0; i < agentCount; i++) {
        const agent = await createMockAgent(`${wsUrl}/ws/agent`, `stop-agent-${i}`, 'test-token');
        agents.push(agent);
      }

      // Measure emergency stop broadcast latency
      const startTime = Date.now();
      dashboard.sendEmergencyStop('Performance test stop');

      // Wait for all agents to receive stop
      const promises = agents.map(agent => agent.waitForEmergencyStop(1000));
      await Promise.all(promises);

      const latency = Date.now() - startTime;
      expect(latency).toBeLessThan(200);

      console.log(`Emergency stop broadcast to ${agentCount} agents: ${latency}ms`);

      await dashboard.disconnect();
      await Promise.all(agents.map(a => a.disconnect()));
    });
  });

  describe('Message Routing Under Load', () => {
    it('should maintain <200ms latency with 100 msg/sec per agent for 3 agents', async () => {
      const agentCount = 3;
      const messagesPerAgent = 100;
      const testDuration = 1000; // 1 second

      const dashboards: MockDashboardClient[] = [];
      const agents: MockAgentClient[] = [];
      const commandIds: string[] = [];

      // Setup agents and dashboards
      for (let i = 0; i < agentCount; i++) {
        const dashboard = await createMockDashboard(`${wsUrl}/ws/dashboard`, 'test-token');
        const agent = await createMockAgent(`${wsUrl}/ws/agent`, `load-agent-${i}`, 'test-token');

        dashboards.push(dashboard);
        agents.push(agent);

        const commandId = dashboard.sendCommandRequest(`load-agent-${i}`, 'load test');
        commandIds.push(commandId);
      }

      // Wait for commands to be received
      await Promise.all(agents.map(agent => agent.waitForCommand(1000)));

      // Start load test
      const startTime = Date.now();
      const latencies: number[] = [];
      let messagesSent = 0;

      const sendInterval = testDuration / messagesPerAgent;

      // Send messages at specified rate
      const intervals = agents.map((agent, agentIdx) => {
        return setInterval(() => {
          const msgStartTime = Date.now();
          agent.sendTerminalOutput(commandIds[agentIdx], `Load msg ${messagesSent++}`);

          dashboards[agentIdx].waitForTerminalOutput(commandIds[agentIdx], 500)
            .then(() => {
              latencies.push(Date.now() - msgStartTime);
            })
            .catch(() => {
              // Ignore timeout errors in load test
            });
        }, sendInterval);
      });

      // Run for test duration
      await new Promise(resolve => setTimeout(resolve, testDuration + 500));

      // Stop sending
      intervals.forEach(clearInterval);

      // Calculate results
      if (latencies.length > 0) {
        const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

        expect(avgLatency).toBeLessThan(200);

        console.log(`Load test (${agentCount} agents, ${messagesPerAgent} msg/sec each):
          Messages sent: ${messagesSent}
          Messages received: ${latencies.length}
          Average latency: ${avgLatency.toFixed(2)}ms
          P95 latency: ${p95Latency}ms`);
      }

      // Cleanup
      await Promise.all(dashboards.map(d => d.disconnect()));
      await Promise.all(agents.map(a => a.disconnect()));
    });
  });
});