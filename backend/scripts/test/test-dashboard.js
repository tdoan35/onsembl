#!/usr/bin/env node
/**
 * Test Dashboard Script for WebSocket Routing Tests
 * Usage: npm run test:dashboard -- --user-id <id>
 */

import WebSocket from 'ws';
import readline from 'readline';
import { v4 as uuidv4 } from 'uuid';

const args = process.argv.slice(2);
const userIdIndex = args.indexOf('--user-id');
const userId = userIdIndex >= 0 ? args[userIdIndex + 1] : `user-${uuidv4().slice(0, 8)}`;
const resume = args.includes('--resume');
const wsUrl = process.env.WS_URL || 'ws://localhost:3000/ws/dashboard';

console.log(`Starting test dashboard for user: ${userId}`);
console.log(`Connecting to: ${wsUrl}`);
if (resume) console.log('Resume mode: Will attempt to recover previous session');

const ws = new WebSocket(wsUrl, {
  headers: {
    'authorization': 'Bearer test-token'
  }
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const activeCommands = new Map(); // commandId -> { agentId, command }

ws.on('open', () => {
  console.log('✓ Connected to WebSocket at', wsUrl);

  // Send dashboard init message
  const initMsg = {
    id: uuidv4(),
    type: 'DASHBOARD_INIT',
    timestamp: Date.now(),
    payload: {
      userId,
      subscriptions: {
        agents: [],
        commands: [],
        traces: true,
        terminals: true
      }
    }
  };

  ws.send(JSON.stringify(initMsg));
  console.log('✓ Authenticated as user:', userId);
  console.log('✓ Ready to send commands\n');
  console.log('Commands:');
  console.log('  execute <agent-id> "<command>"  - Send command to agent');
  console.log('  emergency-stop "<reason>"        - Trigger emergency stop');
  console.log('  status                          - Show active commands');
  console.log('  exit                            - Close dashboard\n');

  promptUser();
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());

    switch (message.type) {
      case 'ACK':
        if (message.payload.commandId) {
          console.log('← Command acknowledged:', message.payload.commandId);
        }
        break;

      case 'COMMAND_STATUS':
        handleCommandStatus(message);
        break;

      case 'TERMINAL_STREAM':
        handleTerminalStream(message);
        break;

      case 'EMERGENCY_STOP':
        console.log('\n← Emergency stop broadcast received');
        console.log('  Reason:', message.payload.reason);
        break;

      case 'ERROR':
        console.error('← Error:', message.payload.message);
        break;

      default:
        console.log('← Received:', message.type);
    }
  } catch (error) {
    console.error('Error processing message:', error);
  }
});

function handleCommandStatus(message) {
  const { commandId, status, agentId, error } = message.payload;
  const cmdInfo = activeCommands.get(commandId);

  if (status === 'completed') {
    console.log(`← Command completed successfully [${agentId}]`);
    activeCommands.delete(commandId);
  } else if (status === 'failed') {
    console.log(`← Command failed [${agentId}]: ${error}`);
    activeCommands.delete(commandId);
  } else if (status === 'running') {
    console.log(`← Command running [${agentId}]`);
  }
}

function handleTerminalStream(message) {
  const { commandId, content, agentId } = message.payload;
  const cmdInfo = activeCommands.get(commandId);

  if (cmdInfo) {
    console.log(`← Terminal output [${agentId}]: ${content.trim()}`);
  }
}

function promptUser() {
  rl.question('> ', (input) => {
    processCommand(input);
    promptUser();
  });
}

function processCommand(input) {
  const parts = input.trim().split(' ');
  const command = parts[0];

  switch (command) {
    case 'execute':
      executeCommand(input);
      break;

    case 'emergency-stop':
      sendEmergencyStop(input);
      break;

    case 'status':
      showStatus();
      break;

    case 'exit':
      console.log('Closing dashboard...');
      ws.close();
      process.exit(0);
      break;

    default:
      if (input.trim()) {
        console.log('Unknown command. Type "help" for available commands.');
      }
  }
}

function executeCommand(input) {
  // Parse: execute <agent-id> "<command>"
  const match = input.match(/execute\s+(\S+)\s+"(.+)"/);
  if (!match) {
    console.log('Usage: execute <agent-id> "<command>"');
    return;
  }

  const [, agentId, commandStr] = match;
  const commandParts = commandStr.split(' ');
  const command = commandParts[0];
  const args = commandParts.slice(1);

  const commandId = uuidv4();
  activeCommands.set(commandId, { agentId, command: commandStr });

  const msg = {
    id: uuidv4(),
    type: 'COMMAND_REQUEST',
    timestamp: Date.now(),
    connectionId: ws._socket.remoteAddress,
    payload: {
      agentId,
      commandId,
      command,
      args
    }
  };

  ws.send(JSON.stringify(msg));
  console.log(`→ Sending command to ${agentId}: ${commandStr}`);
}

function sendEmergencyStop(input) {
  const match = input.match(/emergency-stop\s+"(.+)"/);
  const reason = match ? match[1] : 'Emergency stop triggered';

  const msg = {
    id: uuidv4(),
    type: 'EMERGENCY_STOP',
    timestamp: Date.now(),
    payload: {
      reason
    }
  };

  ws.send(JSON.stringify(msg));
  console.log('→ Emergency stop sent:', reason);
}

function showStatus() {
  if (activeCommands.size === 0) {
    console.log('No active commands');
  } else {
    console.log('Active commands:');
    activeCommands.forEach((info, id) => {
      console.log(`  ${id.slice(0, 8)}: ${info.agentId} - ${info.command}`);
    });
  }
}

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('\nWebSocket connection closed');
  rl.close();
  process.exit(0);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nShutting down dashboard...');
  ws.close();
  process.exit(0);
});