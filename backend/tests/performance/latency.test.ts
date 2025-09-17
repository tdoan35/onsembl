import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import WebSocket from 'ws';
import { createTestServer, TestContext } from '../helpers/test-server';
import { MessageType } from '@onsembl/agent-protocol';

interface LatencyMeasurement {
  timestamp: number;
  latency: number;
  payloadSize: number;
}

interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
  count: number;
}

describe('WebSocket Latency Performance Tests', () => {
  let ctx: TestContext;
  let wsUrl: string;

  beforeAll(async () => {
    ctx = await createTestServer();

    await ctx.server.register(require('@fastify/websocket'));

    // Register WebSocket handler with latency tracking
    ctx.server.register(async function (fastify) {
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        connection.socket.on('message', (message) => {
          const receiveTime = performance.now();
          const data = JSON.parse(message.toString());

          if (data.type === MessageType.AGENT_CONNECT) {
            connection.socket.send(JSON.stringify({
              type: 'CONNECTION_ACK',
              payload: {
                agentId: data.payload.agentId,
                timestamp: receiveTime
              },
            }));
          }

          if (data.type === MessageType.TERMINAL_OUTPUT) {
            // Calculate round-trip latency
            const sentTime = data.payload.sentTime;
            const latency = receiveTime - sentTime;

            connection.socket.send(JSON.stringify({
              type: 'TERMINAL_ACK',
              payload: {
                commandId: data.payload.commandId,
                sequence: data.payload.sequence,
                receiveTime,
                sentTime,
                latency,
                payloadSize: Buffer.byteLength(message.toString(), 'utf8'),
              },
            }));
          }

          // Echo back ping messages for latency testing
          if (data.type === 'PING') {
            connection.socket.send(JSON.stringify({
              type: 'PONG',
              payload: {
                id: data.payload.id,
                sentTime: data.payload.sentTime,
                receiveTime,
                latency: receiveTime - data.payload.sentTime,
                payloadSize: Buffer.byteLength(message.toString(), 'utf8'),
              },
            }));
          }
        });
      });
    });

    await ctx.server.listen({ port: 0 });
    const address = ctx.server.server.address() as any;
    wsUrl = `ws://localhost:${address.port}/ws/agent`;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  function calculateLatencyStats(measurements: LatencyMeasurement[]): LatencyStats {
    const latencies = measurements.map(m => m.latency).sort((a, b) => a - b);
    const count = latencies.length;

    return {
      p50: latencies[Math.floor(count * 0.5)],
      p95: latencies[Math.floor(count * 0.95)],
      p99: latencies[Math.floor(count * 0.99)],
      avg: latencies.reduce((sum, lat) => sum + lat, 0) / count,
      min: latencies[0],
      max: latencies[count - 1],
      count,
    };
  }

  function createWebSocketConnection(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: MessageType.AGENT_CONNECT,
          payload: {
            agentId: 'perf-test-agent',
            token: 'valid-token',
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'CONNECTION_ACK') {
          resolve(ws);
        }
      });

      ws.on('error', reject);

      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  }

  describe('Message Round-trip Latency', () => {
    it('should maintain <200ms latency for basic ping messages', async () => {
      const ws = await createWebSocketConnection();
      const measurements: LatencyMeasurement[] = [];
      const numPings = 100;
      let completedPings = 0;

      return new Promise<void>((resolve, reject) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'PONG') {
            measurements.push({
              timestamp: message.payload.receiveTime,
              latency: message.payload.latency,
              payloadSize: message.payload.payloadSize,
            });

            completedPings++;

            if (completedPings === numPings) {
              const stats = calculateLatencyStats(measurements);

              console.log('Ping Latency Stats (ms):', {
                p50: stats.p50.toFixed(2),
                p95: stats.p95.toFixed(2),
                p99: stats.p99.toFixed(2),
                avg: stats.avg.toFixed(2),
                min: stats.min.toFixed(2),
                max: stats.max.toFixed(2),
              });

              // Validate latency requirements
              expect(stats.p95).toBeLessThan(200);
              expect(stats.p99).toBeLessThan(300);
              expect(stats.avg).toBeLessThan(100);

              ws.close();
              resolve();
            }
          }
        });

        // Send ping messages with 10ms intervals
        for (let i = 0; i < numPings; i++) {
          setTimeout(() => {
            const sentTime = performance.now();
            ws.send(JSON.stringify({
              type: 'PING',
              payload: {
                id: i,
                sentTime,
              },
            }));
          }, i * 10);
        }

        // Timeout after 10 seconds
        setTimeout(() => reject(new Error('Test timeout')), 10000);
      });
    });

    it('should maintain <200ms latency for terminal output streaming', async () => {
      const ws = await createWebSocketConnection();
      const measurements: LatencyMeasurement[] = [];
      const numOutputs = 50;
      let completedOutputs = 0;

      return new Promise<void>((resolve, reject) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'TERMINAL_ACK') {
            measurements.push({
              timestamp: message.payload.receiveTime,
              latency: message.payload.latency,
              payloadSize: message.payload.payloadSize,
            });

            completedOutputs++;

            if (completedOutputs === numOutputs) {
              const stats = calculateLatencyStats(measurements);

              console.log('Terminal Output Latency Stats (ms):', {
                p50: stats.p50.toFixed(2),
                p95: stats.p95.toFixed(2),
                p99: stats.p99.toFixed(2),
                avg: stats.avg.toFixed(2),
                min: stats.min.toFixed(2),
                max: stats.max.toFixed(2),
              });

              // Validate latency requirements
              expect(stats.p95).toBeLessThan(200);
              expect(stats.p99).toBeLessThan(300);
              expect(stats.avg).toBeLessThan(100);

              ws.close();
              resolve();
            }
          }
        });

        // Send terminal outputs with realistic content
        for (let i = 0; i < numOutputs; i++) {
          setTimeout(() => {
            const sentTime = performance.now();
            ws.send(JSON.stringify({
              type: MessageType.TERMINAL_OUTPUT,
              payload: {
                commandId: `cmd-${i}`,
                agentId: 'perf-test-agent',
                output: `Terminal output line ${i}\n`,
                type: 'stdout',
                timestamp: new Date().toISOString(),
                sequence: i + 1,
                sentTime,
              },
            }));
          }, i * 20); // 20ms intervals
        }

        // Timeout after 10 seconds
        setTimeout(() => reject(new Error('Test timeout')), 10000);
      });
    });
  });

  describe('Payload Size Impact on Latency', () => {
    const payloadSizes = [
      { name: 'Small (100 bytes)', size: 100 },
      { name: 'Medium (1KB)', size: 1024 },
      { name: 'Large (10KB)', size: 10240 },
      { name: 'Max (1MB)', size: 1048576 },
    ];

    payloadSizes.forEach(({ name, size }) => {
      it(`should handle ${name} payloads with acceptable latency`, async () => {
        const ws = await createWebSocketConnection();
        const measurements: LatencyMeasurement[] = [];
        const numMessages = 20;
        let completedMessages = 0;

        // Generate payload of specified size
        const payload = 'x'.repeat(size);

        return new Promise<void>((resolve, reject) => {
          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());

            if (message.type === 'TERMINAL_ACK') {
              measurements.push({
                timestamp: message.payload.receiveTime,
                latency: message.payload.latency,
                payloadSize: message.payload.payloadSize,
              });

              completedMessages++;

              if (completedMessages === numMessages) {
                const stats = calculateLatencyStats(measurements);

                console.log(`${name} Payload Latency Stats (ms):`, {
                  p50: stats.p50.toFixed(2),
                  p95: stats.p95.toFixed(2),
                  p99: stats.p99.toFixed(2),
                  avg: stats.avg.toFixed(2),
                  actualSize: measurements[0].payloadSize,
                });

                // Adjust expectations based on payload size
                const expectedP95 = size < 1024 ? 200 : size < 10240 ? 500 : 1000;
                expect(stats.p95).toBeLessThan(expectedP95);

                ws.close();
                resolve();
              }
            }
          });

          // Send messages with large payloads
          for (let i = 0; i < numMessages; i++) {
            setTimeout(() => {
              const sentTime = performance.now();
              ws.send(JSON.stringify({
                type: MessageType.TERMINAL_OUTPUT,
                payload: {
                  commandId: `cmd-${i}`,
                  agentId: 'perf-test-agent',
                  output: payload,
                  type: 'stdout',
                  timestamp: new Date().toISOString(),
                  sequence: i + 1,
                  sentTime,
                },
              }));
            }, i * 100); // 100ms intervals for large payloads
          }

          // Timeout after 15 seconds for large payloads
          setTimeout(() => reject(new Error('Test timeout')), 15000);
        });
      });
    });
  });

  describe('Network Condition Simulation', () => {
    it('should handle burst of messages without significant latency degradation', async () => {
      const ws = await createWebSocketConnection();
      const measurements: LatencyMeasurement[] = [];
      const burstSize = 20;
      let completedMessages = 0;

      return new Promise<void>((resolve, reject) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'TERMINAL_ACK') {
            measurements.push({
              timestamp: message.payload.receiveTime,
              latency: message.payload.latency,
              payloadSize: message.payload.payloadSize,
            });

            completedMessages++;

            if (completedMessages === burstSize) {
              const stats = calculateLatencyStats(measurements);

              console.log('Burst Messages Latency Stats (ms):', {
                p50: stats.p50.toFixed(2),
                p95: stats.p95.toFixed(2),
                p99: stats.p99.toFixed(2),
                avg: stats.avg.toFixed(2),
                min: stats.min.toFixed(2),
                max: stats.max.toFixed(2),
              });

              // Under burst conditions, allow slightly higher latency
              expect(stats.p95).toBeLessThan(300);
              expect(stats.p99).toBeLessThan(500);

              ws.close();
              resolve();
            }
          }
        });

        // Send burst of messages simultaneously
        for (let i = 0; i < burstSize; i++) {
          const sentTime = performance.now();
          ws.send(JSON.stringify({
            type: MessageType.TERMINAL_OUTPUT,
            payload: {
              commandId: `cmd-${i}`,
              agentId: 'perf-test-agent',
              output: `Burst message ${i}\n`,
              type: 'stdout',
              timestamp: new Date().toISOString(),
              sequence: i + 1,
              sentTime,
            },
          }));
        }

        // Timeout after 5 seconds
        setTimeout(() => reject(new Error('Test timeout')), 5000);
      });
    });

    it('should recover quickly after connection interruption', async () => {
      let ws = await createWebSocketConnection();
      const measurements: LatencyMeasurement[] = [];
      let reconnectStartTime: number;
      let reconnectCompleteTime: number;

      return new Promise<void>((resolve, reject) => {
        let messageCount = 0;
        const totalMessages = 10;

        const handleMessage = (data: Buffer) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'CONNECTION_ACK' && reconnectStartTime) {
            reconnectCompleteTime = performance.now();
            const reconnectTime = reconnectCompleteTime - reconnectStartTime;

            console.log(`Reconnection time: ${reconnectTime.toFixed(2)}ms`);
            expect(reconnectTime).toBeLessThan(1000); // Should reconnect within 1 second

            // Continue sending messages after reconnection
            sendMessage();
          }

          if (message.type === 'TERMINAL_ACK') {
            measurements.push({
              timestamp: message.payload.receiveTime,
              latency: message.payload.latency,
              payloadSize: message.payload.payloadSize,
            });

            messageCount++;

            if (messageCount === totalMessages) {
              const stats = calculateLatencyStats(measurements);

              console.log('Post-reconnection Latency Stats (ms):', {
                p50: stats.p50.toFixed(2),
                p95: stats.p95.toFixed(2),
                avg: stats.avg.toFixed(2),
              });

              expect(stats.p95).toBeLessThan(200);
              resolve();
            } else {
              // Simulate connection drop after 3rd message
              if (messageCount === 3) {
                ws.close();

                // Reconnect after 100ms
                setTimeout(async () => {
                  reconnectStartTime = performance.now();
                  ws = await createWebSocketConnection();
                  ws.on('message', handleMessage);
                }, 100);
              } else {
                setTimeout(sendMessage, 50);
              }
            }
          }
        };

        const sendMessage = () => {
          const sentTime = performance.now();
          ws.send(JSON.stringify({
            type: MessageType.TERMINAL_OUTPUT,
            payload: {
              commandId: `cmd-${messageCount}`,
              agentId: 'perf-test-agent',
              output: `Recovery test message ${messageCount}\n`,
              type: 'stdout',
              timestamp: new Date().toISOString(),
              sequence: messageCount + 1,
              sentTime,
            },
          }));
        };

        ws.on('message', handleMessage);

        // Start the test
        sendMessage();

        // Timeout after 10 seconds
        setTimeout(() => reject(new Error('Test timeout')), 10000);
      });
    });
  });
});