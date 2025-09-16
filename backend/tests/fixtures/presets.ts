import { v4 as uuidv4 } from 'uuid';

export const presetFixtures = {
  createPreset: (overrides: any = {}) => ({
    id: uuidv4(),
    userId: uuidv4(),
    name: 'Code Review Preset',
    description: 'Performs comprehensive code review and suggests improvements',
    content: 'Review the following code for:\n- Performance issues\n- Security vulnerabilities\n- Best practices\n- Code style\n\nCode: {{code}}',
    type: 'REVIEW',
    targetAgentTypes: ['CLAUDE', 'GEMINI'],
    variables: [
      {
        name: 'code',
        description: 'The code to review',
        default: '',
      },
    ],
    metadata: {},
    isGlobal: false,
    tags: ['code-review', 'quality'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),

  createPresetRequest: {
    name: 'Test Preset',
    description: 'A test preset for unit testing',
    content: 'Execute test command: {{command}}',
    type: 'NATURAL',
    targetAgentTypes: ['CLAUDE'],
    variables: [
      {
        name: 'command',
        description: 'The command to execute',
        default: 'test',
      },
    ],
  },

  updatePresetRequest: {
    name: 'Updated Preset',
    description: 'Updated description',
    content: 'Updated content with {{variable}}',
    type: 'INVESTIGATE',
    targetAgentTypes: ['GEMINI', 'CODEX'],
    variables: [
      {
        name: 'variable',
        description: 'Updated variable',
        default: 'default value',
      },
    ],
  },

  presetVariations: [
    {
      name: 'Security Scan',
      type: 'INVESTIGATE',
      content: 'Scan for security vulnerabilities in: {{target}}',
      targetAgentTypes: ['CLAUDE'],
    },
    {
      name: 'Performance Analysis',
      type: 'REVIEW',
      content: 'Analyze performance bottlenecks in: {{component}}',
      targetAgentTypes: ['CODEX'],
    },
    {
      name: 'Documentation Generator',
      type: 'SYNTHESIZE',
      content: 'Generate documentation for: {{module}}',
      targetAgentTypes: ['GEMINI'],
    },
    {
      name: 'Bug Investigation',
      type: 'INVESTIGATE',
      content: 'Investigate bug report: {{bugId}}',
      targetAgentTypes: ['CLAUDE', 'GEMINI'],
    },
    {
      name: 'Refactoring Plan',
      type: 'PLAN',
      content: 'Plan refactoring for: {{component}}',
      targetAgentTypes: ['CLAUDE'],
    },
  ],

  presetResponse: {
    id: expect.any(String),
    userId: expect.any(String),
    name: expect.any(String),
    description: expect.any(String),
    content: expect.any(String),
    type: expect.stringMatching(/^(NATURAL|INVESTIGATE|REVIEW|PLAN|SYNTHESIZE)$/),
    targetAgentTypes: expect.any(Array),
    variables: expect.any(Array),
    metadata: expect.any(Object),
    isGlobal: expect.any(Boolean),
    tags: expect.any(Array),
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  },

  presetListResponse: {
    presets: expect.any(Array),
  },
};