/**
 * WebSocket message type definitions for the Onsembl.ai Agent Control Center
 */

import {
  AgentConnectPayload,
  AgentHeartbeatPayload,
  AgentStatusPayload,
  AgentErrorPayload,
  AgentControlPayload
} from './agent.js';
import {
  CommandRequestPayload,
  CommandAckPayload,
  CommandStatusPayload,
  CommandCompletePayload,
  CommandCancelPayload,
  TerminalOutputPayload,
  TerminalStreamPayload
} from './command.js';
import { TraceEventPayload, TraceUpdatePayload } from './trace.js';

// Base WebSocket message structure
export interface WebSocketMessage<T = any> {
  type: MessageType;
  id: string;
  timestamp: number;
  payload: T;
}

// Message types from agent to server
export type AgentToServerMessageType =
  | 'AGENT_CONNECT'
  | 'AGENT_HEARTBEAT'
  | 'COMMAND_ACK'
  | 'TERMINAL_OUTPUT'
  | 'TRACE_EVENT'
  | 'COMMAND_COMPLETE'
  | 'INVESTIGATION_REPORT'
  | 'AGENT_ERROR';

// Message types from server to agent
export type ServerToAgentMessageType =
  | 'COMMAND_REQUEST'
  | 'COMMAND_CANCEL'
  | 'AGENT_CONTROL'
  | 'TOKEN_REFRESH'
  | 'SERVER_HEARTBEAT';

// Message types from server to dashboard
export type ServerToDashboardMessageType =
  | 'AGENT_STATUS'
  | 'COMMAND_STATUS'
  | 'TERMINAL_STREAM'
  | 'TRACE_UPDATE';

// Combined message type
export type MessageType =
  | AgentToServerMessageType
  | ServerToAgentMessageType
  | ServerToDashboardMessageType
  | 'ERROR';

// Agent to Server Messages
export interface AgentConnectMessage extends WebSocketMessage<AgentConnectPayload> {
  type: 'AGENT_CONNECT';
}

export interface AgentHeartbeatMessage extends WebSocketMessage<AgentHeartbeatPayload> {
  type: 'AGENT_HEARTBEAT';
}

export interface CommandAckMessage extends WebSocketMessage<CommandAckPayload> {
  type: 'COMMAND_ACK';
}

export interface TerminalOutputMessage extends WebSocketMessage<TerminalOutputPayload> {
  type: 'TERMINAL_OUTPUT';
}

export interface TraceEventMessage extends WebSocketMessage<TraceEventPayload> {
  type: 'TRACE_EVENT';
}

export interface CommandCompleteMessage extends WebSocketMessage<CommandCompletePayload> {
  type: 'COMMAND_COMPLETE';
}

export interface AgentErrorMessage extends WebSocketMessage<AgentErrorPayload> {
  type: 'AGENT_ERROR';
}

// Server to Agent Messages
export interface CommandRequestMessage extends WebSocketMessage<CommandRequestPayload> {
  type: 'COMMAND_REQUEST';
}

export interface CommandCancelMessage extends WebSocketMessage<CommandCancelPayload> {
  type: 'COMMAND_CANCEL';
}

export interface AgentControlMessage extends WebSocketMessage<AgentControlPayload> {
  type: 'AGENT_CONTROL';
}

export interface TokenRefreshPayload {
  accessToken: string;
  expiresIn: number;
}

export interface TokenRefreshMessage extends WebSocketMessage<TokenRefreshPayload> {
  type: 'TOKEN_REFRESH';
}

export interface ServerHeartbeatPayload {
  serverTime: number;
  nextPingExpected: number;
}

export interface ServerHeartbeatMessage extends WebSocketMessage<ServerHeartbeatPayload> {
  type: 'SERVER_HEARTBEAT';
}

// Server to Dashboard Messages
export interface AgentStatusMessage extends WebSocketMessage<AgentStatusPayload> {
  type: 'AGENT_STATUS';
}

export interface CommandStatusMessage extends WebSocketMessage<CommandStatusPayload> {
  type: 'COMMAND_STATUS';
}

export interface TerminalStreamMessage extends WebSocketMessage<TerminalStreamPayload> {
  type: 'TERMINAL_STREAM';
}

export interface TraceUpdateMessage extends WebSocketMessage<TraceUpdatePayload> {
  type: 'TRACE_UPDATE';
}

// Investigation Report Types
export interface InvestigationSection {
  title: string;
  content: string;
  order: number;
}

export interface InvestigationFinding {
  title: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidence: string[];
}

export interface InvestigationRecommendation {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  actionItems: string[];
}

export interface InvestigationContent {
  sections: InvestigationSection[];
  findings: InvestigationFinding[];
  recommendations: InvestigationRecommendation[];
}

export interface InvestigationReportPayload {
  commandId: string;
  agentId: string;
  reportId: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETE';
  title: string;
  summary: string;
  content: InvestigationContent;
}

export interface InvestigationReportMessage extends WebSocketMessage<InvestigationReportPayload> {
  type: 'INVESTIGATION_REPORT';
}

// Error Message
export interface ErrorPayload {
  code: string;
  message: string;
  details?: Record<string, any>;
  recoverable?: boolean;
  originalMessageId?: string;
}

export interface ErrorMessage extends WebSocketMessage<ErrorPayload> {
  type: 'ERROR';
}

// Union types for all message categories
export type AgentToServerMessage =
  | AgentConnectMessage
  | AgentHeartbeatMessage
  | CommandAckMessage
  | TerminalOutputMessage
  | TraceEventMessage
  | CommandCompleteMessage
  | InvestigationReportMessage
  | AgentErrorMessage;

export type ServerToAgentMessage =
  | CommandRequestMessage
  | CommandCancelMessage
  | AgentControlMessage
  | TokenRefreshMessage
  | ServerHeartbeatMessage;

export type ServerToDashboardMessage =
  | AgentStatusMessage
  | CommandStatusMessage
  | TerminalStreamMessage
  | TraceUpdateMessage;

export type AnyWebSocketMessage =
  | AgentToServerMessage
  | ServerToAgentMessage
  | ServerToDashboardMessage
  | ErrorMessage;

// Type guards for message discrimination
export function isAgentToServerMessage(message: AnyWebSocketMessage): message is AgentToServerMessage {
  return [
    'AGENT_CONNECT',
    'AGENT_HEARTBEAT',
    'COMMAND_ACK',
    'TERMINAL_OUTPUT',
    'TRACE_EVENT',
    'COMMAND_COMPLETE',
    'INVESTIGATION_REPORT',
    'AGENT_ERROR'
  ].includes(message.type);
}

export function isServerToAgentMessage(message: AnyWebSocketMessage): message is ServerToAgentMessage {
  return [
    'COMMAND_REQUEST',
    'COMMAND_CANCEL',
    'AGENT_CONTROL',
    'TOKEN_REFRESH',
    'SERVER_HEARTBEAT'
  ].includes(message.type);
}

export function isServerToDashboardMessage(message: AnyWebSocketMessage): message is ServerToDashboardMessage {
  return [
    'AGENT_STATUS',
    'COMMAND_STATUS',
    'TERMINAL_STREAM',
    'TRACE_UPDATE'
  ].includes(message.type);
}