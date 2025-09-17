import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';

export interface LogForwarderConfig {
  enabled?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  batchSize?: number;
  flushInterval?: number;
  includeStackTraces?: boolean;
  filterPatterns?: RegExp[];
}

export class LogForwarder {
  private config: Required<LogForwarderConfig>;
  private originalConsole: {
    log: typeof console.log;
    debug: typeof console.debug;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
  };
  private logBuffer: Array<{
    level: string;
    message: string;
    timestamp: string;
    stack?: string;
    data?: any;
  }> = [];
  private flushTimer?: NodeJS.Timeout;
  private sendCallback?: (message: WebSocketMessage) => void;

  constructor(config: LogForwarderConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      logLevel: config.logLevel ?? 'info',
      batchSize: config.batchSize ?? 50,
      flushInterval: config.flushInterval ?? 5000,
      includeStackTraces: config.includeStackTraces ?? false,
      filterPatterns: config.filterPatterns ?? []
    };

    // Store original console methods
    this.originalConsole = {
      log: console.log,
      debug: console.debug,
      info: console.info,
      warn: console.warn,
      error: console.error
    };
  }

  /**
   * Start forwarding console logs
   */
  start(sendCallback: (message: WebSocketMessage) => void): void {
    if (!this.config.enabled) return;

    this.sendCallback = sendCallback;

    // Override console methods
    this.overrideConsole();

    // Start flush timer
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);

    // Flush on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flush();
      });
    }
  }

  /**
   * Stop forwarding console logs
   */
  stop(): void {
    // Restore original console methods
    this.restoreConsole();

    // Clear flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    // Flush any remaining logs
    this.flush();

    this.sendCallback = undefined;
  }

  /**
   * Override console methods
   */
  private overrideConsole(): void {
    const levels = ['log', 'debug', 'info', 'warn', 'error'] as const;

    levels.forEach(level => {
      console[level] = (...args: any[]) => {
        // Call original method
        this.originalConsole[level](...args);

        // Forward to backend if enabled
        if (this.shouldLog(level)) {
          this.captureLog(level, args);
        }
      };
    });

    // Capture unhandled errors
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.captureError(event.error || new Error(event.message), {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        this.captureError(
          new Error(`Unhandled Promise Rejection: ${event.reason}`),
          { promise: true }
        );
      });
    }
  }

  /**
   * Restore original console methods
   */
  private restoreConsole(): void {
    console.log = this.originalConsole.log;
    console.debug = this.originalConsole.debug;
    console.info = this.originalConsole.info;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
  }

  /**
   * Check if log level should be forwarded
   */
  private shouldLog(level: string): boolean {
    const levels = { debug: 0, log: 1, info: 2, warn: 3, error: 4 };
    const configLevel = levels[this.config.logLevel] || 2;
    const messageLevel = levels[level] || 1;
    return messageLevel >= configLevel;
  }

  /**
   * Capture a log entry
   */
  private captureLog(level: string, args: any[]): void {
    // Format message
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    // Check filter patterns
    if (this.config.filterPatterns.some(pattern => pattern.test(message))) {
      return; // Skip filtered messages
    }

    // Create log entry
    const entry = {
      level,
      message: message.substring(0, 5000), // Limit message size
      timestamp: new Date().toISOString(),
      stack: this.config.includeStackTraces ? this.getStackTrace() : undefined,
      data: undefined as any
    };

    // Add to buffer
    this.logBuffer.push(entry);

    // Flush if buffer is full
    if (this.logBuffer.length >= this.config.batchSize) {
      this.flush();
    }
  }

  /**
   * Capture an error
   */
  private captureError(error: Error, context?: any): void {
    const entry = {
      level: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
      stack: error.stack,
      data: {
        name: error.name,
        context
      }
    };

    this.logBuffer.push(entry);

    // Immediately flush errors
    this.flush();
  }

  /**
   * Get current stack trace
   */
  private getStackTrace(): string | undefined {
    const err = new Error();
    const stack = err.stack?.split('\n');
    
    // Remove first 4 lines (Error message and log forwarder frames)
    return stack?.slice(4).join('\n');
  }

  /**
   * Flush log buffer to backend
   */
  private flush(): void {
    if (this.logBuffer.length === 0 || !this.sendCallback) {
      return;
    }

    // Create batch message
    const message: WebSocketMessage = {
      type: 'frontend:logs',
      logs: this.logBuffer.slice(), // Copy buffer
      timestamp: new Date().toISOString()
    } as any;

    // Send to backend
    try {
      this.sendCallback(message);
    } catch (error) {
      // Use original console to avoid infinite loop
      this.originalConsole.error('Failed to forward logs:', error);
    }

    // Clear buffer
    this.logBuffer = [];
  }

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.logBuffer.length;
  }

  /**
   * Manually log a message
   */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    if (this.shouldLog(level)) {
      this.logBuffer.push({
        level,
        message,
        timestamp: new Date().toISOString(),
        data
      });

      if (this.logBuffer.length >= this.config.batchSize) {
        this.flush();
      }
    }
  }
}

// Export singleton instance
export const logForwarder = new LogForwarder();
