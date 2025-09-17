#!/usr/bin/env node

/**
 * WebSocket Stress Test
 * Tests the system under high load conditions
 * Usage: node stress-test.js [connections] [messagesPerSecond]
 */

const WebSocket = require('ws');

// Configuration
const SERVER_URL = process.env.WS_URL || 'ws://localhost:3001/ws/dashboard';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'test-token';
const NUM_CONNECTIONS = parseInt(process.argv[2]) || 10;
const MESSAGES_PER_SECOND = parseInt(process.argv[3]) || 10;

// Colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

// Statistics
const stats = {
  connectionsCreated: 0,
  connectionsActive: 0,
  connectionsFailed: 0,
  messagesSent: 0,
  messagesReceived: 0,
  errors: 0,
  latencies: [],
  startTime: Date.now()
};

// Active connections
const connections = [];

console.log(`${colors.bright}WebSocket Stress Test${colors.reset}`);
console.log(`Target: ${SERVER_URL}`);
console.log(`Connections: ${NUM_CONNECTIONS}`);
console.log(`Messages/sec: ${MESSAGES_PER_SECOND}`);
console.log('');

// Create connection
function createConnection(id) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SERVER_URL, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    const connection = {
      id,
      ws,
      connected: false,
      messageCount: 0,
      lastPing: null
    };

    ws.on('open', () => {
      stats.connectionsActive++;
      connection.connected = true;

      // Send initial connect message
      ws.send(JSON.stringify({
        type: 'dashboard:connect',
        dashboardId: `stress-test-${id}`,
        userId: `user-${id}`,
        timestamp: new Date().toISOString()
      }));

      console.log(`${colors.green}✓${colors.reset} Connection ${id} established`);
      resolve(connection);
    });

    ws.on('message', (data) => {
      stats.messagesReceived++;
      connection.messageCount++;

      try {
        const message = JSON.parse(data.toString());

        // Calculate latency for pongs
        if (message.type === 'heartbeat:pong' && connection.lastPing) {
          const latency = Date.now() - connection.lastPing;
          stats.latencies.push(latency);
          connection.lastPing = null;
        }
      } catch (error) {
        stats.errors++;
      }
    });

    ws.on('close', () => {
      stats.connectionsActive--;
      connection.connected = false;
      console.log(`${colors.yellow}✗${colors.reset} Connection ${id} closed`);
    });

    ws.on('error', (error) => {
      stats.errors++;
      stats.connectionsFailed++;
      console.error(`${colors.red}✗${colors.reset} Connection ${id} error:`, error.message);
      reject(error);
    });
  });
}

// Send message on connection
function sendMessage(connection, type = 'heartbeat:ping') {
  if (!connection.connected) return;

  const message = {
    type,
    timestamp: new Date().toISOString()
  };

  if (type === 'heartbeat:ping') {
    message.sequence = stats.messagesSent;
    connection.lastPing = Date.now();
  }

  try {
    connection.ws.send(JSON.stringify(message));
    stats.messagesSent++;
  } catch (error) {
    stats.errors++;
  }
}

// Create terminal output message
function createTerminalOutput(agentId, commandId, lineNum) {
  return {
    type: 'terminal:output',
    agentId,
    commandId,
    output: {
      type: 'stdout',
      content: `Line ${lineNum}: ${Array(80).fill('=').join('')}\n`,
      timestamp: new Date().toISOString()
    },
    timestamp: new Date().toISOString()
  };
}

// Main stress test
async function runStressTest() {
  console.log(`${colors.cyan}Creating ${NUM_CONNECTIONS} connections...${colors.reset}`);

  // Create connections
  for (let i = 0; i < NUM_CONNECTIONS; i++) {
    try {
      const connection = await createConnection(i);
      connections.push(connection);
      stats.connectionsCreated++;

      // Stagger connection creation
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Failed to create connection ${i}`);
    }
  }

  console.log(`${colors.green}Created ${stats.connectionsCreated} connections${colors.reset}`);
  console.log('');

  // Start sending messages
  console.log(`${colors.cyan}Starting message flood (${MESSAGES_PER_SECOND} msg/sec)...${colors.reset}`);

  const messageInterval = 1000 / MESSAGES_PER_SECOND;
  let messageType = 0;

  const sendInterval = setInterval(() => {
    connections.forEach(connection => {
      if (!connection.connected) return;

      // Rotate through different message types
      switch (messageType % 4) {
        case 0:
          sendMessage(connection, 'heartbeat:ping');
          break;
        case 1:
          // Send command request
          connection.ws.send(JSON.stringify({
            type: 'command:request',
            agentId: `agent-${connection.id}`,
            command: 'stress-test',
            args: ['--test'],
            timestamp: new Date().toISOString()
          }));
          stats.messagesSent++;
          break;
        case 2:
          // Send terminal output
          connection.ws.send(JSON.stringify(
            createTerminalOutput(
              `agent-${connection.id}`,
              `cmd-${Date.now()}`,
              stats.messagesSent
            )
          ));
          stats.messagesSent++;
          break;
        case 3:
          // Send status update
          connection.ws.send(JSON.stringify({
            type: 'agent:status',
            agentId: `agent-${connection.id}`,
            status: 'online',
            metrics: {
              cpuUsage: Math.random() * 100,
              memoryUsage: Math.random() * 100,
              activeCommands: Math.floor(Math.random() * 5)
            },
            timestamp: new Date().toISOString()
          }));
          stats.messagesSent++;
          break;
      }
    });

    messageType++;
  }, messageInterval);

  // Print statistics every second
  const statsInterval = setInterval(() => {
    const runtime = ((Date.now() - stats.startTime) / 1000).toFixed(1);
    const avgLatency = stats.latencies.length > 0
      ? (stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length).toFixed(1)
      : 'N/A';

    console.log(`${colors.bright}=== Statistics (${runtime}s) ===${colors.reset}`);
    console.log(`Active Connections: ${stats.connectionsActive}/${stats.connectionsCreated}`);
    console.log(`Messages Sent: ${stats.messagesSent}`);
    console.log(`Messages Received: ${stats.messagesReceived}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Average Latency: ${avgLatency}ms`);
    console.log(`Rate: ${(stats.messagesSent / runtime).toFixed(1)} msg/sec`);
    console.log('');
  }, 5000);

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log(`\n${colors.yellow}Shutting down stress test...${colors.reset}`);

    clearInterval(sendInterval);
    clearInterval(statsInterval);

    // Close all connections
    connections.forEach(connection => {
      if (connection.connected) {
        connection.ws.close();
      }
    });

    // Print final statistics
    const runtime = ((Date.now() - stats.startTime) / 1000).toFixed(1);
    const avgLatency = stats.latencies.length > 0
      ? (stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length).toFixed(1)
      : 'N/A';

    console.log('');
    console.log(`${colors.bright}=== Final Statistics ===${colors.reset}`);
    console.log(`Runtime: ${runtime}s`);
    console.log(`Connections Created: ${stats.connectionsCreated}`);
    console.log(`Connections Failed: ${stats.connectionsFailed}`);
    console.log(`Total Messages Sent: ${stats.messagesSent}`);
    console.log(`Total Messages Received: ${stats.messagesReceived}`);
    console.log(`Total Errors: ${stats.errors}`);
    console.log(`Average Latency: ${avgLatency}ms`);
    console.log(`Average Rate: ${(stats.messagesSent / runtime).toFixed(1)} msg/sec`);

    if (stats.latencies.length > 0) {
      const sorted = [...stats.latencies].sort((a, b) => a - b);
      console.log(`Min Latency: ${sorted[0]}ms`);
      console.log(`Max Latency: ${sorted[sorted.length - 1]}ms`);
      console.log(`P50 Latency: ${sorted[Math.floor(sorted.length * 0.5)]}ms`);
      console.log(`P95 Latency: ${sorted[Math.floor(sorted.length * 0.95)]}ms`);
      console.log(`P99 Latency: ${sorted[Math.floor(sorted.length * 0.99)]}ms`);
    }

    process.exit(0);
  });
}

// Run the stress test
runStressTest().catch(error => {
  console.error(`${colors.red}Stress test failed:${colors.reset}`, error);
  process.exit(1);
});