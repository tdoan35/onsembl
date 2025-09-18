/**
 * T008: Test message queuing for offline agents
 *
 * This test verifies that messages intended for offline agents
 * are properly queued and delivered when agents reconnect.
 *
 * These tests are designed to FAIL initially since routing is not implemented yet.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createTestServer, generateTestToken } from '../../utils/test-server.js';
import { createMockAgent, MockAgentClient } from '../../utils/mock-agent.js';
import { createMockDashboard, MockDashboardClient } from '../../utils/mock-dashboard.js';
import { v4 as uuidv4 } from 'uuid';

describe('T008: Offline Agent Message Queuing', () => {
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

  describe('Basic Offline Message Queuing', () => {
    let dashboard: MockDashboardClient;
    const agentId = 'offline-test-agent';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
    });

    it('should queue commands for offline agents', async () => {
      // This test should FAIL initially - routing not implemented

      // Send command to offline agent
      const commandId = dashboard.sendCommandRequest(agentId, 'echo "queued command"');

      // Agent is not connected, so command should be queued
      await new Promise(resolve => setTimeout(resolve, 500));

      // Connect agent
      const agent = await createMockAgent(serverUrl, agentId, authToken);

      // Agent should receive the queued command
      const queuedCommand = await agent.waitForCommand(3000);
      expect(queuedCommand.payload.commandId).toBe(commandId);
      expect(queuedCommand.payload.command).toBe('echo "queued command"');

      await agent.disconnect();
    }, 8000);

    it('should queue multiple commands for offline agent', async () => {
      const commands = [
        'echo "first command"',
        'echo "second command"',
        'echo "third command"'
      ];

      // Send multiple commands to offline agent
      const commandIds = commands.map(cmd =>
        dashboard.sendCommandRequest(agentId, cmd)
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Connect agent
      const agent = await createMockAgent(serverUrl, agentId, authToken);

      // Agent should receive all queued commands in order
      const receivedCommands = [];
      for (let i = 0; i < commands.length; i++) {
        const cmd = await agent.waitForCommand(2000);
        receivedCommands.push({
          id: cmd.payload.commandId,
          command: cmd.payload.command
        });
      }

      expect(receivedCommands).toHaveLength(3);
      expect(receivedCommands[0].id).toBe(commandIds[0]);
      expect(receivedCommands[0].command).toBe(commands[0]);
      expect(receivedCommands[1].id).toBe(commandIds[1]);
      expect(receivedCommands[1].command).toBe(commands[1]);
      expect(receivedCommands[2].id).toBe(commandIds[2]);
      expect(receivedCommands[2].command).toBe(commands[2]);

      await agent.disconnect();
    }, 10000);

    it('should preserve command metadata in queued messages', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'ls -la', ['-la']);

      await new Promise(resolve => setTimeout(resolve, 500));

      const agent = await createMockAgent(serverUrl, agentId, authToken);
      const queuedCommand = await agent.waitForCommand(3000);

      expect(queuedCommand.payload.commandId).toBe(commandId);
      expect(queuedCommand.payload.args).toEqual(['-la']);
      expect(queuedCommand.connectionId).toBe(dashboard.connectionId);
      expect(queuedCommand.timestamp).toBeGreaterThan(Date.now() - 10000);

      await agent.disconnect();
    }, 8000);
  });

  describe('Queue Management and Limits', () => {
    let dashboard: MockDashboardClient;
    const agentId = 'queue-management-agent';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
    });

    it('should handle queue overflow gracefully', async () => {
      // Send many commands to test queue limits
      const commandCount = 1000;
      const commandIds = [];

      for (let i = 0; i < commandCount; i++) {
        const commandId = dashboard.sendCommandRequest(agentId, `echo "command ${i}"`);
        commandIds.push(commandId);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const agent = await createMockAgent(serverUrl, agentId, authToken);

      // Should receive at least some commands (depending on queue limit)
      const receivedCommands = [];
      try {
        while (receivedCommands.length < commandCount) {
          const cmd = await agent.waitForCommand(1000);
          receivedCommands.push(cmd.payload.commandId);
        }
      } catch (error) {
        // Expected if queue has limits
      }

      // Should receive at least the most recent commands
      expect(receivedCommands.length).toBeGreaterThan(0);

      await agent.disconnect();
    }, 15000);

    it('should maintain queue order with priority', async () => {
      // Send commands with different priorities (if supported)
      const highPriorityId = dashboard.sendCommandRequest(agentId, 'high priority command');
      const normalPriorityId = dashboard.sendCommandRequest(agentId, 'normal priority command');
      const lowPriorityId = dashboard.sendCommandRequest(agentId, 'low priority command');

      await new Promise(resolve => setTimeout(resolve, 500));

      const agent = await createMockAgent(serverUrl, agentId, authToken);

      // Commands should be delivered in priority order or FIFO order
      const firstCommand = await agent.waitForCommand(2000);
      expect([highPriorityId, normalPriorityId, lowPriorityId])
        .toContain(firstCommand.payload.commandId);

      await agent.disconnect();
    }, 8000);

    it('should clear old queued messages after timeout', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'old command');

      // Wait for message to potentially expire
      await new Promise(resolve => setTimeout(resolve, 2000));

      const agent = await createMockAgent(serverUrl, agentId, authToken);

      // Depending on implementation, old messages might be expired
      try {
        const command = await agent.waitForCommand(1000);
        // If received, should be the sent command
        expect(command.payload.commandId).toBe(commandId);
      } catch (error) {
        // If not received due to expiry, that's also valid behavior
        expect(error).toBeDefined();
      }

      await agent.disconnect();
    }, 8000);
  });

  describe('Multiple Agent Queue Isolation', () => {
    let dashboard: MockDashboardClient;

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
    });

    it('should maintain separate queues for different agents', async () => {
      const agent1Id = 'queue-agent-1';
      const agent2Id = 'queue-agent-2';

      // Send commands to different offline agents
      const command1Id = dashboard.sendCommandRequest(agent1Id, 'command for agent 1');
      const command2Id = dashboard.sendCommandRequest(agent2Id, 'command for agent 2');

      await new Promise(resolve => setTimeout(resolve, 500));

      // Connect agents separately
      const agent1 = await createMockAgent(serverUrl, agent1Id, authToken);
      const command1 = await agent1.waitForCommand(2000);
      expect(command1.payload.commandId).toBe(command1Id);
      expect(command1.payload.command).toBe('command for agent 1');

      const agent2 = await createMockAgent(serverUrl, agent2Id, authToken);
      const command2 = await agent2.waitForCommand(2000);
      expect(command2.payload.commandId).toBe(command2Id);
      expect(command2.payload.command).toBe('command for agent 2');

      // Agents should not receive each other's commands
      await expect(agent1.waitForCommand(500)).rejects.toThrow();
      await expect(agent2.waitForCommand(500)).rejects.toThrow();

      await agent1.disconnect();
      await agent2.disconnect();
    }, 10000);

    it('should handle partial connectivity scenarios', async () => {
      const onlineAgent = await createMockAgent(serverUrl, 'online-agent', authToken);
      const offlineAgentId = 'offline-agent';

      // Send command to online agent - should be delivered immediately
      const onlineCommandId = dashboard.sendCommandRequest('online-agent', 'immediate command');
      const onlineCommand = await onlineAgent.waitForCommand(2000);
      expect(onlineCommand.payload.commandId).toBe(onlineCommandId);

      // Send command to offline agent - should be queued
      const offlineCommandId = dashboard.sendCommandRequest(offlineAgentId, 'queued command');

      await new Promise(resolve => setTimeout(resolve, 500));

      // Connect offline agent
      const offlineAgent = await createMockAgent(serverUrl, offlineAgentId, authToken);
      const queuedCommand = await offlineAgent.waitForCommand(2000);
      expect(queuedCommand.payload.commandId).toBe(offlineCommandId);

      await onlineAgent.disconnect();
      await offlineAgent.disconnect();
    }, 10000);
  });

  describe('Queue Persistence Across Reconnections', () => {
    let dashboard: MockDashboardClient;
    const agentId = 'reconnection-test-agent';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
    });

    it('should preserve queue when agent disconnects and reconnects', async () => {
      // Connect agent initially
      let agent = await createMockAgent(serverUrl, agentId, authToken);

      // Send and receive a command
      const firstCommandId = dashboard.sendCommandRequest(agentId, 'first command');
      await agent.waitForCommand(2000);

      // Disconnect agent
      await agent.disconnect();

      // Send command while agent is offline
      const queuedCommandId = dashboard.sendCommandRequest(agentId, 'queued while offline');

      await new Promise(resolve => setTimeout(resolve, 500));

      // Reconnect agent
      agent = await createMockAgent(serverUrl, agentId, authToken);

      // Should receive the queued command
      const queuedCommand = await agent.waitForCommand(3000);
      expect(queuedCommand.payload.commandId).toBe(queuedCommandId);

      await agent.disconnect();
    }, 10000);

    it('should handle rapid disconnect/reconnect cycles', async () => {
      const commandIds = [];

      for (let cycle = 0; cycle < 3; cycle++) {
        // Connect agent
        const agent = await createMockAgent(serverUrl, agentId, authToken);

        // Send command
        const commandId = dashboard.sendCommandRequest(agentId, `cycle ${cycle} command`);
        commandIds.push(commandId);

        // Quick disconnect
        await agent.disconnect();

        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Final reconnection should deliver all queued commands
      const finalAgent = await createMockAgent(serverUrl, agentId, authToken);

      const receivedCommands = [];
      for (let i = 0; i < commandIds.length; i++) {
        try {
          const cmd = await finalAgent.waitForCommand(2000);
          receivedCommands.push(cmd.payload.commandId);
        } catch (error) {
          // Some commands might be lost due to rapid cycling
          break;
        }
      }

      expect(receivedCommands.length).toBeGreaterThan(0);

      await finalAgent.disconnect();
    }, 15000);
  });

  describe('Emergency Stop and Queue Interaction', () => {
    let dashboard: MockDashboardClient;
    const agentId = 'emergency-queue-agent';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
    });

    it('should handle emergency stop with queued commands', async () => {
      // Send commands to offline agent
      const commandId1 = dashboard.sendCommandRequest(agentId, 'queued command 1');
      const commandId2 = dashboard.sendCommandRequest(agentId, 'queued command 2');

      // Trigger emergency stop
      dashboard.sendEmergencyStop('Emergency while commands queued');

      await new Promise(resolve => setTimeout(resolve, 500));

      // Connect agent
      const agent = await createMockAgent(serverUrl, agentId, authToken);

      // Agent should receive emergency stop immediately
      const emergencyStop = await agent.waitForEmergencyStop(2000);
      expect(emergencyStop.payload.reason).toBe('Emergency while commands queued');

      // Queued commands might be cancelled or still delivered
      // Implementation dependent behavior
      try {
        await agent.waitForCommand(1000);
      } catch (error) {
        // Commands might be cancelled due to emergency stop
      }

      await agent.disconnect();
    }, 8000);

    it('should clear queue on emergency stop (if implemented)', async () => {
      // Send commands to offline agent
      dashboard.sendCommandRequest(agentId, 'command before emergency');

      // Trigger emergency stop
      dashboard.sendEmergencyStop('Clear queue emergency');

      await new Promise(resolve => setTimeout(resolve, 500));

      // Connect agent after emergency stop
      const agent = await createMockAgent(serverUrl, agentId, authToken);

      // Should receive emergency stop but not queued commands
      const emergencyStop = await agent.waitForEmergencyStop(2000);
      expect(emergencyStop.type).toBe('EMERGENCY_STOP');

      // Queued commands should be cleared
      await expect(agent.waitForCommand(1000)).rejects.toThrow();

      await agent.disconnect();
    }, 8000);
  });

  describe('Queue Error Handling and Edge Cases', () => {
    let dashboard: MockDashboardClient;
    const agentId = 'error-test-agent';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
    });

    it('should handle queue with malformed messages', async () => {
      // Send valid command
      const validCommandId = dashboard.sendCommandRequest(agentId, 'valid command');

      // Send malformed command
      const malformedMessage = {
        id: uuidv4(),
        type: 'COMMAND_REQUEST',
        timestamp: Date.now(),
        connectionId: dashboard.connectionId,
        payload: {
          // Missing required fields
          command: 'malformed'
        }
      };
      dashboard.sendDashboardMessage(malformedMessage as any);

      await new Promise(resolve => setTimeout(resolve, 500));

      const agent = await createMockAgent(serverUrl, agentId, authToken);

      // Should receive valid command, malformed message should be filtered
      const command = await agent.waitForCommand(2000);
      expect(command.payload.commandId).toBe(validCommandId);

      await agent.disconnect();
    }, 8000);

    it('should handle agent ID mismatch in queue', async () => {
      // Send command to agent
      const commandId = dashboard.sendCommandRequest(agentId, 'correct agent command');

      await new Promise(resolve => setTimeout(resolve, 500));

      // Connect with different agent ID
      const wrongAgent = await createMockAgent(serverUrl, 'wrong-agent-id', authToken);

      // Should not receive command meant for different agent
      await expect(wrongAgent.waitForCommand(1000)).rejects.toThrow();

      // Connect correct agent
      const correctAgent = await createMockAgent(serverUrl, agentId, authToken);
      const command = await correctAgent.waitForCommand(2000);
      expect(command.payload.commandId).toBe(commandId);

      await wrongAgent.disconnect();
      await correctAgent.disconnect();
    }, 10000);

    it('should handle dashboard disconnection with queued messages', async () => {
      // Send command to offline agent
      const commandId = dashboard.sendCommandRequest(agentId, 'command before disconnect');

      // Disconnect dashboard
      await dashboard.disconnect();

      await new Promise(resolve => setTimeout(resolve, 500));

      // Connect agent
      const agent = await createMockAgent(serverUrl, agentId, authToken);

      // Command should still be delivered even if dashboard disconnected
      const command = await agent.waitForCommand(3000);
      expect(command.payload.commandId).toBe(commandId);

      await agent.disconnect();
    }, 8000);

    it('should handle memory pressure with large queue', async () => {
      // Send many large commands
      const commandCount = 100;
      const largeCommand = 'echo "' + 'A'.repeat(10000) + '"';

      for (let i = 0; i < commandCount; i++) {
        dashboard.sendCommandRequest(agentId, largeCommand);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const agent = await createMockAgent(serverUrl, agentId, authToken);

      // Should handle large queue without crashing
      let receivedCount = 0;
      try {
        for (let i = 0; i < commandCount; i++) {
          await agent.waitForCommand(1000);
          receivedCount++;
        }
      } catch (error) {
        // May not receive all due to memory limits
      }

      expect(receivedCount).toBeGreaterThan(0);

      await agent.disconnect();
    }, 20000);
  });
});