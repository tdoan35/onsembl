#!/usr/bin/env node
/**
 * Test script to start multiple test agents for terminal output testing
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const AGENT_WRAPPER_PATH = path.join(__dirname, 'agent-wrapper');
const CLI_PATH = path.join(AGENT_WRAPPER_PATH, 'dist', 'cli.js');

// Check if CLI exists
if (!fs.existsSync(CLI_PATH)) {
  console.error(`Error: CLI not found at ${CLI_PATH}`);
  console.error('Please build agent-wrapper first: npm run build -w agent-wrapper');
  process.exit(1);
}

console.log('Starting test agents...\n');

// Start first mock agent (test-command-agent)
console.log('Starting: test-command-agent (mock agent)');
const agent1 = spawn('node', [CLI_PATH, 'start', '--agent', 'mock', '--no-websocket'], {
  cwd: AGENT_WRAPPER_PATH,
  stdio: 'inherit',
  env: {
    ...process.env,
    ONSEMBL_AGENT_ID: 'test-command-agent',
    ONSEMBL_AGENT_NAME: 'test-command-agent',
    LOG_LEVEL: 'debug'
  }
});

// Start second mock agent (test-mock-agent) after a delay
setTimeout(() => {
  console.log('\nStarting: test-mock-agent (mock agent)');
  const agent2 = spawn('node', [CLI_PATH, 'start', '--agent', 'mock', '--no-websocket'], {
    cwd: AGENT_WRAPPER_PATH,
    stdio: 'inherit',
    env: {
      ...process.env,
      ONSEMBL_AGENT_ID: 'test-mock-agent',
      ONSEMBL_AGENT_NAME: 'test-mock-agent',
      LOG_LEVEL: 'debug'
    }
  });

  agent2.on('error', (err) => {
    console.error('Failed to start agent2:', err);
  });

  agent2.on('exit', (code) => {
    console.log('Agent 2 exited with code', code);
  });
}, 2000);

agent1.on('error', (err) => {
  console.error('Failed to start agent1:', err);
});

agent1.on('exit', (code) => {
  console.log('Agent 1 exited with code', code);
  process.exit(code);
});

// Handle termination
process.on('SIGINT', () => {
  console.log('\nTerminating agents...');
  agent1.kill();
  process.exit(0);
});
