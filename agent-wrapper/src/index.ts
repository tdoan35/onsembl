/**
 * @onsembl/agent-wrapper
 *
 * Node.js CLI wrappers for AI coding agents
 *
 * This package provides CLI tools and utilities for connecting AI coding agents
 * (Claude, Gemini, Codex) to the Onsembl.ai Agent Control Center.
 */

// Core configuration and logging utilities
export { loadConfig, getAgentExecutablePath, validateWebSocketUrl, createConfigTemplate } from './lib/config.js';
export type { Config } from './lib/config.js';

export {
  logger,
  createChildLogger,
  configureLogger,
  LogLevel,
  logHelpers,
  withRequestId
} from './lib/logger.js';

// Define basic types locally until agent protocol package is built
export interface AgentMessage {
  id: string;
  type: string;
  timestamp: Date;
}

export interface CommandMessage extends AgentMessage {
  type: 'command';
  command: string;
  args?: string[];
}

export type AgentStatus = 'connected' | 'disconnected' | 'busy' | 'idle' | 'error';

export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: Date;
}

// Version information
export const version = '0.1.0';

/**
 * Package metadata
 */
export const packageInfo = {
  name: '@onsembl/agent-wrapper',
  version,
  description: 'Node.js CLI wrappers for AI coding agents',
  author: 'Onsembl.ai',
  license: 'MIT',
} as const;

/**
 * Supported agent types
 */
export const SUPPORTED_AGENTS = ['claude', 'gemini', 'codex'] as const;
export type SupportedAgent = typeof SUPPORTED_AGENTS[number];

/**
 * Default configuration values
 */
export const DEFAULTS = {
  SERVER_URL: 'ws://localhost:3001',
  AGENT_TYPE: 'claude' as SupportedAgent,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  HEARTBEAT_INTERVAL: 30000,
  LOG_LEVEL: 'info',
} as const;

/**
 * Environment variable names
 */
export const ENV_VARS = {
  AGENT_TYPE: 'ONSEMBL_AGENT_TYPE',
  SERVER_URL: 'ONSEMBL_SERVER_URL',
  AUTH_TOKEN: 'ONSEMBL_AUTH_TOKEN',
  AGENT_PATH: 'ONSEMBL_AGENT_PATH',
  MAX_RETRIES: 'ONSEMBL_MAX_RETRIES',
  RETRY_DELAY: 'ONSEMBL_RETRY_DELAY',
  HEARTBEAT_INTERVAL: 'ONSEMBL_HEARTBEAT_INTERVAL',
  LOG_LEVEL: 'ONSEMBL_LOG_LEVEL',
} as const;

/**
 * Utility function to check if an agent type is supported
 */
export function isSupportedAgent(agent: string): agent is SupportedAgent {
  return SUPPORTED_AGENTS.includes(agent as SupportedAgent);
}

/**
 * Utility function to format agent display name
 */
export function formatAgentName(agent: SupportedAgent): string {
  const names = {
    claude: 'Claude',
    gemini: 'Gemini',
    codex: 'Codex',
  };
  return names[agent];
}