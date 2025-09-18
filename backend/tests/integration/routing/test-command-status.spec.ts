/**
 * T005: Test COMMAND_STATUS routing from agent to dashboard
 *
 * This test verifies that COMMAND_STATUS messages sent from agents
 * are correctly routed back to the originating dashboard through the MessageRouter.
 *
 * These tests are designed to FAIL initially since routing is not implemented yet.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createTestServer, generateTestToken } from '../../utils/test-server.js';
import { createMockAgent, MockAgentClient } from '../../utils/mock-agent.js';
import { createMockDashboard, MockDashboardClient } from '../../utils/mock-dashboard.js';
import { v4 as uuidv4 } from 'uuid';

describe('T005: Command Status Routing', () => {
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

    await server.listen({ port: 0, host: '127.0.0.1' });
    const address = server.server.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    serverUrl = `ws://127.0.0.1:${port}`;

    authToken = generateTestToken(server);
  });

  afterAll(async () => {
    await server.close();
  });

  describe('Basic Status Routing', () => {
    let dashboard: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'test-agent-status';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent = await createMockAgent(serverUrl, agentId, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent?.disconnect();
    });

    it('should route COMMAND_STATUS from agent to originating dashboard', async () => {
      // This test should FAIL initially - routing not implemented

      // Send command from dashboard
      const commandId = dashboard.sendCommandRequest(agentId, 'echo "test"');
      await agent.waitForCommand(1000);

      // Agent sends status update
      agent.sendCommandStatus(commandId, 'running');

      // Dashboard should receive the status update
      const statusUpdate = await dashboard.waitForCommandStatus(commandId, 'running', 2000);

      expect(statusUpdate).toBeDefined();
      expect(statusUpdate.type).toBe('COMMAND_STATUS');
      expect(statusUpdate.payload.commandId).toBe(commandId);
      expect(statusUpdate.payload.status).toBe('running');
      expect(statusUpdate.agentId).toBe(agentId);
    }, 5000);

    it('should route status updates for all command lifecycle states', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'ls -la');
      await agent.waitForCommand(1000);

      // Test all status transitions
      const statuses = ['queued', 'running', 'completed'] as const;

      for (const status of statuses) {
        agent.sendCommandStatus(commandId, status);
        const statusUpdate = await dashboard.waitForCommandStatus(commandId, status, 2000);

        expect(statusUpdate.payload.status).toBe(status);
        expect(statusUpdate.payload.commandId).toBe(commandId);
      }
    }, 8000);

    it('should route error status with error details', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'invalid-command');
      await agent.waitForCommand(1000);

      const errorMessage = 'Command not found';
      agent.sendCommandStatus(commandId, 'failed', errorMessage);

      const statusUpdate = await dashboard.waitForCommandStatus(commandId, 'failed', 2000);
      expect(statusUpdate.payload.status).toBe('failed');
      expect(statusUpdate.payload.error).toBe(errorMessage);
    }, 5000);
  });

  describe('Multiple Dashboard Routing', () => {
    let dashboard1: MockDashboardClient;
    let dashboard2: MockDashboardClient;
    let dashboard3: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'test-agent-multi-dash';

    beforeEach(async () => {
      dashboard1 = await createMockDashboard(serverUrl, authToken, 'dashboard-1');
      dashboard2 = await createMockDashboard(serverUrl, authToken, 'dashboard-2');
      dashboard3 = await createMockDashboard(serverUrl, authToken, 'dashboard-3');
      agent = await createMockAgent(serverUrl, agentId, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard1?.disconnect();
      await dashboard2?.disconnect();
      await dashboard3?.disconnect();
      await agent?.disconnect();
    });

    it('should route status updates only to originating dashboard', async () => {
      // Dashboard 1 sends command
      const commandId1 = dashboard1.sendCommandRequest(agentId, 'echo "dashboard1"');
      await agent.waitForCommand(1000);

      // Dashboard 2 sends different command
      const commandId2 = dashboard2.sendCommandRequest(agentId, 'echo "dashboard2"');
      await agent.waitForCommand(1000);

      // Agent sends status for command from dashboard 1
      agent.sendCommandStatus(commandId1, 'completed');

      // Only dashboard 1 should receive this status
      const status1 = await dashboard1.waitForCommandStatus(commandId1, 'completed', 2000);
      expect(status1.payload.commandId).toBe(commandId1);

      // Dashboard 2 and 3 should not receive this status
      await expect(dashboard2.waitForCommandStatus(commandId1, 'completed', 500))
        .rejects.toThrow();
      await expect(dashboard3.waitForCommandStatus(commandId1, 'completed', 500))
        .rejects.toThrow();
    }, 8000);

    it('should handle concurrent status updates from same agent', async () => {
      const commandId1 = dashboard1.sendCommandRequest(agentId, 'command1');
      const commandId2 = dashboard2.sendCommandRequest(agentId, 'command2');
      const commandId3 = dashboard3.sendCommandRequest(agentId, 'command3');

      // Wait for all commands to be received
      await agent.waitForCommand(1000);
      await agent.waitForCommand(1000);
      await agent.waitForCommand(1000);

      // Send status updates simultaneously
      agent.sendCommandStatus(commandId1, 'running');
      agent.sendCommandStatus(commandId2, 'running');
      agent.sendCommandStatus(commandId3, 'running');

      // Each dashboard should receive only their status
      const [status1, status2, status3] = await Promise.all([
        dashboard1.waitForCommandStatus(commandId1, 'running', 2000),
        dashboard2.waitForCommandStatus(commandId2, 'running', 2000),
        dashboard3.waitForCommandStatus(commandId3, 'running', 2000)
      ]);

      expect(status1.payload.commandId).toBe(commandId1);
      expect(status2.payload.commandId).toBe(commandId2);
      expect(status3.payload.commandId).toBe(commandId3);
    }, 8000);
  });

  describe('Command Tracking and Cleanup', () => {
    let dashboard: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'test-agent-tracking';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent = await createMockAgent(serverUrl, agentId, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent?.disconnect();
    });

    it('should stop routing after command completion', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'echo "test"');
      await agent.waitForCommand(1000);

      // Send completion status
      agent.sendCommandStatus(commandId, 'completed');
      await dashboard.waitForCommandStatus(commandId, 'completed', 2000);

      // Sending another status for same command should not be routed
      agent.sendCommandStatus(commandId, 'running');

      await expect(dashboard.waitForCommandStatus(commandId, 'running', 1000))
        .rejects.toThrow();
    }, 5000);

    it('should handle orphaned status updates gracefully', async () => {
      // Send status for non-existent command
      const fakeCommandId = uuidv4();
      agent.sendCommandStatus(fakeCommandId, 'completed');

      // No dashboard should receive this status
      await expect(dashboard.waitForMessage(
        (msg) => msg.type === 'COMMAND_STATUS' && msg.payload.commandId === fakeCommandId,
        1000
      )).rejects.toThrow();
    }, 3000);

    it('should clean up command tracking when dashboard disconnects', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'long-running-command');
      await agent.waitForCommand(1000);

      // Disconnect dashboard before completion
      await dashboard.disconnect();

      // Agent sends status update
      agent.sendCommandStatus(commandId, 'completed');

      // Status should not be delivered anywhere
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Reconnect dashboard - should not receive old status
      dashboard = await createMockDashboard(serverUrl, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(dashboard.waitForMessage(
        (msg) => msg.type === 'COMMAND_STATUS' && msg.payload.commandId === commandId,
        1000
      )).rejects.toThrow();
    }, 8000);
  });

  describe('Status Update Ordering', () => {
    let dashboard: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'test-agent-ordering';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent = await createMockAgent(serverUrl, agentId, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent?.disconnect();
    });

    it('should preserve status update ordering', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'multi-step-command');
      await agent.waitForCommand(1000);

      const expectedOrder = ['queued', 'running', 'completed'] as const;
      const receivedStatuses: string[] = [];

      // Send status updates rapidly
      for (const status of expectedOrder) {
        agent.sendCommandStatus(commandId, status);
      }

      // Collect all status updates
      for (let i = 0; i < expectedOrder.length; i++) {
        const statusUpdate = await dashboard.waitForMessage(
          (msg) => msg.type === 'COMMAND_STATUS' && msg.payload.commandId === commandId,
          2000
        );
        receivedStatuses.push(statusUpdate.payload.status);
      }

      expect(receivedStatuses).toEqual(expectedOrder);
    }, 5000);

    it('should handle rapid status updates without dropping messages', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'rapid-updates');
      await agent.waitForCommand(1000);

      const statusCount = 10;
      const sentStatuses: string[] = [];

      // Send many rapid status updates
      for (let i = 0; i < statusCount; i++) {
        const status = i === statusCount - 1 ? 'completed' : 'running';
        sentStatuses.push(status);
        agent.sendCommandStatus(commandId, status, `Update ${i}`);
      }

      // Collect all status updates
      const receivedStatuses: string[] = [];
      for (let i = 0; i < statusCount; i++) {
        const statusUpdate = await dashboard.waitForMessage(
          (msg) => msg.type === 'COMMAND_STATUS' && msg.payload.commandId === commandId,
          2000
        );
        receivedStatuses.push(statusUpdate.payload.status);
      }

      expect(receivedStatuses).toEqual(sentStatuses);
    }, 10000);
  });

  describe('Error Handling and Edge Cases', () => {
    let dashboard: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'test-agent-errors';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent = await createMockAgent(serverUrl, agentId, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent?.disconnect();
    });

    it('should handle malformed status messages', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'test');
      await agent.waitForCommand(1000);

      // Send malformed status message
      const malformedStatus = {
        id: uuidv4(),
        type: 'COMMAND_STATUS',
        timestamp: Date.now(),
        agentId: agentId,
        connectionId: agent.connectionId,
        payload: {
          // Missing required commandId
          status: 'running'
        }
      };

      agent.sendAgentMessage(malformedStatus as any);

      // Dashboard should not receive malformed message
      await expect(dashboard.waitForMessage(
        (msg) => msg.type === 'COMMAND_STATUS',
        1000
      )).rejects.toThrow();
    }, 3000);

    it('should handle status from wrong agent ID', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'test');
      await agent.waitForCommand(1000);

      // Create another agent and try to send status for the command
      const wrongAgent = await createMockAgent(serverUrl, 'wrong-agent', authToken);
      wrongAgent.sendCommandStatus(commandId, 'completed');

      // Dashboard should not receive status from wrong agent
      await expect(dashboard.waitForCommandStatus(commandId, 'completed', 1000))
        .rejects.toThrow();

      await wrongAgent.disconnect();
    }, 5000);

    it('should handle duplicate status messages', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'test');
      await agent.waitForCommand(1000);

      // Send same status twice
      agent.sendCommandStatus(commandId, 'running');
      agent.sendCommandStatus(commandId, 'running');

      // Dashboard should receive first status
      const firstStatus = await dashboard.waitForCommandStatus(commandId, 'running', 2000);
      expect(firstStatus.payload.status).toBe('running');

      // Second identical status should also be delivered (no deduplication)
      const secondStatus = await dashboard.waitForCommandStatus(commandId, 'running', 2000);
      expect(secondStatus.payload.status).toBe('running');
    }, 5000);
  });
});