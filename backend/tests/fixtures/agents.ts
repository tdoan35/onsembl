import { v4 as uuidv4 } from 'uuid';

export const agentFixtures = {
  createAgent: (overrides: any = {}) => ({
    id: uuidv4(),
    name: 'Test Agent',
    type: 'CLAUDE',
    status: 'ONLINE',
    activityState: 'IDLE',
    hostMachine: 'test-machine-01',
    connectedAt: new Date().toISOString(),
    disconnectedAt: null,
    healthMetrics: {
      cpuUsage: 25.5,
      memoryUsage: 45.2,
      uptime: 3600,
      commandsProcessed: 10,
      averageResponseTime: 250,
    },
    config: {
      serverUrl: 'ws://localhost:3002',
      autoReconnect: true,
      maxRetries: 3,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),

  agentTypes: ['CLAUDE', 'GEMINI', 'CODEX'] as const,
  agentStatuses: ['ONLINE', 'OFFLINE', 'CONNECTING', 'ERROR'] as const,
  agentActivityStates: ['IDLE', 'PROCESSING', 'QUEUED'] as const,

  createMultipleAgents: (count: number = 3) => {
    const agents = [];
    const types = ['CLAUDE', 'GEMINI', 'CODEX'];
    const statuses = ['ONLINE', 'OFFLINE', 'CONNECTING'];
    const activities = ['IDLE', 'PROCESSING', 'QUEUED'];

    for (let i = 0; i < count; i++) {
      agents.push(agentFixtures.createAgent({
        id: uuidv4(),
        name: `Agent ${i + 1}`,
        type: types[i % types.length],
        status: statuses[i % statuses.length],
        activityState: activities[i % activities.length],
        hostMachine: `machine-${(i % 2) + 1}`,
        healthMetrics: {
          cpuUsage: 20 + (i * 5),
          memoryUsage: 30 + (i * 10),
          uptime: 3600 * (i + 1),
          commandsProcessed: i * 5,
          averageResponseTime: 200 + (i * 50),
        },
      }));
    }
    return agents;
  },

  agentListResponse: {
    agents: expect.any(Array),
    total: expect.any(Number),
  },

  agentResponse: {
    id: expect.any(String),
    name: expect.any(String),
    type: expect.stringMatching(/^(CLAUDE|GEMINI|CODEX)$/),
    status: expect.stringMatching(/^(ONLINE|OFFLINE|CONNECTING|ERROR)$/),
    activityState: expect.stringMatching(/^(IDLE|PROCESSING|QUEUED)$/),
    hostMachine: expect.any(String),
    connectedAt: expect.any(String),
    disconnectedAt: expect.any(String),
    healthMetrics: expect.objectContaining({
      cpuUsage: expect.any(Number),
      memoryUsage: expect.any(Number),
      uptime: expect.any(Number),
      commandsProcessed: expect.any(Number),
      averageResponseTime: expect.any(Number),
    }),
    config: expect.objectContaining({
      serverUrl: expect.any(String),
      autoReconnect: expect.any(Boolean),
      maxRetries: expect.any(Number),
    }),
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  },

  messageResponse: {
    message: expect.any(String),
  },

  errorResponse: {
    error: expect.any(String),
  },
};