/**
 * T004: Test COMMAND_REQUEST routing from dashboard to agent
 *
 * This test verifies that COMMAND_REQUEST messages sent from dashboards
 * are correctly routed to the target agent through the MessageRouter.
 *
 * These tests are designed to FAIL initially since routing is not implemented yet.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createTestServer, generateTestToken } from '../../utils/test-server.js';
import { createMockAgent, MockAgentClient } from '../../utils/mock-agent.js';
import { createMockDashboard, MockDashboardClient } from '../../utils/mock-dashboard.js';
import { v4 as uuidv4 } from 'uuid';

describe('T004: Command Request Routing', () => {
  let server: FastifyInstance;
  let serverUrl: string;
  let authToken: string;

  beforeAll(async () => {
    server = await createTestServer({
      withAuth: true,
      withCors: true,
      logLevel: 'silent'
    });

    // TODO: Add WebSocket routing support to test server
    await server.register(import('fastify-websocket'));

    // Start server
    await server.listen({ port: 0, host: '127.0.0.1' });
    const address = server.server.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    serverUrl = `ws://127.0.0.1:${port}`;

    authToken = generateTestToken(server);
  });

  afterAll(async () => {
    await server.close();
  });

  describe('Basic Command Request Routing', () => {
    let dashboard: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'test-agent-1';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent = await createMockAgent(serverUrl, agentId, authToken);

      // Wait for connections to be established
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent?.disconnect();
    });

    it('should route COMMAND_REQUEST from dashboard to target agent', async () => {
      // This test should FAIL initially - routing not implemented

      const command = 'echo "Hello from dashboard"';
      const commandId = dashboard.sendCommandRequest(agentId, command);

      // Agent should receive the command request
      const receivedCommand = await agent.waitForCommand(2000);

      expect(receivedCommand).toBeDefined();
      expect(receivedCommand.type).toBe('COMMAND_REQUEST');
      expect(receivedCommand.payload.commandId).toBe(commandId);
      expect(receivedCommand.payload.command).toBe(command);
      expect(receivedCommand.payload.agentId).toBe(agentId);
    }, 5000);

    it('should handle command request with arguments', async () => {
      const command = 'git';
      const args = ['status', '--porcelain'];
      const commandId = dashboard.sendCommandRequest(agentId, command, args);

      const receivedCommand = await agent.waitForCommand(2000);

      expect(receivedCommand.payload.command).toBe(command);
      expect(receivedCommand.payload.args).toEqual(args);
    }, 5000);

    it('should preserve command metadata in routing', async () => {
      const command = 'ls -la';
      const commandId = dashboard.sendCommandRequest(agentId, command);

      const receivedCommand = await agent.waitForCommand(2000);

      expect(receivedCommand.payload.commandId).toBe(commandId);
      expect(receivedCommand.connectionId).toBe(dashboard.connectionId);
      expect(receivedCommand.timestamp).toBeGreaterThan(Date.now() - 5000);
    }, 5000);
  });

  describe('Multiple Agent Routing', () => {
    let dashboard: MockDashboardClient;
    let agent1: MockAgentClient;
    let agent2: MockAgentClient;
    let agent3: MockAgentClient;

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent1 = await createMockAgent(serverUrl, 'agent-1', authToken);
      agent2 = await createMockAgent(serverUrl, 'agent-2', authToken);
      agent3 = await createMockAgent(serverUrl, 'agent-3', authToken);

      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent1?.disconnect();
      await agent2?.disconnect();
      await agent3?.disconnect();
    });

    it('should route commands to specific agents only', async () => {
      // Send command to agent-2
      const commandId = dashboard.sendCommandRequest('agent-2', 'pwd');

      // Only agent-2 should receive the command
      const receivedCommand = await agent2.waitForCommand(2000);
      expect(receivedCommand.payload.agentId).toBe('agent-2');

      // Other agents should not receive the command
      await expect(agent1.waitForCommand(500)).rejects.toThrow();
      await expect(agent3.waitForCommand(500)).rejects.toThrow();
    }, 5000);

    it('should handle concurrent commands to different agents', async () => {
      const commandId1 = dashboard.sendCommandRequest('agent-1', 'echo "Agent 1"');
      const commandId2 = dashboard.sendCommandRequest('agent-2', 'echo "Agent 2"');
      const commandId3 = dashboard.sendCommandRequest('agent-3', 'echo "Agent 3"');

      const [cmd1, cmd2, cmd3] = await Promise.all([
        agent1.waitForCommand(2000),
        agent2.waitForCommand(2000),
        agent3.waitForCommand(2000)
      ]);

      expect(cmd1.payload.commandId).toBe(commandId1);
      expect(cmd2.payload.commandId).toBe(commandId2);
      expect(cmd3.payload.commandId).toBe(commandId3);
    }, 5000);
  });

  describe('Error Handling', () => {
    let dashboard: MockDashboardClient;

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
    });

    it('should handle command request to non-existent agent', async () => {
      // This should fail gracefully when routing is implemented
      const commandId = dashboard.sendCommandRequest('non-existent-agent', 'pwd');

      // Should receive an error message
      const errorResponse = await dashboard.waitForMessage(
        (msg) => msg.type === 'ERROR' && msg.payload.originalMessageId,
        2000
      );

      expect(errorResponse.payload.code).toBe('AGENT_NOT_FOUND');
      expect(errorResponse.payload.message).toContain('non-existent-agent');
    }, 5000);

    it('should handle malformed command requests', async () => {
      // Send invalid command request
      const malformedMessage = {
        id: uuidv4(),
        type: 'COMMAND_REQUEST',
        timestamp: Date.now(),
        connectionId: dashboard.connectionId,
        payload: {
          // Missing required fields
          command: 'test'
        }
      };

      dashboard.sendDashboardMessage(malformedMessage as any);

      const errorResponse = await dashboard.waitForMessage(
        (msg) => msg.type === 'ERROR',
        2000
      );

      expect(errorResponse.payload.code).toBe('VALIDATION_ERROR');
    }, 5000);
  });

  describe('Command Queue Integration', () => {
    let dashboard: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'test-agent-queue';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent = await createMockAgent(serverUrl, agentId, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent?.disconnect();
    });

    it('should queue commands when agent is busy', async () => {
      // First command should start executing
      const commandId1 = dashboard.sendCommandRequest(agentId, 'sleep 2');
      const cmd1 = await agent.waitForCommand(1000);

      // Simulate agent starting execution
      agent.sendCommandStatus(commandId1, 'running');

      // Second command should be queued
      const commandId2 = dashboard.sendCommandRequest(agentId, 'echo "queued"');

      // Agent should not receive second command immediately
      await expect(agent.waitForCommand(500)).rejects.toThrow();

      // Complete first command
      agent.sendCommandStatus(commandId1, 'completed');

      // Now second command should be delivered
      const cmd2 = await agent.waitForCommand(1000);
      expect(cmd2.payload.commandId).toBe(commandId2);
    }, 10000);
  });

  describe('Connection State Handling', () => {
    let dashboard: MockDashboardClient;
    const agentId = 'test-agent-connection';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
    });

    it('should track command origin for response routing', async () => {
      // Connect agent
      const agent = await createMockAgent(serverUrl, agentId, authToken);

      const commandId = dashboard.sendCommandRequest(agentId, 'whoami');
      const receivedCommand = await agent.waitForCommand(2000);

      // The router should track this command came from this dashboard
      expect(receivedCommand.connectionId).toBe(dashboard.connectionId);

      await agent.disconnect();
    }, 5000);

    it('should handle dashboard reconnection scenarios', async () => {
      // Send command, then disconnect dashboard
      const agent = await createMockAgent(serverUrl, agentId, authToken);
      const commandId = dashboard.sendCommandRequest(agentId, 'echo "test"');

      await dashboard.disconnect();

      // Reconnect with same connection ID
      dashboard = await createMockDashboard(serverUrl, authToken, dashboard.connectionId);

      // Agent should still receive the command
      const receivedCommand = await agent.waitForCommand(2000);
      expect(receivedCommand.payload.commandId).toBe(commandId);

      await agent.disconnect();
    }, 5000);
  });
});