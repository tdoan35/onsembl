/**
 * Command-related type definitions for the Onsembl.ai Agent Control Center
 */

export type CommandType = 'NATURAL' | 'INVESTIGATE' | 'REVIEW' | 'PLAN' | 'SYNTHESIZE';

export type CommandStatus = 'PENDING' | 'QUEUED' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type StreamType = 'STDOUT' | 'STDERR';

export interface ExecutionConstraints {
  timeLimitMs?: number;
  tokenBudget?: number;
}

export interface CommandProgress {
  percent: number;
  message: string;
}

export interface Command {
  id: string;
  content: string;
  type: CommandType;
  priority: number;
  status: CommandStatus;
  agentId?: string;
  executionConstraints?: ExecutionConstraints;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  executionTime?: number;
  tokensUsed?: number;
  error?: string;
}

export interface CommandRequestPayload {
  commandId: string;
  content: string;
  type: CommandType;
  priority: number;
  executionConstraints?: ExecutionConstraints;
}

export interface CommandAckPayload {
  commandId: string;
  agentId: string;
  status: 'RECEIVED' | 'QUEUED' | 'EXECUTING';
}

export interface CommandStatusPayload {
  commandId: string;
  status: CommandStatus;
  progress?: CommandProgress;
}

export interface CommandCompletePayload {
  commandId: string;
  agentId: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  error?: string;
  executionTime: number;
  tokensUsed: number;
}

export interface CommandCancelPayload {
  commandId: string;
  reason: string;
}

export interface TerminalOutputPayload {
  commandId: string;
  agentId: string;
  streamType: StreamType;
  content: string;
  ansiCodes: boolean;
  sequence: number;
}

export interface TerminalStreamPayload {
  commandId: string;
  agentId: string;
  agentName: string;
  agentType: string;
  streamType: StreamType;
  content: string;
  ansiCodes: boolean;
}