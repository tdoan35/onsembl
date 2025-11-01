/**
 * Unit tests for AgentConfigManager
 * Tests persistent agent identity configuration storage
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { AgentConfigManager } from '../src/agent-config-manager.js';

describe('AgentConfigManager', () => {
  let configManager: AgentConfigManager;
  let testConfigDir: string;
  let originalHome: string;

  beforeEach(async () => {
    // Create a temporary config directory for testing
    testConfigDir = path.join(os.tmpdir(), `onsembl-test-${Date.now()}`);
    await fs.mkdir(testConfigDir, { recursive: true });

    // Mock the home directory to use our test directory
    originalHome = process.env['HOME'] || process.env['USERPROFILE'] || os.homedir();
    process.env['HOME'] = testConfigDir;
    process.env['USERPROFILE'] = testConfigDir;

    configManager = new AgentConfigManager();
  });

  afterEach(async () => {
    // Restore original home directory
    process.env['HOME'] = originalHome;
    process.env['USERPROFILE'] = originalHome;

    // Clean up test directory
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should generate stable ID on first run', async () => {
    const { id, isNew } = await configManager.getOrCreateAgentId('mock');

    assert.strictEqual(isNew, true, 'Agent should be marked as new');
    assert.match(id, /^mock-[a-z0-9]+-[a-z0-9]+$/, 'ID should match expected format');
  });

  test('should reuse existing ID on subsequent runs', async () => {
    const first = await configManager.getOrCreateAgentId('mock');
    const second = await configManager.getOrCreateAgentId('mock');

    assert.strictEqual(first.id, second.id, 'IDs should be the same');
    assert.strictEqual(first.isNew, true, 'First should be new');
    assert.strictEqual(second.isNew, false, 'Second should not be new');
  });

  test('should support custom agent names', async () => {
    const { id, name, isNew } = await configManager.getOrCreateAgentId('mock', {
      name: 'my-laptop'
    });

    assert.strictEqual(name, 'my-laptop', 'Name should be set');
    assert.strictEqual(isNew, true, 'Agent should be new');

    // Verify name persists
    const second = await configManager.getOrCreateAgentId('mock');
    assert.strictEqual(second.name, 'my-laptop', 'Name should persist');
  });

  test('should update agent name', async () => {
    const { id } = await configManager.getOrCreateAgentId('mock', {
      name: 'old-name'
    });

    await configManager.updateAgentName(id, 'new-name');

    const agents = await configManager.listAgents();
    assert.strictEqual(agents.length, 1, 'Should have one agent');
    assert.strictEqual(agents[0].name, 'new-name', 'Name should be updated');
  });

  test('should list all configured agents', async () => {
    await configManager.getOrCreateAgentId('mock', { name: 'agent-1' });

    // Create a second agent by using a specific ID
    const secondId = 'mock-test-second';
    const config = {
      version: '1.0.0',
      defaultAgent: 'mock-test-first',
      agents: {
        'mock-test-first': {
          id: 'mock-test-first',
          name: 'agent-1',
          type: 'mock',
          createdAt: new Date().toISOString(),
          lastUsed: new Date().toISOString(),
          metadata: {
            hostMachine: os.hostname(),
            platform: os.platform()
          }
        },
        [secondId]: {
          id: secondId,
          name: 'agent-2',
          type: 'claude',
          createdAt: new Date().toISOString(),
          lastUsed: new Date().toISOString(),
          metadata: {
            hostMachine: os.hostname(),
            platform: os.platform()
          }
        }
      }
    };

    // Write config manually
    const configPath = path.join(testConfigDir, '.onsembl', 'agent-config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    const agents = await configManager.listAgents();
    assert.strictEqual(agents.length, 2, 'Should have two agents');
    assert.strictEqual(agents.some(a => a.name === 'agent-1'), true, 'Should have agent-1');
    assert.strictEqual(agents.some(a => a.name === 'agent-2'), true, 'Should have agent-2');
  });

  test('should get and set default agent', async () => {
    const { id: id1 } = await configManager.getOrCreateAgentId('mock');

    const defaultId = await configManager.getDefaultAgentId();
    assert.strictEqual(defaultId, id1, 'Default should be first agent');

    // Manually create a second agent
    const id2 = 'mock-test-second';
    const agents = await configManager.listAgents();
    const config = {
      version: '1.0.0',
      defaultAgent: id1,
      agents: {
        [id1]: agents[0],
        [id2]: {
          id: id2,
          name: 'agent-2',
          type: 'claude',
          createdAt: new Date().toISOString(),
          lastUsed: new Date().toISOString(),
          metadata: {
            hostMachine: os.hostname(),
            platform: os.platform()
          }
        }
      }
    };

    const configPath = path.join(testConfigDir, '.onsembl', 'agent-config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    await configManager.setDefaultAgent(id2);
    const newDefaultId = await configManager.getDefaultAgentId();
    assert.strictEqual(newDefaultId, id2, 'Default should be updated');
  });

  test('should delete agent from config', async () => {
    const { id } = await configManager.getOrCreateAgentId('mock');

    await configManager.deleteAgent(id);

    const agents = await configManager.listAgents();
    assert.strictEqual(agents.length, 0, 'Should have no agents');

    const defaultId = await configManager.getDefaultAgentId();
    assert.strictEqual(defaultId, null, 'Default should be null');
  });

  test('should get specific agent by ID', async () => {
    const { id, name } = await configManager.getOrCreateAgentId('mock', {
      name: 'test-agent'
    });

    const agent = await configManager.getAgent(id);
    assert.notStrictEqual(agent, null, 'Agent should exist');
    assert.strictEqual(agent?.id, id, 'ID should match');
    assert.strictEqual(agent?.name, name, 'Name should match');
    assert.strictEqual(agent?.type, 'mock', 'Type should match');
  });

  test('should return null for non-existent agent', async () => {
    const agent = await configManager.getAgent('non-existent-id');
    assert.strictEqual(agent, null, 'Should return null');
  });

  test('should handle specific agent ID option', async () => {
    // Create first agent
    const { id: id1 } = await configManager.getOrCreateAgentId('mock');

    // Create second agent with specific ID
    const specificId = 'my-specific-agent-id';
    await configManager.getOrCreateAgentId('claude', {
      agentId: specificId,
      name: 'specific-agent'
    });

    // Verify second agent was created
    const agent = await configManager.getAgent(specificId);
    assert.strictEqual(agent?.name, 'specific-agent', 'Name should match');

    // Verify default is still first agent
    const defaultId = await configManager.getDefaultAgentId();
    assert.strictEqual(defaultId, id1, 'Default should still be first agent');
  });

  test('should check if config file exists', async () => {
    assert.strictEqual(configManager.configExists(), false, 'Config should not exist initially');

    await configManager.getOrCreateAgentId('mock');

    assert.strictEqual(configManager.configExists(), true, 'Config should exist after creation');
  });

  test('should provide config file path', () => {
    const configPath = configManager.getConfigPath();
    assert.match(configPath, /\.onsembl[\/\\]agent-config\.json$/, 'Path should end with .onsembl/agent-config.json');
  });

  test('should update lastUsed timestamp on reuse', async () => {
    const { id } = await configManager.getOrCreateAgentId('mock');

    const agent1 = await configManager.getAgent(id);
    const firstLastUsed = agent1?.lastUsed;

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 10));

    // Reuse the agent
    await configManager.getOrCreateAgentId('mock');

    const agent2 = await configManager.getAgent(id);
    const secondLastUsed = agent2?.lastUsed;

    assert.notStrictEqual(firstLastUsed, secondLastUsed, 'lastUsed should be updated');
    assert.strictEqual(
      new Date(secondLastUsed!) > new Date(firstLastUsed!),
      true,
      'secondLastUsed should be later'
    );
  });

  test('should throw error when updating non-existent agent name', async () => {
    await assert.rejects(
      async () => {
        await configManager.updateAgentName('non-existent-id', 'new-name');
      },
      /Agent .* not found/,
      'Should throw error for non-existent agent'
    );
  });

  test('should throw error when deleting non-existent agent', async () => {
    await assert.rejects(
      async () => {
        await configManager.deleteAgent('non-existent-id');
      },
      /Agent .* not found/,
      'Should throw error for non-existent agent'
    );
  });

  test('should throw error when setting non-existent agent as default', async () => {
    await assert.rejects(
      async () => {
        await configManager.setDefaultAgent('non-existent-id');
      },
      /Agent .* not found/,
      'Should throw error for non-existent agent'
    );
  });

  test('should update name via options on reconnection', async () => {
    const { id } = await configManager.getOrCreateAgentId('mock', {
      name: 'old-name'
    });

    // Reconnect with new name
    await configManager.getOrCreateAgentId('mock', {
      name: 'new-name'
    });

    const agent = await configManager.getAgent(id);
    assert.strictEqual(agent?.name, 'new-name', 'Name should be updated via options');
  });
});
