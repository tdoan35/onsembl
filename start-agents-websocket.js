#!/usr/bin/env node
/**
 * Start test agents with WebSocket connection
 * Assumes test credentials are already set up via setup-test-auth.js
 */

const { spawn } = require('child_process');
const path = require('path');

const AGENT_WRAPPER_PATH = path.join(__dirname, 'agent-wrapper');

console.log('Starting test agents with WebSocket connection...\n');

const agents = [];

function startAgent(name, agentId) {
  console.log(`Starting agent: ${name}`);

  const cliPath = path.join(AGENT_WRAPPER_PATH, 'dist', 'cli.js');
  const agent = spawn('node', [cliPath, 'start', '--agent', 'mock', '--name', name, '--agent-id', agentId], {
    cwd: AGENT_WRAPPER_PATH,
    stdio: 'pipe',
    env: {
      ...process.env,
      LOG_LEVEL: 'debug',
      NODE_ENV: 'development'
    }
  });

  // Pipe output
  agent.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l);
    lines.forEach(line => {
      console.log(`[${name}] ${line}`);
    });
  });

  agent.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l);
    lines.forEach(line => {
      console.error(`[${name}] ERROR: ${line}`);
    });
  });

  agent.on('error', (err) => {
    console.error(`Failed to start ${name}:`, err);
  });

  agent.on('exit', (code) => {
    console.log(`[${name}] Exited with code ${code}`);
    const idx = agents.indexOf(agent);
    if (idx > -1) agents.splice(idx, 1);
  });

  agents.push(agent);
  return agent;
}

// Start first agent
startAgent('test-command-agent', 'test-command-agent');

// Start second agent after a delay
setTimeout(() => {
  startAgent('test-mock-agent', 'test-mock-agent');
}, 3000);

// Handle termination
process.on('SIGINT', () => {
  console.log('\n\nTerminating agents...');
  agents.forEach(agent => {
    try {
      agent.kill();
    } catch (e) {
      // ignore
    }
  });
  setTimeout(() => process.exit(0), 1500);
});

console.log('Press Ctrl+C to stop agents\n');
