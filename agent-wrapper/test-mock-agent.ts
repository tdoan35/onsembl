#!/usr/bin/env tsx
/**
 * Test script specifically for Mock agent
 */
import { MockAgent } from './src/agents/mock.js';
import { loadConfig } from './src/config.js';

async function testMockAgent() {
  console.log('Testing Mock Agent Spawning...\n');

  try {
    // Load config for mock agent
    const config = loadConfig({
      agentType: 'mock',
      apiKey: 'test-api-key',
      logLevel: 'info'
    });

    // Create mock agent with all required options
    const agent = new MockAgent({
      config,
      onOutput: async (stream, chunk) => {
        console.log(`[${stream}] ${chunk.data}`);
      },
      onError: (error) => {
        console.error('Agent error:', error);
      },
      onStatusChange: (status) => {
        console.log(`Status change callback: ${status}`);
      }
    });

    console.log('Starting mock agent...');
    await agent.start();

    const status = agent.getStatus();
    console.log(`Mock agent status: ${status}`);

    const metadata = agent.getMetadata();
    console.log(`Mock agent PID: ${metadata.pid}`);
    console.log(`Mock agent capabilities: ${metadata.capabilities.join(', ')}`);

    // Test execute command
    console.log('\nTesting command execution...');
    await agent.executeCommand('echo "Hello from mock agent"');

    // Wait a bit for simulated execution
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test interrupt
    console.log('\nTesting interrupt...');
    await agent.interrupt();
    console.log('Command interrupted');

    // Stop the agent
    console.log('\nStopping mock agent...');
    await agent.stop();
    console.log('Mock agent stopped successfully');

    console.log('\n✅ Mock agent test PASSED');
    return true;

  } catch (error: any) {
    console.error('\n❌ Mock agent test FAILED:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run the test
testMockAgent().then(success => {
  process.exit(success ? 0 : 1);
});