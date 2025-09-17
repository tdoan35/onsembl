/**
 * WebSocket Message Protocol v1.0.0
 * Defines all message types for dashboard-backend communication
 */

// Base message structure
export interface WebSocketMessage<T = any> {
  version: '1.0.0'
  type: string
  timestamp: number
  payload: T
}

// Connection states
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
export type AgentStatus = 'online' | 'busy' | 'offline'
export type CommandStatus = 'queued' | 'running' | 'completed' | 'failed' | 'interrupted'
export type CommandPriority = 'high' | 'normal' | 'low'

// Client → Server Messages

export interface DashboardConnectMessage extends WebSocketMessage<{
  token: string
  clientInfo: {
    userAgent: string
    timezone: string
    viewport?: {
      width: number
      height: number
    }
  }
}> {
  type: 'dashboard:connect'
}

export interface CommandRequestMessage extends WebSocketMessage<{
  agentId: string
  command: string
  priority: CommandPriority
  timeout?: number // Optional timeout in ms
}> {
  type: 'command:request'
}

export interface CommandInterruptMessage extends WebSocketMessage<{
  commandId: string
  reason?: string
}> {
  type: 'command:interrupt'
}

export interface HeartbeatMessage extends WebSocketMessage<{
  sequence: number
}> {
  type: 'heartbeat'
}

// Server → Client Messages

export interface AgentStatusUpdateMessage extends WebSocketMessage<{
  agentId: string
  agentType: 'claude' | 'gemini' | 'codex'
  status: AgentStatus
  capabilities?: string[]
  metadata?: {
    version?: string
    platform?: string
  }
}> {
  type: 'agent:status'
}

export interface AgentListMessage extends WebSocketMessage<{
  agents: Array<{
    agentId: string
    agentType: 'claude' | 'gemini' | 'codex'
    status: AgentStatus
    connectedAt: number
    lastActivity: number
  }>
}> {
  type: 'agent:list'
}

export interface TerminalOutputMessage extends WebSocketMessage<{
  commandId: string
  agentId: string
  data: string
  stream: 'stdout' | 'stderr'
  sequence: number
  isCompressed?: boolean // If true, data is gzipped and base64 encoded
}> {
  type: 'terminal:output'
}

export interface CommandStatusUpdateMessage extends WebSocketMessage<{
  commandId: string
  agentId: string
  status: CommandStatus
  exitCode?: number
  error?: string
  executionTime?: number // Duration in ms
}> {
  type: 'command:status'
}

export interface CommandQueueUpdateMessage extends WebSocketMessage<{
  agentId: string
  queue: Array<{
    commandId: string
    command: string
    priority: CommandPriority
    position: number
    requestedBy: string
    requestedAt: number
  }>
}> {
  type: 'command:queue'
}

export interface ConnectionAckMessage extends WebSocketMessage<{
  connectionId: string
  serverVersion: string
  features: string[] // Supported features
}> {
  type: 'connection:ack'
}

export interface ErrorMessage extends WebSocketMessage<{
  code: string
  message: string
  details?: any
  recoverable: boolean
}> {
  type: 'error'
}

// Type guards

export function isDashboardConnect(msg: WebSocketMessage): msg is DashboardConnectMessage {
  return msg.type === 'dashboard:connect'
}

export function isCommandRequest(msg: WebSocketMessage): msg is CommandRequestMessage {
  return msg.type === 'command:request'
}

export function isCommandInterrupt(msg: WebSocketMessage): msg is CommandInterruptMessage {
  return msg.type === 'command:interrupt'
}

export function isHeartbeat(msg: WebSocketMessage): msg is HeartbeatMessage {
  return msg.type === 'heartbeat'
}

export function isAgentStatusUpdate(msg: WebSocketMessage): msg is AgentStatusUpdateMessage {
  return msg.type === 'agent:status'
}

export function isAgentList(msg: WebSocketMessage): msg is AgentListMessage {
  return msg.type === 'agent:list'
}

export function isTerminalOutput(msg: WebSocketMessage): msg is TerminalOutputMessage {
  return msg.type === 'terminal:output'
}

export function isCommandStatusUpdate(msg: WebSocketMessage): msg is CommandStatusUpdateMessage {
  return msg.type === 'command:status'
}

export function isCommandQueueUpdate(msg: WebSocketMessage): msg is CommandQueueUpdateMessage {
  return msg.type === 'command:queue'
}

export function isConnectionAck(msg: WebSocketMessage): msg is ConnectionAckMessage {
  return msg.type === 'connection:ack'
}

export function isError(msg: WebSocketMessage): msg is ErrorMessage {
  return msg.type === 'error'
}

// Message factory functions

export function createMessage<T extends WebSocketMessage>(
  type: T['type'],
  payload: T['payload']
): T {
  return {
    version: '1.0.0',
    type,
    timestamp: Date.now(),
    payload
  } as T
}

export function createErrorMessage(
  code: string,
  message: string,
  recoverable = true
): ErrorMessage {
  return createMessage('error', {
    code,
    message,
    recoverable,
    details: null
  })
}

// Validation schemas (for runtime validation)

export const MessageValidation = {
  isDashboardConnect: (msg: any): boolean => {
    return msg?.type === 'dashboard:connect' &&
           msg?.payload?.token &&
           msg?.payload?.clientInfo?.userAgent
  },

  isCommandRequest: (msg: any): boolean => {
    return msg?.type === 'command:request' &&
           msg?.payload?.agentId &&
           msg?.payload?.command &&
           ['high', 'normal', 'low'].includes(msg?.payload?.priority)
  },

  isValidVersion: (msg: any): boolean => {
    return msg?.version === '1.0.0'
  }
}