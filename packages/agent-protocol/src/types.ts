/**
 * WebSocket Protocol Types for Onsembl.ai Agent Control Center
 * Version: 0.1.0
 */

// Base message structure
export interface WebSocketMessage<T = any> {
  type: MessageType;
  id: string;
  timestamp: number;
  payload: T;
}

// Message type enum
export enum MessageType {
  // Agent → Server
  AGENT_CONNECT = 'AGENT_CONNECT',
  AGENT_HEARTBEAT = 'AGENT_HEARTBEAT',
  AGENT_ERROR = 'AGENT_ERROR',
  COMMAND_ACK = 'COMMAND_ACK',
  COMMAND_COMPLETE = 'COMMAND_COMPLETE',
  TERMINAL_OUTPUT = 'TERMINAL_OUTPUT',
  TRACE_EVENT = 'TRACE_EVENT',
  INVESTIGATION_REPORT = 'INVESTIGATION_REPORT',

  // Server → Agent
  COMMAND_REQUEST = 'COMMAND_REQUEST',
  COMMAND_CANCEL = 'COMMAND_CANCEL',
  AGENT_CONTROL = 'AGENT_CONTROL',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  SERVER_HEARTBEAT = 'SERVER_HEARTBEAT',

  // Server → Dashboard
  AGENT_STATUS = 'AGENT_STATUS',
  AGENT_DISCONNECT = 'AGENT_DISCONNECT',
  COMMAND_STATUS = 'COMMAND_STATUS',
  TERMINAL_STREAM = 'TERMINAL_STREAM',
  TRACE_STREAM = 'TRACE_STREAM',
  QUEUE_UPDATE = 'QUEUE_UPDATE',
  EMERGENCY_STOP = 'EMERGENCY_STOP',

  // Dashboard → Server
  DASHBOARD_INIT = 'DASHBOARD_INIT',
  DASHBOARD_SUBSCRIBE = 'DASHBOARD_SUBSCRIBE',
  DASHBOARD_UNSUBSCRIBE = 'DASHBOARD_UNSUBSCRIBE',

  // Bidirectional
  PING = 'PING',
  PONG = 'PONG',
  ACK = 'ACK',
  ERROR = 'ERROR'
}

// Agent types
export type AgentType = 'CLAUDE' | 'GEMINI' | 'CODEX';

// Agent status
export type AgentStatus = 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'ERROR';
export type AgentActivityState = 'IDLE' | 'PROCESSING' | 'QUEUED';

// Command types
export type CommandType = 'NATURAL' | 'INVESTIGATE' | 'REVIEW' | 'PLAN' | 'SYNTHESIZE';
export type CommandStatus = 'PENDING' | 'QUEUED' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

// Stream types
export type StreamType = 'STDOUT' | 'STDERR';

// Trace types
export type TraceType = 'LLM_PROMPT' | 'TOOL_CALL' | 'RESPONSE';

// Error types
export type ErrorType = 'CONNECTION' | 'EXECUTION' | 'RESOURCE' | 'UNKNOWN';

// Agent control actions
export type AgentControlAction = 'STOP' | 'RESTART' | 'PAUSE' | 'RESUME';

// Report status
export type ReportStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETE';

// ============================================================================
// Agent → Server Message Payloads
// ============================================================================

export interface AgentConnectPayload {
  agentId: string;
  name?: string; // Optional agent display name from config
  agentType: AgentType;
  version: string;
  hostMachine: string;
  capabilities: {
    maxTokens: number;
    supportsInterrupt: boolean;
    supportsTrace: boolean;
  };
}

export interface AgentHeartbeatPayload {
  agentId: string;
  healthMetrics: {
    cpuUsage: number;
    memoryUsage: number;
    uptime: number;
    commandsProcessed: number;
    averageResponseTime: number;
  };
}

export interface CommandAckPayload {
  commandId: string;
  agentId: string;
  status: 'RECEIVED' | 'QUEUED' | 'EXECUTING';
  queuePosition?: number;
}

export interface TerminalOutputPayload {
  commandId: string;
  agentId: string;
  streamType: StreamType;
  content: string;
  ansiCodes: boolean;
  sequence: number;
}

export interface TraceEventPayload {
  commandId: string;
  agentId: string;
  traceId: string;
  parentId: string | null;
  type: TraceType;
  name: string;
  content: {
    prompt?: string;
    response?: string;
    toolName?: string;
    toolInput?: any;
    toolOutput?: any;
    error?: string;
  };
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  tokensUsed?: number;
  metadata?: Record<string, any>;
}

export interface CommandCompletePayload {
  commandId: string;
  agentId: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  error?: string;
  executionTime: number;
  tokensUsed: number;
  outputStats?: {
    totalLines: number;
    stdoutLines: number;
    stderrLines: number;
  };
}

export interface InvestigationReportPayload {
  commandId: string;
  agentId: string;
  reportId: string;
  status: ReportStatus;
  title: string;
  summary: string;
  content: {
    sections: Array<{
      title: string;
      content: string;
      order: number;
    }>;
    findings: Array<{
      type: 'issue' | 'insight' | 'recommendation';
      severity: 'low' | 'medium' | 'high';
      description: string;
      evidence?: string[];
    }>;
    recommendations: Array<{
      priority: number;
      action: string;
      rationale: string;
    }>;
  };
  metadata?: {
    commandCount: number;
    traceCount: number;
    errorCount: number;
    duration: number;
  };
}

export interface AgentErrorPayload {
  agentId: string;
  errorType: ErrorType;
  message: string;
  recoverable: boolean;
  details?: Record<string, any>;
  stack?: string;
}

// ============================================================================
// Server → Agent Message Payloads
// ============================================================================

export interface CommandRequestPayload {
  commandId: string;
  content: string;
  type: CommandType;
  priority: number;
  executionConstraints?: {
    timeLimitMs?: number;
    tokenBudget?: number;
    maxRetries?: number;
  };
  context?: {
    previousCommandId?: string;
    presetId?: string;
    parameters?: Record<string, any>;
  };
}

export interface CommandCancelPayload {
  commandId: string;
  reason: string;
  force?: boolean;
}

export interface AgentControlPayload {
  action: AgentControlAction;
  reason: string;
  gracefulShutdown?: boolean;
  timeout?: number;
}

export interface TokenRefreshPayload {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}

export interface ServerHeartbeatPayload {
  serverTime: number;
  nextPingExpected: number;
  maintenanceWindow?: {
    start: number;
    end: number;
    message: string;
  };
}

// ============================================================================
// Server → Dashboard Message Payloads
// ============================================================================

export interface AgentStatusPayload {
  agentId: string;
  status: AgentStatus;
  activityState: AgentActivityState;
  healthMetrics?: {
    cpuUsage: number;
    memoryUsage: number;
    uptime: number;
    commandsProcessed: number;
    averageResponseTime: number;
  };
  currentCommand?: {
    id: string;
    type: CommandType;
    startedAt: number;
  };
  queuedCommands?: number;
}

export interface AgentDisconnectPayload {
  agentId: string;
  reason?: string;
  timestamp: number;
}

export interface CommandStatusPayload {
  commandId: string;
  agentId: string;
  status: CommandStatus;
  progress?: {
    percent: number;
    message: string;
    currentStep?: number;
    totalSteps?: number;
  };
  startedAt?: number;
  completedAt?: number;
}

export interface TerminalStreamPayload {
  commandId: string;
  agentId: string;
  content: string;
  streamType: StreamType;
  ansiCodes: boolean;
  timestamp: number;
}

export interface TraceStreamPayload {
  commandId: string;
  agentId: string;
  trace: TraceEventPayload;
}

export interface QueueUpdatePayload {
  agentId: string;
  queueSize: number;
  executing?: {
    commandId: string;
    startedAt: number;
  };
  queued: Array<{
    commandId: string;
    position: number;
    priority: number;
    estimatedStartTime?: number;
  }>;
}

export interface EmergencyStopPayload {
  triggeredBy: string;
  reason: string;
  agentsStopped: number;
  commandsCancelled: number;
  timestamp: number;
}

// ============================================================================
// Dashboard → Server Message Payloads
// ============================================================================

export interface DashboardInitPayload {
  userId: string;
  subscriptions?: {
    agents?: string[];
    commands?: string[];
    traces?: boolean;
    terminals?: boolean;
  };
}

export interface DashboardSubscribePayload {
  type: 'agent' | 'command' | 'trace' | 'terminal';
  id?: string; // Optional ID for specific resource
  all?: boolean; // Subscribe to all resources of this type
}

export interface DashboardUnsubscribePayload {
  type: 'agent' | 'command' | 'trace' | 'terminal';
  id?: string;
  all?: boolean;
}

// ============================================================================
// Common/Utility Payloads
// ============================================================================

export interface PingPayload {
  timestamp: number;
  sequence?: number;
}

export interface PongPayload {
  timestamp: number;
  sequence?: number;
  latency?: number;
}

export interface AckPayload {
  messageId: string;
  success: boolean;
  error?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: Record<string, any>;
  originalMessageId?: string;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isAgentMessage(type: MessageType): boolean {
  return [
    MessageType.AGENT_CONNECT,
    MessageType.AGENT_HEARTBEAT,
    MessageType.AGENT_ERROR,
    MessageType.COMMAND_ACK,
    MessageType.COMMAND_COMPLETE,
    MessageType.TERMINAL_OUTPUT,
    MessageType.TRACE_EVENT,
    MessageType.INVESTIGATION_REPORT
  ].includes(type);
}

export function isServerToAgentMessage(type: MessageType): boolean {
  return [
    MessageType.COMMAND_REQUEST,
    MessageType.COMMAND_CANCEL,
    MessageType.AGENT_CONTROL,
    MessageType.TOKEN_REFRESH,
    MessageType.SERVER_HEARTBEAT
  ].includes(type);
}

export function isDashboardMessage(type: MessageType): boolean {
  return [
    MessageType.DASHBOARD_INIT,
    MessageType.DASHBOARD_SUBSCRIBE,
    MessageType.DASHBOARD_UNSUBSCRIBE
  ].includes(type);
}

export function isServerToDashboardMessage(type: MessageType): boolean {
  return [
    MessageType.AGENT_STATUS,
    MessageType.AGENT_DISCONNECT,
    MessageType.COMMAND_STATUS,
    MessageType.TERMINAL_STREAM,
    MessageType.TRACE_STREAM,
    MessageType.QUEUE_UPDATE,
    MessageType.EMERGENCY_STOP
  ].includes(type);
}

// ============================================================================
// Message Type Mappings
// ============================================================================

export type MessagePayloadMap = {
  [MessageType.AGENT_CONNECT]: AgentConnectPayload;
  [MessageType.AGENT_HEARTBEAT]: AgentHeartbeatPayload;
  [MessageType.AGENT_ERROR]: AgentErrorPayload;
  [MessageType.COMMAND_ACK]: CommandAckPayload;
  [MessageType.COMMAND_COMPLETE]: CommandCompletePayload;
  [MessageType.TERMINAL_OUTPUT]: TerminalOutputPayload;
  [MessageType.TRACE_EVENT]: TraceEventPayload;
  [MessageType.INVESTIGATION_REPORT]: InvestigationReportPayload;
  [MessageType.COMMAND_REQUEST]: CommandRequestPayload;
  [MessageType.COMMAND_CANCEL]: CommandCancelPayload;
  [MessageType.AGENT_CONTROL]: AgentControlPayload;
  [MessageType.TOKEN_REFRESH]: TokenRefreshPayload;
  [MessageType.SERVER_HEARTBEAT]: ServerHeartbeatPayload;
  [MessageType.AGENT_STATUS]: AgentStatusPayload;
  [MessageType.AGENT_DISCONNECT]: AgentDisconnectPayload;
  [MessageType.COMMAND_STATUS]: CommandStatusPayload;
  [MessageType.TERMINAL_STREAM]: TerminalStreamPayload;
  [MessageType.TRACE_STREAM]: TraceStreamPayload;
  [MessageType.QUEUE_UPDATE]: QueueUpdatePayload;
  [MessageType.EMERGENCY_STOP]: EmergencyStopPayload;
  [MessageType.DASHBOARD_INIT]: DashboardInitPayload;
  [MessageType.DASHBOARD_SUBSCRIBE]: DashboardSubscribePayload;
  [MessageType.DASHBOARD_UNSUBSCRIBE]: DashboardUnsubscribePayload;
  [MessageType.PING]: PingPayload;
  [MessageType.PONG]: PongPayload;
  [MessageType.ACK]: AckPayload;
  [MessageType.ERROR]: ErrorPayload;
};

export type TypedWebSocketMessage<T extends MessageType> = WebSocketMessage<MessagePayloadMap[T]>;

// Export convenience type aliases
export type AgentMessage = TypedWebSocketMessage<
  | MessageType.AGENT_CONNECT
  | MessageType.AGENT_HEARTBEAT
  | MessageType.AGENT_ERROR
  | MessageType.COMMAND_ACK
  | MessageType.COMMAND_COMPLETE
  | MessageType.TERMINAL_OUTPUT
  | MessageType.TRACE_EVENT
  | MessageType.INVESTIGATION_REPORT
>;

export type DashboardMessage = TypedWebSocketMessage<
  | MessageType.DASHBOARD_INIT
  | MessageType.DASHBOARD_SUBSCRIBE
  | MessageType.DASHBOARD_UNSUBSCRIBE
>;

export type ServerMessage = TypedWebSocketMessage<
  | MessageType.COMMAND_REQUEST
  | MessageType.COMMAND_CANCEL
  | MessageType.AGENT_CONTROL
  | MessageType.TOKEN_REFRESH
  | MessageType.SERVER_HEARTBEAT
  | MessageType.AGENT_STATUS
  | MessageType.COMMAND_STATUS
  | MessageType.TERMINAL_STREAM
  | MessageType.TRACE_STREAM
  | MessageType.QUEUE_UPDATE
  | MessageType.EMERGENCY_STOP
>;