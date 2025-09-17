import { v4 as uuidv4 } from 'uuid';

export const auditLogFixtures = {
  eventTypes: [
    'AUTH_MAGIC_LINK_SENT',
    'AUTH_LOGIN',
    'AUTH_LOGOUT',
    'AUTH_TOKEN_REFRESH',
    'AGENT_CONNECTED',
    'AGENT_DISCONNECTED',
    'AGENT_STATUS_CHANGED',
    'AGENT_RESTARTED',
    'AGENT_STOPPED',
    'COMMAND_CREATED',
    'COMMAND_EXECUTED',
    'COMMAND_COMPLETED',
    'COMMAND_FAILED',
    'COMMAND_CANCELLED',
    'EMERGENCY_STOP_TRIGGERED',
    'PRESET_CREATED',
    'PRESET_UPDATED',
    'PRESET_DELETED',
    'REPORT_GENERATED',
    'CONSTRAINT_VIOLATED',
    'SECURITY_ALERT',
  ] as const,

  createAuditLog: (overrides: any = {}) => ({
    id: uuidv4(),
    eventType: 'COMMAND_EXECUTED',
    userId: uuidv4(),
    agentId: uuidv4(),
    commandId: uuidv4(),
    details: {
      action: 'Command executed successfully',
      commandType: 'INVESTIGATE',
      duration: 5432,
      status: 'SUCCESS',
    },
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    metadata: {
      sessionId: uuidv4(),
      requestId: uuidv4(),
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  createAuthLog: (overrides: any = {}) => ({
    id: uuidv4(),
    eventType: 'AUTH_LOGIN',
    userId: uuidv4(),
    agentId: null,
    commandId: null,
    details: {
      method: 'magic_link',
      email: 'user@example.com',
      success: true,
    },
    ipAddress: '10.0.0.1',
    userAgent: 'Mozilla/5.0',
    metadata: {
      sessionDuration: 3600,
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  createAgentLog: (overrides: any = {}) => ({
    id: uuidv4(),
    eventType: 'AGENT_CONNECTED',
    userId: null,
    agentId: uuidv4(),
    commandId: null,
    details: {
      agentName: 'claude-agent-1',
      agentType: 'CLAUDE',
      version: '1.0.0',
      hostMachine: 'prod-server-1',
    },
    ipAddress: '172.16.0.10',
    userAgent: 'agent-wrapper/1.0.0',
    metadata: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  createSecurityLog: (overrides: any = {}) => ({
    id: uuidv4(),
    eventType: 'SECURITY_ALERT',
    userId: uuidv4(),
    agentId: null,
    commandId: null,
    details: {
      alertType: 'SUSPICIOUS_ACTIVITY',
      description: 'Multiple failed authentication attempts',
      severity: 'MEDIUM',
      attempts: 5,
    },
    ipAddress: '203.0.113.0',
    userAgent: 'Unknown',
    metadata: {
      blocked: true,
      blockDuration: 3600,
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  createEmergencyStopLog: (overrides: any = {}) => ({
    id: uuidv4(),
    eventType: 'EMERGENCY_STOP_TRIGGERED',
    userId: uuidv4(),
    agentId: null,
    commandId: null,
    details: {
      reason: 'Manual emergency stop initiated',
      agentsStopped: 5,
      commandsCancelled: 12,
      triggeredBy: 'user@example.com',
    },
    ipAddress: '192.168.1.50',
    userAgent: 'Mozilla/5.0',
    metadata: {
      priority: 'CRITICAL',
      notificationsSent: ['admin@example.com', 'security@example.com'],
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  auditLogVariations: [
    {
      eventType: 'AUTH_MAGIC_LINK_SENT',
      details: { email: 'test@example.com' },
    },
    {
      eventType: 'AGENT_STATUS_CHANGED',
      details: { from: 'ONLINE', to: 'OFFLINE' },
    },
    {
      eventType: 'COMMAND_FAILED',
      details: { error: 'Timeout exceeded', duration: 30000 },
    },
    {
      eventType: 'PRESET_CREATED',
      details: { presetName: 'Code Review', presetType: 'REVIEW' },
    },
    {
      eventType: 'CONSTRAINT_VIOLATED',
      details: { constraint: 'MAX_MEMORY', limit: '4GB', used: '4.5GB' },
    },
  ],

  auditLogResponse: {
    id: expect.any(String),
    eventType: expect.any(String),
    userId: expect.any(String),
    agentId: expect.any(String),
    commandId: expect.any(String),
    details: expect.any(Object),
    ipAddress: expect.any(String),
    userAgent: expect.any(String),
    createdAt: expect.any(String),
  },

  auditLogListResponse: {
    logs: expect.any(Array),
    total: expect.any(Number),
  },
};