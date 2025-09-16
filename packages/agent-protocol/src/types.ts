// WebSocket message types for agent communication

export enum MessageType {
  // Agent -> Server
  AGENT_CONNECT = 'AGENT_CONNECT',
  AGENT_DISCONNECT = 'AGENT_DISCONNECT',
  AGENT_HEARTBEAT = 'AGENT_HEARTBEAT',
  COMMAND_ACK = 'COMMAND_ACK',
  COMMAND_COMPLETE = 'COMMAND_COMPLETE',
  TERMINAL_OUTPUT = 'TERMINAL_OUTPUT',
  TRACE_EVENT = 'TRACE_EVENT',
  STATUS_UPDATE = 'STATUS_UPDATE',

  // Server -> Agent
  CONNECTION_ACK = 'CONNECTION_ACK',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  COMMAND_REQUEST = 'COMMAND_REQUEST',
  COMMAND_CANCEL = 'COMMAND_CANCEL',
  HEARTBEAT_ACK = 'HEARTBEAT_ACK',
  TOKEN_REFRESH = 'TOKEN_REFRESH',

  // Bidirectional
  ERROR = 'ERROR',
  PING = 'PING',
  PONG = 'PONG',
}

export enum AgentType {
  CLAUDE = 'claude',
  GEMINI = 'gemini',
  CODEX = 'codex',
  CUSTOM = 'custom',
}

export enum AgentStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  EXECUTING = 'executing',
  ERROR = 'error',
  MAINTENANCE = 'maintenance',
}

export enum CommandStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum TerminalOutputType {
  STDOUT = 'stdout',
  STDERR = 'stderr',
  SYSTEM = 'system',
}

export enum TraceEventType {
  REQUEST = 'request',
  RESPONSE = 'response',
  THOUGHT = 'thought',
  ACTION = 'action',
  OBSERVATION = 'observation',
  ERROR = 'error',
}

// Base message interface
export interface BaseMessage {
  type: MessageType;
  timestamp: string;
  correlationId?: string;
}

// Agent connection messages
export interface AgentConnectMessage extends BaseMessage {
  type: MessageType.AGENT_CONNECT;
  payload: {
    agentId: string;
    token: string;
    version: string;
    capabilities: string[];
    metadata?: Record<string, any>;
    reconnecting?: boolean;
  };
}

export interface ConnectionAckMessage extends BaseMessage {
  type: MessageType.CONNECTION_ACK;
  payload: {
    agentId: string;
    connectionId: string;
    serverVersion: string;
  };
}

// Heartbeat messages
export interface AgentHeartbeatMessage extends BaseMessage {
  type: MessageType.AGENT_HEARTBEAT;
  payload: {
    agentId: string;
    timestamp: string;
    metrics?: {
      cpuUsage?: number;
      memoryUsage?: number;
      activeCommands?: number;
      queuedCommands?: number;
    };
  };
}

export interface HeartbeatAckMessage extends BaseMessage {
  type: MessageType.HEARTBEAT_ACK;
  payload: {
    timestamp: string;
    serverTime: string;
  };
}

// Command messages
export interface CommandRequestMessage extends BaseMessage {
  type: MessageType.COMMAND_REQUEST;
  payload: {
    commandId: string;
    command: string;
    arguments: Record<string, any>;
    priority: number;
    timeout?: number;
    constraints?: {
      maxCpu?: number;
      maxMemory?: number;
      maxDuration?: number;
    };
  };
}

export interface CommandAckMessage extends BaseMessage {
  type: MessageType.COMMAND_ACK;
  payload: {
    commandId: string;
    status: CommandStatus;
    queuePosition?: number;
    estimatedStartTime?: string;
  };
}

export interface CommandCompleteMessage extends BaseMessage {
  type: MessageType.COMMAND_COMPLETE;
  payload: {
    commandId: string;
    status: CommandStatus;
    exitCode?: number;
    result?: any;
    error?: string;
    duration: number;
    startedAt: string;
    completedAt: string;
  };
}

// Terminal output messages
export interface TerminalOutputMessage extends BaseMessage {
  type: MessageType.TERMINAL_OUTPUT;
  payload: {
    commandId: string;
    agentId: string;
    output: string;
    type: TerminalOutputType;
    sequence: number;
    timestamp: string;
  };
}

// Trace event messages
export interface TraceEventMessage extends BaseMessage {
  type: MessageType.TRACE_EVENT;
  payload: {
    commandId: string;
    agentId: string;
    parentId?: string;
    type: TraceEventType;
    content: any;
    metadata?: {
      model?: string;
      promptTokens?: number;
      completionTokens?: number;
      temperature?: number;
      duration?: number;
    };
  };
}

// Status update messages
export interface StatusUpdateMessage extends BaseMessage {
  type: MessageType.STATUS_UPDATE;
  payload: {
    agentId: string;
    status: AgentStatus;
    reason?: string;
    metadata?: Record<string, any>;
  };
}

// Error messages
export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  payload: {
    code: string;
    message: string;
    details?: any;
    fatal?: boolean;
  };
}

// Token refresh messages
export interface TokenRefreshMessage extends BaseMessage {
  type: MessageType.TOKEN_REFRESH;
  payload: {
    token: string;
    expiresIn: number;
  };
}

// Union type for all messages
export type WebSocketMessage =
  | AgentConnectMessage
  | ConnectionAckMessage
  | AgentHeartbeatMessage
  | HeartbeatAckMessage
  | CommandRequestMessage
  | CommandAckMessage
  | CommandCompleteMessage
  | TerminalOutputMessage
  | TraceEventMessage
  | StatusUpdateMessage
  | ErrorMessage
  | TokenRefreshMessage;

// Type guards
export function isAgentConnectMessage(msg: any): msg is AgentConnectMessage {
  return msg?.type === MessageType.AGENT_CONNECT;
}

export function isCommandRequestMessage(msg: any): msg is CommandRequestMessage {
  return msg?.type === MessageType.COMMAND_REQUEST;
}

export function isTerminalOutputMessage(msg: any): msg is TerminalOutputMessage {
  return msg?.type === MessageType.TERMINAL_OUTPUT;
}

export function isTraceEventMessage(msg: any): msg is TraceEventMessage {
  return msg?.type === MessageType.TRACE_EVENT;
}