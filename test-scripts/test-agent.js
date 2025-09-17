#!/usr/bin/env node

/**
 * Test Agent Simulator
 * Simulates an AI agent connecting to the WebSocket server
 * Usage: node test-agent.js [agentId] [agentType]
 */

const WebSocket = require('ws');
const readline = require('readline');

// Configuration
const SERVER_URL = process.env.WS_URL || 'ws://localhost:3001/ws/agent';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'test-token';
const AGENT_ID = process.argv[2] || `test-agent-${Date.now()}`;
const AGENT_TYPE = process.argv[3] || 'claude';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

// Create WebSocket connection
console.log(`${colors.cyan}Connecting to ${SERVER_URL}...${colors.reset}`);
const ws = new WebSocket(SERVER_URL, {
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`
  }
});

// Track state
let isConnected = false;
let runningCommands = new Map();

// WebSocket event handlers
ws.on('open', () => {
  console.log(`${colors.green}✓ Connected to server${colors.reset}`);

  // Send agent connect message
  const connectMessage = {
    type: 'agent:connect',
    agentId: AGENT_ID,
    agentType: AGENT_TYPE,
    version: '1.0.0',
    hostMachine: {
      platform: process.platform,
      cpus: require('os').cpus().length,
      memory: require('os').totalmem()
    },
    capabilities: {
      supportsInterrupt: true,
      supportsStreaming: true,
      maxConcurrentCommands: 3
    },
    timestamp: new Date().toISOString()
  };

  ws.send(JSON.stringify(connectMessage));
  console.log(`${colors.blue}→ Sent agent:connect for ${AGENT_ID}${colors.reset}`);

  isConnected = true;
  startHeartbeat();
  startStatusUpdates();
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log(`${colors.yellow}← Received:${colors.reset}`, message.type);

    handleMessage(message);
  } catch (error) {
    console.error(`${colors.red}Error parsing message:${colors.reset}`, error);
  }
});

ws.on('close', () => {
  console.log(`${colors.red}✗ Disconnected from server${colors.reset}`);
  isConnected = false;
  process.exit(0);
});

ws.on('error', (error) => {
  console.error(`${colors.red}WebSocket error:${colors.reset}`, error.message);
});

// Message handlers
function handleMessage(message) {
  switch (message.type) {
    case 'command:execute':
      handleCommandExecute(message);
      break;

    case 'command:interrupt':
      handleCommandInterrupt(message);
      break;

    case 'heartbeat:ping':
      handlePing(message);
      break;

    case 'system:emergency-stop':
      handleEmergencyStop();
      break;

    case 'ACK':
      console.log(`${colors.green}✓ Message acknowledged${colors.reset}`);
      break;

    default:
      console.log(`${colors.cyan}ℹ Unhandled message type: ${message.type}${colors.reset}`);
  }
}

// Command execution
function handleCommandExecute(message) {
  const { commandId, command, args } = message.payload;
  console.log(`${colors.bright}Executing command: ${command} ${args?.join(' ') || ''}${colors.reset}`);

  // Store command
  runningCommands.set(commandId, {
    command,
    startTime: Date.now(),
    interrupted: false
  });

  // Send status update
  sendMessage({
    type: 'command:status',
    commandId,
    agentId: AGENT_ID,
    status: 'running',
    timestamp: new Date().toISOString()
  });

  // Simulate command execution with output
  simulateCommandOutput(commandId, command);
}

function simulateCommandOutput(commandId, command) {
  const outputs = [
    `${colors.cyan}Starting: ${command}${colors.reset}`,
    'Initializing environment...',
    'Loading dependencies...',
    '  ✓ Dependencies loaded',
    'Running command...',
    '  → Processing...',
    '  → Analyzing...',
    '  → Generating output...',
    `${colors.green}✓ Command completed successfully${colors.reset}`
  ];

  let index = 0;
  const interval = setInterval(() => {
    const cmd = runningCommands.get(commandId);
    if (!cmd || cmd.interrupted) {
      clearInterval(interval);
      if (cmd?.interrupted) {
        sendTerminalOutput(commandId, `${colors.yellow}Command interrupted by user${colors.reset}`, 'system');
      }
      return;
    }

    if (index < outputs.length) {
      sendTerminalOutput(commandId, outputs[index], index === outputs.length - 1 ? 'stdout' : 'stdout');
      index++;
    } else {
      // Command complete
      clearInterval(interval);
      completeCommand(commandId, 0);
    }
  }, 500);
}

function sendTerminalOutput(commandId, content, type = 'stdout') {
  sendMessage({
    type: 'terminal:output',
    agentId: AGENT_ID,
    commandId,
    output: {
      type,
      content: content + '\n',
      timestamp: new Date().toISOString()
    },
    timestamp: new Date().toISOString()
  });
}

function completeCommand(commandId, exitCode) {
  const cmd = runningCommands.get(commandId);
  if (!cmd) return;

  const duration = Date.now() - cmd.startTime;

  sendMessage({
    type: 'command:complete',
    commandId,
    agentId: AGENT_ID,
    exitCode,
    duration,
    timestamp: new Date().toISOString()
  });

  runningCommands.delete(commandId);
  console.log(`${colors.green}✓ Command completed in ${duration}ms${colors.reset}`);
}

// Command interrupt
function handleCommandInterrupt(message) {
  const { commandId } = message.payload;
  const cmd = runningCommands.get(commandId);

  if (cmd) {
    console.log(`${colors.yellow}⚠ Interrupting command: ${commandId}${colors.reset}`);
    cmd.interrupted = true;

    sendMessage({
      type: 'command:status',
      commandId,
      agentId: AGENT_ID,
      status: 'interrupted',
      timestamp: new Date().toISOString()
    });

    completeCommand(commandId, 130); // SIGINT exit code
  }
}

// Emergency stop
function handleEmergencyStop() {
  console.log(`${colors.red}🛑 EMERGENCY STOP - Halting all operations${colors.reset}`);

  // Stop all running commands
  for (const [commandId, cmd] of runningCommands) {
    cmd.interrupted = true;
    completeCommand(commandId, 130);
  }

  // Close connection
  setTimeout(() => {
    ws.close();
  }, 1000);
}

// Heartbeat
function startHeartbeat() {
  setInterval(() => {
    if (!isConnected) return;

    sendMessage({
      type: 'agent:heartbeat',
      agentId: AGENT_ID,
      timestamp: new Date().toISOString()
    });
  }, 30000); // Every 30 seconds
}

// Status updates
function startStatusUpdates() {
  setInterval(() => {
    if (!isConnected) return;

    const status = runningCommands.size > 0 ? 'busy' : 'online';

    sendMessage({
      type: 'agent:status',
      agentId: AGENT_ID,
      status,
      metrics: {
        cpuUsage: Math.random() * 100,
        memoryUsage: Math.random() * 100,
        activeCommands: runningCommands.size
      },
      timestamp: new Date().toISOString()
    });

    console.log(`${colors.cyan}→ Status update: ${status} (${runningCommands.size} commands)${colors.reset}`);
  }, 5000); // Every 5 seconds
}

// Ping handler
function handlePing(message) {
  sendMessage({
    type: 'heartbeat:pong',
    timestamp: new Date().toISOString(),
    latency: Date.now() - new Date(message.timestamp).getTime()
  });
}

// Send message helper
function sendMessage(message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Interactive CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(`
${colors.bright}Test Agent Controls:${colors.reset}
  status    - Send status update
  error     - Simulate error
  output    - Send test output
  complete  - Complete all commands
  quit      - Disconnect and exit
`);

rl.on('line', (input) => {
  const cmd = input.trim().toLowerCase();

  switch (cmd) {
    case 'status':
      console.log('Sending status update...');
      startStatusUpdates();
      break;

    case 'error':
      sendMessage({
        type: 'agent:error',
        agentId: AGENT_ID,
        error: 'Simulated error for testing',
        timestamp: new Date().toISOString()
      });
      break;

    case 'output':
      if (runningCommands.size > 0) {
        const commandId = Array.from(runningCommands.keys())[0];
        sendTerminalOutput(commandId, 'Test output from CLI');
      } else {
        console.log('No running commands to send output for');
      }
      break;

    case 'complete':
      for (const commandId of runningCommands.keys()) {
        completeCommand(commandId, 0);
      }
      break;

    case 'quit':
    case 'exit':
      console.log('Closing connection...');
      ws.close();
      process.exit(0);
      break;

    default:
      console.log(`Unknown command: ${cmd}`);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');

  sendMessage({
    type: 'agent:disconnect',
    agentId: AGENT_ID,
    timestamp: new Date().toISOString()
  });

  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 1000);
});

console.log(`${colors.bright}Agent ID: ${AGENT_ID}${colors.reset}`);
console.log(`${colors.bright}Agent Type: ${AGENT_TYPE}${colors.reset}`);