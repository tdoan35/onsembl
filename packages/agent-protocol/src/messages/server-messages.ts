/**
 * Server-side message builders and utilities for the Onsembl.ai Agent Control Center
 */

import { v4 as uuidv4 } from 'uuid';
import {
  CommandRequestMessage,
  CommandCancelMessage,
  AgentControlMessage,
  TokenRefreshMessage,
  ServerHeartbeatMessage,
  AgentStatusMessage,
  CommandStatusMessage,
  TerminalStreamMessage,
  TraceUpdateMessage,
  ErrorMessage,
  CommandRequestPayload,
  CommandCancelPayload,
  AgentControlPayload,
  TokenRefreshPayload,
  ServerHeartbeatPayload,
  AgentStatusPayload,
  CommandStatusPayload,
  TerminalStreamPayload,
  TraceUpdatePayload,
  ErrorPayload
} from '../types/index';

/**
 * Message builder functions for server-to-agent messages
 */
export class ServerToAgentMessageBuilder {
  /**
   * Creates a COMMAND_REQUEST message
   */
  static commandRequest(payload: CommandRequestPayload): CommandRequestMessage {
    return {
      type: 'COMMAND_REQUEST',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }

  /**
   * Creates a COMMAND_CANCEL message
   */
  static commandCancel(payload: CommandCancelPayload): CommandCancelMessage {
    return {
      type: 'COMMAND_CANCEL',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }

  /**
   * Creates an AGENT_CONTROL message
   */
  static agentControl(payload: AgentControlPayload): AgentControlMessage {
    return {
      type: 'AGENT_CONTROL',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }

  /**
   * Creates a TOKEN_REFRESH message
   */
  static tokenRefresh(payload: TokenRefreshPayload): TokenRefreshMessage {
    return {
      type: 'TOKEN_REFRESH',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }

  /**
   * Creates a SERVER_HEARTBEAT message
   */
  static serverHeartbeat(payload: ServerHeartbeatPayload): ServerHeartbeatMessage {
    return {
      type: 'SERVER_HEARTBEAT',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }
}

/**
 * Message builder functions for server-to-dashboard messages
 */
export class ServerToDashboardMessageBuilder {
  /**
   * Creates an AGENT_STATUS message
   */
  static agentStatus(payload: AgentStatusPayload): AgentStatusMessage {
    return {
      type: 'AGENT_STATUS',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }

  /**
   * Creates a COMMAND_STATUS message
   */
  static commandStatus(payload: CommandStatusPayload): CommandStatusMessage {
    return {
      type: 'COMMAND_STATUS',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }

  /**
   * Creates a TERMINAL_STREAM message
   */
  static terminalStream(payload: TerminalStreamPayload): TerminalStreamMessage {
    return {
      type: 'TERMINAL_STREAM',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }

  /**
   * Creates a TRACE_UPDATE message
   */
  static traceUpdate(payload: TraceUpdatePayload): TraceUpdateMessage {
    return {
      type: 'TRACE_UPDATE',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }
}

/**
 * Error message builder
 */
export class ErrorMessageBuilder {
  /**
   * Creates an ERROR message
   */
  static error(payload: ErrorPayload): ErrorMessage {
    return {
      type: 'ERROR',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }

  /**
   * Creates a standard authentication error
   */
  static authError(details: Record<string, any> = {}): ErrorMessage {
    return this.error({
      code: 'AUTH_FAILED',
      message: 'Authentication failed',
      details,
      recoverable: false
    });
  }

  /**
   * Creates a standard validation error
   */
  static validationError(message: string, originalMessageId?: string): ErrorMessage {
    const payload: ErrorPayload = {
      code: 'VALIDATION_FAILED',
      message: message || 'Message validation failed'
    };
    if (originalMessageId) {
      payload.originalMessageId = originalMessageId;
    }
    return this.error(payload);
  }

  /**
   * Creates a rate limit error
   */
  static rateLimitError(details: Record<string, any> = {}): ErrorMessage {
    return this.error({
      code: 'RATE_LIMIT',
      message: 'Rate limit exceeded',
      details,
      recoverable: true
    });
  }

  /**
   * Creates a resource exhausted error
   */
  static resourceExhaustedError(details: Record<string, any> = {}): ErrorMessage {
    return this.error({
      code: 'RESOURCE_EXHAUSTED',
      message: 'Resource limits reached',
      details,
      recoverable: true
    });
  }

  /**
   * Creates a connection error
   */
  static connectionError(details: Record<string, any> = {}): ErrorMessage {
    return this.error({
      code: 'CONNECTION_ERROR',
      message: 'Connection error occurred',
      details,
      recoverable: true
    });
  }

  /**
   * Creates an internal server error
   */
  static internalError(details: Record<string, any> = {}): ErrorMessage {
    return this.error({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details,
      recoverable: false
    });
  }
}

/**
 * Utility functions for working with server messages
 */
export class ServerMessageUtils {
  /**
   * Checks if a message requires acknowledgment
   */
  static requiresAck(messageType: string): boolean {
    return ['COMMAND_REQUEST', 'COMMAND_CANCEL', 'AGENT_CONTROL'].includes(messageType);
  }

  /**
   * Gets the expected response time for a message type
   */
  static getExpectedResponseTime(messageType: string): number {
    switch (messageType) {
      case 'COMMAND_REQUEST':
        return 60000; // 1 minute
      case 'COMMAND_CANCEL':
        return 5000; // 5 seconds
      case 'AGENT_CONTROL':
        return 10000; // 10 seconds
      default:
        return 30000; // 30 seconds
    }
  }

  /**
   * Checks if a message type is broadcast to all dashboards
   */
  static isBroadcastMessage(messageType: string): boolean {
    return ['AGENT_STATUS', 'COMMAND_STATUS', 'TERMINAL_STREAM', 'TRACE_UPDATE'].includes(messageType);
  }

  /**
   * Gets the priority level for a message type
   */
  static getMessagePriority(messageType: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    switch (messageType) {
      case 'AGENT_CONTROL':
      case 'COMMAND_CANCEL':
        return 'HIGH';
      case 'COMMAND_REQUEST':
      case 'TERMINAL_STREAM':
        return 'MEDIUM';
      default:
        return 'LOW';
    }
  }
}