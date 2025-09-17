import { config } from 'dotenv';
import { z } from 'zod';
import { existsSync } from 'fs';
import { join } from 'path';

// Load environment variables from .env file if it exists
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  config({ path: envPath });
}

// Configuration schema with validation
const ConfigSchema = z.object({
  // Server connection
  serverUrl: z.string().url().default('ws://localhost:8080'),
  apiKey: z.string().min(1, 'API key is required'),

  // Agent configuration
  agentType: z.enum(['claude', 'gemini', 'codex', 'mock']).default('mock'),
  agentCommand: z.string().optional(),
  workingDirectory: z.string().default(process.cwd()),

  // Process limits
  maxMemoryMb: z.number().positive().default(1024),
  maxCpuPercent: z.number().min(1).max(100).default(80),

  // Connection settings
  reconnectAttempts: z.number().min(0).default(10),
  reconnectBaseDelay: z.number().positive().default(1000),
  heartbeatInterval: z.number().positive().default(30000),

  // Output settings
  outputBufferSize: z.number().positive().default(8192),
  outputFlushInterval: z.number().positive().default(100),

  // Logging
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  logFile: z.string().optional(),

  // Agent-specific settings
  claude: z.object({
    model: z.string().default('claude-3-sonnet-20240229'),
    maxTokens: z.number().positive().default(4000),
    temperature: z.number().min(0).max(2).default(0.7),
  }).default({}),

  gemini: z.object({
    model: z.string().default('gemini-pro'),
    maxTokens: z.number().positive().default(4000),
    temperature: z.number().min(0).max(2).default(0.7),
  }).default({}),

  codex: z.object({
    model: z.string().default('gpt-4'),
    maxTokens: z.number().positive().default(4000),
    temperature: z.number().min(0).max(2).default(0.3),
  }).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

// Default agent commands
const DEFAULT_AGENT_COMMANDS = {
  claude: 'claude',
  gemini: 'gemini',
  codex: 'codex'
} as const;

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(overrides: Partial<Config> = {}): Config {
  const envConfig = {
    // Server connection
    serverUrl: process.env.ONSEMBL_SERVER_URL,
    apiKey: process.env.ONSEMBL_API_KEY,

    // Agent configuration
    agentType: process.env.ONSEMBL_AGENT_TYPE,
    agentCommand: process.env.ONSEMBL_AGENT_COMMAND,
    workingDirectory: process.env.ONSEMBL_WORKING_DIR,

    // Process limits
    maxMemoryMb: process.env.ONSEMBL_MAX_MEMORY_MB ? parseInt(process.env.ONSEMBL_MAX_MEMORY_MB, 10) : undefined,
    maxCpuPercent: process.env.ONSEMBL_MAX_CPU_PERCENT ? parseInt(process.env.ONSEMBL_MAX_CPU_PERCENT, 10) : undefined,

    // Connection settings
    reconnectAttempts: process.env.ONSEMBL_RECONNECT_ATTEMPTS ? parseInt(process.env.ONSEMBL_RECONNECT_ATTEMPTS, 10) : undefined,
    reconnectBaseDelay: process.env.ONSEMBL_RECONNECT_BASE_DELAY ? parseInt(process.env.ONSEMBL_RECONNECT_BASE_DELAY, 10) : undefined,
    heartbeatInterval: process.env.ONSEMBL_HEARTBEAT_INTERVAL ? parseInt(process.env.ONSEMBL_HEARTBEAT_INTERVAL, 10) : undefined,

    // Output settings
    outputBufferSize: process.env.ONSEMBL_OUTPUT_BUFFER_SIZE ? parseInt(process.env.ONSEMBL_OUTPUT_BUFFER_SIZE, 10) : undefined,
    outputFlushInterval: process.env.ONSEMBL_OUTPUT_FLUSH_INTERVAL ? parseInt(process.env.ONSEMBL_OUTPUT_FLUSH_INTERVAL, 10) : undefined,

    // Logging
    logLevel: process.env.ONSEMBL_LOG_LEVEL,
    logFile: process.env.ONSEMBL_LOG_FILE,

    // Agent-specific settings
    claude: {
      model: process.env.CLAUDE_MODEL,
      maxTokens: process.env.CLAUDE_MAX_TOKENS ? parseInt(process.env.CLAUDE_MAX_TOKENS, 10) : undefined,
      temperature: process.env.CLAUDE_TEMPERATURE ? parseFloat(process.env.CLAUDE_TEMPERATURE) : undefined,
    },

    gemini: {
      model: process.env.GEMINI_MODEL,
      maxTokens: process.env.GEMINI_MAX_TOKENS ? parseInt(process.env.GEMINI_MAX_TOKENS, 10) : undefined,
      temperature: process.env.GEMINI_TEMPERATURE ? parseFloat(process.env.GEMINI_TEMPERATURE) : undefined,
    },

    codex: {
      model: process.env.CODEX_MODEL,
      maxTokens: process.env.CODEX_MAX_TOKENS ? parseInt(process.env.CODEX_MAX_TOKENS, 10) : undefined,
      temperature: process.env.CODEX_TEMPERATURE ? parseFloat(process.env.CODEX_TEMPERATURE) : undefined,
    },
  };

  // Merge environment config with overrides
  const mergedConfig = {
    ...envConfig,
    ...overrides,
    claude: { ...envConfig.claude, ...overrides.claude },
    gemini: { ...envConfig.gemini, ...overrides.gemini },
    codex: { ...envConfig.codex, ...overrides.codex },
  };

  // Remove undefined values
  const cleanedConfig = Object.fromEntries(
    Object.entries(mergedConfig).filter(([_, value]) => value !== undefined)
  );

  // Validate configuration
  const validatedConfig = ConfigSchema.parse(cleanedConfig);

  // Set default agent command if not specified
  if (!validatedConfig.agentCommand) {
    validatedConfig.agentCommand = DEFAULT_AGENT_COMMANDS[validatedConfig.agentType];
  }

  return validatedConfig;
}

/**
 * Get WebSocket URL from server URL
 */
export function getWebSocketUrl(serverUrl: string): string {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws/agent';
  return url.toString();
}

/**
 * Validate agent command exists in PATH
 */
export function validateAgentCommand(command: string): boolean {
  try {
    const { execSync } = require('child_process');
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get environment variables for agent process
 */
export function getAgentEnvironment(config: Config): Record<string, string> {
  const baseEnv = { ...process.env };

  switch (config.agentType) {
    case 'claude':
      return {
        ...baseEnv,
        CLAUDE_MODEL: config.claude.model,
        CLAUDE_MAX_TOKENS: config.claude.maxTokens.toString(),
        CLAUDE_TEMPERATURE: config.claude.temperature.toString(),
      };

    case 'gemini':
      return {
        ...baseEnv,
        GEMINI_MODEL: config.gemini.model,
        GEMINI_MAX_TOKENS: config.gemini.maxTokens.toString(),
        GEMINI_TEMPERATURE: config.gemini.temperature.toString(),
      };

    case 'codex':
      return {
        ...baseEnv,
        CODEX_MODEL: config.codex.model,
        CODEX_MAX_TOKENS: config.codex.maxTokens.toString(),
        CODEX_TEMPERATURE: config.codex.temperature.toString(),
      };

    default:
      return baseEnv;
  }
}