import { v4 as uuidv4 } from 'uuid';

export const traceFixtures = {
  traceTypes: ['LLM_PROMPT', 'TOOL_CALL', 'RESPONSE'] as const,

  createTraceEntry: (overrides: any = {}) => ({
    id: uuidv4(),
    commandId: uuidv4(),
    agentId: uuidv4(),
    parentTraceId: null,
    type: 'LLM_PROMPT',
    name: 'Test trace entry',
    data: {
      prompt: 'Test prompt',
      temperature: 0.7,
      maxTokens: 1000,
    },
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 1000).toISOString(),
    duration: 1000,
    tokenUsage: {
      input: 150,
      output: 200,
      total: 350,
    },
    error: null,
    metadata: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  createTraceTree: (commandId: string, agentId: string) => {
    const rootId = uuidv4();
    const child1Id = uuidv4();
    const child2Id = uuidv4();
    const grandchildId = uuidv4();

    const baseTime = Date.now();

    return [
      // Root LLM prompt
      traceFixtures.createTraceEntry({
        id: rootId,
        commandId,
        agentId,
        parentTraceId: null,
        type: 'LLM_PROMPT',
        name: 'Initial Analysis',
        data: {
          prompt: 'Analyze the codebase and suggest improvements',
          model: 'claude-3-opus',
          temperature: 0.7,
        },
        startTime: new Date(baseTime).toISOString(),
        endTime: new Date(baseTime + 5000).toISOString(),
        duration: 5000,
        tokenUsage: {
          input: 500,
          output: 800,
          total: 1300,
        },
      }),

      // First child - Tool call
      traceFixtures.createTraceEntry({
        id: child1Id,
        commandId,
        agentId,
        parentTraceId: rootId,
        type: 'TOOL_CALL',
        name: 'ReadFile',
        data: {
          tool: 'file_reader',
          input: {
            path: '/src/index.ts',
          },
          output: {
            content: 'file contents...',
          },
        },
        startTime: new Date(baseTime + 1000).toISOString(),
        endTime: new Date(baseTime + 1500).toISOString(),
        duration: 500,
        tokenUsage: null,
      }),

      // Second child - Another tool call
      traceFixtures.createTraceEntry({
        id: child2Id,
        commandId,
        agentId,
        parentTraceId: rootId,
        type: 'TOOL_CALL',
        name: 'SearchCode',
        data: {
          tool: 'code_search',
          input: {
            query: 'function implementation',
          },
          output: {
            results: ['result1', 'result2'],
          },
        },
        startTime: new Date(baseTime + 2000).toISOString(),
        endTime: new Date(baseTime + 3000).toISOString(),
        duration: 1000,
        tokenUsage: null,
      }),

      // Grandchild - Nested LLM call
      traceFixtures.createTraceEntry({
        id: grandchildId,
        commandId,
        agentId,
        parentTraceId: child2Id,
        type: 'LLM_PROMPT',
        name: 'Analyze Search Results',
        data: {
          prompt: 'Analyze these search results...',
          model: 'claude-3-haiku',
          temperature: 0.3,
        },
        startTime: new Date(baseTime + 2500).toISOString(),
        endTime: new Date(baseTime + 2800).toISOString(),
        duration: 300,
        tokenUsage: {
          input: 200,
          output: 150,
          total: 350,
        },
      }),

      // Final response
      traceFixtures.createTraceEntry({
        id: uuidv4(),
        commandId,
        agentId,
        parentTraceId: rootId,
        type: 'RESPONSE',
        name: 'Final Analysis',
        data: {
          response: 'Based on my analysis, here are the improvements...',
        },
        startTime: new Date(baseTime + 4500).toISOString(),
        endTime: new Date(baseTime + 5000).toISOString(),
        duration: 500,
        tokenUsage: {
          input: 100,
          output: 500,
          total: 600,
        },
      }),
    ];
  },

  createErrorTrace: (commandId: string, agentId: string) => ({
    id: uuidv4(),
    commandId,
    agentId,
    parentTraceId: null,
    type: 'LLM_PROMPT',
    name: 'Failed Analysis',
    data: {
      prompt: 'Analyze this code',
      error: 'Rate limit exceeded',
    },
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 100).toISOString(),
    duration: 100,
    tokenUsage: null,
    error: {
      message: 'Rate limit exceeded',
      code: 'RATE_LIMIT',
      details: {
        retryAfter: 60,
      },
    },
    metadata: {},
    createdAt: new Date().toISOString(),
  }),

  traceResponse: {
    id: expect.any(String),
    commandId: expect.any(String),
    agentId: expect.any(String),
    parentTraceId: expect.any(String),
    type: expect.stringMatching(/^(LLM_PROMPT|TOOL_CALL|RESPONSE)$/),
    name: expect.any(String),
    data: expect.any(Object),
    startTime: expect.any(String),
    endTime: expect.any(String),
    duration: expect.any(Number),
    tokenUsage: expect.any(Object),
    error: expect.any(Object),
    metadata: expect.any(Object),
    createdAt: expect.any(String),
  },

  traceListResponse: {
    traces: expect.any(Array),
    total: expect.any(Number),
    totalTokens: expect.any(Number),
    totalDuration: expect.any(Number),
  },
};