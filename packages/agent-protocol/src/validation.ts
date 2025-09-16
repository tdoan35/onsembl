import { z } from 'zod';
import {
  MessageType,
  AgentType,
  AgentStatus,
  CommandStatus,
  TerminalOutputType,
  TraceEventType,
} from './types';

// Base message schema
const BaseMessageSchema = z.object({
  type: z.nativeEnum(MessageType),
  timestamp: z.string(),
  correlationId: z.string().uuid().optional(),
});

// Agent connection schemas
export const AgentConnectMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.AGENT_CONNECT),
  payload: z.object({
    agentId: z.string().min(1),
    token: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    capabilities: z.array(z.string()),
    metadata: z.record(z.any()).optional(),
    reconnecting: z.boolean().optional(),
  }),
});

export const ConnectionAckMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.CONNECTION_ACK),
  payload: z.object({
    agentId: z.string().min(1),
    connectionId: z.string().min(1),
    serverVersion: z.string(),
  }),
});

// Heartbeat schemas
export const AgentHeartbeatMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.AGENT_HEARTBEAT),
  payload: z.object({
    agentId: z.string().min(1),
    timestamp: z.string(),
    metrics: z.object({
      cpuUsage: z.number().min(0).max(100).optional(),
      memoryUsage: z.number().min(0).max(100).optional(),
      activeCommands: z.number().int().min(0).optional(),
      queuedCommands: z.number().int().min(0).optional(),
    }).optional(),
  }),
});

export const HeartbeatAckMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.HEARTBEAT_ACK),
  payload: z.object({
    timestamp: z.string(),
    serverTime: z.string(),
  }),
});

// Command schemas
export const CommandRequestMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.COMMAND_REQUEST),
  payload: z.object({
    commandId: z.string().min(1),
    command: z.string().min(1),
    arguments: z.record(z.any()),
    priority: z.number().int().min(0).max(10),
    timeout: z.number().int().min(0).optional(),
    constraints: z.object({
      maxCpu: z.number().min(0).max(100).optional(),
      maxMemory: z.number().min(0).optional(),
      maxDuration: z.number().min(0).optional(),
    }).optional(),
  }),
});

export const CommandAckMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.COMMAND_ACK),
  payload: z.object({
    commandId: z.string().min(1),
    status: z.nativeEnum(CommandStatus),
    queuePosition: z.number().int().min(0).optional(),
    estimatedStartTime: z.string().optional(),
  }),
});

export const CommandCompleteMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.COMMAND_COMPLETE),
  payload: z.object({
    commandId: z.string().min(1),
    status: z.nativeEnum(CommandStatus),
    exitCode: z.number().int().optional(),
    result: z.any().optional(),
    error: z.string().optional(),
    duration: z.number().min(0),
    startedAt: z.string(),
    completedAt: z.string(),
  }),
});

// Terminal output schema
export const TerminalOutputMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.TERMINAL_OUTPUT),
  payload: z.object({
    commandId: z.string().min(1),
    agentId: z.string().min(1),
    output: z.string(),
    type: z.nativeEnum(TerminalOutputType),
    sequence: z.number().int().min(0),
    timestamp: z.string(),
  }),
});

// Trace event schema
export const TraceEventMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.TRACE_EVENT),
  payload: z.object({
    commandId: z.string().min(1),
    agentId: z.string().min(1),
    parentId: z.string().optional(),
    type: z.nativeEnum(TraceEventType),
    content: z.any(),
    metadata: z.object({
      model: z.string().optional(),
      promptTokens: z.number().int().min(0).optional(),
      completionTokens: z.number().int().min(0).optional(),
      temperature: z.number().min(0).max(2).optional(),
      duration: z.number().min(0).optional(),
    }).optional(),
  }),
});

// Status update schema
export const StatusUpdateMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.STATUS_UPDATE),
  payload: z.object({
    agentId: z.string().min(1),
    status: z.nativeEnum(AgentStatus),
    reason: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  }),
});

// Error message schema
export const ErrorMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.ERROR),
  payload: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.any().optional(),
    fatal: z.boolean().optional(),
  }),
});

// Token refresh schema
export const TokenRefreshMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.TOKEN_REFRESH),
  payload: z.object({
    token: z.string().min(1),
    expiresIn: z.number().int().min(0),
  }),
});

// Union schema for all messages
export const WebSocketMessageSchema = z.discriminatedUnion('type', [
  AgentConnectMessageSchema,
  ConnectionAckMessageSchema,
  AgentHeartbeatMessageSchema,
  HeartbeatAckMessageSchema,
  CommandRequestMessageSchema,
  CommandAckMessageSchema,
  CommandCompleteMessageSchema,
  TerminalOutputMessageSchema,
  TraceEventMessageSchema,
  StatusUpdateMessageSchema,
  ErrorMessageSchema,
  TokenRefreshMessageSchema,
]);

// Validation functions
export function validateMessage(data: unknown) {
  return WebSocketMessageSchema.safeParse(data);
}

export function validateAgentConnect(data: unknown) {
  return AgentConnectMessageSchema.safeParse(data);
}

export function validateCommandRequest(data: unknown) {
  return CommandRequestMessageSchema.safeParse(data);
}

export function validateTerminalOutput(data: unknown) {
  return TerminalOutputMessageSchema.safeParse(data);
}

export function validateTraceEvent(data: unknown) {
  return TraceEventMessageSchema.safeParse(data);
}

// Helper function to create error messages
export function createErrorMessage(code: string, message: string, details?: any) {
  return {
    type: MessageType.ERROR,
    timestamp: new Date().toISOString(),
    payload: {
      code,
      message,
      details,
      fatal: false,
    },
  };
}

// Helper function to create acknowledgment messages
export function createAckMessage(type: MessageType, payload: any) {
  return {
    type,
    timestamp: new Date().toISOString(),
    payload,
  };
}