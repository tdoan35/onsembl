/**
 * Trace-related type definitions for the Onsembl.ai Agent Control Center
 */

export type TraceType = 'LLM_PROMPT' | 'TOOL_CALL' | 'RESPONSE';

export interface TraceEntry {
  id: string;
  commandId: string;
  agentId: string;
  parentId: string | null;
  type: TraceType;
  name: string;
  content: Record<string, any>;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  tokensUsed?: number;
  children?: TraceEntry[];
}

export interface TraceEventPayload {
  commandId: string;
  agentId: string;
  traceId: string;
  parentId: string | null;
  type: TraceType;
  name: string;
  content: Record<string, any>;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  tokensUsed?: number;
}

export interface TraceUpdatePayload {
  commandId: string;
  agentId: string;
  traces: TraceEntry[];
}

export interface TraceTree {
  commandId: string;
  agentId: string;
  rootTraces: TraceEntry[];
  totalDuration: number;
  totalTokens: number;
  createdAt: number;
  updatedAt: number;
}