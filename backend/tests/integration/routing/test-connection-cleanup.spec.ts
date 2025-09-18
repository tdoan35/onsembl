/**
 * T009: Test connection cleanup on disconnect
 *
 * This test verifies that the MessageRouter properly cleans up
 * routing state when agents or dashboards disconnect.
 *
 * These tests are designed to FAIL initially since routing is not implemented yet.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createTestServer, generateTestToken } from '../../utils/test-server.js';
import { createMockAgent, MockAgentClient } from '../../utils/mock-agent.js';
import { createMockDashboard, MockDashboardClient } from '../../utils/mock-dashboard.js';
import { v4 as uuidv4 } from 'uuid';

describe('T009: Connection Cleanup Routing', () => {
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

  describe('Dashboard Disconnect Cleanup', () => {
    let dashboard: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'cleanup-test-agent';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent = await createMockAgent(serverUrl, agentId, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent?.disconnect();
    });

    it('should cleanup command routing when dashboard disconnects', async () => {
      // This test should FAIL initially - routing not implemented

      // Send command from dashboard
      const commandId = dashboard.sendCommandRequest(agentId, 'test command');
      await agent.waitForCommand(1000);

      // Disconnect dashboard before agent responds
      await dashboard.disconnect();

      // Agent sends status update
      agent.sendCommandStatus(commandId, 'completed');

      // Status should not be delivered anywhere (dashboard is gone)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Reconnect dashboard with same connection ID
      dashboard = await createMockDashboard(serverUrl, authToken, dashboard.connectionId);

      // Should not receive the old status update
      await expect(dashboard.waitForMessage(
        (msg) => msg.type === 'COMMAND_STATUS' && msg.payload.commandId === commandId,
        1000
      )).rejects.toThrow();
    }, 8000);

    it('should cleanup terminal stream routing when dashboard disconnects', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'terminal test');
      await agent.waitForCommand(1000);

      // Disconnect dashboard
      await dashboard.disconnect();

      // Agent sends terminal output
      agent.sendTerminalOutput(commandId, 'orphaned output\n');

      // Output should not be delivered anywhere
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Reconnect dashboard
      dashboard = await createMockDashboard(serverUrl, authToken);

      await expect(dashboard.waitForMessage(
        (msg) => msg.type === 'TERMINAL_STREAM' && msg.payload.commandId === commandId,
        1000
      )).rejects.toThrow();
    }, 8000);

    it('should remove dashboard from emergency stop broadcast list', async () => {
      // Connect multiple dashboards
      const dashboard2 = await createMockDashboard(serverUrl, authToken, 'dashboard-2');

      // Disconnect first dashboard
      await dashboard.disconnect();

      // Second dashboard triggers emergency stop
      dashboard2.sendEmergencyStop('Test emergency after disconnect');

      // Agent should still receive emergency stop
      const emergencyStop = await agent.waitForEmergencyStop(2000);
      expect(emergencyStop.payload.reason).toBe('Test emergency after disconnect');

      await dashboard2.disconnect();
    }, 8000);

    it('should handle graceful vs abrupt dashboard disconnections', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'graceful test');
      await agent.waitForCommand(1000);

      // Simulate abrupt disconnection (network failure)
      dashboard.ws.terminate();

      // Agent sends response
      agent.sendCommandStatus(commandId, 'completed');

      // Should not crash server or leak memory
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Server should still function normally
      const newDashboard = await createMockDashboard(serverUrl, authToken);
      const newCommandId = newDashboard.sendCommandRequest(agentId, 'new command');
      const newCommand = await agent.waitForCommand(2000);
      expect(newCommand.payload.commandId).toBe(newCommandId);

      await newDashboard.disconnect();
    }, 10000);
  });

  describe('Agent Disconnect Cleanup', () => {
    let dashboard: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'agent-cleanup-test';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent = await createMockAgent(serverUrl, agentId, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent?.disconnect();
    });

    it('should cleanup agent routing when agent disconnects', async () => {
      // Agent is connected
      const commandId = dashboard.sendCommandRequest(agentId, 'test command');
      await agent.waitForCommand(1000);

      // Disconnect agent
      await agent.disconnect();

      // Send another command to the same agent ID
      const commandId2 = dashboard.sendCommandRequest(agentId, 'second command');

      // Command should be queued for offline agent (not delivered to old connection)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Reconnect agent with same ID
      agent = await createMockAgent(serverUrl, agentId, authToken);

      // Should receive the queued command
      const queuedCommand = await agent.waitForCommand(2000);
      expect(queuedCommand.payload.commandId).toBe(commandId2);
    }, 10000);

    it('should stop emergency stop broadcasts to disconnected agents', async () => {
      const agent2 = await createMockAgent(serverUrl, 'agent-2', authToken);

      // Disconnect first agent
      await agent.disconnect();

      // Trigger emergency stop
      dashboard.sendEmergencyStop('Emergency after agent disconnect');

      // Only remaining agent should receive emergency stop
      const emergencyStop = await agent2.waitForEmergencyStop(2000);
      expect(emergencyStop.payload.reason).toBe('Emergency after agent disconnect');

      await agent2.disconnect();
    }, 8000);

    it('should handle agent reconnection with same ID', async () => {
      const originalConnectionId = agent.connectionId;

      // Send command to agent
      const commandId = dashboard.sendCommandRequest(agentId, 'before disconnect');
      await agent.waitForCommand(1000);

      // Disconnect and reconnect agent with same ID
      await agent.disconnect();
      agent = await createMockAgent(serverUrl, agentId, authToken);

      // New connection should have different connection ID
      expect(agent.connectionId).not.toBe(originalConnectionId);

      // Should be able to receive new commands
      const newCommandId = dashboard.sendCommandRequest(agentId, 'after reconnect');
      const newCommand = await agent.waitForCommand(2000);
      expect(newCommand.payload.commandId).toBe(newCommandId);
    }, 10000);

    it('should handle agent ID collision (different agents with same ID)', async () => {
      // Connect second agent with same ID but different connection
      const duplicateAgent = await createMockAgent(serverUrl, agentId, authToken, 'different-connection');

      // Send command to the agent ID
      const commandId = dashboard.sendCommandRequest(agentId, 'collision test');

      // One of the agents should receive the command
      try {
        const cmd1 = await agent.waitForCommand(1000);
        expect(cmd1.payload.commandId).toBe(commandId);
        // Other agent should not receive it
        await expect(duplicateAgent.waitForCommand(500)).rejects.toThrow();
      } catch (error) {
        // Or the duplicate agent receives it
        const cmd2 = await duplicateAgent.waitForCommand(1000);
        expect(cmd2.payload.commandId).toBe(commandId);
        await expect(agent.waitForCommand(500)).rejects.toThrow();
      }

      await duplicateAgent.disconnect();
    }, 8000);
  });

  describe('Memory and Resource Cleanup', () => {
    let dashboard: MockDashboardClient;

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
    });

    it('should cleanup routing tables after many connections', async () => {
      const agents: MockAgentClient[] = [];

      // Create many agents
      for (let i = 0; i < 50; i++) {
        const agent = await createMockAgent(serverUrl, `stress-agent-${i}`, authToken);
        agents.push(agent);

        // Send command to each agent
        dashboard.sendCommandRequest(`stress-agent-${i}`, `command ${i}`);
        await agent.waitForCommand(1000);
      }

      // Disconnect all agents
      for (const agent of agents) {
        await agent.disconnect();
      }

      // Router should clean up all routing entries
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Server should still function normally
      const newAgent = await createMockAgent(serverUrl, 'new-agent', authToken);
      const commandId = dashboard.sendCommandRequest('new-agent', 'after cleanup');
      const command = await newAgent.waitForCommand(2000);
      expect(command.payload.commandId).toBe(commandId);

      await newAgent.disconnect();
    }, 30000);

    it('should handle rapid connect/disconnect cycles', async () => {
      const agentId = 'rapid-cycle-agent';

      for (let cycle = 0; cycle < 10; cycle++) {
        const agent = await createMockAgent(serverUrl, agentId, authToken);

        const commandId = dashboard.sendCommandRequest(agentId, `cycle ${cycle}`);
        await agent.waitForCommand(1000);

        agent.sendCommandStatus(commandId, 'completed');
        await dashboard.waitForCommandStatus(commandId, 'completed', 2000);

        await agent.disconnect();
      }

      // Router should handle all cycles without issues
      const finalAgent = await createMockAgent(serverUrl, agentId, authToken);
      const finalCommandId = dashboard.sendCommandRequest(agentId, 'final command');
      const finalCommand = await finalAgent.waitForCommand(2000);
      expect(finalCommand.payload.commandId).toBe(finalCommandId);

      await finalAgent.disconnect();
    }, 20000);

    it('should cleanup orphaned command tracking', async () => {
      const agents: MockAgentClient[] = [];

      // Create agents and send commands
      for (let i = 0; i < 10; i++) {
        const agent = await createMockAgent(serverUrl, `orphan-agent-${i}`, authToken);
        agents.push(agent);

        // Send command but don't complete it
        dashboard.sendCommandRequest(`orphan-agent-${i}`, `orphaned command ${i}`);
        await agent.waitForCommand(1000);
      }

      // Disconnect dashboard (orphaning commands)
      await dashboard.disconnect();

      // Agents send status updates for orphaned commands
      for (let i = 0; i < agents.length; i++) {
        agents[i].sendCommandStatus(`orphaned-command-${i}`, 'completed');
      }

      // Disconnect all agents
      for (const agent of agents) {
        await agent.disconnect();
      }

      // Router should clean up orphaned command tracking
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Reconnect and verify normal operation
      dashboard = await createMockDashboard(serverUrl, authToken);
      const newAgent = await createMockAgent(serverUrl, 'clean-agent', authToken);

      const commandId = dashboard.sendCommandRequest('clean-agent', 'clean command');
      const command = await newAgent.waitForCommand(2000);
      expect(command.payload.commandId).toBe(commandId);

      await newAgent.disconnect();
    }, 20000);
  });

  describe('Concurrent Disconnect Handling', () => {
    let dashboard1: MockDashboardClient;
    let dashboard2: MockDashboardClient;
    let agent1: MockAgentClient;
    let agent2: MockAgentClient;

    beforeEach(async () => {
      dashboard1 = await createMockDashboard(serverUrl, authToken, 'dashboard-1');
      dashboard2 = await createMockDashboard(serverUrl, authToken, 'dashboard-2');
      agent1 = await createMockAgent(serverUrl, 'agent-1', authToken);
      agent2 = await createMockAgent(serverUrl, 'agent-2', authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard1?.disconnect();
      await dashboard2?.disconnect();
      await agent1?.disconnect();
      await agent2?.disconnect();
    });

    it('should handle simultaneous dashboard disconnections', async () => {
      // Both dashboards send commands
      const cmd1 = dashboard1.sendCommandRequest('agent-1', 'dashboard1 command');
      const cmd2 = dashboard2.sendCommandRequest('agent-2', 'dashboard2 command');

      await agent1.waitForCommand(1000);
      await agent2.waitForCommand(1000);

      // Disconnect both dashboards simultaneously
      await Promise.all([
        dashboard1.disconnect(),
        dashboard2.disconnect()
      ]);

      // Agents send responses
      agent1.sendCommandStatus(cmd1, 'completed');
      agent2.sendCommandStatus(cmd2, 'completed');

      // No crashes should occur
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Reconnect and verify functionality
      dashboard1 = await createMockDashboard(serverUrl, authToken);
      const newCmd = dashboard1.sendCommandRequest('agent-1', 'recovery command');
      const newCommand = await agent1.waitForCommand(2000);
      expect(newCommand.payload.commandId).toBe(newCmd);
    }, 10000);

    it('should handle simultaneous agent disconnections', async () => {
      // Send commands to both agents
      dashboard1.sendCommandRequest('agent-1', 'agent1 command');
      dashboard1.sendCommandRequest('agent-2', 'agent2 command');

      await agent1.waitForCommand(1000);
      await agent2.waitForCommand(1000);

      // Disconnect both agents simultaneously
      await Promise.all([
        agent1.disconnect(),
        agent2.disconnect()
      ]);

      // Send new commands (should be queued)
      const queuedCmd1 = dashboard1.sendCommandRequest('agent-1', 'queued for agent1');
      const queuedCmd2 = dashboard1.sendCommandRequest('agent-2', 'queued for agent2');

      await new Promise(resolve => setTimeout(resolve, 500));

      // Reconnect agents
      agent1 = await createMockAgent(serverUrl, 'agent-1', authToken);
      agent2 = await createMockAgent(serverUrl, 'agent-2', authToken);

      // Should receive queued commands
      const queued1 = await agent1.waitForCommand(2000);
      const queued2 = await agent2.waitForCommand(2000);

      expect(queued1.payload.commandId).toBe(queuedCmd1);
      expect(queued2.payload.commandId).toBe(queuedCmd2);
    }, 12000);

    it('should handle mixed connection state changes', async () => {
      // Initial commands
      const cmd1 = dashboard1.sendCommandRequest('agent-1', 'initial command');
      await agent1.waitForCommand(1000);

      // Dashboard 1 disconnects, agent 2 disconnects
      await dashboard1.disconnect();
      await agent2.disconnect();

      // Dashboard 2 sends command to agent 1 (still connected)
      const cmd2 = dashboard2.sendCommandRequest('agent-1', 'from dashboard2');
      await agent1.waitForCommand(1000);

      // Agent 1 sends responses
      agent1.sendCommandStatus(cmd1, 'completed'); // Orphaned (dashboard1 gone)
      agent1.sendCommandStatus(cmd2, 'completed'); // Should route to dashboard2

      // Dashboard 2 should receive only its command status
      const status = await dashboard2.waitForCommandStatus(cmd2, 'completed', 2000);
      expect(status.payload.commandId).toBe(cmd2);

      // No other messages should be received
      await expect(dashboard2.waitForMessage(
        (msg) => msg.type === 'COMMAND_STATUS' && msg.payload.commandId === cmd1,
        1000
      )).rejects.toThrow();
    }, 12000);
  });

  describe('Error Recovery and Resilience', () => {
    let dashboard: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'resilience-agent';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent = await createMockAgent(serverUrl, agentId, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent?.disconnect();
    });

    it('should recover from cleanup errors gracefully', async () => {
      // Send multiple commands
      const commands = [];
      for (let i = 0; i < 5; i++) {
        const cmd = dashboard.sendCommandRequest(agentId, `command ${i}`);
        commands.push(cmd);
        await agent.waitForCommand(1000);
      }

      // Force abrupt disconnection that might cause cleanup errors
      agent.ws.terminate();
      dashboard.ws.terminate();

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Reconnect and verify normal operation
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent = await createMockAgent(serverUrl, agentId, authToken);

      const newCmd = dashboard.sendCommandRequest(agentId, 'recovery command');
      const newCommand = await agent.waitForCommand(2000);
      expect(newCommand.payload.commandId).toBe(newCmd);
    }, 10000);

    it('should maintain data consistency during cleanup', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'consistency test');
      await agent.waitForCommand(1000);

      // Start status update
      agent.sendCommandStatus(commandId, 'running');

      // Disconnect during message processing
      await dashboard.disconnect();

      // Should not cause inconsistent state
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Reconnect and verify clean state
      dashboard = await createMockDashboard(serverUrl, authToken);
      const testCmd = dashboard.sendCommandRequest(agentId, 'state test');
      const testCommand = await agent.waitForCommand(2000);
      expect(testCommand.payload.commandId).toBe(testCmd);
    }, 8000);
  });
});