/**
 * Message validation utilities using Zod schemas
 */

import { z } from 'zod';
import {
  webSocketMessageSchema,
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
} from './schemas.js';

import type {
  AnyWebSocketMessage,
  AgentToServerMessage,
  ServerToAgentMessage,
  ServerToDashboardMessage,
  MessageType
} from '../types/index.js';

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

export class MessageValidator {
  /**
   * Validates any WebSocket message against the appropriate schema
   */
  static validate(message: unknown): ValidationResult<AnyWebSocketMessage> {
    try {
      const result = webSocketMessageSchema.safeParse(message);

      if (result.success) {
        return {
          success: true,
          data: result.data
        };
      }

      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Message validation failed',
          issues: result.error.issues.map(issue => ({
            path: issue.path.map(p => String(p)),
            message: issue.message,
            code: issue.code
          }))
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown validation error',
          issues: []
        }
      };
    }
  }

  /**
   * Validates a specific message type
   */
  static validateMessageType<T>(message: unknown, messageType: MessageType): ValidationResult<T> {
    const schema = this.getSchemaForType(messageType);
    if (!schema) {
      return {
        success: false,
        error: {
          code: 'UNKNOWN_MESSAGE_TYPE',
          message: `Unknown message type: ${messageType}`,
          issues: []
        }
      };
    }

    try {
      const result = schema.safeParse(message);

      if (result.success) {
        return {
          success: true,
          data: result.data
        };
      }

      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Validation failed for message type: ${messageType}`,
          issues: result.error.issues.map(issue => ({
            path: issue.path.map(p => String(p)),
            message: issue.message,
            code: issue.code
          }))
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown validation error',
          issues: []
        }
      };
    }
  }

  /**
   * Validates that a message conforms to agent-to-server protocol
   */
  static validateAgentMessage(message: unknown): ValidationResult<AgentToServerMessage> {
    const result = this.validate(message);
    if (!result.success) {
      return result;
    }

    const agentMessageTypes = [
      'AGENT_CONNECT',
      'AGENT_HEARTBEAT',
      'COMMAND_ACK',
      'TERMINAL_OUTPUT',
      'TRACE_EVENT',
      'COMMAND_COMPLETE',
      'INVESTIGATION_REPORT',
      'AGENT_ERROR'
    ];

    if (!agentMessageTypes.includes(result.data!.type)) {
      return {
        success: false,
        error: {
          code: 'INVALID_MESSAGE_TYPE',
          message: `Message type '${result.data!.type}' is not valid for agent-to-server communication`,
          issues: []
        }
      };
    }

    return result as ValidationResult<AgentToServerMessage>;
  }

  /**
   * Validates that a message conforms to server-to-agent protocol
   */
  static validateServerToAgentMessage(message: unknown): ValidationResult<ServerToAgentMessage> {
    const result = this.validate(message);
    if (!result.success) {
      return result;
    }

    const serverToAgentMessageTypes = [
      'COMMAND_REQUEST',
      'COMMAND_CANCEL',
      'AGENT_CONTROL',
      'TOKEN_REFRESH',
      'SERVER_HEARTBEAT'
    ];

    if (!serverToAgentMessageTypes.includes(result.data!.type)) {
      return {
        success: false,
        error: {
          code: 'INVALID_MESSAGE_TYPE',
          message: `Message type '${result.data!.type}' is not valid for server-to-agent communication`,
          issues: []
        }
      };
    }

    return result as ValidationResult<ServerToAgentMessage>;
  }

  /**
   * Validates that a message conforms to server-to-dashboard protocol
   */
  static validateServerToDashboardMessage(message: unknown): ValidationResult<ServerToDashboardMessage> {
    const result = this.validate(message);
    if (!result.success) {
      return result;
    }

    const serverToDashboardMessageTypes = [
      'AGENT_STATUS',
      'COMMAND_STATUS',
      'TERMINAL_STREAM',
      'TRACE_UPDATE'
    ];

    if (!serverToDashboardMessageTypes.includes(result.data!.type)) {
      return {
        success: false,
        error: {
          code: 'INVALID_MESSAGE_TYPE',
          message: `Message type '${result.data!.type}' is not valid for server-to-dashboard communication`,
          issues: []
        }
      };
    }

    return result as ValidationResult<ServerToDashboardMessage>;
  }

  /**
   * Gets the appropriate Zod schema for a message type
   */
  private static getSchemaForType(messageType: MessageType): z.ZodSchema | null {
    const schemaMap: Record<MessageType, z.ZodSchema> = {
      'AGENT_CONNECT': agentConnectMessageSchema,
      'AGENT_HEARTBEAT': agentHeartbeatMessageSchema,
      'COMMAND_ACK': commandAckMessageSchema,
      'TERMINAL_OUTPUT': terminalOutputMessageSchema,
      'TRACE_EVENT': traceEventMessageSchema,
      'COMMAND_COMPLETE': commandCompleteMessageSchema,
      'INVESTIGATION_REPORT': investigationReportMessageSchema,
      'AGENT_ERROR': agentErrorMessageSchema,
      'COMMAND_REQUEST': commandRequestMessageSchema,
      'COMMAND_CANCEL': commandCancelMessageSchema,
      'AGENT_CONTROL': agentControlMessageSchema,
      'TOKEN_REFRESH': tokenRefreshMessageSchema,
      'SERVER_HEARTBEAT': serverHeartbeatMessageSchema,
      'AGENT_STATUS': agentStatusMessageSchema,
      'COMMAND_STATUS': commandStatusMessageSchema,
      'TERMINAL_STREAM': terminalStreamMessageSchema,
      'TRACE_UPDATE': traceUpdateMessageSchema,
      'ERROR': errorMessageSchema
    };

    return schemaMap[messageType] || null;
  }

  /**
   * Validates message size constraints
   */
  static validateMessageSize(message: unknown, maxSize: number = 1024 * 1024): ValidationResult<void> {
    try {
      const serialized = JSON.stringify(message);
      const size = new TextEncoder().encode(serialized).length;

      if (size > maxSize) {
        return {
          success: false,
          error: {
            code: 'MESSAGE_TOO_LARGE',
            message: `Message size (${size} bytes) exceeds maximum allowed size (${maxSize} bytes)`,
            issues: []
          }
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SERIALIZATION_ERROR',
          message: error instanceof Error ? error.message : 'Failed to serialize message',
          issues: []
        }
      };
    }
  }

  /**
   * Validates message timestamp is within acceptable bounds
   */
  static validateTimestamp(timestamp: number, toleranceMs: number = 5 * 60 * 1000): ValidationResult<void> {
    const now = Date.now();
    const diff = Math.abs(now - timestamp);

    if (diff > toleranceMs) {
      return {
        success: false,
        error: {
          code: 'INVALID_TIMESTAMP',
          message: `Message timestamp is ${diff}ms off from server time (tolerance: ${toleranceMs}ms)`,
          issues: []
        }
      };
    }

    return { success: true };
  }
}

/**
 * Type-safe validation functions for specific message types
 */
export class TypedValidator {
  static agentConnect = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'AGENT_CONNECT');

  static agentHeartbeat = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'AGENT_HEARTBEAT');

  static commandAck = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'COMMAND_ACK');

  static terminalOutput = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'TERMINAL_OUTPUT');

  static traceEvent = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'TRACE_EVENT');

  static commandComplete = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'COMMAND_COMPLETE');

  static investigationReport = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'INVESTIGATION_REPORT');

  static agentError = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'AGENT_ERROR');

  static commandRequest = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'COMMAND_REQUEST');

  static commandCancel = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'COMMAND_CANCEL');

  static agentControl = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'AGENT_CONTROL');

  static tokenRefresh = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'TOKEN_REFRESH');

  static serverHeartbeat = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'SERVER_HEARTBEAT');

  static agentStatus = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'AGENT_STATUS');

  static commandStatus = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'COMMAND_STATUS');

  static terminalStream = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'TERMINAL_STREAM');

  static traceUpdate = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'TRACE_UPDATE');

  static error = (message: unknown) =>
    MessageValidator.validateMessageType(message, 'ERROR');
}