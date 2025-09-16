/**
 * @onsembl/agent-protocol - WebSocket protocol types and validation for Onsembl.ai Agent Control Center
 *
 * This package provides:
 * - TypeScript interfaces for all WebSocket message types
 * - Zod schemas for runtime validation
 * - Message builder utilities
 * - Protocol version management
 */

// Export all types
export * from './types/index.js';

// Export message builders
export * from './messages/index.js';

// Export validation utilities
export * from './validation/index.js';

// Export version information
export const PACKAGE_VERSION = '0.1.0';

// Re-export commonly used utilities for convenience
export {
  MessageValidator,
  TypedValidator
} from './validation/validator.js';

export {
  AgentMessageBuilder,
  ServerToAgentMessageBuilder,
  ServerToDashboardMessageBuilder,
  ErrorMessageBuilder
} from './messages/index.js';

export {
  PROTOCOL_VERSION,
  MESSAGE_TYPES,
  ERROR_CODES,
  RATE_LIMITS
} from './types/index.js';