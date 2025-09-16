/**
 * @onsembl/agent-protocol - WebSocket protocol types and validation for Onsembl.ai Agent Control Center
 *
 * This package provides:
 * - TypeScript interfaces for all WebSocket message types
 * - Zod schemas for runtime validation
 * - Message builder utilities
 * - Protocol version management
 * - CLI tools for testing and validation
 */

// Export core types and enums
export {
  MessageType,
  type WebSocketMessage,
  type AgentType,
  type AgentStatus,
  type AgentActivityState,
  type CommandType,
  type CommandStatus,
  type StreamType,
  type TraceType,
  type ErrorType,
  type AgentControlAction,
  type ReportStatus,
  type AgentConnectPayload,
  type AgentHeartbeatPayload,
  type CommandAckPayload,
  type TerminalOutputPayload,
  type TraceEventPayload,
  type CommandCompletePayload,
  type InvestigationReportPayload,
  type AgentErrorPayload,
  type CommandRequestPayload,
  type CommandCancelPayload,
  type AgentControlPayload,
  type TokenRefreshPayload,
  type ServerHeartbeatPayload,
  type AgentStatusPayload,
  type CommandStatusPayload,
  type TerminalStreamPayload,
  type TraceStreamPayload,
  type QueueUpdatePayload,
  type EmergencyStopPayload,
  type DashboardInitPayload,
  type DashboardSubscribePayload,
  type DashboardUnsubscribePayload,
  type PingPayload,
  type PongPayload,
  type AckPayload,
  type ErrorPayload,
  type MessagePayloadMap,
  type TypedWebSocketMessage
} from './types.js';

// Export validation functionality
export * from './validation.js';

// Export message builders
export * from './messages/index.js';

// ValidationResult interface for CLI usage
export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    issues: Array<{
      path: string[];
      message: string;
      code: string;
    }>;
  };
}

// Simple placeholder MessageValidator for CLI usage
export class MessageValidator {
  static validate(message: any) {
    // Basic validation implementation for CLI
    if (!message || typeof message !== 'object') {
      return {
        success: false,
        error: {
          code: 'INVALID_FORMAT',
          message: 'Message must be a valid object',
          issues: []
        }
      };
    }

    const requiredFields = ['type', 'id', 'timestamp', 'payload'];
    const missingFields = requiredFields.filter(field => !(field in message));

    if (missingFields.length > 0) {
      return {
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: `Missing required fields: ${missingFields.join(', ')}`,
          issues: missingFields.map(field => ({
            path: [field],
            message: `Required field '${field}' is missing`,
            code: 'MISSING_FIELD'
          }))
        }
      };
    }

    return { success: true, data: message };
  }

  static validateMessageType(message: any, expectedType: string) {
    const result = this.validate(message);
    if (!result.success) return result;

    if (message.type !== expectedType) {
      return {
        success: false,
        error: {
          code: 'TYPE_MISMATCH',
          message: `Expected type '${expectedType}' but got '${message.type}'`,
          issues: [{ path: ['type'], message: 'Type mismatch', code: 'TYPE_MISMATCH' }]
        }
      };
    }

    return { success: true, data: message };
  }
}

// Export version information
export const PACKAGE_VERSION = '0.1.0';
export const PROTOCOL_VERSION = '1.0.0';

// Note: MessageValidator is defined above as a simple implementation for CLI

export {
  AgentMessageBuilder,
  ServerToAgentMessageBuilder,
  ServerToDashboardMessageBuilder,
  ErrorMessageBuilder
} from './messages/index.js';

// Export commonly used constants
export const MESSAGE_TYPES = {
  // Agent → Server
  AGENT_CONNECT: 'AGENT_CONNECT' as const,
  AGENT_HEARTBEAT: 'AGENT_HEARTBEAT' as const,
  AGENT_ERROR: 'AGENT_ERROR' as const,
  COMMAND_ACK: 'COMMAND_ACK' as const,
  COMMAND_COMPLETE: 'COMMAND_COMPLETE' as const,
  TERMINAL_OUTPUT: 'TERMINAL_OUTPUT' as const,
  TRACE_EVENT: 'TRACE_EVENT' as const,
  INVESTIGATION_REPORT: 'INVESTIGATION_REPORT' as const,

  // Server → Agent
  COMMAND_REQUEST: 'COMMAND_REQUEST' as const,
  COMMAND_CANCEL: 'COMMAND_CANCEL' as const,
  AGENT_CONTROL: 'AGENT_CONTROL' as const,
  TOKEN_REFRESH: 'TOKEN_REFRESH' as const,
  SERVER_HEARTBEAT: 'SERVER_HEARTBEAT' as const,

  // Server → Dashboard
  AGENT_STATUS: 'AGENT_STATUS' as const,
  COMMAND_STATUS: 'COMMAND_STATUS' as const,
  TERMINAL_STREAM: 'TERMINAL_STREAM' as const,
  TRACE_STREAM: 'TRACE_STREAM' as const,
  QUEUE_UPDATE: 'QUEUE_UPDATE' as const,
  EMERGENCY_STOP: 'EMERGENCY_STOP' as const,

  // Dashboard → Server
  DASHBOARD_INIT: 'DASHBOARD_INIT' as const,
  DASHBOARD_SUBSCRIBE: 'DASHBOARD_SUBSCRIBE' as const,
  DASHBOARD_UNSUBSCRIBE: 'DASHBOARD_UNSUBSCRIBE' as const,

  // Bidirectional
  PING: 'PING' as const,
  PONG: 'PONG' as const,
  ACK: 'ACK' as const,
  ERROR: 'ERROR' as const
} as const;

export const ERROR_CODES = {
  // Connection errors
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',

  // Message errors
  INVALID_MESSAGE_FORMAT: 'INVALID_MESSAGE_FORMAT',
  UNSUPPORTED_MESSAGE_TYPE: 'UNSUPPORTED_MESSAGE_TYPE',
  MESSAGE_TOO_LARGE: 'MESSAGE_TOO_LARGE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Command errors
  COMMAND_NOT_FOUND: 'COMMAND_NOT_FOUND',
  COMMAND_EXECUTION_FAILED: 'COMMAND_EXECUTION_FAILED',
  COMMAND_CANCELLED: 'COMMAND_CANCELLED',
  COMMAND_TIMEOUT: 'COMMAND_TIMEOUT',

  // Agent errors
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  AGENT_OFFLINE: 'AGENT_OFFLINE',
  AGENT_BUSY: 'AGENT_BUSY',
  AGENT_ERROR: 'AGENT_ERROR',

  // Resource errors
  INSUFFICIENT_RESOURCES: 'INSUFFICIENT_RESOURCES',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  SCHEMA_VIOLATION: 'SCHEMA_VIOLATION',

  // System errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
} as const;

export const RATE_LIMITS = {
  // Messages per second limits
  AGENT_MESSAGES_PER_SECOND: 10,
  DASHBOARD_MESSAGES_PER_SECOND: 5,
  TERMINAL_OUTPUT_PER_SECOND: 50,

  // Burst limits
  AGENT_BURST_LIMIT: 50,
  DASHBOARD_BURST_LIMIT: 25,

  // Size limits
  MAX_MESSAGE_SIZE: 1024 * 1024, // 1MB
  MAX_TERMINAL_OUTPUT_SIZE: 64 * 1024, // 64KB

  // Connection limits
  MAX_CONNECTIONS_PER_IP: 10,
  MAX_AGENTS_PER_USER: 5
} as const;