import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { createTestServer } from '../test-utils/server';
import { setupTestDatabase, cleanupTestDatabase } from '../test-utils/database';
import { createTestAgent, createTestPreset } from '../test-utils/fixtures';
import { waitForMessage, sendWebSocketMessage } from '../test-utils/websocket';

describe('Integration: Command Presets', () => {
  let server: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    await setupTestDatabase();
    server = await createTestServer();

    // Get auth token for testing
    const authResponse = await server.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { token: 'test-magic-token' }
    });
    authToken = JSON.parse(authResponse.body).token;
  });

  afterAll(async () => {
    await server.close();
    await cleanupTestDatabase();
  });

  it('should create and execute a command preset', async () => {
    // Test Scenario from quickstart.md Test 5
    // Expected: Preset saves and executes

    // Step 1: Create a command preset
    const createPresetResponse = await server.inject({
      method: 'POST',
      url: '/presets',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        name: 'Build and Test',
        description: 'Run build followed by tests',
        command: 'npm run build && npm test',
        tags: ['build', 'test', 'ci'],
        agentConstraints: {
          type: 'node'
        },
        executionConstraints: {
          maxExecutionTime: 300000,
          allowedPaths: ['/project'],
          environmentVariables: {
            NODE_ENV: 'test'
          }
        }
      }
    });

    expect(createPresetResponse.statusCode).toBe(201);
    const preset = JSON.parse(createPresetResponse.body);

    expect(preset.name).toBe('Build and Test');
    expect(preset.command).toBe('npm run build && npm test');
    expect(preset.tags).toContain('build');
    expect(preset.tags).toContain('test');
    expect(preset.id).toBeDefined();

    // Step 2: List presets to verify it was saved
    const listResponse = await server.inject({
      method: 'GET',
      url: '/presets',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(listResponse.statusCode).toBe(200);
    const presets = JSON.parse(listResponse.body);
    const savedPreset = presets.find((p: any) => p.id === preset.id);
    expect(savedPreset).toBeDefined();
    expect(savedPreset.name).toBe('Build and Test');

    // Step 3: Connect an agent
    const agent = await createTestAgent({ name: 'preset-test-agent', type: 'node' });
    const agentWs = new WebSocket(`ws://localhost:3000/agent/${agent.id}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    await waitForMessage(agentWs, 'AGENT_CONNECT_ACK');

    // Step 4: Execute the preset
    const executeResponse = await server.inject({
      method: 'POST',
      url: '/commands',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        agentId: agent.id,
        presetId: preset.id
      }
    });

    expect(executeResponse.statusCode).toBe(201);
    const command = JSON.parse(executeResponse.body);

    // Command should inherit from preset
    expect(command.command).toBe('npm run build && npm test');
    expect(command.agentId).toBe(agent.id);
    expect(command.presetId).toBe(preset.id);
    expect(command.status).toBe('pending');

    // Step 5: Verify agent receives command with preset context
    const commandMessage = await waitForMessage(agentWs, 'COMMAND_REQUEST');
    expect(commandMessage.payload.commandId).toBe(command.id);
    expect(commandMessage.payload.command).toBe('npm run build && npm test');
    expect(commandMessage.payload.constraints).toBeDefined();
    expect(commandMessage.payload.constraints.maxExecutionTime).toBe(300000);

    // Clean up
    agentWs.close();
  });

  it('should support preset tags for filtering', async () => {
    // Create multiple presets with different tags
    const deployPreset = await server.inject({
      method: 'POST',
      url: '/presets',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        name: 'Deploy to Production',
        command: 'npm run deploy:prod',
        tags: ['deploy', 'production']
      }
    });

    const testPreset = await server.inject({
      method: 'POST',
      url: '/presets',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        name: 'Run Unit Tests',
        command: 'npm test',
        tags: ['test', 'ci']
      }
    });

    const lintPreset = await server.inject({
      method: 'POST',
      url: '/presets',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        name: 'Lint Code',
        command: 'npm run lint',
        tags: ['lint', 'ci']
      }
    });

    expect(deployPreset.statusCode).toBe(201);
    expect(testPreset.statusCode).toBe(201);
    expect(lintPreset.statusCode).toBe(201);

    // Filter by tag 'ci'
    const ciPresetsResponse = await server.inject({
      method: 'GET',
      url: '/presets?tag=ci',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const ciPresets = JSON.parse(ciPresetsResponse.body);
    expect(ciPresets.length).toBe(2);
    const ciPresetNames = ciPresets.map((p: any) => p.name);
    expect(ciPresetNames).toContain('Run Unit Tests');
    expect(ciPresetNames).toContain('Lint Code');
    expect(ciPresetNames).not.toContain('Deploy to Production');
  });

  it('should update existing preset', async () => {
    // Create initial preset
    const createResponse = await server.inject({
      method: 'POST',
      url: '/presets',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        name: 'Original Preset',
        command: 'echo "original"',
        tags: ['original']
      }
    });

    const preset = JSON.parse(createResponse.body);

    // Update the preset
    const updateResponse = await server.inject({
      method: 'PUT',
      url: `/presets/${preset.id}`,
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        name: 'Updated Preset',
        command: 'echo "updated"',
        tags: ['updated', 'modified']
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    const updatedPreset = JSON.parse(updateResponse.body);

    expect(updatedPreset.id).toBe(preset.id);
    expect(updatedPreset.name).toBe('Updated Preset');
    expect(updatedPreset.command).toBe('echo "updated"');
    expect(updatedPreset.tags).toContain('updated');
    expect(updatedPreset.tags).toContain('modified');
  });

  it('should delete preset', async () => {
    // Create preset to delete
    const createResponse = await server.inject({
      method: 'POST',
      url: '/presets',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        name: 'To Be Deleted',
        command: 'echo "delete me"'
      }
    });

    const preset = JSON.parse(createResponse.body);

    // Delete the preset
    const deleteResponse = await server.inject({
      method: 'DELETE',
      url: `/presets/${preset.id}`,
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(deleteResponse.statusCode).toBe(204);

    // Verify it's deleted
    const getResponse = await server.inject({
      method: 'GET',
      url: `/presets/${preset.id}`,
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(getResponse.statusCode).toBe(404);
  });

  it('should validate agent constraints when executing preset', async () => {
    // Create preset with specific agent constraints
    const createResponse = await server.inject({
      method: 'POST',
      url: '/presets',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        name: 'Python Only',
        command: 'python script.py',
        agentConstraints: {
          type: 'python',
          minVersion: '3.9'
        }
      }
    });

    const preset = JSON.parse(createResponse.body);

    // Create incompatible agent (node type)
    const nodeAgent = await createTestAgent({
      name: 'node-agent',
      type: 'node'
    });

    // Try to execute preset on incompatible agent
    const executeResponse = await server.inject({
      method: 'POST',
      url: '/commands',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        agentId: nodeAgent.id,
        presetId: preset.id
      }
    });

    expect(executeResponse.statusCode).toBe(400);
    const error = JSON.parse(executeResponse.body);
    expect(error.message).toContain('constraint');

    // Create compatible agent
    const pythonAgent = await createTestAgent({
      name: 'python-agent',
      type: 'python',
      version: '3.10'
    });

    // Execute on compatible agent should work
    const validExecuteResponse = await server.inject({
      method: 'POST',
      url: '/commands',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        agentId: pythonAgent.id,
        presetId: preset.id
      }
    });

    expect(validExecuteResponse.statusCode).toBe(201);
  });

  it('should track preset usage statistics', async () => {
    // Create a preset
    const createResponse = await server.inject({
      method: 'POST',
      url: '/presets',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        name: 'Popular Preset',
        command: 'echo "used often"'
      }
    });

    const preset = JSON.parse(createResponse.body);
    const agent = await createTestAgent({ name: 'stats-agent' });

    // Execute preset multiple times
    for (let i = 0; i < 3; i++) {
      await server.inject({
        method: 'POST',
        url: '/commands',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        payload: {
          agentId: agent.id,
          presetId: preset.id
        }
      });
    }

    // Get preset with usage stats
    const getResponse = await server.inject({
      method: 'GET',
      url: `/presets/${preset.id}`,
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const presetWithStats = JSON.parse(getResponse.body);
    expect(presetWithStats.usageCount).toBe(3);
    expect(presetWithStats.lastUsed).toBeDefined();
  });

  it('should support preset variables and parameter substitution', async () => {
    // Create preset with variables
    const createResponse = await server.inject({
      method: 'POST',
      url: '/presets',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        name: 'Parameterized Build',
        command: 'npm run build --env={{ENV}} --target={{TARGET}}',
        parameters: {
          ENV: {
            type: 'string',
            default: 'development',
            description: 'Build environment'
          },
          TARGET: {
            type: 'string',
            required: true,
            description: 'Build target'
          }
        }
      }
    });

    const preset = JSON.parse(createResponse.body);
    const agent = await createTestAgent({ name: 'param-agent' });

    // Execute preset with parameter values
    const executeResponse = await server.inject({
      method: 'POST',
      url: '/commands',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        agentId: agent.id,
        presetId: preset.id,
        parameters: {
          ENV: 'production',
          TARGET: 'web'
        }
      }
    });

    expect(executeResponse.statusCode).toBe(201);
    const command = JSON.parse(executeResponse.body);

    // Command should have substituted values
    expect(command.command).toBe('npm run build --env=production --target=web');

    // Execute with default ENV value
    const executeDefaultResponse = await server.inject({
      method: 'POST',
      url: '/commands',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        agentId: agent.id,
        presetId: preset.id,
        parameters: {
          TARGET: 'mobile'
        }
      }
    });

    expect(executeDefaultResponse.statusCode).toBe(201);
    const commandDefault = JSON.parse(executeDefaultResponse.body);
    expect(commandDefault.command).toBe('npm run build --env=development --target=mobile');

    // Missing required parameter should fail
    const executeMissingResponse = await server.inject({
      method: 'POST',
      url: '/commands',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      payload: {
        agentId: agent.id,
        presetId: preset.id,
        parameters: {
          ENV: 'test'
          // TARGET missing
        }
      }
    });

    expect(executeMissingResponse.statusCode).toBe(400);
    const error = JSON.parse(executeMissingResponse.body);
    expect(error.message).toContain('TARGET');
  });
});