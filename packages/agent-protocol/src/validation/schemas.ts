/**
 * Zod validation schemas for WebSocket messages and payloads
 */

import { z } from 'zod';

// Common schemas
const uuidSchema = z.string().uuid();
const timestampSchema = z.number().int().positive();

// Agent schemas
export const agentTypeSchema = z.enum(['CLAUDE', 'GEMINI', 'CODEX']);
export const agentStatusSchema = z.enum(['ONLINE', 'OFFLINE', 'CONNECTING', 'ERROR']);
export const activityStateSchema = z.enum(['IDLE', 'PROCESSING', 'QUEUED']);

export const agentCapabilitiesSchema = z.object({
  maxTokens: z.number().int().positive(),
  supportsInterrupt: z.boolean(),
  supportsTrace: z.boolean()
});

export const healthMetricsSchema = z.object({
  cpuUsage: z.number().min(0).max(100),
  memoryUsage: z.number().int().min(0),
  uptime: z.number().int().min(0),
  commandsProcessed: z.number().int().min(0),
  averageResponseTime: z.number().min(0)
});

export const agentConnectPayloadSchema = z.object({
  agentId: uuidSchema,
  agentType: agentTypeSchema,
  version: z.string().min(1),
  hostMachine: z.string().min(1),
  capabilities: agentCapabilitiesSchema
});

export const agentHeartbeatPayloadSchema = z.object({
  agentId: uuidSchema,
  healthMetrics: healthMetricsSchema
});

export const agentStatusPayloadSchema = z.object({
  agentId: uuidSchema,
  status: agentStatusSchema,
  activityState: activityStateSchema,
  healthMetrics: healthMetricsSchema.optional()
});

export const agentErrorPayloadSchema = z.object({
  agentId: uuidSchema,
  errorType: z.enum(['CONNECTION', 'EXECUTION', 'RESOURCE', 'UNKNOWN']),
  message: z.string().min(1),
  recoverable: z.boolean(),
  details: z.record(z.any())
});

export const agentControlPayloadSchema = z.object({
  action: z.enum(['STOP', 'RESTART', 'PAUSE', 'RESUME']),
  reason: z.string().min(1)
});

// Command schemas
export const commandTypeSchema = z.enum(['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE']);
export const commandStatusSchema = z.enum(['PENDING', 'QUEUED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED']);
export const streamTypeSchema = z.enum(['STDOUT', 'STDERR']);

export const executionConstraintsSchema = z.object({
  timeLimitMs: z.number().int().positive().optional(),
  tokenBudget: z.number().int().positive().optional()
});

export const commandProgressSchema = z.object({
  percent: z.number().min(0).max(100),
  message: z.string()
});

export const commandRequestPayloadSchema = z.object({
  commandId: uuidSchema,
  content: z.string().min(1),
  type: commandTypeSchema,
  priority: z.number().int().min(0).max(100),
  executionConstraints: executionConstraintsSchema.optional()
});

export const commandAckPayloadSchema = z.object({
  commandId: uuidSchema,
  agentId: uuidSchema,
  status: z.enum(['RECEIVED', 'QUEUED', 'EXECUTING'])
});

export const commandStatusPayloadSchema = z.object({
  commandId: uuidSchema,
  status: commandStatusSchema,
  progress: commandProgressSchema.optional()
});

export const commandCompletePayloadSchema = z.object({
  commandId: uuidSchema,
  agentId: uuidSchema,
  status: z.enum(['COMPLETED', 'FAILED', 'CANCELLED']),
  error: z.string().optional(),
  executionTime: z.number().int().min(0),
  tokensUsed: z.number().int().min(0)
});

export const commandCancelPayloadSchema = z.object({
  commandId: uuidSchema,
  reason: z.string().min(1)
});

export const terminalOutputPayloadSchema = z.object({
  commandId: uuidSchema,
  agentId: uuidSchema,
  streamType: streamTypeSchema,
  content: z.string(),
  ansiCodes: z.boolean(),
  sequence: z.number().int().min(0)
});

export const terminalStreamPayloadSchema = z.object({
  commandId: uuidSchema,
  agentId: uuidSchema,
  agentName: z.string().min(1),
  agentType: z.string().min(1),
  streamType: streamTypeSchema,
  content: z.string(),
  ansiCodes: z.boolean()
});

// Trace schemas
export const traceTypeSchema = z.enum(['LLM_PROMPT', 'TOOL_CALL', 'RESPONSE']);

export const traceEventPayloadSchema = z.object({
  commandId: uuidSchema,
  agentId: uuidSchema,
  traceId: uuidSchema,
  parentId: uuidSchema.nullable(),
  type: traceTypeSchema,
  name: z.string().min(1),
  content: z.record(z.any()),
  startedAt: timestampSchema,
  completedAt: timestampSchema.optional(),
  durationMs: z.number().int().min(0).optional(),
  tokensUsed: z.number().int().min(0).optional()
});

export const traceEntrySchema: z.ZodSchema<any> = z.lazy(() => z.object({
  id: uuidSchema,
  commandId: uuidSchema,
  agentId: uuidSchema,
  parentId: uuidSchema.nullable(),
  type: traceTypeSchema,
  name: z.string().min(1),
  content: z.record(z.any()),
  startedAt: timestampSchema,
  completedAt: timestampSchema.optional(),
  durationMs: z.number().int().min(0).optional(),
  tokensUsed: z.number().int().min(0).optional(),
  children: z.array(traceEntrySchema).optional()
}));

export const traceUpdatePayloadSchema = z.object({
  commandId: uuidSchema,
  agentId: uuidSchema,
  traces: z.array(traceEntrySchema)
});

// Investigation report schemas
export const investigationSectionSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
  order: z.number().int().min(0)
});

export const investigationFindingSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  evidence: z.array(z.string())
});

export const investigationRecommendationSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  actionItems: z.array(z.string())
});

export const investigationContentSchema = z.object({
  sections: z.array(investigationSectionSchema),
  findings: z.array(investigationFindingSchema),
  recommendations: z.array(investigationRecommendationSchema)
});

export const investigationReportPayloadSchema = z.object({
  commandId: uuidSchema,
  agentId: uuidSchema,
  reportId: uuidSchema,
  status: z.enum(['DRAFT', 'IN_PROGRESS', 'COMPLETE']),
  title: z.string().min(1),
  summary: z.string(),
  content: investigationContentSchema
});

// Server message payload schemas
export const tokenRefreshPayloadSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive()
});

export const serverHeartbeatPayloadSchema = z.object({
  serverTime: timestampSchema,
  nextPingExpected: z.number().int().positive()
});

// Error payload schema
export const errorPayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.any()),
  recoverable: z.boolean()
});

// Base WebSocket message schema
export const baseMessageSchema = z.object({
  type: z.string().min(1),
  id: uuidSchema,
  timestamp: timestampSchema,
  payload: z.any()
});

// Message type schemas
export const messageTypeSchema = z.enum([
  // Agent to Server
  'AGENT_CONNECT',
  'AGENT_HEARTBEAT',
  'COMMAND_ACK',
  'TERMINAL_OUTPUT',
  'TRACE_EVENT',
  'COMMAND_COMPLETE',
  'INVESTIGATION_REPORT',
  'AGENT_ERROR',
  // Server to Agent
  'COMMAND_REQUEST',
  'COMMAND_CANCEL',
  'AGENT_CONTROL',
  'TOKEN_REFRESH',
  'SERVER_HEARTBEAT',
  // Server to Dashboard
  'AGENT_STATUS',
  'COMMAND_STATUS',
  'TERMINAL_STREAM',
  'TRACE_UPDATE',
  // Error
  'ERROR'
]);

// Complete message schemas with typed payloads
export const agentConnectMessageSchema = baseMessageSchema.extend({
  type: z.literal('AGENT_CONNECT'),
  payload: agentConnectPayloadSchema
});

export const agentHeartbeatMessageSchema = baseMessageSchema.extend({
  type: z.literal('AGENT_HEARTBEAT'),
  payload: agentHeartbeatPayloadSchema
});

export const commandAckMessageSchema = baseMessageSchema.extend({
  type: z.literal('COMMAND_ACK'),
  payload: commandAckPayloadSchema
});

export const terminalOutputMessageSchema = baseMessageSchema.extend({
  type: z.literal('TERMINAL_OUTPUT'),
  payload: terminalOutputPayloadSchema
});

export const traceEventMessageSchema = baseMessageSchema.extend({
  type: z.literal('TRACE_EVENT'),
  payload: traceEventPayloadSchema
});

export const commandCompleteMessageSchema = baseMessageSchema.extend({
  type: z.literal('COMMAND_COMPLETE'),
  payload: commandCompletePayloadSchema
});

export const investigationReportMessageSchema = baseMessageSchema.extend({
  type: z.literal('INVESTIGATION_REPORT'),
  payload: investigationReportPayloadSchema
});

export const agentErrorMessageSchema = baseMessageSchema.extend({
  type: z.literal('AGENT_ERROR'),
  payload: agentErrorPayloadSchema
});

export const commandRequestMessageSchema = baseMessageSchema.extend({
  type: z.literal('COMMAND_REQUEST'),
  payload: commandRequestPayloadSchema
});

export const commandCancelMessageSchema = baseMessageSchema.extend({
  type: z.literal('COMMAND_CANCEL'),
  payload: commandCancelPayloadSchema
});

export const agentControlMessageSchema = baseMessageSchema.extend({
  type: z.literal('AGENT_CONTROL'),
  payload: agentControlPayloadSchema
});

export const tokenRefreshMessageSchema = baseMessageSchema.extend({
  type: z.literal('TOKEN_REFRESH'),
  payload: tokenRefreshPayloadSchema
});

export const serverHeartbeatMessageSchema = baseMessageSchema.extend({
  type: z.literal('SERVER_HEARTBEAT'),
  payload: serverHeartbeatPayloadSchema
});

export const agentStatusMessageSchema = baseMessageSchema.extend({
  type: z.literal('AGENT_STATUS'),
  payload: agentStatusPayloadSchema
});

export const commandStatusMessageSchema = baseMessageSchema.extend({
  type: z.literal('COMMAND_STATUS'),
  payload: commandStatusPayloadSchema
});

export const terminalStreamMessageSchema = baseMessageSchema.extend({
  type: z.literal('TERMINAL_STREAM'),
  payload: terminalStreamPayloadSchema
});

export const traceUpdateMessageSchema = baseMessageSchema.extend({
  type: z.literal('TRACE_UPDATE'),
  payload: traceUpdatePayloadSchema
});

export const errorMessageSchema = baseMessageSchema.extend({
  type: z.literal('ERROR'),
  payload: errorPayloadSchema
});

// Union schema for all possible messages
export const webSocketMessageSchema = z.discriminatedUnion('type', [
  agentConnectMessageSchema,
  agentHeartbeatMessageSchema,
  commandAckMessageSchema,
  terminalOutputMessageSchema,
  traceEventMessageSchema,
  commandCompleteMessageSchema,
  investigationReportMessageSchema,
  agentErrorMessageSchema,
  commandRequestMessageSchema,
  commandCancelMessageSchema,
  agentControlMessageSchema,
  tokenRefreshMessageSchema,
  serverHeartbeatMessageSchema,
  agentStatusMessageSchema,
  commandStatusMessageSchema,
  terminalStreamMessageSchema,
  traceUpdateMessageSchema,
  errorMessageSchema
]);