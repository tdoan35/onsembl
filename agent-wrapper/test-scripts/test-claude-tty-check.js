#!/usr/bin/env node

// Test if Claude checks for TTY on stdin
import { spawn } from 'child_process';

console.log('Testing Claude with different stdin configurations...\n');

// Test 1: No stdin (inherit)
console.log('Test 1: Spawning Claude with inherited stdio...');
const claude1 = spawn('claude', [], {
  stdio: 'inherit'
});

claude1.on('exit', (code) => {
  console.log(`Claude exited with code ${code} when stdio inherited\n`);

  // Test 2: Piped stdin
  console.log('Test 2: Spawning Claude with piped stdio...');
  const claude2 = spawn('claude', [], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  claude2.stdout.on('data', (data) => {
    console.log('Claude output (piped):', data.toString().slice(0, 100));
  });

  claude2.stderr.on('data', (data) => {
    console.log('Claude error (piped):', data.toString().slice(0, 100));
  });

  claude2.on('exit', (code) => {
    console.log(`Claude exited with code ${code} when stdio piped\n`);
  });

  // Give it a moment then kill if still running
  setTimeout(() => {
    if (!claude2.killed) {
      console.log('Killing Claude process...');
      claude2.kill();
    }
  }, 2000);
});