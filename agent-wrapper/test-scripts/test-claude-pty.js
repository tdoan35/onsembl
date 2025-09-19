#!/usr/bin/env node

import pty from 'node-pty';

console.log('Testing Claude with proper PTY settings...\n');

// Try with more explicit terminal settings
const ptyProcess = pty.spawn('claude', [], {
  name: 'xterm-256color',
  cols: process.stdout.columns || 80,
  rows: process.stdout.rows || 24,
  cwd: process.cwd(),
  env: {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    FORCE_COLOR: '3'
  }
});

console.log('PTY spawned with PID:', ptyProcess.pid);

ptyProcess.onData((data) => {
  process.stdout.write(data);
});

ptyProcess.onExit(({ exitCode, signal }) => {
  console.log('\n\nClaude exited:', { exitCode, signal });
  process.exit(exitCode || 0);
});

// Handle terminal input
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.on('data', (data) => {
    // Check for Ctrl+C
    if (data[0] === 0x03) {
      console.log('\nReceived Ctrl+C, killing PTY...');
      ptyProcess.kill();
      process.exit(0);
    }
    ptyProcess.write(data);
  });
}

// Keep the process alive
process.stdin.resume();

console.log('Waiting for Claude to start...\n');

// Give some debug info after a short delay
setTimeout(() => {
  if (ptyProcess.pid) {
    console.log('PTY still running after 1 second...');
  }
}, 1000);