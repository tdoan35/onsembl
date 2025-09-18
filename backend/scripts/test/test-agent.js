#!/usr/bin/env node
/**
 * Test Agent Script for WebSocket Routing Tests
 * Usage: npm run test:agent -- --agent-id <id>
 */

import WebSocket from 'ws';
import readline from 'readline';
import { v4 as uuidv4 } from 'uuid';

const args = process.argv.slice(2);
const agentIdIndex = args.indexOf('--agent-id');
const agentId = agentIdIndex >= 0 ? args[agentIdIndex + 1] : `agent-${uuidv4().slice(0, 8)}`;
const wsUrl = process.env.WS_URL || 'ws://localhost:3000/ws/agent';

console.log(`Starting test agent: ${agentId}`);
console.log(`Connecting to: ${wsUrl}`);

const ws = new WebSocket(wsUrl, {
  headers: {
    'x-agent-id': agentId,
    'authorization': 'Bearer test-token'
  }
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

ws.on('open', () => {
  console.log('✓ Connected to WebSocket at', wsUrl);

  // Send agent connect message
  const connectMsg = {
    id: uuidv4(),
    type: 'AGENT_CONNECT',
    timestamp: Date.now(),
    payload: {
      agentId,
      version: '1.0.0',
      capabilities: ['execute', 'terminal', 'trace'],
      metadata: { test: true }
    }
  };

  ws.send(JSON.stringify(connectMsg));
  console.log('✓ Authenticated as agent:', agentId);
  console.log('✓ Waiting for commands...\n');
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());

    switch (message.type) {
      case 'COMMAND_REQUEST':
        handleCommandRequest(message);
        break;

      case 'COMMAND_CANCEL':
        console.log('← Command cancelled:', message.payload.commandId);
        break;

      case 'EMERGENCY_STOP':
        console.log('\n🛑 EMERGENCY STOP RECEIVED!');
        console.log('   Reason:', message.payload.reason);
        console.log('   Stopping all operations...\n');
        break;

      case 'AGENT_CONTROL':
        console.log('← Agent control:', message.payload.action);
        break;

      case 'PING':
        // Respond with PONG
        ws.send(JSON.stringify({
          id: uuidv4(),
          type: 'PONG',
          timestamp: Date.now(),
          payload: { timestamp: message.payload.timestamp }
        }));
        break;

      default:
        console.log('← Received:', message.type);
    }
  } catch (error) {
    console.error('Error processing message:', error);
  }
});

function handleCommandRequest(message) {
  const { commandId, command, args } = message.payload;

  console.log('← Received command:', command, args?.join(' ') || '');
  console.log('  Command ID:', commandId);
  console.log('→ Executing command...\n');

  // Send command acknowledgment
  ws.send(JSON.stringify({
    id: uuidv4(),
    type: 'COMMAND_ACK',
    timestamp: Date.now(),
    agentId,
    payload: {
      commandId,
      agentId,
      status: 'queued'
    }
  }));

  // Send status update: running
  setTimeout(() => {
    ws.send(JSON.stringify({
      id: uuidv4(),
      type: 'COMMAND_STATUS',
      timestamp: Date.now(),
      agentId,
      payload: {
        commandId,
        agentId,
        status: 'running'
      }
    }));
  }, 100);

  // Simulate command execution
  setTimeout(() => {
    // Send terminal output
    const output = command === 'echo' && args
      ? args.join(' ').replace(/['"]/g, '')
      : `Output from command: ${command}`;

    ws.send(JSON.stringify({
      id: uuidv4(),
      type: 'TERMINAL_OUTPUT',
      timestamp: Date.now(),
      agentId,
      payload: {
        commandId,
        agentId,
        content: output + '\n',
        streamType: 'stdout',
        timestamp: Date.now()
      }
    }));

    console.log('→ Terminal output sent:', output);

    // Send command complete
    ws.send(JSON.stringify({
      id: uuidv4(),
      type: 'COMMAND_COMPLETE',
      timestamp: Date.now(),
      agentId,
      payload: {
        commandId,
        agentId,
        status: 'completed',
        exitCode: 0,
        executionTime: 500
      }
    }));

    console.log('→ Command completed\n');
  }, 500);
}

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('\nWebSocket connection closed');
  process.exit(0);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nShutting down agent...');
  ws.close();
  process.exit(0);
});

// Keep the process alive
process.stdin.resume();