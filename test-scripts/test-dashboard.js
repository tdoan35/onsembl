#!/usr/bin/env node

/**
 * Test Dashboard Client
 * Simulates a dashboard connecting to the WebSocket server
 * Usage: node test-dashboard.js [dashboardId]
 */

const WebSocket = require('ws');
const readline = require('readline');

// Configuration
const SERVER_URL = process.env.WS_URL || 'ws://localhost:3001/ws/dashboard';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'test-token';
const USER_ID = process.env.USER_ID || 'test-user-123';
const DASHBOARD_ID = process.argv[2] || `test-dashboard-${Date.now()}`;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
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
let connectedAgents = new Map();
let runningCommands = new Map();
let terminalOutputs = [];

// WebSocket event handlers
ws.on('open', () => {
  console.log(`${colors.green}✓ Connected to server${colors.reset}`);

  // Send dashboard connect message
  const connectMessage = {
    type: 'dashboard:connect',
    dashboardId: DASHBOARD_ID,
    userId: USER_ID,
    timestamp: new Date().toISOString()
  };

  ws.send(JSON.stringify(connectMessage));
  console.log(`${colors.blue}→ Sent dashboard:connect for ${DASHBOARD_ID}${colors.reset}`);

  isConnected = true;

  // Subscribe to all updates
  setTimeout(() => {
    subscribe('agent', null, true);
    subscribe('command', null, true);
    subscribe('terminal', null, true);
  }, 1000);

  startHeartbeat();
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log(`${colors.yellow}← Received:${colors.reset} ${message.type}`);

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
    case 'agent:list':
      handleAgentList(message);
      break;

    case 'agent:status':
      handleAgentStatus(message);
      break;

    case 'command:queued':
      handleCommandQueued(message);
      break;

    case 'command:status':
      handleCommandStatus(message);
      break;

    case 'terminal:output':
      handleTerminalOutput(message);
      break;

    case 'heartbeat:ping':
      handlePing(message);
      break;

    case 'auth:refresh-needed':
      handleTokenRefresh();
      break;

    case 'ACK':
      console.log(`${colors.green}✓ Message acknowledged${colors.reset}`);
      break;

    case 'connection:error':
      console.error(`${colors.red}Connection error: ${message.error}${colors.reset}`);
      break;

    default:
      console.log(`${colors.cyan}ℹ Message: ${JSON.stringify(message, null, 2)}${colors.reset}`);
  }
}

// Agent handlers
function handleAgentList(message) {
  console.log(`${colors.magenta}Connected Agents:${colors.reset}`);
  message.agents.forEach(agent => {
    connectedAgents.set(agent.agentId, agent);
    console.log(`  ${colors.green}●${colors.reset} ${agent.agentId} (${agent.status})`);
  });
}

function handleAgentStatus(message) {
  const { agentId, status, metrics } = message;
  connectedAgents.set(agentId, { ...connectedAgents.get(agentId), status, metrics });

  console.log(`${colors.cyan}Agent Status Update:${colors.reset}`);
  console.log(`  Agent: ${agentId}`);
  console.log(`  Status: ${status}`);
  if (metrics) {
    console.log(`  CPU: ${metrics.cpuUsage?.toFixed(1)}%`);
    console.log(`  Memory: ${metrics.memoryUsage?.toFixed(1)}%`);
    console.log(`  Commands: ${metrics.activeCommands}`);
  }
}

// Command handlers
function handleCommandQueued(message) {
  const { commandId, agentId, position, estimatedWait } = message;
  runningCommands.set(commandId, { agentId, status: 'queued' });

  console.log(`${colors.yellow}Command Queued:${colors.reset}`);
  console.log(`  ID: ${commandId}`);
  console.log(`  Position: ${position}`);
  console.log(`  Wait: ${estimatedWait}ms`);
}

function handleCommandStatus(message) {
  const { commandId, status, exitCode, duration } = message;

  if (runningCommands.has(commandId)) {
    runningCommands.get(commandId).status = status;
  }

  console.log(`${colors.cyan}Command Status:${colors.reset}`);
  console.log(`  ID: ${commandId}`);
  console.log(`  Status: ${status}`);
  if (exitCode !== undefined) console.log(`  Exit Code: ${exitCode}`);
  if (duration !== undefined) console.log(`  Duration: ${duration}ms`);
}

// Terminal output handler
function handleTerminalOutput(message) {
  const { agentId, commandId, output } = message;
  terminalOutputs.push(output);

  const colorMap = {
    stdout: colors.reset,
    stderr: colors.red,
    system: colors.cyan,
    command: colors.yellow
  };

  const color = colorMap[output.type] || colors.reset;
  console.log(`${color}[${agentId}] ${output.content}${colors.reset}`);
}

// Subscribe to updates
function subscribe(type, id = null, all = false) {
  const message = {
    type: 'dashboard:subscribe',
    type: type,
    timestamp: new Date().toISOString()
  };

  if (id) message.id = id;
  if (all) message.all = all;

  sendMessage(message);
  console.log(`${colors.blue}→ Subscribed to ${type} updates${colors.reset}`);
}

// Send command request
function sendCommand(agentId, command, args = []) {
  const message = {
    type: 'command:request',
    agentId,
    command,
    args,
    priority: 'normal',
    timestamp: new Date().toISOString()
  };

  sendMessage(message);
  console.log(`${colors.blue}→ Sent command: ${command} to ${agentId}${colors.reset}`);
}

// Interrupt command
function interruptCommand(commandId) {
  sendMessage({
    type: 'command:interrupt',
    commandId,
    timestamp: new Date().toISOString()
  });
  console.log(`${colors.yellow}→ Interrupting command: ${commandId}${colors.reset}`);
}

// Emergency stop
function emergencyStop() {
  sendMessage({
    type: 'system:emergency-stop',
    reason: 'User initiated from test client',
    timestamp: new Date().toISOString()
  });
  console.log(`${colors.red}🛑 EMERGENCY STOP SENT${colors.reset}`);
}

// Heartbeat
function startHeartbeat() {
  setInterval(() => {
    if (!isConnected) return;

    sendMessage({
      type: 'heartbeat:ping',
      timestamp: new Date().toISOString(),
      sequence: Date.now()
    });
  }, 30000); // Every 30 seconds
}

// Ping handler
function handlePing(message) {
  sendMessage({
    type: 'heartbeat:pong',
    timestamp: new Date().toISOString(),
    latency: Date.now() - new Date(message.timestamp).getTime()
  });
}

// Token refresh
function handleTokenRefresh() {
  console.log(`${colors.yellow}Token refresh requested${colors.reset}`);

  // In real scenario, get new token from auth service
  sendMessage({
    type: 'auth:refresh-token',
    token: 'new-token-here',
    refreshToken: 'refresh-token-here',
    timestamp: new Date().toISOString()
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
${colors.bright}Dashboard Test Client Controls:${colors.reset}
  agents              - List connected agents
  command <agent> <cmd> - Send command to agent
  interrupt <cmdId>   - Interrupt running command
  subscribe <type>    - Subscribe to updates (agent/command/terminal)
  emergency           - Send emergency stop
  clear               - Clear terminal outputs
  status              - Show current state
  quit                - Disconnect and exit

Example: command test-agent-001 "npm test"
`);

rl.on('line', (input) => {
  const parts = input.trim().split(' ');
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case 'agents':
      console.log(`${colors.magenta}Connected Agents:${colors.reset}`);
      connectedAgents.forEach((agent, id) => {
        console.log(`  ${agent.status === 'online' ? colors.green : colors.yellow}●${colors.reset} ${id} (${agent.status})`);
      });
      break;

    case 'command':
      if (parts.length < 3) {
        console.log('Usage: command <agentId> <command>');
      } else {
        const agentId = parts[1];
        const command = parts.slice(2).join(' ');
        sendCommand(agentId, command);
      }
      break;

    case 'interrupt':
      if (parts.length < 2) {
        console.log('Usage: interrupt <commandId>');
      } else {
        interruptCommand(parts[1]);
      }
      break;

    case 'subscribe':
      if (parts.length < 2) {
        console.log('Usage: subscribe <type> (agent/command/terminal)');
      } else {
        subscribe(parts[1], null, true);
      }
      break;

    case 'emergency':
      emergencyStop();
      break;

    case 'clear':
      terminalOutputs = [];
      console.clear();
      break;

    case 'status':
      console.log(`${colors.bright}Dashboard Status:${colors.reset}`);
      console.log(`  ID: ${DASHBOARD_ID}`);
      console.log(`  Connected: ${isConnected}`);
      console.log(`  Agents: ${connectedAgents.size}`);
      console.log(`  Commands: ${runningCommands.size}`);
      console.log(`  Terminal Lines: ${terminalOutputs.length}`);
      break;

    case 'quit':
    case 'exit':
      console.log('Closing connection...');
      sendMessage({
        type: 'dashboard:disconnect',
        dashboardId: DASHBOARD_ID,
        timestamp: new Date().toISOString()
      });
      setTimeout(() => {
        ws.close();
        process.exit(0);
      }, 1000);
      break;

    default:
      console.log(`Unknown command: ${cmd}`);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');

  sendMessage({
    type: 'dashboard:disconnect',
    dashboardId: DASHBOARD_ID,
    timestamp: new Date().toISOString()
  });

  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 1000);
});

console.log(`${colors.bright}Dashboard ID: ${DASHBOARD_ID}${colors.reset}`);
console.log(`${colors.bright}User ID: ${USER_ID}${colors.reset}`);