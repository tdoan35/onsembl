import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { createTestServer } from '../test-utils/server';
import { setupTestDatabase, cleanupTestDatabase } from '../test-utils/database';
import { createTestAgent, createTestCommand } from '../test-utils/fixtures';
import { waitForMessage, sendWebSocketMessage } from '../test-utils/websocket';
import type { AgentMessage, DashboardMessage } from '@onsembl/agent-protocol';

describe('Integration: Emergency Stop', () => {
  let server: FastifyInstance;
  let agentWs1: WebSocket;
  let agentWs2: WebSocket;
  let agentWs3: WebSocket;
  let dashboardWs: WebSocket;
  let authToken: string;

  beforeAll(async () => {
    await setupTestDatabase();
    server = await createTestServer();

    // Get auth token for testing
    const authResponse = await server.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { token: 'test-magic-token' }
    });
    authToken = JSON.parse(authResponse.body).token;
  });

  afterAll(async () => {
    agentWs1?.close();
    agentWs2?.close();
    agentWs3?.close();
    dashboardWs?.close();
    await server.close();
    await cleanupTestDatabase();
  });

  it('should stop all running agents immediately when emergency stop is triggered', async () => {
    // Test Scenario from quickstart.md Test 4
    // Expected: All agents stop immediately

    // Step 1: Connect multiple agents
    const agent1 = await createTestAgent({ name: 'claude-dev-1' });
    const agent2 = await createTestAgent({ name: 'gemini-dev-2' });
    const agent3 = await createTestAgent({ name: 'codex-dev-3' });

    agentWs1 = new WebSocket(`ws://localhost:3000/agent/${agent1.id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    agentWs2 = new WebSocket(`ws://localhost:3000/agent/${agent2.id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    agentWs3 = new WebSocket(`ws://localhost:3000/agent/${agent3.id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    // Wait for all agents to connect
    await Promise.all([
      waitForMessage(agentWs1, 'AGENT_CONNECT_ACK'),
      waitForMessage(agentWs2, 'AGENT_CONNECT_ACK'),
      waitForMessage(agentWs3, 'AGENT_CONNECT_ACK')
    ]);

    // Step 2: Start commands on each agent
    const command1 = await createTestCommand({
      agentId: agent1.id,
      command: 'npm run build',
      status: 'running'
    });

    const command2 = await createTestCommand({
      agentId: agent2.id,
      command: 'python train.py',
      status: 'running'
    });

    const command3 = await createTestCommand({
      agentId: agent3.id,
      command: 'cargo test',
      status: 'running'
    });

    // Send command execution messages
    await sendWebSocketMessage(agentWs1, {
      type: 'COMMAND_ACK',
      payload: { commandId: command1.id, status: 'running' }
    });

    await sendWebSocketMessage(agentWs2, {
      type: 'COMMAND_ACK',
      payload: { commandId: command2.id, status: 'running' }
    });

    await sendWebSocketMessage(agentWs3, {
      type: 'COMMAND_ACK',
      payload: { commandId: command3.id, status: 'running' }
    });

    // Step 3: Connect dashboard WebSocket to monitor
    dashboardWs = new WebSocket('ws://localhost:3000/dashboard', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    await waitForMessage(dashboardWs, 'DASHBOARD_INIT');

    // Step 4: Trigger emergency stop
    const emergencyResponse = await server.inject({
      method: 'POST',
      url: '/emergency-stop',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(emergencyResponse.statusCode).toBe(200);
    const emergencyResult = JSON.parse(emergencyResponse.body);
    expect(emergencyResult.agentsStopped).toBe(3);

    // Step 5: Verify all agents received stop commands
    const [stopMsg1, stopMsg2, stopMsg3] = await Promise.all([
      waitForMessage(agentWs1, 'COMMAND_CANCEL'),
      waitForMessage(agentWs2, 'COMMAND_CANCEL'),
      waitForMessage(agentWs3, 'COMMAND_CANCEL')
    ]);

    expect(stopMsg1.payload.reason).toContain('Emergency stop');
    expect(stopMsg2.payload.reason).toContain('Emergency stop');
    expect(stopMsg3.payload.reason).toContain('Emergency stop');

    // Step 6: Verify dashboard received emergency stop notification
    const dashboardNotification = await waitForMessage(dashboardWs, 'EMERGENCY_STOP');
    expect(dashboardNotification.payload.agentsStopped).toBe(3);
    expect(dashboardNotification.payload.commandsCancelled).toBeGreaterThanOrEqual(3);

    // Step 7: Verify commands are marked as cancelled in database
    const commandsResponse = await server.inject({
      method: 'GET',
      url: '/commands?status=cancelled',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const cancelledCommands = JSON.parse(commandsResponse.body);
    const cancelledIds = cancelledCommands.map((c: any) => c.id);

    expect(cancelledIds).toContain(command1.id);
    expect(cancelledIds).toContain(command2.id);
    expect(cancelledIds).toContain(command3.id);

    // Step 8: Verify audit log entry
    const auditResponse = await server.inject({
      method: 'GET',
      url: '/audit-logs?eventType=emergency_stop',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const auditLogs = JSON.parse(auditResponse.body);
    expect(auditLogs.length).toBeGreaterThan(0);

    const latestEmergencyStop = auditLogs[0];
    expect(latestEmergencyStop.eventType).toBe('emergency_stop');
    expect(latestEmergencyStop.details.agentsStopped).toBe(3);
  });

  it('should handle emergency stop when some agents are idle', async () => {
    // Additional test: Emergency stop with mixed agent states

    // Connect one agent and keep it idle
    const idleAgent = await createTestAgent({ name: 'idle-agent' });
    const idleWs = new WebSocket(`ws://localhost:3000/agent/${idleAgent.id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    await waitForMessage(idleWs, 'AGENT_CONNECT_ACK');

    // Connect another agent and give it a command
    const busyAgent = await createTestAgent({ name: 'busy-agent' });
    const busyWs = new WebSocket(`ws://localhost:3000/agent/${busyAgent.id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    await waitForMessage(busyWs, 'AGENT_CONNECT_ACK');

    const command = await createTestCommand({
      agentId: busyAgent.id,
      command: 'long-running-task',
      status: 'running'
    });

    await sendWebSocketMessage(busyWs, {
      type: 'COMMAND_ACK',
      payload: { commandId: command.id, status: 'running' }
    });

    // Trigger emergency stop
    const response = await server.inject({
      method: 'POST',
      url: '/emergency-stop',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(response.statusCode).toBe(200);
    const result = JSON.parse(response.body);

    // Both agents should be counted as stopped
    expect(result.agentsStopped).toBe(2);

    // Only the busy agent's command should be cancelled
    expect(result.commandsCancelled).toBe(1);

    // Verify busy agent received cancel
    const busyCancel = await waitForMessage(busyWs, 'COMMAND_CANCEL');
    expect(busyCancel.payload.commandId).toBe(command.id);

    // Clean up
    idleWs.close();
    busyWs.close();
  });

  it('should be idempotent when called multiple times', async () => {
    // Test that multiple emergency stops don't cause issues

    const agent = await createTestAgent({ name: 'test-agent' });
    const ws = new WebSocket(`ws://localhost:3000/agent/${agent.id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    await waitForMessage(ws, 'AGENT_CONNECT_ACK');

    // First emergency stop
    const response1 = await server.inject({
      method: 'POST',
      url: '/emergency-stop',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(response1.statusCode).toBe(200);
    const result1 = JSON.parse(response1.body);
    expect(result1.agentsStopped).toBe(1);

    // Second emergency stop (should be safe)
    const response2 = await server.inject({
      method: 'POST',
      url: '/emergency-stop',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(response2.statusCode).toBe(200);
    const result2 = JSON.parse(response2.body);
    // No new agents stopped since they were already stopped
    expect(result2.agentsStopped).toBe(0);

    ws.close();
  });

  it('should stop queued commands during emergency stop', async () => {
    // Test that queued commands are also cancelled

    const agent = await createTestAgent({ name: 'queue-test-agent' });

    // Create multiple commands - one running, others queued
    const runningCommand = await createTestCommand({
      agentId: agent.id,
      command: 'current-task',
      status: 'running'
    });

    const queuedCommand1 = await createTestCommand({
      agentId: agent.id,
      command: 'queued-task-1',
      status: 'queued'
    });

    const queuedCommand2 = await createTestCommand({
      agentId: agent.id,
      command: 'queued-task-2',
      status: 'queued'
    });

    // Trigger emergency stop
    const response = await server.inject({
      method: 'POST',
      url: '/emergency-stop',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(response.statusCode).toBe(200);
    const result = JSON.parse(response.body);

    // All commands should be cancelled
    expect(result.commandsCancelled).toBe(3);

    // Verify all commands are cancelled in database
    const verifyCommand = async (id: string) => {
      const cmdResponse = await server.inject({
        method: 'GET',
        url: `/commands/${id}`,
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      const cmd = JSON.parse(cmdResponse.body);
      expect(cmd.status).toBe('cancelled');
    };

    await Promise.all([
      verifyCommand(runningCommand.id),
      verifyCommand(queuedCommand1.id),
      verifyCommand(queuedCommand2.id)
    ]);
  });
});