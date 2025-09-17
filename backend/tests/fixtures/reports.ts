import { v4 as uuidv4 } from 'uuid';

export const reportFixtures = {
  reportStatuses: ['DRAFT', 'IN_PROGRESS', 'COMPLETE'] as const,

  createReport: (overrides: any = {}) => ({
    id: uuidv4(),
    commandId: uuidv4(),
    agentId: uuidv4(),
    title: 'Codebase Investigation Report',
    summary: 'Comprehensive analysis of the codebase architecture and potential improvements',
    status: 'COMPLETE',
    content: {
      sections: [
        {
          title: 'Executive Summary',
          content: 'The codebase follows modern architectural patterns with room for optimization.',
          type: 'summary',
          order: 1,
        },
        {
          title: 'Architecture Overview',
          content: 'The application uses a microservices architecture with clear separation of concerns.',
          type: 'analysis',
          order: 2,
        },
        {
          title: 'Security Analysis',
          content: 'No critical vulnerabilities found. Minor improvements suggested for input validation.',
          type: 'security',
          order: 3,
        },
        {
          title: 'Performance Metrics',
          content: 'Average response time: 200ms. Optimization opportunities identified in database queries.',
          type: 'performance',
          order: 4,
        },
        {
          title: 'Recommendations',
          content: '1. Implement caching layer\n2. Optimize database indices\n3. Add input validation middleware',
          type: 'recommendations',
          order: 5,
        },
      ],
      findings: [
        {
          description: 'Unoptimized database queries in user service',
          severity: 'medium',
          location: '/src/services/user.service.ts',
          recommendation: 'Add database indices on frequently queried columns',
        },
        {
          description: 'Missing input validation on API endpoints',
          severity: 'low',
          location: '/src/api/routes.ts',
          recommendation: 'Implement validation middleware using Joi or Zod',
        },
        {
          description: 'Potential memory leak in WebSocket handler',
          severity: 'high',
          location: '/src/websocket/handler.ts',
          recommendation: 'Properly clean up event listeners on disconnect',
        },
      ],
      metadata: {
        filesAnalyzed: 145,
        linesOfCode: 12500,
        duration: '5m 32s',
        toolsUsed: ['ESLint', 'SonarQube', 'Custom Analyzer'],
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    ...overrides,
  }),

  createDraftReport: (overrides: any = {}) => ({
    id: uuidv4(),
    commandId: uuidv4(),
    agentId: uuidv4(),
    title: 'Work in Progress Investigation',
    summary: 'Initial findings from code analysis',
    status: 'DRAFT',
    content: {
      sections: [
        {
          title: 'Initial Findings',
          content: 'Preliminary analysis shows...',
          type: 'summary',
          order: 1,
        },
      ],
      findings: [],
      metadata: {
        filesAnalyzed: 10,
        linesOfCode: 1000,
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  }),

  createInProgressReport: (overrides: any = {}) => ({
    id: uuidv4(),
    commandId: uuidv4(),
    agentId: uuidv4(),
    title: 'Ongoing Security Audit',
    summary: 'Security vulnerability assessment in progress',
    status: 'IN_PROGRESS',
    content: {
      sections: [
        {
          title: 'Vulnerability Scan',
          content: '50% complete...',
          type: 'security',
          order: 1,
        },
      ],
      findings: [
        {
          description: 'SQL injection vulnerability detected',
          severity: 'critical',
          location: '/src/db/queries.ts',
          recommendation: 'Use parameterized queries',
        },
      ],
      metadata: {
        progress: 50,
        estimatedCompletion: '10 minutes',
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  }),

  reportVariations: [
    {
      title: 'Performance Optimization Report',
      status: 'COMPLETE',
      type: 'performance',
    },
    {
      title: 'Security Vulnerability Assessment',
      status: 'IN_PROGRESS',
      type: 'security',
    },
    {
      title: 'Code Quality Analysis',
      status: 'DRAFT',
      type: 'quality',
    },
    {
      title: 'Architecture Review',
      status: 'COMPLETE',
      type: 'architecture',
    },
  ],

  reportResponse: {
    id: expect.any(String),
    commandId: expect.any(String),
    agentId: expect.any(String),
    title: expect.any(String),
    summary: expect.any(String),
    status: expect.stringMatching(/^(DRAFT|IN_PROGRESS|COMPLETE)$/),
    content: expect.objectContaining({
      sections: expect.any(Array),
      findings: expect.any(Array),
    }),
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  },

  reportListResponse: {
    reports: expect.any(Array),
  },
};