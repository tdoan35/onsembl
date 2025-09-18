/**
 * Message Validation for WebSocket Protocol
 * Provides runtime validation and type checking for all message types
 */

import { z } from 'zod';
import {
  MessageType,
  AgentType,
  AgentStatus,
  AgentActivityState,
  CommandType,
  CommandStatus,
  StreamType,
  TraceType,
  ErrorType,
  AgentControlAction,
  ReportStatus,
} from './types';

// ============================================================================
// Base Schemas
// ============================================================================

const MessageTypeSchema = z.nativeEnum(MessageType);
const AgentTypeSchema = z.enum(['CLAUDE', 'GEMINI', 'CODEX']);
const AgentStatusSchema = z.enum(['ONLINE', 'OFFLINE', 'CONNECTING', 'ERROR']);
const AgentActivityStateSchema = z.enum(['IDLE', 'PROCESSING', 'QUEUED']);
const CommandTypeSchema = z.enum(['NATURAL', 'INVESTIGATE', 'REVIEW', 'PLAN', 'SYNTHESIZE']);
const CommandStatusSchema = z.enum(['PENDING', 'QUEUED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED']);
const StreamTypeSchema = z.enum(['STDOUT', 'STDERR']);
const TraceTypeSchema = z.enum(['LLM_PROMPT', 'TOOL_CALL', 'RESPONSE']);
const ErrorTypeSchema = z.enum(['CONNECTION', 'EXECUTION', 'RESOURCE', 'UNKNOWN']);
const AgentControlActionSchema = z.enum(['STOP', 'RESTART', 'PAUSE', 'RESUME']);
const ReportStatusSchema = z.enum(['DRAFT', 'IN_PROGRESS', 'COMPLETE']);

// Base message structure
export const WebSocketMessageSchema = z.object({
  type: MessageTypeSchema,
  id: z.string().uuid(),
  timestamp: z.number().positive(),
  payload: z.any(), // Will be refined based on message type
});

// ============================================================================
// Agent → Server Message Schemas
// ============================================================================

export const AgentConnectPayloadSchema = z.object({
  agentId: z.string().uuid(),
  agentType: AgentTypeSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  hostMachine: z.string().min(1),
  capabilities: z.object({
    maxTokens: z.number().positive(),
    supportsInterrupt: z.boolean(),
    supportsTrace: z.boolean(),
  }),
});

export const AgentHeartbeatPayloadSchema = z.object({
  agentId: z.string().uuid(),
  healthMetrics: z.object({
    cpuUsage: z.number().min(0).max(100),
    memoryUsage: z.number().min(0),
    uptime: z.number().min(0),
    commandsProcessed: z.number().min(0),
    averageResponseTime: z.number().min(0),
  }),
});

export const CommandAckPayloadSchema = z.object({
  commandId: z.string().uuid(),
  agentId: z.string().uuid(),
  status: z.enum(['RECEIVED', 'QUEUED', 'EXECUTING']),
  queuePosition: z.number().positive().optional(),
});

export const TerminalOutputPayloadSchema = z.object({
  commandId: z.string().uuid(),
  agentId: z.string().uuid(),
  streamType: StreamTypeSchema,
  content: z.string(),
  ansiCodes: z.boolean(),
  sequence: z.number().min(0),
});

export const TraceEventPayloadSchema = z.object({
  commandId: z.string().uuid(),
  agentId: z.string().uuid(),
  traceId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  type: TraceTypeSchema,
  name: z.string().min(1),
  content: z.object({
    prompt: z.string().optional(),
    response: z.string().optional(),
    toolName: z.string().optional(),
    toolInput: z.any().optional(),
    toolOutput: z.any().optional(),
    error: z.string().optional(),
  }),
  startedAt: z.number().positive(),
  completedAt: z.number().positive(),
  durationMs: z.number().min(0),
  tokensUsed: z.number().min(0).optional(),
  metadata: z.record(z.any()).optional(),
});

export const CommandCompletePayloadSchema = z.object({
  commandId: z.string().uuid(),
  agentId: z.string().uuid(),
  status: z.enum(['COMPLETED', 'FAILED', 'CANCELLED']),
  error: z.string().optional(),
  executionTime: z.number().min(0),
  tokensUsed: z.number().min(0),
  outputStats: z.object({
    totalLines: z.number().min(0),
    stdoutLines: z.number().min(0),
    stderrLines: z.number().min(0),
  }).optional(),
});

export const InvestigationReportPayloadSchema = z.object({
  commandId: z.string().uuid(),
  agentId: z.string().uuid(),
  reportId: z.string().uuid(),
  status: ReportStatusSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  content: z.object({
    sections: z.array(z.object({
      title: z.string().min(1),
      content: z.string(),
      order: z.number().min(0),
    })),
    findings: z.array(z.object({
      type: z.enum(['issue', 'insight', 'recommendation']),
      severity: z.enum(['low', 'medium', 'high']),
      description: z.string().min(1),
      evidence: z.array(z.string()).optional(),
    })),
    recommendations: z.array(z.object({
      priority: z.number().min(1),
      action: z.string().min(1),
      rationale: z.string().min(1),
    })),
  }),
  metadata: z.object({
    commandCount: z.number().min(0),
    traceCount: z.number().min(0),
    errorCount: z.number().min(0),
    duration: z.number().min(0),
  }).optional(),
});

export const AgentErrorPayloadSchema = z.object({
  agentId: z.string().uuid(),
  errorType: ErrorTypeSchema,
  message: z.string().min(1),
  recoverable: z.boolean(),
  details: z.record(z.any()).optional(),
  stack: z.string().optional(),
});

// ============================================================================
// Server → Agent Message Schemas
// ============================================================================

export const CommandRequestPayloadSchema = z.object({
  commandId: z.string().uuid(),
  content: z.string().min(1),
  type: CommandTypeSchema,
  priority: z.number().min(0).max(100),
  executionConstraints: z.object({
    timeLimitMs: z.number().positive().optional(),
    tokenBudget: z.number().positive().optional(),
    maxRetries: z.number().min(0).optional(),
  }).optional(),
  context: z.object({
    previousCommandId: z.string().uuid().optional(),
    presetId: z.string().uuid().optional(),
    parameters: z.record(z.any()).optional(),
  }).optional(),
});

export const CommandCancelPayloadSchema = z.object({
  commandId: z.string().uuid(),
  reason: z.string().min(1),
  force: z.boolean().optional(),
});

export const AgentControlPayloadSchema = z.object({
  action: AgentControlActionSchema,
  reason: z.string().min(1),
  gracefulShutdown: z.boolean().optional(),
  timeout: z.number().positive().optional(),
});

export const TokenRefreshPayloadSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().positive(),
  refreshToken: z.string().min(1).optional(),
});

export const ServerHeartbeatPayloadSchema = z.object({
  serverTime: z.number().positive(),
  nextPingExpected: z.number().positive(),
  maintenanceWindow: z.object({
    start: z.number().positive(),
    end: z.number().positive(),
    message: z.string().min(1),
  }).optional(),
});

// ============================================================================
// Server → Dashboard Message Schemas
// ============================================================================

export const AgentStatusPayloadSchema = z.object({
  agentId: z.string().uuid(),
  status: AgentStatusSchema,
  activityState: AgentActivityStateSchema,
  healthMetrics: z.object({
    cpuUsage: z.number().min(0).max(100),
    memoryUsage: z.number().min(0),
    uptime: z.number().min(0),
    commandsProcessed: z.number().min(0),
    averageResponseTime: z.number().min(0),
  }).optional(),
  currentCommand: z.object({
    id: z.string().uuid(),
    type: CommandTypeSchema,
    startedAt: z.number().positive(),
  }).optional(),
  queuedCommands: z.number().min(0).optional(),
});

export const CommandStatusPayloadSchema = z.object({
  commandId: z.string().uuid(),
  agentId: z.string().uuid(),
  status: CommandStatusSchema,
  progress: z.object({
    percent: z.number().min(0).max(100),
    message: z.string(),
    currentStep: z.number().min(0).optional(),
    totalSteps: z.number().positive().optional(),
  }).optional(),
  startedAt: z.number().positive().optional(),
  completedAt: z.number().positive().optional(),
});

export const TerminalStreamPayloadSchema = z.object({
  commandId: z.string().uuid(),
  agentId: z.string().uuid(),
  content: z.string(),
  streamType: StreamTypeSchema,
  ansiCodes: z.boolean(),
  timestamp: z.number().positive(),
});

export const TraceStreamPayloadSchema = z.object({
  commandId: z.string().uuid(),
  agentId: z.string().uuid(),
  trace: TraceEventPayloadSchema,
});

export const QueueUpdatePayloadSchema = z.object({
  agentId: z.string().uuid(),
  queueSize: z.number().min(0),
  executing: z.object({
    commandId: z.string().uuid(),
    startedAt: z.number().positive(),
  }).optional(),
  queued: z.array(z.object({
    commandId: z.string().uuid(),
    position: z.number().positive(),
    priority: z.number().min(0).max(100),
    estimatedStartTime: z.number().positive().optional(),
  })),
});

export const EmergencyStopPayloadSchema = z.object({
  triggeredBy: z.string().min(1),
  reason: z.string().min(1),
  agentsStopped: z.number().min(0),
  commandsCancelled: z.number().min(0),
  timestamp: z.number().positive(),
});

// ============================================================================
// Dashboard → Server Message Schemas
// ============================================================================

export const DashboardInitPayloadSchema = z.object({
  userId: z.string().min(1),
  subscriptions: z.object({
    agents: z.array(z.string().uuid()).optional(),
    commands: z.array(z.string().uuid()).optional(),
    traces: z.boolean().optional(),
    terminals: z.boolean().optional(),
  }).optional(),
});

export const DashboardSubscribePayloadSchema = z.object({
  type: z.enum(['agent', 'command', 'trace', 'terminal']),
  id: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

export const DashboardUnsubscribePayloadSchema = z.object({
  type: z.enum(['agent', 'command', 'trace', 'terminal']),
  id: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

// ============================================================================
// Common/Utility Schemas
// ============================================================================

export const PingPayloadSchema = z.object({
  timestamp: z.number().positive(),
  sequence: z.number().min(0).optional(),
});

export const PongPayloadSchema = z.object({
  timestamp: z.number().positive(),
  sequence: z.number().min(0).optional(),
  latency: z.number().min(0).optional(),
});

export const AckPayloadSchema = z.object({
  messageId: z.string().uuid(),
  success: z.boolean(),
  error: z.string().optional(),
});

export const ErrorPayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.any()).optional(),
  originalMessageId: z.string().uuid().optional(),
});

// ============================================================================
// Message Validation Map
// ============================================================================

export const MessageValidationMap = {
  [MessageType.AGENT_CONNECT]: AgentConnectPayloadSchema,
  [MessageType.AGENT_HEARTBEAT]: AgentHeartbeatPayloadSchema,
  [MessageType.AGENT_ERROR]: AgentErrorPayloadSchema,
  [MessageType.COMMAND_ACK]: CommandAckPayloadSchema,
  [MessageType.COMMAND_COMPLETE]: CommandCompletePayloadSchema,
  [MessageType.TERMINAL_OUTPUT]: TerminalOutputPayloadSchema,
  [MessageType.TRACE_EVENT]: TraceEventPayloadSchema,
  [MessageType.INVESTIGATION_REPORT]: InvestigationReportPayloadSchema,
  [MessageType.COMMAND_REQUEST]: CommandRequestPayloadSchema,
  [MessageType.COMMAND_CANCEL]: CommandCancelPayloadSchema,
  [MessageType.AGENT_CONTROL]: AgentControlPayloadSchema,
  [MessageType.TOKEN_REFRESH]: TokenRefreshPayloadSchema,
  [MessageType.SERVER_HEARTBEAT]: ServerHeartbeatPayloadSchema,
  [MessageType.AGENT_STATUS]: AgentStatusPayloadSchema,
  [MessageType.COMMAND_STATUS]: CommandStatusPayloadSchema,
  [MessageType.TERMINAL_STREAM]: TerminalStreamPayloadSchema,
  [MessageType.TRACE_STREAM]: TraceStreamPayloadSchema,
  [MessageType.QUEUE_UPDATE]: QueueUpdatePayloadSchema,
  [MessageType.EMERGENCY_STOP]: EmergencyStopPayloadSchema,
  [MessageType.DASHBOARD_INIT]: DashboardInitPayloadSchema,
  [MessageType.DASHBOARD_SUBSCRIBE]: DashboardSubscribePayloadSchema,
  [MessageType.DASHBOARD_UNSUBSCRIBE]: DashboardUnsubscribePayloadSchema,
  [MessageType.PING]: PingPayloadSchema,
  [MessageType.PONG]: PongPayloadSchema,
  [MessageType.ACK]: AckPayloadSchema,
  [MessageType.ERROR]: ErrorPayloadSchema,
};

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a WebSocket message structure
 */
export function validateMessage(message: unknown): { valid: boolean; error?: string } {
  try {
    const result = WebSocketMessageSchema.parse(message);
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, error: error.errors[0]?.message || 'Validation error' };
    }
    return { valid: false, error: 'Invalid message structure' };
  }
}

/**
 * Validates a message payload based on its type
 */
export function validatePayload(type: MessageType, payload: unknown): { valid: boolean; error?: string } {
  const schema = MessageValidationMap[type];
  if (!schema) {
    return { valid: false, error: `Unknown message type: ${type}` };
  }

  try {
    schema.parse(payload);
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return { valid: false, error: issues };
    }
    return { valid: false, error: 'Invalid payload' };
  }
}

/**
 * Validates a complete WebSocket message including payload
 */
export function validateCompleteMessage(message: unknown): { valid: boolean; error?: string; data?: any } {
  // First validate the message structure
  const messageResult = validateMessage(message);
  if (!messageResult.valid) {
    return messageResult;
  }

  // Type assertion is safe after validation
  const msg = message as any;

  // Then validate the payload based on message type
  const payloadResult = validatePayload(msg.type, msg.payload);
  if (!payloadResult.valid) {
    return payloadResult;
  }

  return { valid: true, data: msg };
}

/**
 * Creates a validated message
 */
export function createMessage<T extends MessageType>(
  type: T,
  payload: any,
  id?: string
): { valid: boolean; error?: string; message?: any } {
  const message = {
    type,
    id: id || generateUUID(),
    timestamp: Date.now(),
    payload,
  };

  const result = validateCompleteMessage(message);
  if (result.valid) {
    return { valid: true, message };
  }

  return { valid: false, error: result.error || 'Validation failed' };
}

/**
 * Utility function to generate UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============================================================================
// Type-safe Message Builders
// ============================================================================

export class MessageBuilder {
  static agentConnect(payload: z.infer<typeof AgentConnectPayloadSchema>) {
    return createMessage(MessageType.AGENT_CONNECT, payload);
  }

  static agentHeartbeat(payload: z.infer<typeof AgentHeartbeatPayloadSchema>) {
    return createMessage(MessageType.AGENT_HEARTBEAT, payload);
  }

  static commandAck(payload: z.infer<typeof CommandAckPayloadSchema>) {
    return createMessage(MessageType.COMMAND_ACK, payload);
  }

  static terminalOutput(payload: z.infer<typeof TerminalOutputPayloadSchema>) {
    return createMessage(MessageType.TERMINAL_OUTPUT, payload);
  }

  static traceEvent(payload: z.infer<typeof TraceEventPayloadSchema>) {
    return createMessage(MessageType.TRACE_EVENT, payload);
  }

  static commandComplete(payload: z.infer<typeof CommandCompletePayloadSchema>) {
    return createMessage(MessageType.COMMAND_COMPLETE, payload);
  }

  static commandRequest(payload: z.infer<typeof CommandRequestPayloadSchema>) {
    return createMessage(MessageType.COMMAND_REQUEST, payload);
  }

  static commandCancel(payload: z.infer<typeof CommandCancelPayloadSchema>) {
    return createMessage(MessageType.COMMAND_CANCEL, payload);
  }

  static agentControl(payload: z.infer<typeof AgentControlPayloadSchema>) {
    return createMessage(MessageType.AGENT_CONTROL, payload);
  }

  static tokenRefresh(payload: z.infer<typeof TokenRefreshPayloadSchema>) {
    return createMessage(MessageType.TOKEN_REFRESH, payload);
  }

  static agentStatus(payload: z.infer<typeof AgentStatusPayloadSchema>) {
    return createMessage(MessageType.AGENT_STATUS, payload);
  }

  static commandStatus(payload: z.infer<typeof CommandStatusPayloadSchema>) {
    return createMessage(MessageType.COMMAND_STATUS, payload);
  }

  static terminalStream(payload: z.infer<typeof TerminalStreamPayloadSchema>) {
    return createMessage(MessageType.TERMINAL_STREAM, payload);
  }

  static queueUpdate(payload: z.infer<typeof QueueUpdatePayloadSchema>) {
    return createMessage(MessageType.QUEUE_UPDATE, payload);
  }

  static emergencyStop(payload: z.infer<typeof EmergencyStopPayloadSchema>) {
    return createMessage(MessageType.EMERGENCY_STOP, payload);
  }

  static ping(sequence?: number) {
    return createMessage(MessageType.PING, { timestamp: Date.now(), sequence });
  }

  static pong(sequence?: number, latency?: number) {
    return createMessage(MessageType.PONG, { timestamp: Date.now(), sequence, latency });
  }

  static ack(messageId: string, success: boolean, error?: string) {
    return createMessage(MessageType.ACK, { messageId, success, error });
  }

  static error(code: string, message: string, details?: any, originalMessageId?: string) {
    return createMessage(MessageType.ERROR, { code, message, details, originalMessageId });
  }
}

// Export validation utilities
export {
  z,
  type ZodError,
} from 'zod';