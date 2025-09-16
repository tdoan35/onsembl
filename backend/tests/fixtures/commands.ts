import { v4 as uuidv4 } from 'uuid';

export const commandFixtures = {
  commandTypes: ['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE'] as const,
  commandStatuses: ['PENDING', 'QUEUED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const,
  streamTypes: ['STDOUT', 'STDERR'] as const,

  createCommand: (overrides: any = {}) => ({
    id: uuidv4(),
    userId: uuidv4(),
    content: 'Test command content',
    type: 'NATURAL',
    targetAgents: [uuidv4()],
    broadcast: false,
    status: 'PENDING',
    priority: 0,
    queuePosition: null,
    startedAt: null,
    completedAt: null,
    failureReason: null,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),

  createMultipleCommands: (count: number = 5) => {
    const commands = [];
    const types = ['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE'];
    const statuses = ['PENDING', 'QUEUED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED'];

    for (let i = 0; i < count; i++) {
      const status = statuses[i % statuses.length];
      const now = new Date();
      const createdAt = new Date(now.getTime() - (i * 60000)); // Each 1 minute apart

      commands.push(commandFixtures.createCommand({
        id: uuidv4(),
        content: `Command ${i + 1}: ${types[i % types.length].toLowerCase()} task`,
        type: types[i % types.length],
        status,
        priority: i,
        queuePosition: status === 'QUEUED' ? i + 1 : null,
        startedAt: ['EXECUTING', 'COMPLETED', 'FAILED'].includes(status)
          ? new Date(createdAt.getTime() + 10000).toISOString()
          : null,
        completedAt: ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)
          ? new Date(createdAt.getTime() + 30000).toISOString()
          : null,
        failureReason: status === 'FAILED' ? `Error in command ${i + 1}` : null,
        createdAt: createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    }
    return commands;
  },

  createCommandRequest: {
    content: 'Analyze the codebase and suggest improvements',
    type: 'INVESTIGATE',
    targetAgents: [uuidv4()],
    broadcast: false,
    priority: 1,
    metadata: {
      source: 'test',
    },
  },

  createInvalidCommandRequest: {
    content: '', // Invalid: empty content
    type: 'INVALID_TYPE',
    targetAgents: [],
    broadcast: false,
  },

  createTerminalOutput: (overrides: any = {}) => ({
    id: uuidv4(),
    commandId: uuidv4(),
    agentId: uuidv4(),
    content: 'Test output line',
    streamType: 'STDOUT',
    timestamp: new Date().toISOString(),
    sequenceNumber: 1,
    ...overrides,
  }),

  createMultipleOutputs: (commandId: string, count: number = 10) => {
    const outputs = [];
    const streamTypes = ['STDOUT', 'STDERR'];
    const baseTime = Date.now();

    for (let i = 0; i < count; i++) {
      outputs.push(commandFixtures.createTerminalOutput({
        id: uuidv4(),
        commandId,
        agentId: uuidv4(),
        content: `Output line ${i + 1}: ${i % 3 === 0 ? 'Error' : 'Processing'}...`,
        streamType: streamTypes[i % 5 === 0 ? 1 : 0], // Every 5th line is stderr
        timestamp: new Date(baseTime + (i * 100)).toISOString(), // 100ms apart
        sequenceNumber: i + 1,
      }));
    }
    return outputs;
  },

  commandResponse: {
    id: expect.any(String),
    userId: expect.any(String),
    content: expect.any(String),
    type: expect.stringMatching(/^(NATURAL|INVESTIGATE|REVIEW|PLAN|SYNTHESIZE)$/),
    targetAgents: expect.any(Array),
    broadcast: expect.any(Boolean),
    status: expect.stringMatching(/^(PENDING|QUEUED|EXECUTING|COMPLETED|FAILED|CANCELLED)$/),
    priority: expect.any(Number),
    queuePosition: expect.any(Number),
    startedAt: expect.any(String),
    completedAt: expect.any(String),
    failureReason: expect.any(String),
    metadata: expect.any(Object),
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  },

  commandListResponse: {
    commands: expect.any(Array),
    total: expect.any(Number),
    hasMore: expect.any(Boolean),
  },

  terminalOutputResponse: {
    id: expect.any(String),
    commandId: expect.any(String),
    agentId: expect.any(String),
    content: expect.any(String),
    streamType: expect.stringMatching(/^(STDOUT|STDERR)$/),
    timestamp: expect.any(String),
    sequenceNumber: expect.any(Number),
  },

  messageResponse: {
    message: expect.any(String),
  },

  errorResponse: {
    error: expect.any(String),
  },
};