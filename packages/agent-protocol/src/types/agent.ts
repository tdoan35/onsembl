/**
 * Agent-related type definitions for the Onsembl.ai Agent Control Center
 */

export type AgentType = 'CLAUDE' | 'GEMINI' | 'CODEX';

export type AgentStatus = 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'ERROR';

export type ActivityState = 'IDLE' | 'PROCESSING' | 'QUEUED';

export interface AgentCapabilities {
  maxTokens: number;
  supportsInterrupt: boolean;
  supportsTrace: boolean;
}

export interface HealthMetrics {
  cpuUsage: number;
  memoryUsage: number;
  uptime: number;
  commandsProcessed: number;
  averageResponseTime: number;
}

export interface Agent {
  id: string;
  type: AgentType;
  version: string;
  hostMachine: string;
  capabilities: AgentCapabilities;
  status: AgentStatus;
  activityState: ActivityState;
  healthMetrics?: HealthMetrics;
  lastSeen?: number;
  connectedAt?: number;
}

export interface AgentConnectPayload {
  agentId: string;
  agentType: AgentType;
  version: string;
  hostMachine: string;
  capabilities: AgentCapabilities;
}

export interface AgentHeartbeatPayload {
  agentId: string;
  healthMetrics: HealthMetrics;
}

export interface AgentStatusPayload {
  agentId: string;
  status: AgentStatus;
  activityState: ActivityState;
  healthMetrics?: HealthMetrics;
}

export interface AgentErrorPayload {
  agentId: string;
  errorType: 'CONNECTION' | 'EXECUTION' | 'RESOURCE' | 'UNKNOWN';
  message: string;
  recoverable: boolean;
  details: Record<string, any>;
}

export interface AgentControlPayload {
  action: 'STOP' | 'RESTART' | 'PAUSE' | 'RESUME';
  reason: string;
}