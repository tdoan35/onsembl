/**
 * T006: Test TERMINAL_STREAM routing to correct dashboard
 *
 * This test verifies that TERMINAL_STREAM messages sent from agents
 * are correctly routed to the dashboard that initiated the command.
 *
 * These tests are designed to FAIL initially since routing is not implemented yet.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createTestServer, generateTestToken } from '../../utils/test-server.js';
import { createMockAgent, MockAgentClient } from '../../utils/mock-agent.js';
import { createMockDashboard, MockDashboardClient } from '../../utils/mock-dashboard.js';
import { v4 as uuidv4 } from 'uuid';

describe('T006: Terminal Stream Routing', () => {
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

  describe('Basic Terminal Stream Routing', () => {
    let dashboard: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'test-agent-terminal';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent = await createMockAgent(serverUrl, agentId, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent?.disconnect();
    });

    it('should route TERMINAL_STREAM from agent to originating dashboard', async () => {
      // This test should FAIL initially - routing not implemented

      const commandId = dashboard.sendCommandRequest(agentId, 'echo "Hello Terminal"');
      await agent.waitForCommand(1000);

      // Agent sends terminal output
      const outputContent = 'Hello Terminal\n';
      agent.sendTerminalOutput(commandId, outputContent);

      // Dashboard should receive terminal output
      const terminalOutput = await dashboard.waitForTerminalOutput(commandId, 2000);

      expect(terminalOutput).toBeDefined();
      expect(terminalOutput.type).toBe('TERMINAL_STREAM');
      expect(terminalOutput.payload.commandId).toBe(commandId);
      expect(terminalOutput.payload.content).toBe(outputContent);
      expect(terminalOutput.payload.isError).toBe(false);
      expect(terminalOutput.agentId).toBe(agentId);
    }, 5000);

    it('should route both stdout and stderr streams', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'ls /nonexistent');
      await agent.waitForCommand(1000);

      // Send stdout
      const stdoutContent = 'Some output\n';
      agent.sendTerminalOutput(commandId, stdoutContent, false);

      // Send stderr
      const stderrContent = 'ls: /nonexistent: No such file or directory\n';
      agent.sendTerminalOutput(commandId, stderrContent, true);

      // Dashboard should receive both streams
      const stdoutMsg = await dashboard.waitForTerminalOutput(commandId, 2000);
      const stderrMsg = await dashboard.waitForTerminalOutput(commandId, 2000);

      expect(stdoutMsg.payload.content).toBe(stdoutContent);
      expect(stdoutMsg.payload.isError).toBe(false);

      expect(stderrMsg.payload.content).toBe(stderrContent);
      expect(stderrMsg.payload.isError).toBe(true);
    }, 5000);

    it('should preserve terminal output ordering', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'complex-command');
      await agent.waitForCommand(1000);

      const outputs = [
        'Starting process...\n',
        'Processing item 1\n',
        'Processing item 2\n',
        'Process complete\n'
      ];

      // Send outputs rapidly
      for (const output of outputs) {
        agent.sendTerminalOutput(commandId, output);
      }

      // Collect all outputs in order
      const receivedOutputs: string[] = [];
      for (let i = 0; i < outputs.length; i++) {
        const terminalMsg = await dashboard.waitForTerminalOutput(commandId, 2000);
        receivedOutputs.push(terminalMsg.payload.content);
      }

      expect(receivedOutputs).toEqual(outputs);
    }, 8000);
  });

  describe('Multiple Dashboard Isolation', () => {
    let dashboard1: MockDashboardClient;
    let dashboard2: MockDashboardClient;
    let dashboard3: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'test-agent-multi-terminal';

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

    it('should route terminal output only to originating dashboard', async () => {
      // Dashboard 1 sends command
      const commandId1 = dashboard1.sendCommandRequest(agentId, 'echo "Dashboard 1 output"');
      await agent.waitForCommand(1000);

      // Dashboard 2 sends different command
      const commandId2 = dashboard2.sendCommandRequest(agentId, 'echo "Dashboard 2 output"');
      await agent.waitForCommand(1000);

      // Agent sends terminal output for command from dashboard 1
      const output1 = 'Dashboard 1 output\n';
      agent.sendTerminalOutput(commandId1, output1);

      // Only dashboard 1 should receive this output
      const terminalMsg1 = await dashboard1.waitForTerminalOutput(commandId1, 2000);
      expect(terminalMsg1.payload.content).toBe(output1);

      // Dashboard 2 and 3 should not receive this output
      await expect(dashboard2.waitForTerminalOutput(commandId1, 500))
        .rejects.toThrow();
      await expect(dashboard3.waitForTerminalOutput(commandId1, 500))
        .rejects.toThrow();
    }, 8000);

    it('should handle concurrent terminal streams from same agent', async () => {
      const commandId1 = dashboard1.sendCommandRequest(agentId, 'command1');
      const commandId2 = dashboard2.sendCommandRequest(agentId, 'command2');
      const commandId3 = dashboard3.sendCommandRequest(agentId, 'command3');

      // Wait for all commands
      await agent.waitForCommand(1000);
      await agent.waitForCommand(1000);
      await agent.waitForCommand(1000);

      // Send terminal output for all commands simultaneously
      const output1 = 'Output from command 1\n';
      const output2 = 'Output from command 2\n';
      const output3 = 'Output from command 3\n';

      agent.sendTerminalOutput(commandId1, output1);
      agent.sendTerminalOutput(commandId2, output2);
      agent.sendTerminalOutput(commandId3, output3);

      // Each dashboard should receive only their output
      const [term1, term2, term3] = await Promise.all([
        dashboard1.waitForTerminalOutput(commandId1, 2000),
        dashboard2.waitForTerminalOutput(commandId2, 2000),
        dashboard3.waitForTerminalOutput(commandId3, 2000)
      ]);

      expect(term1.payload.content).toBe(output1);
      expect(term2.payload.content).toBe(output2);
      expect(term3.payload.content).toBe(output3);
    }, 8000);
  });

  describe('Large Output Handling', () => {
    let dashboard: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'test-agent-large-output';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent = await createMockAgent(serverUrl, agentId, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent?.disconnect();
    });

    it('should handle large terminal output chunks', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'cat large-file');
      await agent.waitForCommand(1000);

      // Send large output chunk (1MB)
      const largeOutput = 'A'.repeat(1024 * 1024) + '\n';
      agent.sendTerminalOutput(commandId, largeOutput);

      const terminalMsg = await dashboard.waitForTerminalOutput(commandId, 5000);
      expect(terminalMsg.payload.content).toBe(largeOutput);
      expect(terminalMsg.payload.content.length).toBe(1024 * 1024 + 1);
    }, 10000);

    it('should handle rapid small output chunks', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'tail -f log-file');
      await agent.waitForCommand(1000);

      const chunkCount = 1000;
      const chunks: string[] = [];

      // Send many small chunks rapidly
      for (let i = 0; i < chunkCount; i++) {
        const chunk = `Log line ${i}\n`;
        chunks.push(chunk);
        agent.sendTerminalOutput(commandId, chunk);
      }

      // Collect all chunks
      const receivedChunks: string[] = [];
      for (let i = 0; i < chunkCount; i++) {
        const terminalMsg = await dashboard.waitForTerminalOutput(commandId, 2000);
        receivedChunks.push(terminalMsg.payload.content);
      }

      expect(receivedChunks).toEqual(chunks);
    }, 30000);

    it('should handle mixed stdout/stderr in rapid succession', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'mixed-output-command');
      await agent.waitForCommand(1000);

      const outputs = [
        { content: 'stdout line 1\n', isError: false },
        { content: 'stderr line 1\n', isError: true },
        { content: 'stdout line 2\n', isError: false },
        { content: 'stderr line 2\n', isError: true },
        { content: 'stdout line 3\n', isError: false }
      ];

      // Send mixed outputs rapidly
      for (const output of outputs) {
        agent.sendTerminalOutput(commandId, output.content, output.isError);
      }

      // Collect all outputs maintaining order and type
      const receivedOutputs: Array<{ content: string; isError: boolean }> = [];
      for (let i = 0; i < outputs.length; i++) {
        const terminalMsg = await dashboard.waitForTerminalOutput(commandId, 2000);
        receivedOutputs.push({
          content: terminalMsg.payload.content,
          isError: terminalMsg.payload.isError
        });
      }

      expect(receivedOutputs).toEqual(outputs);
    }, 8000);
  });

  describe('Terminal Stream Cleanup', () => {
    let dashboard: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'test-agent-cleanup';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent = await createMockAgent(serverUrl, agentId, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent?.disconnect();
    });

    it('should stop routing terminal output after command completion', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'echo "test"');
      await agent.waitForCommand(1000);

      // Send some output and complete command
      agent.sendTerminalOutput(commandId, 'test\n');
      agent.sendCommandStatus(commandId, 'completed');

      // Receive initial output and status
      await dashboard.waitForTerminalOutput(commandId, 2000);
      await dashboard.waitForCommandStatus(commandId, 'completed', 2000);

      // Try to send more output after completion
      agent.sendTerminalOutput(commandId, 'late output\n');

      // Dashboard should not receive output after completion
      await expect(dashboard.waitForTerminalOutput(commandId, 1000))
        .rejects.toThrow();
    }, 5000);

    it('should handle orphaned terminal output gracefully', async () => {
      // Send terminal output for non-existent command
      const fakeCommandId = uuidv4();
      agent.sendTerminalOutput(fakeCommandId, 'orphaned output\n');

      // No dashboard should receive this output
      await expect(dashboard.waitForMessage(
        (msg) => msg.type === 'TERMINAL_STREAM' && msg.payload.commandId === fakeCommandId,
        1000
      )).rejects.toThrow();
    }, 3000);

    it('should clean up terminal routing when dashboard disconnects', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'long-running-command');
      await agent.waitForCommand(1000);

      // Send initial output
      agent.sendTerminalOutput(commandId, 'Initial output\n');
      await dashboard.waitForTerminalOutput(commandId, 2000);

      // Disconnect dashboard
      await dashboard.disconnect();

      // Agent continues sending output
      agent.sendTerminalOutput(commandId, 'Orphaned output\n');

      // Output should not be delivered anywhere
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Reconnect dashboard - should not receive old terminal output
      dashboard = await createMockDashboard(serverUrl, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(dashboard.waitForMessage(
        (msg) => msg.type === 'TERMINAL_STREAM' && msg.payload.commandId === commandId,
        1000
      )).rejects.toThrow();
    }, 8000);
  });

  describe('Error Handling and Edge Cases', () => {
    let dashboard: MockDashboardClient;
    let agent: MockAgentClient;
    const agentId = 'test-agent-terminal-errors';

    beforeEach(async () => {
      dashboard = await createMockDashboard(serverUrl, authToken);
      agent = await createMockAgent(serverUrl, agentId, authToken);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(async () => {
      await dashboard?.disconnect();
      await agent?.disconnect();
    });

    it('should handle malformed terminal stream messages', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'test');
      await agent.waitForCommand(1000);

      // Send malformed terminal stream message
      const malformedStream = {
        id: uuidv4(),
        type: 'TERMINAL_STREAM',
        timestamp: Date.now(),
        agentId: agentId,
        connectionId: agent.connectionId,
        payload: {
          // Missing required commandId
          content: 'test output\n',
          isError: false
        }
      };

      agent.sendAgentMessage(malformedStream as any);

      // Dashboard should not receive malformed message
      await expect(dashboard.waitForMessage(
        (msg) => msg.type === 'TERMINAL_STREAM',
        1000
      )).rejects.toThrow();
    }, 3000);

    it('should handle terminal output from wrong agent ID', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'test');
      await agent.waitForCommand(1000);

      // Create another agent and try to send terminal output for the command
      const wrongAgent = await createMockAgent(serverUrl, 'wrong-agent', authToken);
      wrongAgent.sendTerminalOutput(commandId, 'wrong output\n');

      // Dashboard should not receive output from wrong agent
      await expect(dashboard.waitForTerminalOutput(commandId, 1000))
        .rejects.toThrow();

      await wrongAgent.disconnect();
    }, 5000);

    it('should handle empty and null terminal content', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'test');
      await agent.waitForCommand(1000);

      // Send empty content
      agent.sendTerminalOutput(commandId, '');

      const emptyOutput = await dashboard.waitForTerminalOutput(commandId, 2000);
      expect(emptyOutput.payload.content).toBe('');

      // Send content with null characters
      const nullContent = 'text\0with\0nulls\n';
      agent.sendTerminalOutput(commandId, nullContent);

      const nullOutput = await dashboard.waitForTerminalOutput(commandId, 2000);
      expect(nullOutput.payload.content).toBe(nullContent);
    }, 5000);

    it('should handle unicode and special characters in terminal output', async () => {
      const commandId = dashboard.sendCommandRequest(agentId, 'unicode-test');
      await agent.waitForCommand(1000);

      const unicodeContent = '🚀 Unicode test: 你好世界 ñáéíóú àèìòù\n';
      agent.sendTerminalOutput(commandId, unicodeContent);

      const terminalMsg = await dashboard.waitForTerminalOutput(commandId, 2000);
      expect(terminalMsg.payload.content).toBe(unicodeContent);
    }, 5000);
  });
});