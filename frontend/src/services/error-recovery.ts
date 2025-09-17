import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';

export interface ErrorRecoveryConfig {
  maxRetries?: number;
  retryDelay?: number;
  backoffFactor?: number;
  maxBackoff?: number;
  recoveryStrategies?: ErrorRecoveryStrategy[];
  onRecoveryStart?: () => void;
  onRecoverySuccess?: () => void;
  onRecoveryFailed?: (error: Error) => void;
}

export interface ErrorRecoveryStrategy {
  name: string;
  canRecover: (error: Error) => boolean;
  recover: () => Promise<void>;
  priority?: number;
}

export interface RecoveryState {
  isRecovering: boolean;
  attempts: number;
  lastError?: Error;
  lastAttempt?: Date;
  strategy?: string;
}

export class ErrorRecoveryService {
  private config: Required<ErrorRecoveryConfig>;
  private state: RecoveryState;
  private strategies: ErrorRecoveryStrategy[];
  private reconnectCallback?: () => Promise<void>;
  private messageQueue: WebSocketMessage[] = [];
  private recoveryTimer?: NodeJS.Timeout;

  constructor(config: ErrorRecoveryConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 5,
      retryDelay: config.retryDelay ?? 1000,
      backoffFactor: config.backoffFactor ?? 2,
      maxBackoff: config.maxBackoff ?? 30000,
      recoveryStrategies: config.recoveryStrategies ?? [],
      onRecoveryStart: config.onRecoveryStart ?? (() => {}),
      onRecoverySuccess: config.onRecoverySuccess ?? (() => {}),
      onRecoveryFailed: config.onRecoveryFailed ?? (() => {})
    };

    this.state = {
      isRecovering: false,
      attempts: 0
    };

    // Initialize default strategies
    this.strategies = [
      ...this.getDefaultStrategies(),
      ...this.config.recoveryStrategies
    ].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Get default recovery strategies
   */
  private getDefaultStrategies(): ErrorRecoveryStrategy[] {
    return [
      {
        name: 'network-reconnect',
        priority: 100,
        canRecover: (error) => {
          return error.message.includes('network') ||
                 error.message.includes('connection') ||
                 error.message.includes('ECONNREFUSED');
        },
        recover: async () => {
          // Wait for network to stabilize
          await this.waitForNetwork();

          // Attempt reconnection
          if (this.reconnectCallback) {
            await this.reconnectCallback();
          }
        }
      },
      {
        name: 'token-refresh',
        priority: 90,
        canRecover: (error) => {
          return error.message.includes('401') ||
                 error.message.includes('unauthorized') ||
                 error.message.includes('token');
        },
        recover: async () => {
          // Refresh authentication token
          await this.refreshToken();

          // Reconnect with new token
          if (this.reconnectCallback) {
            await this.reconnectCallback();
          }
        }
      },
      {
        name: 'rate-limit-backoff',
        priority: 80,
        canRecover: (error) => {
          return error.message.includes('rate limit') ||
                 error.message.includes('429') ||
                 error.message.includes('too many');
        },
        recover: async () => {
          // Wait for rate limit to reset
          const backoffTime = this.calculateBackoff(this.state.attempts, 5000);
          await this.delay(backoffTime);

          // Reconnect with reduced rate
          if (this.reconnectCallback) {
            await this.reconnectCallback();
          }
        }
      },
      {
        name: 'clear-cache',
        priority: 50,
        canRecover: (error) => {
          return error.message.includes('cache') ||
                 error.message.includes('storage') ||
                 error.message.includes('quota');
        },
        recover: async () => {
          // Clear local storage cache
          this.clearCache();

          // Reconnect with fresh state
          if (this.reconnectCallback) {
            await this.reconnectCallback();
          }
        }
      }
    ];
  }

  /**
   * Set reconnection callback
   */
  setReconnectCallback(callback: () => Promise<void>): void {
    this.reconnectCallback = callback;
  }

  /**
   * Handle connection error
   */
  async handleError(error: Error): Promise<boolean> {
    if (this.state.isRecovering) {
      console.warn('Already recovering from error');
      return false;
    }

    this.state.lastError = error;
    this.state.lastAttempt = new Date();

    // Find applicable recovery strategy
    const strategy = this.strategies.find(s => s.canRecover(error));

    if (!strategy) {
      console.error('No recovery strategy for error:', error);
      this.config.onRecoveryFailed(error);
      return false;
    }

    return this.executeRecovery(strategy);
  }

  /**
   * Execute recovery strategy
   */
  private async executeRecovery(strategy: ErrorRecoveryStrategy): Promise<boolean> {
    this.state.isRecovering = true;
    this.state.strategy = strategy.name;
    this.config.onRecoveryStart();

    try {
      console.info(`Executing recovery strategy: ${strategy.name}`);

      while (this.state.attempts < this.config.maxRetries) {
        this.state.attempts++;

        try {
          await strategy.recover();

          // Recovery successful
          this.state.isRecovering = false;
          this.state.attempts = 0;
          this.config.onRecoverySuccess();

          // Replay queued messages
          await this.replayQueuedMessages();

          return true;
        } catch (recoveryError) {
          console.warn(`Recovery attempt ${this.state.attempts} failed:`, recoveryError);

          if (this.state.attempts >= this.config.maxRetries) {
            break;
          }

          // Wait before next attempt
          const delay = this.calculateBackoff(this.state.attempts);
          await this.delay(delay);
        }
      }

      // Recovery failed
      this.state.isRecovering = false;
      const failureError = new Error(`Recovery failed after ${this.state.attempts} attempts`);
      this.config.onRecoveryFailed(failureError);
      return false;

    } catch (error) {
      this.state.isRecovering = false;
      this.config.onRecoveryFailed(error as Error);
      return false;
    }
  }

  /**
   * Queue message for replay after recovery
   */
  queueMessage(message: WebSocketMessage): void {
    // Don't queue heartbeats or system messages
    const skipTypes = ['heartbeat:ping', 'heartbeat:pong', 'connection:error'];

    if (!skipTypes.includes(message.type)) {
      this.messageQueue.push(message);

      // Limit queue size
      if (this.messageQueue.length > 100) {
        this.messageQueue.shift();
      }
    }
  }

  /**
   * Replay queued messages after recovery
   */
  private async replayQueuedMessages(): Promise<void> {
    if (this.messageQueue.length === 0) return;

    console.info(`Replaying ${this.messageQueue.length} queued messages`);

    // TODO: Send queued messages through WebSocket
    // This would need to be implemented with the WebSocket service

    this.messageQueue = [];
  }

  /**
   * Wait for network connectivity
   */
  private async waitForNetwork(): Promise<void> {
    if (typeof window === 'undefined') return;

    return new Promise((resolve) => {
      if (navigator.onLine) {
        resolve();
        return;
      }

      const handleOnline = () => {
        window.removeEventListener('online', handleOnline);
        resolve();
      };

      window.addEventListener('online', handleOnline);

      // Timeout after 30 seconds
      setTimeout(() => {
        window.removeEventListener('online', handleOnline);
        resolve();
      }, 30000);
    });
  }

  /**
   * Refresh authentication token
   */
  private async refreshToken(): Promise<void> {
    // In production, this would call your auth service
    const refreshToken = localStorage.getItem('refresh_token');

    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const { access_token, refresh_token: newRefreshToken } = await response.json();

      // Store new tokens
      localStorage.setItem('access_token', access_token);
      if (newRefreshToken) {
        localStorage.setItem('refresh_token', newRefreshToken);
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      throw error;
    }
  }

  /**
   * Clear cache
   */
  private clearCache(): void {
    if (typeof window === 'undefined') return;

    // Clear specific cache keys, not everything
    const cacheKeys = ['ws_messages', 'ws_state', 'agent_cache'];

    cacheKeys.forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    // Clear IndexedDB if used
    if ('indexedDB' in window) {
      indexedDB.deleteDatabase('websocket_cache');
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(attempt: number, baseDelay?: number): number {
    const base = baseDelay ?? this.config.retryDelay;
    const delay = Math.min(
      base * Math.pow(this.config.backoffFactor, attempt - 1),
      this.config.maxBackoff
    );

    // Add jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    return Math.floor(delay + jitter);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current recovery state
   */
  getState(): RecoveryState {
    return { ...this.state };
  }

  /**
   * Reset recovery state
   */
  reset(): void {
    this.state = {
      isRecovering: false,
      attempts: 0
    };
    this.messageQueue = [];

    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = undefined;
    }
  }

  /**
   * Add custom recovery strategy
   */
  addStrategy(strategy: ErrorRecoveryStrategy): void {
    this.strategies.push(strategy);
    this.strategies.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Remove recovery strategy
   */
  removeStrategy(name: string): void {
    this.strategies = this.strategies.filter(s => s.name !== name);
  }
}

// Export singleton instance
export const errorRecovery = new ErrorRecoveryService();