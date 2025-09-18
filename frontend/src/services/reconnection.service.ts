/**
 * Reconnection Service for WebSocket connections
 * Provides exponential backoff with jitter and circuit breaker pattern
 */

export interface ReconnectionConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

export interface ReconnectionState {
  isReconnecting: boolean;
  attemptCount: number;
  nextAttemptTime?: Date;
  lastError?: Error;
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime?: Date;
}

/**
 * Manages automatic reconnection with exponential backoff and jitter
 */
export class ReconnectionManager extends EventTarget {
  private config: ReconnectionConfig;
  private onReconnect: () => Promise<void>;
  private onReconnectFailed: (error: Error) => void;
  private onMaxAttemptsReached: () => void;

  private state: ReconnectionState = {
    isReconnecting: false,
    attemptCount: 0,
  };

  private reconnectTimer: number | null = null;
  private jitterFactor = 0.1; // 10% jitter

  constructor(
    config: ReconnectionConfig,
    onReconnect: () => Promise<void>,
    onReconnectFailed: (error: Error) => void,
    onMaxAttemptsReached: () => void
  ) {
    super();
    this.config = config;
    this.onReconnect = onReconnect;
    this.onReconnectFailed = onReconnectFailed;
    this.onMaxAttemptsReached = onMaxAttemptsReached;
  }

  /**
   * Start the reconnection process
   */
  startReconnection(): void {
    if (this.state.isReconnecting) {
      console.log('[ReconnectionManager] Reconnection already in progress');
      return;
    }

    console.log('[ReconnectionManager] Starting reconnection process');
    this.state.isReconnecting = true;
    this.state.attemptCount = 0;
    this.state.lastError = undefined;

    this.dispatchEvent(new CustomEvent('reconnection_started'));
    this.scheduleNextAttempt();
  }

  /**
   * Stop the reconnection process
   */
  stopReconnection(): void {
    if (!this.state.isReconnecting) {
      return;
    }

    console.log('[ReconnectionManager] Stopping reconnection process');
    this.clearReconnectTimer();
    this.state.isReconnecting = false;
    this.state.attemptCount = 0;
    this.state.nextAttemptTime = undefined;

    this.dispatchEvent(new CustomEvent('reconnection_stopped'));
  }

  /**
   * Reset the reconnection state after successful connection
   */
  reset(): void {
    this.stopReconnection();
    this.dispatchEvent(new CustomEvent('reconnection_reset'));
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
   * Get the delay for the next reconnection attempt with exponential backoff and jitter
   */
  private getNextDelay(): number {
    const { baseDelay, backoffMultiplier, maxDelay } = this.config;

    // Calculate exponential delay
    const exponentialDelay = baseDelay * Math.pow(backoffMultiplier, this.state.attemptCount);

    // Cap at maxDelay
    const cappedDelay = Math.min(exponentialDelay, maxDelay);

    // Add jitter to prevent thundering herd (±10% of delay)
    const jitter = cappedDelay * this.jitterFactor * (Math.random() * 2 - 1);

    // Ensure minimum delay of 1 second
    return Math.max(1000, Math.round(cappedDelay + jitter));
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
  }

  private scheduleNextAttempt(): void {
    if (!this.state.isReconnecting) {
      return;
    }

    // Check if we've exceeded max attempts
    if (this.state.attemptCount >= this.config.maxAttempts) {
      console.log(`[ReconnectionManager] Maximum attempts (${this.config.maxAttempts}) reached`);
      this.state.isReconnecting = false;
      this.dispatchEvent(new CustomEvent('max_attempts_reached'));
      this.onMaxAttemptsReached();
      return;
    }

    const delay = this.getNextDelay();
    this.state.nextAttemptTime = new Date(Date.now() + delay);

    console.log(`[ReconnectionManager] Scheduling attempt ${this.state.attemptCount + 1}/${this.config.maxAttempts} in ${delay}ms`);

    this.reconnectTimer = window.setTimeout(() => {
      this.attemptReconnection();
    }, delay);

    this.dispatchEvent(new CustomEvent('attempt_scheduled', {
      detail: {
        attemptNumber: this.state.attemptCount + 1,
        delay,
        nextAttemptTime: this.state.nextAttemptTime,
      }
    }));
  }

  private async attemptReconnection(): Promise<void> {
    if (!this.state.isReconnecting) {
      return;
    }

    this.state.attemptCount++;
    this.state.nextAttemptTime = undefined;

    console.log(`[ReconnectionManager] Reconnection attempt ${this.state.attemptCount}/${this.config.maxAttempts}`);

    this.dispatchEvent(new CustomEvent('attempt_started', {
      detail: {
        attemptNumber: this.state.attemptCount,
        maxAttempts: this.config.maxAttempts,
      }
    }));

    try {
      await this.onReconnect();

      // Successful reconnection
      console.log('[ReconnectionManager] Reconnection successful');
      this.state.isReconnecting = false;
      this.state.attemptCount = 0;
      this.state.lastError = undefined;

      this.dispatchEvent(new CustomEvent('reconnection_successful'));

    } catch (error) {
      const err = error as Error;
      console.error(`[ReconnectionManager] Attempt ${this.state.attemptCount} failed:`, err.message);

      this.state.lastError = err;
      this.dispatchEvent(new CustomEvent('attempt_failed', {
        detail: {
          attemptNumber: this.state.attemptCount,
          error: err,
        }
      }));

      this.onReconnectFailed(err);

      // Schedule next attempt if we haven't reached the limit
      if (this.state.attemptCount < this.config.maxAttempts) {
        this.scheduleNextAttempt();
      } else {
        this.state.isReconnecting = false;
        this.dispatchEvent(new CustomEvent('max_attempts_reached'));
        this.onMaxAttemptsReached();
      }
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/**
 * Circuit breaker for connection failures
 */
export class ConnectionCircuitBreaker extends EventTarget {
  private failureCount = 0;
  private lastFailureTime?: Date;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private resetTimer: number | null = null;

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
        // Check if recovery timeout has passed
        if (this.lastFailureTime && (now.getTime() - this.lastFailureTime.getTime()) > this.recoveryTimeoutMs) {
          this.transitionToHalfOpen();
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
    this.clearResetTimer();

    if (this.state !== 'closed') {
      this.transitionToClosed();
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
      this.transitionToOpen();
    } else if (this.failureCount >= this.failureThreshold && this.state === 'closed') {
      // Exceeded failure threshold, open the circuit
      this.transitionToOpen();
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
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
    this.clearResetTimer();
    this.transitionToClosed();
  }

  /**
   * Destroy the circuit breaker
   */
  destroy(): void {
    this.clearResetTimer();
  }

  private transitionToClosed(): void {
    const previousState = this.state;
    this.state = 'closed';
    console.log('[CircuitBreaker] State: CLOSED');

    if (previousState !== 'closed') {
      this.dispatchEvent(new CustomEvent('state_changed', {
        detail: { state: 'closed', previousState }
      }));
    }
  }

  private transitionToOpen(): void {
    const previousState = this.state;
    this.state = 'open';
    console.log(`[CircuitBreaker] State: OPEN (failures: ${this.failureCount})`);

    if (previousState !== 'open') {
      this.dispatchEvent(new CustomEvent('state_changed', {
        detail: { state: 'open', previousState }
      }));
    }

    // Set timer to transition to half-open
    this.setResetTimer();
  }

  private transitionToHalfOpen(): void {
    const previousState = this.state;
    this.state = 'half-open';
    console.log('[CircuitBreaker] State: HALF-OPEN (testing recovery)');

    if (previousState !== 'half-open') {
      this.dispatchEvent(new CustomEvent('state_changed', {
        detail: { state: 'half-open', previousState }
      }));
    }
  }

  private setResetTimer(): void {
    this.clearResetTimer();

    this.resetTimer = window.setTimeout(() => {
      if (this.state === 'open') {
        this.transitionToHalfOpen();
      }
    }, this.recoveryTimeoutMs);
  }

  private clearResetTimer(): void {
    if (this.resetTimer) {
      window.clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}

/**
 * Connection health monitor
 */
export class ConnectionHealthMonitor {
  private lastActivity: number = Date.now();
  private lastPing: number = Date.now();
  private lastPong: number = Date.now();
  private healthCheckTimer: number | null = null;
  private healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  constructor(
    private onUnhealthy: () => void,
    private healthCheckInterval = 5000,
    private unhealthyThreshold = 30000
  ) {}

  /**
   * Start health monitoring
   */
  start(): void {
    this.stop();

    this.healthCheckTimer = window.setInterval(() => {
      this.checkHealth();
    }, this.healthCheckInterval);
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.healthCheckTimer) {
      window.clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Record activity
   */
  recordActivity(): void {
    this.lastActivity = Date.now();
  }

  /**
   * Record ping sent
   */
  recordPing(): void {
    this.lastPing = Date.now();
  }

  /**
   * Record pong received
   */
  recordPong(): void {
    this.lastPong = Date.now();
    this.recordActivity();
  }

  /**
   * Get current health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastActivity: number;
    pingLatency: number;
  } {
    return {
      status: this.healthStatus,
      lastActivity: this.lastActivity,
      pingLatency: this.lastPong - this.lastPing,
    };
  }

  /**
   * Check connection health
   */
  private checkHealth(): void {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivity;
    const pingLatency = this.lastPong - this.lastPing;

    let newStatus: 'healthy' | 'degraded' | 'unhealthy';

    if (timeSinceLastActivity > this.unhealthyThreshold || pingLatency > 10000) {
      newStatus = 'unhealthy';
    } else if (timeSinceLastActivity > this.unhealthyThreshold / 2 || pingLatency > 5000) {
      newStatus = 'degraded';
    } else {
      newStatus = 'healthy';
    }

    if (newStatus !== this.healthStatus) {
      console.log(`[HealthMonitor] Status changed: ${this.healthStatus} -> ${newStatus}`);
      this.healthStatus = newStatus;

      if (newStatus === 'unhealthy') {
        this.onUnhealthy();
      }
    }
  }

  /**
   * Destroy the health monitor
   */
  destroy(): void {
    this.stop();
  }
}