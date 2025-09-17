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

  // API URLs
  API_URL: z.string().optional(),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // Database (Supabase) - optional in development
  SUPABASE_URL: z.string().default('http://localhost:54321'),
  SUPABASE_ANON_KEY: z.string().default('mock-anon-key'),
  SUPABASE_SERVICE_KEY: z.string().optional().default('mock-service-key'),

  // Redis (Upstash)
  REDIS_URL: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().default('supersecretkey'),
  JWT_EXPIRES_IN: z.string().default('24h'),

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
    port: process.env['BACKEND_PORT'] || process.env['PORT'],
    host: process.env['BACKEND_HOST'] || process.env['HOST'],

    // Environment
    nodeEnv: process.env['NODE_ENV'],

    // Logging
    logLevel: process.env['LOG_LEVEL'],

    // CORS
    corsOrigin: process.env['CORS_ORIGIN'],

    // API URLs
    API_URL: process.env['API_URL'],
    FRONTEND_URL: process.env['FRONTEND_URL'],

    // Database
    SUPABASE_URL: process.env['SUPABASE_URL'],
    SUPABASE_ANON_KEY: process.env['SUPABASE_ANON_KEY'],
    SUPABASE_SERVICE_KEY: process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_SERVICE_KEY'],

    // Redis
    REDIS_URL: process.env['REDIS_URL'],

    // JWT
    JWT_SECRET: process.env['JWT_SECRET'],
    JWT_EXPIRES_IN: process.env['JWT_EXPIRES_IN'],

    // WebSocket
    wsPath: process.env['WS_PATH'],
    wsMaxConnections: process.env['WS_MAX_CONNECTIONS'],
    wsMaxPayload: process.env['WS_MAX_PAYLOAD'],

    // Agent configuration
    maxConcurrentAgents: process.env['MAX_CONCURRENT_AGENTS'],
    commandTimeoutMs: process.env['COMMAND_TIMEOUT_MS'],
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