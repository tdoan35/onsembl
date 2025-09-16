/**
 * Type definitions for the command queue system
 */

import type { Command, CommandType, CommandStatus } from '@onsembl/agent-protocol';

export interface QueuedCommand extends Command {
  queuedAt: number;
  attemptCount: number;
  maxAttempts: number;
  lastError?: string;
  estimatedDuration?: number;
}

export interface CommandJobData {
  command: QueuedCommand;
  agentId: string | undefined;
  userId: string;
  priority: number;
  executionConstraints: {
    timeLimitMs?: number;
    tokenBudget?: number;
  } | undefined;
  interruptReason?: string;
}

export interface CommandJobResult {
  success: boolean;
  commandId: string;
  agentId: string;
  executionTime: number;
  tokensUsed: number;
  error?: string;
  output?: string;
}

export interface QueueMetrics {
  totalJobs: number;
  waitingJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  avgWaitTime: number;
  avgProcessingTime: number;
  throughputPerHour: number;
}

export interface AgentAvailability {
  agentId: string;
  isAvailable: boolean;
  currentCommandId?: string;
  queuedCommands: number;
  healthScore: number;
  lastSeen: number;
}

export interface QueueConfiguration {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
  queue: {
    name: string;
    defaultJobOptions: {
      removeOnComplete: number;
      removeOnFail: number;
      attempts: number;
      backoff: {
        type: 'exponential' | 'fixed';
        delay: number;
      };
    };
    concurrency?: number;
    maxStalledCount?: number;
    stalledInterval?: number;
  };
  priorities: {
    emergency: number;
    high: number;
    normal: number;
    low: number;
  };
}

export interface CommandFilter {
  agentId?: string;
  userId?: string;
  commandType?: CommandType;
  status?: CommandStatus;
  priority?: {
    min?: number;
    max?: number;
  };
  dateRange?: {
    from: number;
    to: number;
  };
}

export interface InterruptRequest {
  commandId: string;
  reason: string;
  force: boolean;
  timeout?: number;
}

export interface InterruptResult {
  success: boolean;
  commandId: string;
  wasInterrupted: boolean;
  reason?: string;
  error?: string;
}