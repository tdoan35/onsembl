#!/usr/bin/env tsx
/**
 * Test script to verify agent spawning functionality
 */
import { ClaudeAgent } from './src/agents/claude.js';
import { GeminiAgent } from './src/agents/gemini.js';
import { CodexAgent } from './src/agents/codex.js';
import { loadConfig } from './src/config.js';
import { OutputChunk } from './src/stream-capture.js';
import { execSync } from 'child_process';

const TEST_TIMEOUT = 10000; // 10 seconds per test

interface TestResult {
  agent: string;
  success: boolean;
  error?: string;
  pid?: number;
  output?: string;
}

async function testAgent(agentType: 'claude' | 'gemini' | 'codex'): Promise<TestResult> {
  console.log(`\n=== Testing ${agentType} agent ===`);

  const result: TestResult = {
    agent: agentType,
    success: false
  };

  try {
    // Load config with override for agent type
    const config = loadConfig({
      agentType,
      apiKey: 'test-api-key',
      logLevel: 'debug'
    });

    // Prepare agent options
    const capturedOutput: string[] = [];
    const agentOptions = {
      config,
      onOutput: async (stream: 'stdout' | 'stderr', chunk: OutputChunk) => {
        const output = `[${stream}] ${chunk.data}`;
        capturedOutput.push(output);
        console.log(output);
      },
      onError: (error: Error) => {
        console.error(`Agent error: ${error.message}`);
        result.error = error.message;
      },
      onStatusChange: (status: any) => {
        console.log(`Status changed to: ${status}`);
      }
    };

    // Create agent instance
    let agent: ClaudeAgent | GeminiAgent | CodexAgent;

    switch (agentType) {
      case 'claude':
        agent = new ClaudeAgent(agentOptions);
        break;
      case 'gemini':
        agent = new GeminiAgent(agentOptions);
        break;
      case 'codex':
        agent = new CodexAgent(agentOptions);
        break;
    }

    // Start the agent
    console.log(`Starting ${agentType} agent...`);
    await Promise.race([
      agent.start(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), TEST_TIMEOUT))
    ]);

    // Get agent metadata
    const metadata = agent.getMetadata();
    result.pid = metadata.pid;
    console.log(`Agent started with PID: ${metadata.pid}`);
    console.log(`Agent capabilities: ${metadata.capabilities.join(', ')}`);

    // Test sending input
    console.log(`Testing input for ${agentType} agent...`);
    try {
      await agent.sendInput('echo "Hello from test"');
      // Wait a bit for output
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (inputError: any) {
      console.log(`Input test warning: ${inputError.message}`);
    }

    // Test health check
    const isHealthy = await agent.healthCheck();
    console.log(`Health check: ${isHealthy ? 'PASS' : 'FAIL'}`);

    // Stop the agent
    console.log(`Stopping ${agentType} agent...`);
    await agent.stop();
    console.log(`${agentType} agent stopped successfully`);

    result.success = true;
    result.output = capturedOutput.join('\n');

  } catch (error: any) {
    console.error(`Test failed for ${agentType}:`, error.message);
    result.error = error.message;
  }

  return result;
}

async function runTests() {
  console.log('Starting agent spawn tests...\n');
  console.log('Note: This test will attempt to spawn actual CLI tools.');
  console.log('Some tests may fail if the corresponding CLI tools are not installed.\n');

  const results: TestResult[] = [];

  // Test real agents
  const realAgents: Array<'claude' | 'gemini' | 'codex'> = ['claude', 'gemini', 'codex'];

  for (const agentType of realAgents) {
    // Check if command exists before testing
    try {
      execSync(`which ${agentType}`, { stdio: 'ignore' });
      console.log(`\n✓ ${agentType} CLI found, proceeding with test...`);
      results.push(await testAgent(agentType));
    } catch {
      console.log(`\n✗ ${agentType} CLI not found, skipping test`);
      results.push({
        agent: agentType,
        success: false,
        error: `CLI tool '${agentType}' not found in PATH`
      });
    }
  }

  // Print summary
  console.log('\n\n=== TEST SUMMARY ===');
  console.log('-------------------');

  for (const result of results) {
    const status = result.success ? '✓ PASS' : '✗ FAIL';
    console.log(`${status} - ${result.agent}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    if (result.pid) {
      console.log(`  PID: ${result.pid}`);
    }
  }

  const passed = results.filter(r => r.success).length;
  const total = results.length;
  console.log(`\nTotal: ${passed}/${total} tests passed`);

  // Exit with appropriate code
  process.exit(passed === total ? 0 : 1);
}

// Run the tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});