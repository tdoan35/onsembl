/**
 * Configuration management for Onsembl.ai Backend
 * Handles environment variables with type safety and defaults
 */

import { z } from 'zod';

// Configuration schema with validation
const configSchema = z.object({
  // Server configuration
  port: z.coerce.number().default(3001),
  host: z.string().default('localhost'),

  // Environment
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Logging
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // CORS
  corsOrigin: z.string().or(z.array(z.string())).default('*'),

  // Database (Supabase)
  supabaseUrl: z.string().optional(),
  supabaseAnonKey: z.string().optional(),
  supabaseServiceKey: z.string().optional(),

  // Redis (Upstash)
  redisUrl: z.string().optional(),

  // JWT
  jwtSecret: z.string().optional(),

  // WebSocket
  wsPath: z.string().default('/ws'),
  wsMaxConnections: z.coerce.number().default(100),
  wsMaxPayload: z.coerce.number().default(1024 * 1024), // 1MB

  // Agent configuration
  maxConcurrentAgents: z.coerce.number().default(10),
  commandTimeoutMs: z.coerce.number().default(300000), // 5 minutes
});

export type Config = z.infer<typeof configSchema>;

/**
 * Load and validate configuration from environment variables
 */
function loadConfig(): Config {
  const env = {
    // Server
    port: process.env.PORT,
    host: process.env.HOST,

    // Environment
    nodeEnv: process.env.NODE_ENV,

    // Logging
    logLevel: process.env.LOG_LEVEL,

    // CORS
    corsOrigin: process.env.CORS_ORIGIN,

    // Database
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,

    // Redis
    redisUrl: process.env.REDIS_URL,

    // JWT
    jwtSecret: process.env.JWT_SECRET,

    // WebSocket
    wsPath: process.env.WS_PATH,
    wsMaxConnections: process.env.WS_MAX_CONNECTIONS,
    wsMaxPayload: process.env.WS_MAX_PAYLOAD,

    // Agent configuration
    maxConcurrentAgents: process.env.MAX_CONCURRENT_AGENTS,
    commandTimeoutMs: process.env.COMMAND_TIMEOUT_MS,
  };

  try {
    return configSchema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const invalidFields = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      throw new Error(`Invalid configuration:\n${invalidFields.join('\n')}`);
    }
    throw error;
  }
}

// Export singleton config instance
export const config = loadConfig();

// Export for testing
export { configSchema };