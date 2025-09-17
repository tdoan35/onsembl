import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';

export interface RetryConfig {
  maxRetries?: number;
  retryDelay?: number;
  retryBackoff?: number;
  maxRetryDelay?: number;
  retryableTypes?: string[];
  nonRetryableTypes?: string[];
  onRetry?: (message: WebSocketMessage, attempt: number) => void;
  onFailure?: (message: WebSocketMessage, error: Error) => void;
}

export interface QueuedMessage {
  id: string;
  message: WebSocketMessage;
  attempts: number;
  maxRetries: number;
  nextRetry: number;
  createdAt: number;
  lastAttempt?: number;
  error?: Error;
  status: 'pending' | 'retrying' | 'failed' | 'sent';
}

export class MessageRetryService {
  private config: Required<RetryConfig>;
  private queue: Map<string, QueuedMessage> = new Map();
  private sendCallback?: (message: WebSocketMessage) => Promise<void>;
  private retryTimer?: NodeJS.Timeout;
  private isProcessing = false;
  private messageCounter = 0;

  constructor(config: RetryConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      retryBackoff: config.retryBackoff ?? 2,
      maxRetryDelay: config.maxRetryDelay ?? 30000,
      retryableTypes: config.retryableTypes ?? [
        'command:request',
        'command:interrupt',
        'agent:control',
        'dashboard:connect'
      ],
      nonRetryableTypes: config.nonRetryableTypes ?? [
        'heartbeat:ping',
        'heartbeat:pong',
        'auth:refresh-token'
      ],
      onRetry: config.onRetry ?? (() => {}),
      onFailure: config.onFailure ?? (() => {})
    };

    // Start retry processor
    this.startRetryProcessor();
  }

  /**
   * Set send callback
   */
  setSendCallback(callback: (message: WebSocketMessage) => Promise<void>): void {
    this.sendCallback = callback;
  }

  /**
   * Send message with retry support
   */
  async sendWithRetry(message: WebSocketMessage): Promise<string> {
    const messageId = this.generateMessageId();

    // Check if message type is retryable
    if (!this.isRetryable(message)) {
      // Send immediately without retry
      if (this.sendCallback) {
        await this.sendCallback(message);
      }
      return messageId;
    }

    // Create queued message
    const queuedMessage: QueuedMessage = {
      id: messageId,
      message,
      attempts: 0,
      maxRetries: this.config.maxRetries,
      nextRetry: Date.now(),
      createdAt: Date.now(),
      status: 'pending'
    };

    this.queue.set(messageId, queuedMessage);

    // Try to send immediately
    await this.attemptSend(queuedMessage);

    return messageId;
  }

  /**
   * Attempt to send a message
   */
  private async attemptSend(queuedMessage: QueuedMessage): Promise<void> {
    if (!this.sendCallback) {
      // No send callback configured
      return;
    }

    queuedMessage.attempts++;
    queuedMessage.lastAttempt = Date.now();
    queuedMessage.status = queuedMessage.attempts > 1 ? 'retrying' : 'pending';

    try {
      await this.sendCallback(queuedMessage.message);

      // Success - remove from queue
      queuedMessage.status = 'sent';
      this.queue.delete(queuedMessage.id);

    } catch (error) {
      queuedMessage.error = error as Error;

      if (queuedMessage.attempts >= queuedMessage.maxRetries) {
        // Max retries reached
        queuedMessage.status = 'failed';
        this.handleFailure(queuedMessage);
        this.queue.delete(queuedMessage.id);
      } else {
        // Schedule retry
        const delay = this.calculateRetryDelay(queuedMessage.attempts);
        queuedMessage.nextRetry = Date.now() + delay;
        queuedMessage.status = 'retrying';

        // Call retry callback
        this.config.onRetry(queuedMessage.message, queuedMessage.attempts);
      }
    }
  }

  /**
   * Start retry processor
   */
  private startRetryProcessor(): void {
    this.retryTimer = setInterval(() => {
      this.processRetryQueue();
    }, 500); // Check every 500ms
  }

  /**
   * Stop retry processor
   */
  stop(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  /**
   * Process retry queue
   */
  private async processRetryQueue(): Promise<void> {
    if (this.isProcessing || this.queue.size === 0) {
      return;
    }

    this.isProcessing = true;
    const now = Date.now();

    for (const [id, queuedMessage] of this.queue.entries()) {
      if (queuedMessage.status === 'retrying' && queuedMessage.nextRetry <= now) {
        await this.attemptSend(queuedMessage);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Check if message type is retryable
   */
  private isRetryable(message: WebSocketMessage): boolean {
    if (this.config.nonRetryableTypes.includes(message.type)) {
      return false;
    }

    if (this.config.retryableTypes.length > 0) {
      return this.config.retryableTypes.includes(message.type);
    }

    return true;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.config.retryDelay;
    const backoff = this.config.retryBackoff;
    const delay = Math.min(
      baseDelay * Math.pow(backoff, attempt - 1),
      this.config.maxRetryDelay
    );

    // Add jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    return Math.floor(delay + jitter);
  }

  /**
   * Handle message failure
   */
  private handleFailure(queuedMessage: QueuedMessage): void {
    const error = queuedMessage.error ||
                  new Error(`Message failed after ${queuedMessage.attempts} attempts`);

    this.config.onFailure(queuedMessage.message, error);

    // Store failed message for potential manual retry
    this.storeFailedMessage(queuedMessage);
  }

  /**
   * Store failed message
   */
  private storeFailedMessage(queuedMessage: QueuedMessage): void {
    if (typeof window === 'undefined') return;

    const failedMessages = this.getFailedMessages();
    failedMessages.push({
      id: queuedMessage.id,
      message: queuedMessage.message,
      attempts: queuedMessage.attempts,
      error: queuedMessage.error?.message,
      timestamp: Date.now()
    });

    // Keep only last 100 failed messages
    if (failedMessages.length > 100) {
      failedMessages.shift();
    }

    localStorage.setItem('ws_failed_messages', JSON.stringify(failedMessages));
  }

  /**
   * Get failed messages from storage
   */
  getFailedMessages(): any[] {
    if (typeof window === 'undefined') return [];

    try {
      const stored = localStorage.getItem('ws_failed_messages');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * Retry failed message manually
   */
  async retryFailedMessage(messageId: string): Promise<void> {
    const failedMessages = this.getFailedMessages();
    const failed = failedMessages.find(m => m.id === messageId);

    if (!failed) {
      throw new Error('Failed message not found');
    }

    await this.sendWithRetry(failed.message);

    // Remove from failed messages
    const updated = failedMessages.filter(m => m.id !== messageId);
    localStorage.setItem('ws_failed_messages', JSON.stringify(updated));
  }

  /**
   * Clear failed messages
   */
  clearFailedMessages(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ws_failed_messages');
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${++this.messageCounter}`;
  }

  /**
   * Get retry queue status
   */
  getQueueStatus(): {
    pending: number;
    retrying: number;
    failed: number;
    messages: QueuedMessage[];
  } {
    const messages = Array.from(this.queue.values());

    return {
      pending: messages.filter(m => m.status === 'pending').length,
      retrying: messages.filter(m => m.status === 'retrying').length,
      failed: messages.filter(m => m.status === 'failed').length,
      messages
    };
  }

  /**
   * Cancel message retry
   */
  cancelRetry(messageId: string): boolean {
    return this.queue.delete(messageId);
  }

  /**
   * Cancel all retries
   */
  cancelAll(): void {
    this.queue.clear();
  }

  /**
   * Force retry of a queued message
   */
  forceRetry(messageId: string): void {
    const queuedMessage = this.queue.get(messageId);
    if (queuedMessage) {
      queuedMessage.nextRetry = Date.now();
    }
  }

  /**
   * Update retry configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    Object.assign(this.config, config);
  }
}

// Export singleton instance
export const messageRetry = new MessageRetryService();