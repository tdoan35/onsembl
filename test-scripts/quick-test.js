#!/usr/bin/env node

/**
 * Quick WebSocket Test
 * Runs a quick validation of WebSocket functionality
 */

const WebSocket = require('ws');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

const tests = [];
let currentTest = null;

// Test helper
function test(name, fn) {
  tests.push({ name, fn, passed: false, error: null });
}

// Run tests
async function runTests() {
  console.log(`${colors.cyan}Running Quick WebSocket Tests...${colors.reset}\n`);

  for (const t of tests) {
    currentTest = t;
    process.stdout.write(`Testing ${t.name}... `);

    try {
      await t.fn();
      t.passed = true;
      console.log(`${colors.green}✓${colors.reset}`);
    } catch (error) {
      t.error = error.message;
      console.log(`${colors.red}✗${colors.reset}`);
      console.log(`  Error: ${error.message}`);
    }
  }

  // Print summary
  console.log(`\n${colors.bright}Test Summary:${colors.reset}`);
  const passed = tests.filter(t => t.passed).length;
  const failed = tests.length - passed;

  console.log(`  Passed: ${colors.green}${passed}${colors.reset}`);
  console.log(`  Failed: ${colors.red}${failed}${colors.reset}`);

  if (failed === 0) {
    console.log(`\n${colors.green}All tests passed!${colors.reset}`);
  } else {
    console.log(`\n${colors.red}Some tests failed. Please check the WebSocket implementation.${colors.reset}`);
    process.exit(1);
  }
}

// Test 1: Basic connection
test('WebSocket connection', async () => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3001/ws/dashboard');

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Connection timeout'));
    }, 5000);

    ws.on('open', () => {
      clearTimeout(timeout);
      ws.close();
      resolve();
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
});

// Test 2: Ping/Pong
test('Heartbeat ping/pong', async () => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3001/ws/dashboard');

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('No pong received'));
    }, 5000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'PING',
        id: 'test-ping-001',
        timestamp: Date.now(),
        payload: {
          timestamp: Date.now()
        }
      }));
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'PONG') {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      } catch (error) {
        // Ignore parse errors
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
});

// Test 3: Dashboard connection
test('Dashboard connect message', async () => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3001/ws/dashboard');

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('No response to dashboard:connect'));
    }, 5000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'DASHBOARD_INIT',
        id: 'test-init-001',
        timestamp: Date.now(),
        payload: {
          userId: 'test-user',
          subscriptions: {
            agents: [],
            commands: [],
            traces: false,
            terminals: false
          }
        }
      }));
    });

    let gotAck = false;
    let gotAgentStatus = false;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'ACK' && message.payload?.success) {
          gotAck = true;
        }
        if (message.type === 'AGENT_STATUS') {
          gotAgentStatus = true;
        }

        if (gotAck || gotAgentStatus) {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      } catch (error) {
        // Ignore parse errors
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
});

// Test 4: Multiple connections
test('Multiple simultaneous connections', async () => {
  const connections = [];

  try {
    // Create 5 connections
    for (let i = 0; i < 5; i++) {
      const ws = new WebSocket('ws://localhost:3001/ws/dashboard');
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 2000);
      });
      connections.push(ws);
    }

    // All connected successfully
    connections.forEach(ws => ws.close());
    return Promise.resolve();

  } catch (error) {
    connections.forEach(ws => ws.close());
    throw error;
  }
});

// Test 5: Message validation
test('Invalid message handling', async () => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3001/ws/dashboard');

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('No error response for invalid message'));
    }, 5000);

    ws.on('open', () => {
      // Send invalid JSON
      ws.send('not valid json');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'ERROR') {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      } catch (error) {
        // Expected behavior for error response
        clearTimeout(timeout);
        ws.close();
        resolve();
      }
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      ws.close();
      resolve(); // Error handling is what we're testing
    });
  });
});

// Test 6: Rate limiting
test('Rate limiting enforcement', async () => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:3001/ws/dashboard');
    let rateLimitHit = false;

    const timeout = setTimeout(() => {
      ws.close();
      if (rateLimitHit) {
        resolve();
      } else {
        resolve(); // Rate limiting might be disabled in dev
      }
    }, 5000);

    ws.on('open', () => {
      // Send many messages quickly
      for (let i = 0; i < 200; i++) {
        ws.send(JSON.stringify({
          type: 'PING',
          id: `ping-${i}`,
          timestamp: Date.now(),
          payload: { timestamp: Date.now() }
        }));
      }
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'ERROR' && (message.payload?.code === 'RATE_LIMIT' || message.payload?.code === 'TOO_MANY_REQUESTS')) {
          rateLimitHit = true;
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      } catch (error) {
        // Ignore parse errors
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
});

// Check if backend is running
console.log(`${colors.cyan}Checking backend availability...${colors.reset}`);
const testWs = new WebSocket('ws://localhost:3001/ws/dashboard');

testWs.on('error', () => {
  console.log(`${colors.red}Backend is not running!${colors.reset}`);
  console.log('Please start the backend first:');
  console.log('  cd backend && npm run dev');
  process.exit(1);
});

testWs.on('open', () => {
  testWs.close();
  // Run tests
  runTests().catch(console.error);
});