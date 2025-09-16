/**
 * @onsembl/command-queue - BullMQ queue management for Onsembl.ai command execution
 *
 * This package provides:
 * - Priority-based command queueing with BullMQ
 * - Redis connection management
 * - Command interruption support
 * - Agent availability tracking
 * - Queue metrics and monitoring
 */

// Export Redis connection utilities
export * from './redis-connection.js';
export * from './queue-manager.js';

// Re-export BullMQ types
export { Queue, Worker, Job, QueueEvents } from 'bullmq';

// Export core classes
export { CommandQueue } from './queue.js';
export { CommandQueueProcessor, createAgentCommandProcessor, createMockProcessor } from './processor.js';
export { ConfigManager, validateQueueConfig, getConfigFromEnv, defaultQueueConfig } from './config.js';

// Export all types
export * from './types.js';

// Export version information
export const PACKAGE_VERSION = '0.1.0';

// Export commonly used interfaces for convenience
export type {
  CommandJobData,
  CommandJobResult,
  QueuedCommand,
  QueueMetrics,
  AgentAvailability,
  CommandFilter,
  InterruptRequest,
  InterruptResult,
  QueueConfiguration
} from './types.js';

export type {
  CommandProcessor,
  ProcessorEvents
} from './processor.js';

export type {
  CommandQueueEvents
} from './queue.js';