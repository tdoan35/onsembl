import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import WebSocket from 'ws';
import { createTestServer, TestContext } from '../helpers/test-server';
import { MessageType } from '@onsembl/agent-protocol';

interface ConcurrencyMetrics {
  connectTime: number;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  avgLatency: number;
  maxLatency: number;
  throughput: number; // messages per second
  memoryUsage?: NodeJS.MemoryUsage;
}

interface LoadTestResult {
  duration: number;
  concurrentConnections: number;
  totalMessages: number;
  successRate: number;
  avgThroughput: number;
  peakMemoryUsage: number;
  connectionSuccessRate: number;
}

describe('WebSocket Concurrency Performance Tests', () => {
  let ctx: TestContext;
  let wsUrl: string;
  let connectedAgents: Map<string, any> = new Map();

  // Increase Jest timeout for long-running tests
  jest.setTimeout(60000);

  beforeAll(async () => {
    ctx = await createTestServer();

    await ctx.server.register(require('@fastify/websocket'));

    // Register WebSocket handler with connection tracking
    ctx.server.register(async function (fastify) {
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        let agentId: string | null = null;

        connection.socket.on('message', (message) => {
          const receiveTime = performance.now();
          const data = JSON.parse(message.toString());

          if (data.type === MessageType.AGENT_CONNECT) {
            agentId = data.payload.agentId;
            connectedAgents.set(agentId, {
              connected: true,
              connectTime: receiveTime,
              messageCount: 0,
            });

            connection.socket.send(JSON.stringify({
              type: 'CONNECTION_ACK',
              payload: {
                agentId,
                timestamp: receiveTime,
              },
            }));
          }

          if (data.type === MessageType.TERMINAL_OUTPUT && agentId) {
            const agent = connectedAgents.get(agentId);
            if (agent) {
              agent.messageCount++;
              connectedAgents.set(agentId, agent);
            }

            const latency = receiveTime - data.payload.sentTime;

            connection.socket.send(JSON.stringify({
              type: 'TERMINAL_ACK',
              payload: {
                commandId: data.payload.commandId,
                sequence: data.payload.sequence,
                agentId,
                receiveTime,
                sentTime: data.payload.sentTime,
                latency,
              },
            }));
          }

          if (data.type === 'THROUGHPUT_TEST' && agentId) {
            // Echo back immediately for throughput testing
            connection.socket.send(JSON.stringify({
              type: 'THROUGHPUT_ACK',
              payload: {
                id: data.payload.id,
                agentId,
                timestamp: receiveTime,
              },
            }));
          }
        });

        connection.socket.on('close', () => {
          if (agentId) {
            const agent = connectedAgents.get(agentId);
            if (agent) {
              agent.connected = false;
              connectedAgents.set(agentId, agent);
            }
          }
        });
      });
    });

    await ctx.server.listen({ port: 0 });
    const address = ctx.server.server.address() as any;
    wsUrl = `ws://localhost:${address.port}/ws/agent`;
  });

  afterAll(async () => {
    connectedAgents.clear();
    await ctx.cleanup();
  });

  function createAgentConnection(agentId: string): Promise<{
    ws: WebSocket;
    metrics: ConcurrencyMetrics;
  }> {
    return new Promise((resolve, reject) => {
      const connectStartTime = performance.now();
      const ws = new WebSocket(wsUrl);
      const metrics: ConcurrencyMetrics = {
        connectTime: 0,
        messagesSent: 0,
        messagesReceived: 0,
        errors: 0,
        avgLatency: 0,
        maxLatency: 0,
        throughput: 0,
      };

      let latencies: number[] = [];

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId,
            token: 'valid-token',
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'CONNECTION_ACK') {
          metrics.connectTime = performance.now() - connectStartTime;
          resolve({ ws, metrics });
        }

        if (message.type === 'TERMINAL_ACK') {
          metrics.messagesReceived++;
          const latency = message.payload.latency;
          latencies.push(latency);
          metrics.avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
          metrics.maxLatency = Math.max(metrics.maxLatency, latency);
        }

        if (message.type === 'THROUGHPUT_ACK') {
          metrics.messagesReceived++;
        }
      });

      ws.on('error', (error) => {
        metrics.errors++;
        reject(error);
      });

      // Timeout after 5 seconds
      setTimeout(() => reject(new Error(`Connection timeout for agent ${agentId}`)), 5000);
    });
  }

  function sendThroughputTest(
    ws: WebSocket,
    agentId: string,
    messageCount: number,
    intervalMs: number = 10
  ): Promise<ConcurrencyMetrics> {
    return new Promise((resolve, reject) => {
      const metrics: ConcurrencyMetrics = {
        connectTime: 0,
        messagesSent: 0,
        messagesReceived: 0,
        errors: 0,
        avgLatency: 0,
        maxLatency: 0,
        throughput: 0,
      };

      const startTime = performance.now();
      let receivedCount = 0;

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'THROUGHPUT_ACK') {
          receivedCount++;
          if (receivedCount === messageCount) {
            const duration = (performance.now() - startTime) / 1000; // Convert to seconds
            metrics.throughput = messageCount / duration;
            metrics.messagesReceived = receivedCount;
            resolve(metrics);
          }
        }
      });

      // Send messages at specified interval
      for (let i = 0; i < messageCount; i++) {
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'THROUGHPUT_TEST',
            payload: {
              id: i,
              agentId,
              timestamp: performance.now(),
            },
          }));
          metrics.messagesSent++;
        }, i * intervalMs);
      }

      // Timeout based on expected duration plus buffer
      const timeoutMs = (messageCount * intervalMs) + 5000;
      setTimeout(() => {
        reject(new Error(`Throughput test timeout for ${agentId}. Received ${receivedCount}/${messageCount}`));
      }, timeoutMs);
    });
  }

  describe('Concurrent Agent Connections', () => {
    it('should handle 10 concurrent agent connections', async () => {
      const concurrentCount = 10;
      const connectionPromises: Promise<{ ws: WebSocket; metrics: ConcurrencyMetrics }>[] = [];

      // Create concurrent connections
      for (let i = 0; i < concurrentCount; i++) {
        connectionPromises.push(createAgentConnection(`agent-${i}`));
      }

      const connections = await Promise.all(connectionPromises);

      // Verify all connections succeeded
      expect(connections).toHaveLength(concurrentCount);

      // Check connection times
      const avgConnectTime = connections.reduce((sum, conn) => sum + conn.metrics.connectTime, 0) / concurrentCount;
      const maxConnectTime = Math.max(...connections.map(conn => conn.metrics.connectTime));

      console.log(`10 Concurrent Connections:`, {
        avgConnectTime: avgConnectTime.toFixed(2) + 'ms',
        maxConnectTime: maxConnectTime.toFixed(2) + 'ms',
        successRate: '100%',
      });

      expect(avgConnectTime).toBeLessThan(1000); // Average under 1 second
      expect(maxConnectTime).toBeLessThan(2000); // Max under 2 seconds

      // Clean up connections
      connections.forEach(({ ws }) => ws.close());
    });

    it('should handle 20 concurrent agent connections', async () => {
      const concurrentCount = 20;
      const connectionPromises: Promise<{ ws: WebSocket; metrics: ConcurrencyMetrics }>[] = [];

      // Create concurrent connections
      for (let i = 0; i < concurrentCount; i++) {
        connectionPromises.push(createAgentConnection(`agent-load-${i}`));
      }

      const results = await Promise.allSettled(connectionPromises);
      const successfulConnections = results.filter(result => result.status === 'fulfilled') as PromiseFulfilledResult<{ ws: WebSocket; metrics: ConcurrencyMetrics }>[];

      const successRate = (successfulConnections.length / concurrentCount) * 100;

      console.log(`20 Concurrent Connections:`, {
        successfulConnections: successfulConnections.length,
        totalAttempts: concurrentCount,
        successRate: successRate.toFixed(1) + '%',
      });

      // Should achieve at least 90% success rate
      expect(successRate).toBeGreaterThanOrEqual(90);

      // Clean up successful connections
      successfulConnections.forEach(result => result.value.ws.close());
    });

    it('should handle 50 concurrent agent connections with graceful degradation', async () => {
      const concurrentCount = 50;
      const connectionPromises: Promise<{ ws: WebSocket; metrics: ConcurrencyMetrics }>[] = [];

      const startTime = performance.now();

      // Create concurrent connections
      for (let i = 0; i < concurrentCount; i++) {
        connectionPromises.push(createAgentConnection(`agent-stress-${i}`));
      }

      const results = await Promise.allSettled(connectionPromises);
      const successfulConnections = results.filter(result => result.status === 'fulfilled') as PromiseFulfilledResult<{ ws: WebSocket; metrics: ConcurrencyMetrics }>[];

      const successRate = (successfulConnections.length / concurrentCount) * 100;
      const totalTime = performance.now() - startTime;

      console.log(`50 Concurrent Connections:`, {
        successfulConnections: successfulConnections.length,
        totalAttempts: concurrentCount,
        successRate: successRate.toFixed(1) + '%',
        totalTime: totalTime.toFixed(2) + 'ms',
      });

      // Should achieve at least 80% success rate under stress
      expect(successRate).toBeGreaterThanOrEqual(80);

      // Clean up successful connections
      successfulConnections.forEach(result => result.value.ws.close());
    });
  });

  describe('Message Throughput Tests', () => {
    it('should handle 100 messages/second per agent with 5 concurrent agents', async () => {
      const agentCount = 5;
      const messagesPerAgent = 100;
      const targetThroughput = 100; // messages per second
      const intervalMs = 10; // 10ms interval = 100 messages/second

      // Create agent connections
      const connections = await Promise.all(
        Array.from({ length: agentCount }, (_, i) =>
          createAgentConnection(`throughput-agent-${i}`)
        )
      );

      // Run throughput tests in parallel
      const throughputPromises = connections.map(({ ws }, index) =>
        sendThroughputTest(ws, `throughput-agent-${index}`, messagesPerAgent, intervalMs)
      );

      const results = await Promise.all(throughputPromises);

      // Analyze results
      const avgThroughput = results.reduce((sum, result) => sum + result.throughput, 0) / agentCount;
      const minThroughput = Math.min(...results.map(r => r.throughput));
      const maxThroughput = Math.max(...results.map(r => r.throughput));

      console.log('Throughput Test Results:', {
        avgThroughput: avgThroughput.toFixed(2) + ' msg/s',
        minThroughput: minThroughput.toFixed(2) + ' msg/s',
        maxThroughput: maxThroughput.toFixed(2) + ' msg/s',
        targetThroughput: targetThroughput + ' msg/s',
      });

      // Each agent should achieve at least 80% of target throughput
      expect(minThroughput).toBeGreaterThanOrEqual(targetThroughput * 0.8);
      expect(avgThroughput).toBeGreaterThanOrEqual(targetThroughput * 0.9);

      // Clean up connections
      connections.forEach(({ ws }) => ws.close());
    });

    it('should maintain performance with 10 agents sending 50 messages each', async () => {
      const agentCount = 10;
      const messagesPerAgent = 50;
      const intervalMs = 20; // 50 messages/second per agent

      // Create agent connections
      const connections = await Promise.all(
        Array.from({ length: agentCount }, (_, i) =>
          createAgentConnection(`perf-agent-${i}`)
        )
      );

      const startTime = performance.now();
      const initialMemory = process.memoryUsage();

      // Run throughput tests in parallel
      const throughputPromises = connections.map(({ ws }, index) =>
        sendThroughputTest(ws, `perf-agent-${index}`, messagesPerAgent, intervalMs)
      );

      const results = await Promise.all(throughputPromises);

      const endTime = performance.now();
      const finalMemory = process.memoryUsage();
      const duration = (endTime - startTime) / 1000; // seconds

      // Calculate metrics
      const totalMessages = agentCount * messagesPerAgent;
      const overallThroughput = totalMessages / duration;
      const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024; // MB

      console.log('Load Test Results:', {
        agentCount,
        totalMessages,
        duration: duration.toFixed(2) + 's',
        overallThroughput: overallThroughput.toFixed(2) + ' msg/s',
        memoryIncrease: memoryIncrease.toFixed(2) + ' MB',
      });

      // Performance expectations
      expect(overallThroughput).toBeGreaterThanOrEqual(400); // At least 400 msg/s total
      expect(memoryIncrease).toBeLessThan(100); // Memory increase should be reasonable

      // All agents should complete successfully
      expect(results.filter(r => r.messagesReceived === messagesPerAgent)).toHaveLength(agentCount);

      // Clean up connections
      connections.forEach(({ ws }) => ws.close());
    });
  });

  describe('Memory Usage and Resource Management', () => {
    it('should manage memory efficiently under load', async () => {
      const agentCount = 15;
      const messagesPerAgent = 30;

      const initialMemory = process.memoryUsage();

      // Create connections and send messages
      const connections = await Promise.all(
        Array.from({ length: agentCount }, (_, i) =>
          createAgentConnection(`memory-agent-${i}`)
        )
      );

      const midTestMemory = process.memoryUsage();

      // Send messages from all agents
      const messagePromises = connections.map(({ ws }, index) =>
        sendThroughputTest(ws, `memory-agent-${index}`, messagesPerAgent, 50)
      );

      await Promise.all(messagePromises);

      const peakMemory = process.memoryUsage();

      // Close all connections
      connections.forEach(({ ws }) => ws.close());

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));

      const finalMemory = process.memoryUsage();

      const memoryStats = {
        initial: (initialMemory.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        midTest: (midTestMemory.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        peak: (peakMemory.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        final: (finalMemory.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        increase: ((peakMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2) + ' MB',
      };

      console.log('Memory Usage Stats:', memoryStats);

      // Memory should not increase dramatically
      const memoryIncreasePercent = ((peakMemory.heapUsed - initialMemory.heapUsed) / initialMemory.heapUsed) * 100;
      expect(memoryIncreasePercent).toBeLessThan(200); // Less than 200% increase

      // Memory should be released after cleanup
      const memoryRetentionPercent = ((finalMemory.heapUsed - initialMemory.heapUsed) / initialMemory.heapUsed) * 100;
      expect(memoryRetentionPercent).toBeLessThan(50); // Less than 50% retention
    });
  });

  describe('Queue Performance Under Load', () => {
    it('should handle command queuing with multiple agents', async () => {
      const agentCount = 8;
      const commandsPerAgent = 20;

      // Create agent connections
      const connections = await Promise.all(
        Array.from({ length: agentCount }, (_, i) =>
          createAgentConnection(`queue-agent-${i}`)
        )
      );

      const startTime = performance.now();
      let totalCommandsProcessed = 0;
      let completedAgents = 0;

      return new Promise<void>((resolve, reject) => {
        connections.forEach(({ ws }, agentIndex) => {
          let commandsProcessed = 0;

          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());

            if (message.type === 'TERMINAL_ACK') {
              commandsProcessed++;
              totalCommandsProcessed++;

              if (commandsProcessed === commandsPerAgent) {
                completedAgents++;

                if (completedAgents === agentCount) {
                  const duration = (performance.now() - startTime) / 1000;
                  const throughput = totalCommandsProcessed / duration;

                  console.log('Queue Performance Results:', {
                    totalCommands: totalCommandsProcessed,
                    duration: duration.toFixed(2) + 's',
                    throughput: throughput.toFixed(2) + ' cmd/s',
                    agentsCompleted: completedAgents,
                  });

                  expect(totalCommandsProcessed).toBe(agentCount * commandsPerAgent);
                  expect(throughput).toBeGreaterThanOrEqual(50); // At least 50 commands/second

                  // Clean up
                  connections.forEach(({ ws }) => ws.close());
                  resolve();
                }
              }
            }
          });

          // Send commands for this agent
          for (let cmdIndex = 0; cmdIndex < commandsPerAgent; cmdIndex++) {
            setTimeout(() => {
              const sentTime = performance.now();
              ws.send(JSON.stringify({
                type: MessageType.TERMINAL_OUTPUT,
                payload: {
                  commandId: `cmd-${agentIndex}-${cmdIndex}`,
                  agentId: `queue-agent-${agentIndex}`,
                  output: `Command ${cmdIndex} output\n`,
                  type: 'stdout',
                  timestamp: new Date().toISOString(),
                  sequence: cmdIndex + 1,
                  sentTime,
                },
              }));
            }, cmdIndex * 25); // 25ms intervals
          }
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          reject(new Error(`Queue test timeout. Processed ${totalCommandsProcessed}/${agentCount * commandsPerAgent} commands`));
        }, 30000);
      });
    });
  });

  describe('Connection Pool Performance', () => {
    it('should handle rapid connection cycling', async () => {
      const cycleCount = 20;
      const connectionsPerCycle = 5;

      let successfulConnections = 0;
      let failedConnections = 0;

      for (let cycle = 0; cycle < cycleCount; cycle++) {
        const cyclePromises = Array.from({ length: connectionsPerCycle }, (_, i) =>
          createAgentConnection(`cycle-${cycle}-agent-${i}`)
            .then(({ ws }) => {
              successfulConnections++;
              // Close immediately
              ws.close();
              return Promise.resolve();
            })
            .catch(() => {
              failedConnections++;
              return Promise.resolve();
            })
        );

        await Promise.all(cyclePromises);

        // Small delay between cycles
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const totalAttempts = cycleCount * connectionsPerCycle;
      const successRate = (successfulConnections / totalAttempts) * 100;

      console.log('Connection Cycling Results:', {
        totalAttempts,
        successfulConnections,
        failedConnections,
        successRate: successRate.toFixed(1) + '%',
      });

      // Should maintain high success rate even with rapid cycling
      expect(successRate).toBeGreaterThanOrEqual(95);
    });
  });
});