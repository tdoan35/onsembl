import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export const config = {
  // Server
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,

  // Redis/Upstash
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'supersecret-change-in-production',

  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],

  // WebSocket
  wsMaxPayload: 1048576, // 1MB
  wsMaxConnections: parseInt(process.env.WS_MAX_CONNECTIONS || '100', 10),
  wsHeartbeatInterval: 30000, // 30 seconds
  wsHeartbeatTimeout: 90000, // 90 seconds

  // Command Queue
  queueConcurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
  queueMaxRetries: parseInt(process.env.QUEUE_MAX_RETRIES || '3', 10),

  // Rate Limiting
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes

  // Validation
  validate() {
    const required = [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ];

    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate Supabase URL format
    try {
      new URL(this.supabaseUrl);
    } catch {
      throw new Error('Invalid SUPABASE_URL format');
    }

    return true;
  },
};

// Validate configuration on startup
if (process.env.NODE_ENV !== 'test') {
  try {
    config.validate();
  } catch (error) {
    console.error('Configuration validation failed:', error);
    process.exit(1);
  }
}