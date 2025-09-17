import { v4 as uuidv4 } from 'uuid';
import { AgentType, CommandStatus } from '@onsembl/agent-protocol';

export function createTestAgent(overrides: any = {}) {
  return {
    id: uuidv4(),
    name: `test-agent-${Date.now()}`,
    type: AgentType.CLAUDE,
    status: 'online',
    version: '1.0.0',
    host_machine: 'test-machine',
    capabilities: ['code_execution', 'file_operations'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestCommand(agentId: string, overrides: any = {}) {
  return {
    id: uuidv4(),
    agent_id: agentId,
    command: 'echo "test command"',
    arguments: {},
    priority: 1,
    status: CommandStatus.PENDING,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestPreset(overrides: any = {}) {
  return {
    id: uuidv4(),
    name: `test-preset-${Date.now()}`,
    description: 'Test preset for automated testing',
    command_template: 'echo "{{message}}"',
    parameters: {
      message: {
        type: 'string',
        required: true,
        default: 'Hello World',
      },
    },
    agent_type: AgentType.CLAUDE,
    is_public: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestReport(commandId: string, overrides: any = {}) {
  return {
    id: uuidv4(),
    command_id: commandId,
    title: 'Test Investigation Report',
    description: 'Automated test report',
    status: 'draft',
    findings: [],
    recommendations: [],
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestTerminalOutput(commandId: string, overrides: any = {}) {
  return {
    id: uuidv4(),
    command_id: commandId,
    type: 'stdout',
    content: 'Test output line',
    timestamp: new Date().toISOString(),
    line_number: 1,
    ...overrides,
  };
}

export function createTestTraceEntry(commandId: string, overrides: any = {}) {
  return {
    id: uuidv4(),
    command_id: commandId,
    trace_type: 'LLM_PROMPT',
    event_name: 'test_event',
    timestamp: new Date().toISOString(),
    duration_ms: 100,
    metadata: {
      prompt: 'Test prompt',
      response: 'Test response',
    },
    parent_id: null,
    depth: 0,
    ...overrides,
  };
}