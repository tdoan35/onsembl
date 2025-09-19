import { EventEmitter } from 'events';
import { Config } from './config.js';

export interface ReconnectionOptions {
  config: Config;
  onReconnect: () => Promise<void>;
  onReconnectFailed: (error: Error) => void;
  onMaxAttemptsReached: () => void;
}

export interface ReconnectionState {
  isReconnecting: boolean;
  attemptCount: number;
  nextAttemptTime?: Date;
  lastError?: Error;
}

/**
 * Manages automatic reconnection with exponential backoff
 */
export class ReconnectionManager extends EventEmitter {
  private config: Config;
  private onReconnect: () => Promise<void>;
  private onReconnectFailed: (error: Error) => void;
  private onMaxAttemptsReached: () => void;

  private state: ReconnectionState = {
    isReconnecting: false,
    attemptCount: 0,
  };

  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoffMultiplier = 2;
  private maxBackoffDelay = 30000; // 30 seconds
  private jitterFactor = 0.1; // 10% jitter

  constructor(options: ReconnectionOptions) {
    super();
    this.config = options.config;
    this.onReconnect = options.onReconnect;
    this.onReconnectFailed = options.onReconnectFailed;
    this.onMaxAttemptsReached = options.onMaxAttemptsReached;
  }

  /**
   * Start the reconnection process
   */
  startReconnection(): void {
    if (this.state.isReconnecting) {
      console.log('Reconnection already in progress');
      return;
    }

    console.log('Starting reconnection process');
    this.state.isReconnecting = true;
    this.state.attemptCount = 0;
    this.state.lastError = undefined;

    this.emit('reconnection_started');
    this.scheduleNextAttempt();
  }

  /**
   * Stop the reconnection process
   */
  stopReconnection(): void {
    if (!this.state.isReconnecting) {
      return;
    }

    console.log('Stopping reconnection process');
    this.clearReconnectTimer();
    this.state.isReconnecting = false;
    this.state.attemptCount = 0;
    this.state.nextAttemptTime = undefined;

    this.emit('reconnection_stopped');
  }

  /**
   * Reset the reconnection state after successful connection
   */
  reset(): void {
    this.stopReconnection();
    this.emit('reconnection_reset');
  }

  /**
   * Get current reconnection state
   */
  getState(): Readonly<ReconnectionState> {
    return { ...this.state };
  }

  /**
   * Check if currently reconnecting
   */
  get isReconnecting(): boolean {
    return this.state.isReconnecting;
  }

  /**
   * Get the delay for the next reconnection attempt
   */
  getNextDelay(): number {
    const baseDelay = this.config.reconnectBaseDelay;
    const exponentialDelay = baseDelay * Math.pow(this.backoffMultiplier, this.state.attemptCount);
    const cappedDelay = Math.min(exponentialDelay, this.maxBackoffDelay);

    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.jitterFactor * (Math.random() - 0.5);
    return Math.max(1000, cappedDelay + jitter); // Minimum 1 second
  }

  /**
   * Force an immediate reconnection attempt (bypassing timer)
   */
  forceReconnect(): void {
    if (!this.state.isReconnecting) {
      this.startReconnection();
      return;
    }

    this.clearReconnectTimer();
    this.attemptReconnection();
  }

  /**
   * Destroy the reconnection manager
   */
  destroy(): void {
    this.stopReconnection();
    this.removeAllListeners();
  }

  private scheduleNextAttempt(): void {
    if (!this.state.isReconnecting) {
      return;
    }

    // Check if we've exceeded max attempts
    if (this.state.attemptCount >= this.config.reconnectAttempts) {
      console.log(`Maximum reconnection attempts (${this.config.reconnectAttempts}) reached`);
      this.state.isReconnecting = false;
      this.emit('max_attempts_reached');
      this.onMaxAttemptsReached();
      return;
    }

    const delay = this.getNextDelay();
    this.state.nextAttemptTime = new Date(Date.now() + delay);

    console.log(`Scheduling reconnection attempt ${this.state.attemptCount + 1}/${this.config.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.attemptReconnection();
    }, delay);

    this.emit('attempt_scheduled', {
      attemptNumber: this.state.attemptCount + 1,
      delay,
      nextAttemptTime: this.state.nextAttemptTime,
    });
  }

  private async attemptReconnection(): Promise<void> {
    if (!this.state.isReconnecting) {
      return;
    }

    this.state.attemptCount++;
    this.state.nextAttemptTime = undefined;

    console.log(`Reconnection attempt ${this.state.attemptCount}/${this.config.reconnectAttempts}`);

    this.emit('attempt_started', {
      attemptNumber: this.state.attemptCount,
      maxAttempts: this.config.reconnectAttempts,
    });

    try {
      await this.onReconnect();

      // Successful reconnection
      console.log('Reconnection successful');
      this.state.isReconnecting = false;
      this.state.attemptCount = 0;
      this.state.lastError = undefined;

      this.emit('reconnection_successful');

    } catch (error) {
      const err = error as Error;
      console.error(`Reconnection attempt ${this.state.attemptCount} failed:`, err.message);

      this.state.lastError = err;
      this.emit('attempt_failed', {
        attemptNumber: this.state.attemptCount,
        error: err,
      });

      this.onReconnectFailed(err);

      // Schedule next attempt if we haven't reached the limit
      if (this.state.attemptCount < this.config.reconnectAttempts) {
        this.scheduleNextAttempt();
      } else {
        this.state.isReconnecting = false;
        this.emit('max_attempts_reached');
        this.onMaxAttemptsReached();
      }
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/**
 * Circuit breaker for connection failures
 */
export class ConnectionCircuitBreaker extends EventEmitter {
  private failureCount = 0;
  private lastFailureTime?: Date;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private failureThreshold = 5,
    private timeoutMs = 60000, // 1 minute
    private recoveryTimeoutMs = 30000 // 30 seconds
  ) {
    super();
  }

  /**
   * Check if the circuit breaker allows the operation
   */
  canAttempt(): boolean {
    const now = new Date();

    switch (this.state) {
      case 'closed':
        return true;

      case 'open':
        if (this.lastFailureTime && (now.getTime() - this.lastFailureTime.getTime()) > this.recoveryTimeoutMs) {
          this.state = 'half-open';
          this.emit('state_changed', 'half-open');
          return true;
        }
        return false;

      case 'half-open':
        return true;

      default:
        return false;
    }
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    this.failureCount = 0;
    this.lastFailureTime = undefined;

    if (this.state !== 'closed') {
      this.state = 'closed';
      this.emit('state_changed', 'closed');
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.state === 'half-open') {
      // Failed during half-open, go back to open
      this.state = 'open';
      this.emit('state_changed', 'open');
    } else if (this.failureCount >= this.failureThreshold && this.state === 'closed') {
      // Exceeded failure threshold, open the circuit
      this.state = 'open';
      this.emit('state_changed', 'open');
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    lastFailureTime?: Date;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = undefined;
    this.state = 'closed';
    this.emit('state_changed', 'closed');
  }
}