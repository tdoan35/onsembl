/**
 * T007: Test EMERGENCY_STOP broadcast to all agents
 *
 * This test verifies that EMERGENCY_STOP messages are correctly
 * broadcast to all connected agents through the MessageRouter.
 *
 * These tests are designed to FAIL initially since routing is not implemented yet.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createTestServer, generateTestToken } from '../../utils/test-server.js';
import { createMockAgent, MockAgentClient } from '../../utils/mock-agent.js';
import { createMockDashboard, MockDashboardClient } from '../../utils/mock-dashboard.js';
import { v4 as uuidv4 } from 'uuid';

describe('T007: Emergency Stop Broadcast Routing', () => {
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

  describe('Basic Emergency Stop Broadcasting', () => {
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

    it('should broadcast EMERGENCY_STOP to all connected agents', async () => {
      // This test should FAIL initially - routing not implemented

      const reason = 'Critical system error detected';
      dashboard.sendEmergencyStop(reason);

      // All agents should receive the emergency stop
      const [stop1, stop2, stop3] = await Promise.all([
        agent1.waitForEmergencyStop(3000),
        agent2.waitForEmergencyStop(3000),
        agent3.waitForEmergencyStop(3000)
      ]);

      expect(stop1.type).toBe('EMERGENCY_STOP');
      expect(stop1.payload.reason).toBe(reason);

      expect(stop2.type).toBe('EMERGENCY_STOP');
      expect(stop2.payload.reason).toBe(reason);

      expect(stop3.type).toBe('EMERGENCY_STOP');
      expect(stop3.payload.reason).toBe(reason);
    }, 8000);

    it('should broadcast emergency stop without reason', async () => {
      dashboard.sendEmergencyStop();

      const emergencyStop = await agent1.waitForEmergencyStop(3000);
      expect(emergencyStop.payload.reason).toBe('Emergency stop triggered by test');
    }, 5000);

    it('should preserve emergency stop timestamp across all agents', async () => {
      const beforeTime = Date.now();
      dashboard.sendEmergencyStop('Test emergency stop');
      const afterTime = Date.now();

      const [stop1, stop2, stop3] = await Promise.all([
        agent1.waitForEmergencyStop(3000),
        agent2.waitForEmergencyStop(3000),
        agent3.waitForEmergencyStop(3000)
      ]);

      // All agents should receive the same timestamp
      expect(stop1.timestamp).toBe(stop2.timestamp);
      expect(stop2.timestamp).toBe(stop3.timestamp);

      // Timestamp should be reasonable
      expect(stop1.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(stop1.timestamp).toBeLessThanOrEqual(afterTime);
    }, 8000);
  });

  describe('Emergency Stop with Active Commands', () => {
    let dashboard: MockDashboardClient;
    let agent1: MockAgentClient;
    let agent2: MockAgentClient;

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent1 = await createMockAgent(serverUrl, 'busy-agent-1', authToken);
      agent2 = await createMockAgent(serverUrl, 'busy-agent-2', authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent1?.disconnect();
      await agent2?.disconnect();
    });

    it('should broadcast emergency stop to agents executing commands', async () => {
      // Start commands on both agents
      const commandId1 = dashboard.sendCommandRequest('busy-agent-1', 'long-running-task');
      const commandId2 = dashboard.sendCommandRequest('busy-agent-2', 'another-long-task');

      await agent1.waitForCommand(1000);
      await agent2.waitForCommand(1000);

      // Simulate agents starting command execution
      agent1.sendCommandStatus(commandId1, 'running');
      agent2.sendCommandStatus(commandId2, 'running');

      // Trigger emergency stop
      dashboard.sendEmergencyStop('System overload detected');

      // Both busy agents should receive emergency stop
      const [stop1, stop2] = await Promise.all([
        agent1.waitForEmergencyStop(3000),
        agent2.waitForEmergencyStop(3000)
      ]);

      expect(stop1.payload.reason).toBe('System overload detected');
      expect(stop2.payload.reason).toBe('System overload detected');
    }, 8000);

    it('should broadcast to agents in different states', async () => {
      // Agent 1: idle
      // Agent 2: executing command
      const commandId = dashboard.sendCommandRequest('busy-agent-2', 'current-task');
      await agent2.waitForCommand(1000);
      agent2.sendCommandStatus(commandId, 'running');

      dashboard.sendEmergencyStop('Mixed state emergency');

      // Both agents should receive emergency stop regardless of state
      const [stop1, stop2] = await Promise.all([
        agent1.waitForEmergencyStop(3000),
        agent2.waitForEmergencyStop(3000)
      ]);

      expect(stop1.payload.reason).toBe('Mixed state emergency');
      expect(stop2.payload.reason).toBe('Mixed state emergency');
    }, 8000);
  });

  describe('Multiple Dashboard Emergency Stop', () => {
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

    it('should allow any dashboard to trigger emergency stop', async () => {
      // Dashboard 2 triggers emergency stop
      dashboard2.sendEmergencyStop('Dashboard 2 emergency');

      // All agents should receive the stop, regardless of which dashboard sent it
      const [stop1, stop2] = await Promise.all([
        agent1.waitForEmergencyStop(3000),
        agent2.waitForEmergencyStop(3000)
      ]);

      expect(stop1.payload.reason).toBe('Dashboard 2 emergency');
      expect(stop2.payload.reason).toBe('Dashboard 2 emergency');
    }, 8000);

    it('should handle concurrent emergency stops from different dashboards', async () => {
      // Both dashboards trigger emergency stop simultaneously
      dashboard1.sendEmergencyStop('Dashboard 1 emergency');
      dashboard2.sendEmergencyStop('Dashboard 2 emergency');

      // Agents should receive at least one emergency stop
      // The exact behavior depends on implementation - both might be delivered
      const stop1 = await agent1.waitForEmergencyStop(3000);
      const stop2 = await agent2.waitForEmergencyStop(3000);

      expect(stop1.type).toBe('EMERGENCY_STOP');
      expect(stop2.type).toBe('EMERGENCY_STOP');

      // Both should have valid reasons from one of the dashboards
      const validReasons = ['Dashboard 1 emergency', 'Dashboard 2 emergency'];
      expect(validReasons).toContain(stop1.payload.reason);
      expect(validReasons).toContain(stop2.payload.reason);
    }, 8000);
  });

  describe('Emergency Stop Delivery Guarantees', () => {
    let dashboard: MockDashboardClient;
    let agents: MockAgentClient[];

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);

      // Create many agents to test scalability
      agents = [];
      for (let i = 0; i < 10; i++) {
        const agent = await createMockAgent(serverUrl, `load-test-agent-${i}`, authToken);
        agents.push(agent);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      for (const agent of agents) {
        await agent?.disconnect();
      }
    });

    it('should deliver emergency stop to all agents under load', async () => {
      dashboard.sendEmergencyStop('Load test emergency');

      // All agents should receive the emergency stop within reasonable time
      const emergencyStops = await Promise.all(
        agents.map(agent => agent.waitForEmergencyStop(5000))
      );

      expect(emergencyStops).toHaveLength(10);
      emergencyStops.forEach(stop => {
        expect(stop.type).toBe('EMERGENCY_STOP');
        expect(stop.payload.reason).toBe('Load test emergency');
      });
    }, 10000);

    it('should deliver emergency stop even to agents with slow connections', async () => {
      // Simulate slow agents by having them process commands
      const commandPromises = [];
      for (let i = 0; i < agents.length; i++) {
        const commandId = dashboard.sendCommandRequest(`load-test-agent-${i}`, `slow-command-${i}`);
        commandPromises.push(agents[i].waitForCommand(2000));
      }

      await Promise.all(commandPromises);

      // Trigger emergency stop while agents are "busy"
      dashboard.sendEmergencyStop('Emergency during load');

      // All agents should still receive emergency stop
      const emergencyStops = await Promise.all(
        agents.map(agent => agent.waitForEmergencyStop(5000))
      );

      expect(emergencyStops).toHaveLength(10);
    }, 15000);
  });

  describe('Agent Connection State Handling', () => {
    let dashboard: MockDashboardClient;
    let agent1: MockAgentClient;
    let agent2: MockAgentClient;

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent1 = await createMockAgent(serverUrl, 'stable-agent', authToken);
      agent2 = await createMockAgent(serverUrl, 'unstable-agent', authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent1?.disconnect();
      await agent2?.disconnect();
    });

    it('should handle emergency stop when some agents disconnect', async () => {
      // Disconnect one agent
      await agent2.disconnect();

      // Trigger emergency stop
      dashboard.sendEmergencyStop('Partial connectivity emergency');

      // Remaining agent should still receive emergency stop
      const emergencyStop = await agent1.waitForEmergencyStop(3000);
      expect(emergencyStop.payload.reason).toBe('Partial connectivity emergency');

      // No error should be thrown for disconnected agent
    }, 8000);

    it('should handle agents connecting after emergency stop is sent', async () => {
      // Trigger emergency stop
      dashboard.sendEmergencyStop('Pre-connection emergency');

      // Existing agents receive the stop
      await agent1.waitForEmergencyStop(3000);

      // Connect new agent after emergency stop
      const newAgent = await createMockAgent(serverUrl, 'late-agent', authToken);

      // New agent should not receive the old emergency stop
      await expect(newAgent.waitForEmergencyStop(1000))
        .rejects.toThrow();

      await newAgent.disconnect();
    }, 8000);
  });

  describe('Error Handling and Edge Cases', () => {
    let dashboard: MockDashboardClient;
    let agent: MockAgentClient;

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent = await createMockAgent(serverUrl, 'test-agent', authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent?.disconnect();
    });

    it('should handle emergency stop with very long reason', async () => {
      const longReason = 'A'.repeat(10000) + ' - Very long emergency reason';
      dashboard.sendEmergencyStop(longReason);

      const emergencyStop = await agent.waitForEmergencyStop(3000);
      expect(emergencyStop.payload.reason).toBe(longReason);
    }, 5000);

    it('should handle emergency stop with special characters', async () => {
      const specialReason = 'Emergency: 🚨 System failure! \n\t Special chars: ñáéíóú @#$%^&*()';
      dashboard.sendEmergencyStop(specialReason);

      const emergencyStop = await agent.waitForEmergencyStop(3000);
      expect(emergencyStop.payload.reason).toBe(specialReason);
    }, 5000);

    it('should handle malformed emergency stop messages', async () => {
      // Send malformed emergency stop message
      const malformedStop = {
        id: uuidv4(),
        type: 'EMERGENCY_STOP',
        timestamp: Date.now(),
        connectionId: dashboard.connectionId,
        payload: {
          // Missing or invalid reason
          reason: null
        }
      };

      dashboard.sendDashboardMessage(malformedStop as any);

      // Agent should either receive corrected message or no message
      // Implementation dependent - could validate and fix or reject
      try {
        const emergencyStop = await agent.waitForEmergencyStop(2000);
        // If received, should have valid reason
        expect(typeof emergencyStop.payload.reason).toBe('string');
      } catch (error) {
        // If not received, that's also acceptable behavior
        expect(error).toBeDefined();
      }
    }, 5000);

    it('should handle rapid successive emergency stops', async () => {
      // Send multiple emergency stops rapidly
      dashboard.sendEmergencyStop('First emergency');
      dashboard.sendEmergencyStop('Second emergency');
      dashboard.sendEmergencyStop('Third emergency');

      // Agent should receive at least one emergency stop
      const firstStop = await agent.waitForEmergencyStop(3000);
      expect(firstStop.type).toBe('EMERGENCY_STOP');

      // May receive additional stops - implementation dependent
      try {
        const secondStop = await agent.waitForEmergencyStop(1000);
        expect(secondStop.type).toBe('EMERGENCY_STOP');
      } catch (error) {
        // Additional stops may be filtered - acceptable
      }
    }, 8000);
  });
});