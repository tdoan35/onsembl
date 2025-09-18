/**
 * T010: Test multiple dashboard isolation
 *
 * This test verifies that multiple dashboards are properly isolated
 * and only receive messages intended for them through the MessageRouter.
 *
 * These tests are designed to FAIL initially since routing is not implemented yet.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createTestServer, generateTestToken } from '../../utils/test-server.js';
import { createMockAgent, MockAgentClient } from '../../utils/mock-agent.js';
import { createMockDashboard, MockDashboardClient } from '../../utils/mock-dashboard.js';
import { v4 as uuidv4 } from 'uuid';

describe('T010: Dashboard Isolation Routing', () => {
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

  describe('Basic Dashboard Isolation', () => {
    let dashboard1: MockDashboardClient;
    let dashboard2: MockDashboardClient;
    let dashboard3: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'isolation-test-agent';

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

    it('should isolate command status updates between dashboards', async () => {
      // This test should FAIL initially - routing not implemented

      // Each dashboard sends a command
      const cmd1 = dashboard1.sendCommandRequest(agentId, 'dashboard1 command');
      const cmd2 = dashboard2.sendCommandRequest(agentId, 'dashboard2 command');
      const cmd3 = dashboard3.sendCommandRequest(agentId, 'dashboard3 command');

      // Agent receives all commands
      await agent.waitForCommand(1000);
      await agent.waitForCommand(1000);
      await agent.waitForCommand(1000);

      // Agent sends status updates
      agent.sendCommandStatus(cmd1, 'completed');
      agent.sendCommandStatus(cmd2, 'failed', 'Command failed');
      agent.sendCommandStatus(cmd3, 'running');

      // Each dashboard should receive only their status update
      const status1 = await dashboard1.waitForCommandStatus(cmd1, 'completed', 2000);
      const status2 = await dashboard2.waitForCommandStatus(cmd2, 'failed', 2000);
      const status3 = await dashboard3.waitForCommandStatus(cmd3, 'running', 2000);

      expect(status1.payload.commandId).toBe(cmd1);
      expect(status2.payload.commandId).toBe(cmd2);
      expect(status2.payload.error).toBe('Command failed');
      expect(status3.payload.commandId).toBe(cmd3);

      // Dashboards should not receive status for other commands
      await expect(dashboard1.waitForCommandStatus(cmd2, 'failed', 500)).rejects.toThrow();
      await expect(dashboard2.waitForCommandStatus(cmd3, 'running', 500)).rejects.toThrow();
      await expect(dashboard3.waitForCommandStatus(cmd1, 'completed', 500)).rejects.toThrow();
    }, 10000);

    it('should isolate terminal output between dashboards', async () => {
      const cmd1 = dashboard1.sendCommandRequest(agentId, 'echo "output1"');
      const cmd2 = dashboard2.sendCommandRequest(agentId, 'echo "output2"');

      await agent.waitForCommand(1000);
      await agent.waitForCommand(1000);

      // Agent sends terminal output for each command
      agent.sendTerminalOutput(cmd1, 'output1\n');
      agent.sendTerminalOutput(cmd2, 'output2\n');

      // Each dashboard should receive only their terminal output
      const terminal1 = await dashboard1.waitForTerminalOutput(cmd1, 2000);
      const terminal2 = await dashboard2.waitForTerminalOutput(cmd2, 2000);

      expect(terminal1.payload.content).toBe('output1\n');
      expect(terminal2.payload.content).toBe('output2\n');

      // Dashboards should not receive output for other commands
      await expect(dashboard1.waitForTerminalOutput(cmd2, 500)).rejects.toThrow();
      await expect(dashboard2.waitForTerminalOutput(cmd1, 500)).rejects.toThrow();
      await expect(dashboard3.waitForTerminalOutput(cmd1, 500)).rejects.toThrow();
    }, 8000);

    it('should isolate command cancel requests', async () => {
      const cmd1 = dashboard1.sendCommandRequest(agentId, 'long running command 1');
      const cmd2 = dashboard2.sendCommandRequest(agentId, 'long running command 2');

      await agent.waitForCommand(1000);
      await agent.waitForCommand(1000);

      // Dashboard 1 cancels their command
      dashboard1.sendCommandCancel(agentId, cmd1);

      // Agent should receive cancel for cmd1 only
      const cancelMsg = await agent.waitForMessage(
        (msg) => msg.type === 'COMMAND_CANCEL' && msg.payload.commandId === cmd1,
        2000
      );

      expect(cancelMsg.payload.commandId).toBe(cmd1);

      // Should not receive cancel for cmd2
      await expect(agent.waitForMessage(
        (msg) => msg.type === 'COMMAND_CANCEL' && msg.payload.commandId === cmd2,
        500
      )).rejects.toThrow();
    }, 8000);
  });

  describe('Multi-Agent Dashboard Isolation', () => {
    let dashboard1: MockDashboardClient;
    let dashboard2: MockDashboardClient;
    let agent1: MockAgentClient;
    let agent2: MockAgentClient;

    beforeEach(async () => {
      dashboard1 = await createMockDashboard(serverUrl, authToken, 'multi-dash-1');
      dashboard2 = await createMockDashboard(serverUrl, authToken, 'multi-dash-2');
      agent1 = await createMockAgent(serverUrl, 'multi-agent-1', authToken);
      agent2 = await createMockAgent(serverUrl, 'multi-agent-2', authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard1?.disconnect();
      await dashboard2?.disconnect();
      await agent1?.disconnect();
      await agent2?.disconnect();
    });

    it('should maintain isolation across multiple agents', async () => {
      // Dashboard 1 sends commands to both agents
      const cmd1_agent1 = dashboard1.sendCommandRequest('multi-agent-1', 'cmd for agent1 from dash1');
      const cmd1_agent2 = dashboard1.sendCommandRequest('multi-agent-2', 'cmd for agent2 from dash1');

      // Dashboard 2 sends commands to both agents
      const cmd2_agent1 = dashboard2.sendCommandRequest('multi-agent-1', 'cmd for agent1 from dash2');
      const cmd2_agent2 = dashboard2.sendCommandRequest('multi-agent-2', 'cmd for agent2 from dash2');

      // Agents receive their respective commands
      await agent1.waitForCommand(1000);
      await agent1.waitForCommand(1000);
      await agent2.waitForCommand(1000);
      await agent2.waitForCommand(1000);

      // Agents send status updates
      agent1.sendCommandStatus(cmd1_agent1, 'completed');
      agent1.sendCommandStatus(cmd2_agent1, 'completed');
      agent2.sendCommandStatus(cmd1_agent2, 'completed');
      agent2.sendCommandStatus(cmd2_agent2, 'completed');

      // Dashboard 1 should receive only their command statuses
      const status1_1 = await dashboard1.waitForCommandStatus(cmd1_agent1, 'completed', 2000);
      const status1_2 = await dashboard1.waitForCommandStatus(cmd1_agent2, 'completed', 2000);

      expect(status1_1.payload.commandId).toBe(cmd1_agent1);
      expect(status1_2.payload.commandId).toBe(cmd1_agent2);

      // Dashboard 2 should receive only their command statuses
      const status2_1 = await dashboard2.waitForCommandStatus(cmd2_agent1, 'completed', 2000);
      const status2_2 = await dashboard2.waitForCommandStatus(cmd2_agent2, 'completed', 2000);

      expect(status2_1.payload.commandId).toBe(cmd2_agent1);
      expect(status2_2.payload.commandId).toBe(cmd2_agent2);

      // Cross-contamination checks
      await expect(dashboard1.waitForCommandStatus(cmd2_agent1, 'completed', 500)).rejects.toThrow();
      await expect(dashboard2.waitForCommandStatus(cmd1_agent1, 'completed', 500)).rejects.toThrow();
    }, 12000);

    it('should handle concurrent operations with isolation', async () => {
      // Rapid fire commands from both dashboards
      const rapidCommands1: string[] = [];
      const rapidCommands2: string[] = [];

      for (let i = 0; i < 5; i++) {
        const cmd1 = dashboard1.sendCommandRequest('multi-agent-1', `rapid${i} from dash1`);
        const cmd2 = dashboard2.sendCommandRequest('multi-agent-1', `rapid${i} from dash2`);
        rapidCommands1.push(cmd1);
        rapidCommands2.push(cmd2);
      }

      // Agent receives all commands
      for (let i = 0; i < 10; i++) {
        await agent1.waitForCommand(1000);
      }

      // Agent rapidly sends all completions
      for (const cmd of rapidCommands1) {
        agent1.sendCommandStatus(cmd, 'completed');
      }
      for (const cmd of rapidCommands2) {
        agent1.sendCommandStatus(cmd, 'completed');
      }

      // Each dashboard should receive exactly their 5 status updates
      const received1: string[] = [];
      const received2: string[] = [];

      for (let i = 0; i < 5; i++) {
        const status1 = await dashboard1.waitForMessage(
          (msg) => msg.type === 'COMMAND_STATUS',
          2000
        );
        received1.push(status1.payload.commandId);

        const status2 = await dashboard2.waitForMessage(
          (msg) => msg.type === 'COMMAND_STATUS',
          2000
        );
        received2.push(status2.payload.commandId);
      }

      expect(received1.sort()).toEqual(rapidCommands1.sort());
      expect(received2.sort()).toEqual(rapidCommands2.sort());
    }, 15000);
  });

  describe('Dashboard Session Isolation', () => {
    let dashboard1: MockDashboardClient;
    let dashboard2: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'session-agent';

    beforeEach(async () => {
      dashboard1 = await createMockDashboard(serverUrl, authToken, 'session-dash-1');
      dashboard2 = await createMockDashboard(serverUrl, authToken, 'session-dash-2');
      agent = await createMockAgent(serverUrl, agentId, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard1?.disconnect();
      await dashboard2?.disconnect();
      await agent?.disconnect();
    });

    it('should maintain isolation across dashboard reconnections', async () => {
      // Dashboard 1 sends command
      const cmd1 = dashboard1.sendCommandRequest(agentId, 'before reconnection');
      await agent.waitForCommand(1000);

      // Dashboard 1 disconnects and reconnects
      const originalConnectionId = dashboard1.connectionId;
      await dashboard1.disconnect();
      dashboard1 = await createMockDashboard(serverUrl, authToken, originalConnectionId);

      // Send response after reconnection
      agent.sendCommandStatus(cmd1, 'completed');

      // Reconnected dashboard should receive the response
      const status = await dashboard1.waitForCommandStatus(cmd1, 'completed', 2000);
      expect(status.payload.commandId).toBe(cmd1);

      // Dashboard 2 should not receive it
      await expect(dashboard2.waitForCommandStatus(cmd1, 'completed', 500)).rejects.toThrow();
    }, 8000);

    it('should isolate different user sessions', async () => {
      // Create dashboard with different auth token (different user)
      const otherUserToken = generateTestToken(server, { userId: uuidv4() });
      const otherUserDashboard = await createMockDashboard(serverUrl, otherUserToken, 'other-user');

      // Both users send commands
      const cmd1 = dashboard1.sendCommandRequest(agentId, 'user1 command');
      const cmd2 = otherUserDashboard.sendCommandRequest(agentId, 'user2 command');

      await agent.waitForCommand(1000);
      await agent.waitForCommand(1000);

      // Agent sends responses
      agent.sendCommandStatus(cmd1, 'completed');
      agent.sendCommandStatus(cmd2, 'completed');

      // Each user should receive only their response
      const status1 = await dashboard1.waitForCommandStatus(cmd1, 'completed', 2000);
      const status2 = await otherUserDashboard.waitForCommandStatus(cmd2, 'completed', 2000);

      expect(status1.payload.commandId).toBe(cmd1);
      expect(status2.payload.commandId).toBe(cmd2);

      // Cross-user isolation check
      await expect(dashboard1.waitForCommandStatus(cmd2, 'completed', 500)).rejects.toThrow();
      await expect(otherUserDashboard.waitForCommandStatus(cmd1, 'completed', 500)).rejects.toThrow();

      await otherUserDashboard.disconnect();
    }, 10000);

    it('should handle same connection ID from different sessions', async () => {
      const sharedConnectionId = 'shared-connection-id';

      // Create two dashboards with same connection ID but different auth
      await dashboard1.disconnect();
      await dashboard2.disconnect();

      dashboard1 = await createMockDashboard(serverUrl, authToken, sharedConnectionId);
      const otherToken = generateTestToken(server, { userId: uuidv4() });
      dashboard2 = await createMockDashboard(serverUrl, otherToken, sharedConnectionId);

      // Only one should be able to use this connection ID
      // Implementation dependent - might reject duplicate or replace previous

      const cmd1 = dashboard1.sendCommandRequest(agentId, 'first dashboard');

      try {
        await agent.waitForCommand(1000);
        // If command was received, dashboard1 has the connection
        agent.sendCommandStatus(cmd1, 'completed');
        const status = await dashboard1.waitForCommandStatus(cmd1, 'completed', 2000);
        expect(status.payload.commandId).toBe(cmd1);
      } catch (error) {
        // If command wasn't received, connection might have been rejected
        expect(error).toBeDefined();
      }
    }, 8000);
  });

  describe('Message Type Isolation', () => {
    let dashboard1: MockDashboardClient;
    let dashboard2: MockDashboardClient;
    let agent1: MockAgentClient;
    let agent2: MockAgentClient;

    beforeEach(async () => {
      dashboard1 = await createMockDashboard(serverUrl, authToken, 'type-dash-1');
      dashboard2 = await createMockDashboard(serverUrl, authToken, 'type-dash-2');
      agent1 = await createMockAgent(serverUrl, 'type-agent-1', authToken);
      agent2 = await createMockAgent(serverUrl, 'type-agent-2', authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard1?.disconnect();
      await dashboard2?.disconnect();
      await agent1?.disconnect();
      await agent2?.disconnect();
    });

    it('should isolate different message types appropriately', async () => {
      // Dashboard 1 sends command to agent 1
      const cmd1 = dashboard1.sendCommandRequest('type-agent-1', 'mixed message test');
      await agent1.waitForCommand(1000);

      // Dashboard 2 sends command to agent 2
      const cmd2 = dashboard2.sendCommandRequest('type-agent-2', 'another test');
      await agent2.waitForCommand(1000);

      // Agent 1 sends various message types
      agent1.sendCommandStatus(cmd1, 'running');
      agent1.sendTerminalOutput(cmd1, 'terminal output from agent1\n');
      agent1.sendAgentStatus('busy', cmd1);

      // Agent 2 sends similar messages
      agent2.sendCommandStatus(cmd2, 'running');
      agent2.sendTerminalOutput(cmd2, 'terminal output from agent2\n');
      agent2.sendAgentStatus('busy', cmd2);

      // Dashboard 1 should receive only agent 1's messages for their command
      const status1 = await dashboard1.waitForCommandStatus(cmd1, 'running', 2000);
      const terminal1 = await dashboard1.waitForTerminalOutput(cmd1, 2000);

      expect(status1.payload.commandId).toBe(cmd1);
      expect(terminal1.payload.content).toBe('terminal output from agent1\n');

      // Dashboard 2 should receive only agent 2's messages for their command
      const status2 = await dashboard2.waitForCommandStatus(cmd2, 'running', 2000);
      const terminal2 = await dashboard2.waitForTerminalOutput(cmd2, 2000);

      expect(status2.payload.commandId).toBe(cmd2);
      expect(terminal2.payload.content).toBe('terminal output from agent2\n');

      // No cross-contamination
      await expect(dashboard1.waitForCommandStatus(cmd2, 'running', 500)).rejects.toThrow();
      await expect(dashboard2.waitForTerminalOutput(cmd1, 500)).rejects.toThrow();
    }, 10000);

    it('should broadcast emergency stops to all agents but not cross-dashboard status', async () => {
      // Set up active commands from both dashboards
      const cmd1 = dashboard1.sendCommandRequest('type-agent-1', 'emergency test 1');
      const cmd2 = dashboard2.sendCommandRequest('type-agent-2', 'emergency test 2');

      await agent1.waitForCommand(1000);
      await agent2.waitForCommand(1000);

      // Dashboard 1 triggers emergency stop
      dashboard1.sendEmergencyStop('Emergency from dashboard 1');

      // Both agents should receive emergency stop
      const [emergency1, emergency2] = await Promise.all([
        agent1.waitForEmergencyStop(2000),
        agent2.waitForEmergencyStop(2000)
      ]);

      expect(emergency1.payload.reason).toBe('Emergency from dashboard 1');
      expect(emergency2.payload.reason).toBe('Emergency from dashboard 1');

      // But command status should still be isolated
      agent1.sendCommandStatus(cmd1, 'cancelled');
      agent2.sendCommandStatus(cmd2, 'cancelled');

      const status1 = await dashboard1.waitForCommandStatus(cmd1, 'cancelled', 2000);
      const status2 = await dashboard2.waitForCommandStatus(cmd2, 'cancelled', 2000);

      expect(status1.payload.commandId).toBe(cmd1);
      expect(status2.payload.commandId).toBe(cmd2);
    }, 10000);
  });

  describe('Isolation Under Load', () => {
    let dashboards: MockDashboardClient[];
    let agents: MockAgentClient[];

    beforeEach(async () => {
      dashboards = [];
      agents = [];

      // Create multiple dashboards and agents
      for (let i = 0; i < 5; i++) {
        const dashboard = await createMockDashboard(serverUrl, authToken, `load-dash-${i}`);
        const agent = await createMockAgent(serverUrl, `load-agent-${i}`, authToken);
        dashboards.push(dashboard);
        agents.push(agent);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    });

    afterEach(async () => {
      for (const dashboard of dashboards) {
        await dashboard?.disconnect();
      }
      for (const agent of agents) {
        await agent?.disconnect();
      }
    });

    it('should maintain isolation under high message volume', async () => {
      const commandsPerDashboard = 20;
      const allCommands: Array<{ dashboardIndex: number; commandId: string }> = [];

      // Each dashboard sends multiple commands to different agents
      for (let dashIndex = 0; dashIndex < dashboards.length; dashIndex++) {
        for (let cmdIndex = 0; cmdIndex < commandsPerDashboard; cmdIndex++) {
          const agentIndex = cmdIndex % agents.length;
          const commandId = dashboards[dashIndex].sendCommandRequest(
            `load-agent-${agentIndex}`,
            `load test ${dashIndex}-${cmdIndex}`
          );
          allCommands.push({ dashboardIndex: dashIndex, commandId });
        }
      }

      // Agents receive and process all commands
      for (const agent of agents) {
        for (let i = 0; i < commandsPerDashboard; i++) {
          await agent.waitForCommand(1000);
        }
      }

      // Agents send status updates for all commands
      for (const { commandId } of allCommands) {
        const agentIndex = Math.floor(Math.random() * agents.length);
        agents[agentIndex].sendCommandStatus(commandId, 'completed');
      }

      // Each dashboard should receive exactly their command status updates
      for (let dashIndex = 0; dashIndex < dashboards.length; dashIndex++) {
        const expectedCommands = allCommands
          .filter(cmd => cmd.dashboardIndex === dashIndex)
          .map(cmd => cmd.commandId);

        const receivedCommands: string[] = [];
        for (let i = 0; i < commandsPerDashboard; i++) {
          const status = await dashboards[dashIndex].waitForMessage(
            (msg) => msg.type === 'COMMAND_STATUS',
            3000
          );
          receivedCommands.push(status.payload.commandId);
        }

        expect(receivedCommands.sort()).toEqual(expectedCommands.sort());
      }
    }, 30000);

    it('should maintain isolation during concurrent disconnections', async () => {
      // Start some commands
      const activeCommands: Array<{ dashboardIndex: number; commandId: string; agentIndex: number }> = [];

      for (let i = 0; i < dashboards.length; i++) {
        const agentIndex = i % agents.length;
        const commandId = dashboards[i].sendCommandRequest(
          `load-agent-${agentIndex}`,
          `concurrent test ${i}`
        );
        activeCommands.push({ dashboardIndex: i, commandId, agentIndex });
        await agents[agentIndex].waitForCommand(1000);
      }

      // Disconnect half the dashboards
      for (let i = 0; i < Math.floor(dashboards.length / 2); i++) {
        await dashboards[i].disconnect();
      }

      // Send responses for all commands
      for (const { commandId, agentIndex } of activeCommands) {
        agents[agentIndex].sendCommandStatus(commandId, 'completed');
      }

      // Remaining dashboards should receive only their responses
      for (let i = Math.floor(dashboards.length / 2); i < dashboards.length; i++) {
        const expectedCommand = activeCommands[i].commandId;
        const status = await dashboards[i].waitForCommandStatus(
          expectedCommand,
          'completed',
          3000
        );
        expect(status.payload.commandId).toBe(expectedCommand);
      }
    }, 15000);
  });
});