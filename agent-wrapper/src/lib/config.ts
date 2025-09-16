import { z } from 'zod';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { logger } from './logger.js';

// Configuration schema validation
const ConfigSchema = z.object({
  agentType: z.enum(['claude', 'gemini', 'codex']).default('claude'),
  serverUrl: z.string().url().default('ws://localhost:3001'),
  authToken: z.string().optional(),
  agentExecutablePath: z.string().optional(),
  maxRetries: z.number().int().positive().default(3),
  retryDelay: z.number().int().positive().default(1000),
  heartbeatInterval: z.number().int().positive().default(30000),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

// Default configuration
const DEFAULT_CONFIG: Config = {
  agentType: 'claude',
  serverUrl: 'ws://localhost:3001',
  maxRetries: 3,
  retryDelay: 1000,
  heartbeatInterval: 30000,
  logLevel: 'info',
};

// Environment variable mapping
const ENV_MAPPING = {
  ONSEMBL_AGENT_TYPE: 'agentType',
  ONSEMBL_SERVER_URL: 'serverUrl',
  ONSEMBL_AUTH_TOKEN: 'authToken',
  ONSEMBL_AGENT_PATH: 'agentExecutablePath',
  ONSEMBL_MAX_RETRIES: 'maxRetries',
  ONSEMBL_RETRY_DELAY: 'retryDelay',
  ONSEMBL_HEARTBEAT_INTERVAL: 'heartbeatInterval',
  ONSEMBL_LOG_LEVEL: 'logLevel',
} as const;

/**
 * Load configuration from file, environment variables, and defaults
 */
export async function loadConfig(configPath?: string): Promise<Config> {
  let config: Partial<Config> = { ...DEFAULT_CONFIG };

  // Load from config file if provided
  if (configPath) {
    try {
      const resolvedPath = resolve(configPath);
      const fileContent = await readFile(resolvedPath, 'utf-8');
      const fileConfig = JSON.parse(fileContent);
      config = { ...config, ...fileConfig };
      logger.debug('Loaded configuration from file', { configPath: resolvedPath });
    } catch (error) {
      logger.warn('Failed to load config file, using defaults', {
        configPath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Override with environment variables
  const envConfig: Partial<Config> = {};
  for (const [envKey, configKey] of Object.entries(ENV_MAPPING)) {
    const envValue = process.env[envKey];
    if (envValue !== undefined) {
      // Handle type conversion for non-string values
      if (configKey === 'maxRetries' || configKey === 'retryDelay' || configKey === 'heartbeatInterval') {
        const numValue = parseInt(envValue, 10);
        if (!isNaN(numValue)) {
          (envConfig as any)[configKey] = numValue;
        }
      } else {
        (envConfig as any)[configKey] = envValue;
      }
    }
  }

  config = { ...config, ...envConfig };

  // Validate and return configuration
  try {
    const validatedConfig = ConfigSchema.parse(config);
    logger.debug('Configuration loaded successfully', { config: validatedConfig });
    return validatedConfig;
  } catch (error) {
    logger.error('Invalid configuration', { error, config });
    throw new Error(`Configuration validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get agent executable path based on agent type
 */
export function getAgentExecutablePath(agentType: Config['agentType'], customPath?: string): string {
  if (customPath) {
    return customPath;
  }

  // Default paths for different agent types
  const defaultPaths = {
    claude: 'claude',
    gemini: 'gemini',
    codex: 'codex',
  };

  return defaultPaths[agentType];
}

/**
 * Validate WebSocket URL format
 */
export function validateWebSocketUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'ws:' || parsedUrl.protocol === 'wss:';
  } catch {
    return false;
  }
}

/**
 * Create a configuration file template
 */
export function createConfigTemplate(): string {
  const template = {
    agentType: 'claude',
    serverUrl: 'ws://localhost:3001',
    authToken: 'your-auth-token-here',
    agentExecutablePath: '/path/to/your/agent/executable',
    maxRetries: 3,
    retryDelay: 1000,
    heartbeatInterval: 30000,
    logLevel: 'info',
  };

  return JSON.stringify(template, null, 2);
}