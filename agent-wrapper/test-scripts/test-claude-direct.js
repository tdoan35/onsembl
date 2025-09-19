#!/usr/bin/env node

// Direct test of Claude CLI with node-pty
import pty from 'node-pty';

console.log('Testing Claude CLI with node-pty directly...');

const ptyProcess = pty.spawn('claude', [], {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
  cwd: process.cwd(),
  env: process.env
});

ptyProcess.onData((data) => {
  process.stdout.write(data);
});

ptyProcess.onExit(({ exitCode, signal }) => {
  console.log('\nClaude exited with:', { exitCode, signal });
});

// Pass through terminal input
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.on('data', (data) => {
    // Check for Ctrl+C
    if (data[0] === 0x03) {
      ptyProcess.kill();
      process.exit(0);
    }
    ptyProcess.write(data);
  });
}

console.log('Claude CLI started. Press Ctrl+C to exit.\n');