#!/usr/bin/env node

/**
 * Test script for Claude agent wrapper
 * This demonstrates how to test the agent wrapper functionality
 */

console.log('Testing Claude Agent Wrapper');
console.log('============================\n');

// Test 1: Check if Claude CLI is available
const { execSync } = require('child_process');
const path = require('path');

try {
  // Check if claude command exists
  const claudeVersion = execSync('claude --version', { encoding: 'utf-8' }).trim();
  console.log('✅ Claude CLI found');
  console.log('   Version:', claudeVersion);
} catch (error) {
  console.log('❌ Claude CLI not found. Please install Claude Code first.');
  process.exit(1);
}

// Test 2: Set up environment variables
console.log('\n2. Setting up environment...');
if (!process.env.ANTHROPIC_API_KEY) {
  console.log('⚠️  ANTHROPIC_API_KEY not set. Using test mode.');
  process.env.ANTHROPIC_API_KEY = 'test-key-for-wrapper-testing';
}

// Test 3: Test agent wrapper connection
console.log('\n3. Testing agent wrapper connection...');
console.log('   WebSocket URL: ws://localhost:4000');
console.log('   Agent ID: claude-test-agent');

// You can run the actual agent wrapper like this:
console.log('\nTo test the agent wrapper, run one of these commands:');
console.log('\n1. Using npm (in agent-wrapper directory):');
console.log('   cd agent-wrapper');
console.log('   npm run dev -- --agent-type claude --agent-id claude-test');

console.log('\n2. Using the test script:');
console.log('   cd agent-wrapper');
console.log('   ./test-real-claude.sh');

console.log('\n3. Direct execution with environment variables:');
console.log('   ANTHROPIC_API_KEY=your-key node agent-wrapper/dist/cli.js --agent-type claude');

console.log('\n4. For development/testing without building:');
console.log('   cd agent-wrapper');
console.log('   npx tsx src/cli.ts --agent-type claude --agent-id test-claude');

console.log('\n5. Test with mock agent (doesn\'t require API key):');
console.log('   cd agent-wrapper');
console.log('   npx tsx src/cli.ts --agent-type mock --agent-id test-mock');

console.log('\n✅ Test script complete. Choose one of the options above to run the agent wrapper.');