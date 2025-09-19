#!/usr/bin/env node

// Debug version of the wrapper to understand what's happening
import pty from 'node-pty';
import pino from 'pino';

const logger = pino({ level: 'debug' });

console.log('\n=== Debug Wrapper Test ===\n');

// Create the same environment as the wrapper
const env = {
  ...process.env,
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  FORCE_COLOR: '3'
};

const ptyOptions = {
  name: 'xterm-256color',
  cols: process.stdout.columns || 80,
  rows: process.stdout.rows || 24,
  cwd: process.cwd(),
  env: env
};

console.log('Spawning Claude with options:', {
  command: 'claude',
  args: [],
  cols: ptyOptions.cols,
  rows: ptyOptions.rows
});

try {
  const ptyProcess = pty.spawn('claude', [], ptyOptions);
  console.log('PTY spawned, PID:', ptyProcess.pid);

  let outputReceived = false;
  ptyProcess.onData((data) => {
    if (!outputReceived) {
      console.log('\nFirst output received! Length:', data.length);
      outputReceived = true;
    }
    process.stdout.write(data);
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log('\nClaude exited:', { exitCode, signal });
    console.log('Output received:', outputReceived);
    process.exit(exitCode || 0);
  });

  // Set up input handling like the wrapper does
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.on('data', (data) => {
      if (data[0] === 0x03) { // Ctrl+C
        ptyProcess.kill();
        process.exit(0);
      }
      ptyProcess.write(data);
    });
  }

  // Keep alive
  process.stdin.resume();

} catch (error) {
  console.error('Failed to spawn PTY:', error);
  process.exit(1);
}