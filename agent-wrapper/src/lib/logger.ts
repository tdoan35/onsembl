import { pino } from 'pino';
import type { Logger } from 'pino';

// Logger configuration
interface LoggerConfig {
  level?: string;
  name?: string;
  prettyPrint?: boolean;
}

/**
 * Create a configured Pino logger instance
 */
function createLogger(config: LoggerConfig = {}): Logger {
  const {
    level = process.env.ONSEMBL_LOG_LEVEL || 'info',
    name = 'onsembl-agent',
    prettyPrint = process.env.NODE_ENV !== 'production',
  } = config;

  const baseOptions = {
    name,
    level,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      pid: process.pid,
      hostname: process.env.HOSTNAME || 'localhost',
    },
    serializers: {
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
  };

  if (prettyPrint) {
    return pino({
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          messageFormat: '{name}[{pid}]: {msg}',
        },
      },
    });
  }

  return pino(baseOptions);
}

// Default logger instance
export const logger = createLogger();

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: Record<string, any>): Logger {
  return logger.child(context);
}

/**
 * Configure logger with new settings
 */
export function configureLogger(config: LoggerConfig): Logger {
  const newLogger = createLogger(config);
  // Update the default logger reference
  Object.setPrototypeOf(logger, Object.getPrototypeOf(newLogger));
  Object.assign(logger, newLogger);
  return logger;
}

/**
 * Log levels enum for type safety
 */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

/**
 * Helper functions for structured logging
 */
export const logHelpers = {
  /**
   * Log agent connection events
   */
  agentConnection: (action: string, agentId: string, metadata?: Record<string, any>) => {
    logger.info(`Agent ${action}`, {
      agentId,
      action,
      ...metadata,
    });
  },

  /**
   * Log command execution events
   */
  commandExecution: (command: string, status: 'started' | 'completed' | 'failed', metadata?: Record<string, any>) => {
    const logLevel = status === 'failed' ? 'error' : 'info';
    logger[logLevel](`Command ${status}`, {
      command,
      status,
      ...metadata,
    });
  },

  /**
   * Log WebSocket events
   */
  websocketEvent: (event: string, metadata?: Record<string, any>) => {
    logger.debug(`WebSocket ${event}`, {
      event,
      ...metadata,
    });
  },

  /**
   * Log performance metrics
   */
  performance: (operation: string, duration: number, metadata?: Record<string, any>) => {
    logger.info(`Performance: ${operation}`, {
      operation,
      duration,
      unit: 'ms',
      ...metadata,
    });
  },

  /**
   * Log error with context
   */
  errorWithContext: (error: Error, context: Record<string, any>) => {
    logger.error('Error occurred', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...context,
    });
  },
};

/**
 * Request ID middleware for tracing
 */
export function withRequestId<T extends (...args: any[]) => any>(
  fn: T,
  requestId: string
): T {
  const childLogger = logger.child({ requestId });

  return ((...args: Parameters<T>) => {
    // Replace logger in the function context
    const originalLogger = (global as any).logger;
    (global as any).logger = childLogger;

    try {
      return fn(...args);
    } finally {
      (global as any).logger = originalLogger;
    }
  }) as T;
}