/**
 * Client-side message builders and utilities for the Onsembl.ai Agent Control Center
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AgentConnectMessage,
  AgentHeartbeatMessage,
  CommandAckMessage,
  TerminalOutputMessage,
  TraceEventMessage,
  CommandCompleteMessage,
  InvestigationReportMessage,
  AgentErrorMessage,
  AgentConnectPayload,
  AgentHeartbeatPayload,
  CommandAckPayload,
  TerminalOutputPayload,
  TraceEventPayload,
  CommandCompletePayload,
  InvestigationReportPayload,
  AgentErrorPayload
} from '../types/index';

/**
 * Message builder functions for agent-to-server messages
 */
export class AgentMessageBuilder {
  /**
   * Creates an AGENT_CONNECT message
   */
  static connect(payload: AgentConnectPayload): AgentConnectMessage {
    return {
      type: 'AGENT_CONNECT',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }

  /**
   * Creates an AGENT_HEARTBEAT message
   */
  static heartbeat(payload: AgentHeartbeatPayload): AgentHeartbeatMessage {
    return {
      type: 'AGENT_HEARTBEAT',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }

  /**
   * Creates a COMMAND_ACK message
   */
  static commandAck(payload: CommandAckPayload): CommandAckMessage {
    return {
      type: 'COMMAND_ACK',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }

  /**
   * Creates a TERMINAL_OUTPUT message
   */
  static terminalOutput(payload: TerminalOutputPayload): TerminalOutputMessage {
    return {
      type: 'TERMINAL_OUTPUT',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }

  /**
   * Creates a TRACE_EVENT message
   */
  static traceEvent(payload: TraceEventPayload): TraceEventMessage {
    return {
      type: 'TRACE_EVENT',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }

  /**
   * Creates a COMMAND_COMPLETE message
   */
  static commandComplete(payload: CommandCompletePayload): CommandCompleteMessage {
    return {
      type: 'COMMAND_COMPLETE',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }

  /**
   * Creates an INVESTIGATION_REPORT message
   */
  static investigationReport(payload: InvestigationReportPayload): InvestigationReportMessage {
    return {
      type: 'INVESTIGATION_REPORT',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }

  /**
   * Creates an AGENT_ERROR message
   */
  static agentError(payload: AgentErrorPayload): AgentErrorMessage {
    return {
      type: 'AGENT_ERROR',
      id: uuidv4(),
      timestamp: Date.now(),
      payload
    };
  }
}

/**
 * Utility functions for working with client messages
 */
export class ClientMessageUtils {
  /**
   * Validates message ID format (UUID v4)
   */
  static isValidMessageId(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  /**
   * Validates timestamp (should be within reasonable bounds)
   */
  static isValidTimestamp(timestamp: number): boolean {
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    const fiveMinutesFromNow = now + (5 * 60 * 1000);

    return timestamp >= fiveMinutesAgo && timestamp <= fiveMinutesFromNow;
  }

  /**
   * Calculates message size in bytes
   */
  static getMessageSize(message: any): number {
    return new TextEncoder().encode(JSON.stringify(message)).length;
  }

  /**
   * Checks if message exceeds size limits
   */
  static isWithinSizeLimit(message: any, maxSize: number = 1024 * 1024): boolean {
    return this.getMessageSize(message) <= maxSize;
  }
}