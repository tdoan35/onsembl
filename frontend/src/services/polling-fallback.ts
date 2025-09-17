import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';

export interface PollingConfig {
  enabled?: boolean;
  interval?: number;
  maxInterval?: number;
  endpoints?: {
    status?: string;
    messages?: string;
    send?: string;
  };
  onMessage?: (message: WebSocketMessage) => void;
  onError?: (error: Error) => void;
}

export class PollingFallback {
  private config: Required<PollingConfig>;
  private pollingTimer?: NodeJS.Timeout;
  private isPolling = false;
  private lastMessageId?: string;
  private failureCount = 0;
  private currentInterval: number;

  constructor(config: PollingConfig = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      interval: config.interval ?? 2000,
      maxInterval: config.maxInterval ?? 30000,
      endpoints: {
        status: config.endpoints?.status ?? '/api/ws/status',
        messages: config.endpoints?.messages ?? '/api/ws/messages',
        send: config.endpoints?.send ?? '/api/ws/send'
      },
      onMessage: config.onMessage ?? (() => {}),
      onError: config.onError ?? (() => {})
    };
    this.currentInterval = this.config.interval;
  }

  /**
   * Start polling
   */
  start(): void {
    if (!this.config.enabled || this.isPolling) return;

    this.isPolling = true;
    this.poll();
  }

  /**
   * Stop polling
   */
  stop(): void {
    this.isPolling = false;
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = undefined;
    }
  }

  /**
   * Poll for messages
   */
  private async poll(): Promise<void> {
    if (!this.isPolling) return;

    try {
      const messages = await this.fetchMessages();

      if (messages && messages.length > 0) {
        messages.forEach(msg => this.config.onMessage(msg));
        this.failureCount = 0;
        this.currentInterval = this.config.interval;
      }
    } catch (error) {
      this.failureCount++;
      this.currentInterval = Math.min(
        this.currentInterval * 1.5,
        this.config.maxInterval
      );
      this.config.onError(error as Error);
    }

    // Schedule next poll
    if (this.isPolling) {
      this.pollingTimer = setTimeout(() => this.poll(), this.currentInterval);
    }
  }

  /**
   * Fetch messages from server
   */
  private async fetchMessages(): Promise<WebSocketMessage[]> {
    const params = new URLSearchParams();
    if (this.lastMessageId) {
      params.set('after', this.lastMessageId);
    }

    const response = await fetch(`${this.config.endpoints.messages}?${params}`, {
      headers: {
        'Authorization': `Bearer ${this.getToken()}`
      }
    });

    if (!response.ok) {
      throw new Error(`Polling failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.messages && data.messages.length > 0) {
      this.lastMessageId = data.messages[data.messages.length - 1].id;
    }

    return data.messages || [];
  }

  /**
   * Send message via polling
   */
  async sendMessage(message: WebSocketMessage): Promise<void> {
    const response = await fetch(this.config.endpoints.send, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`Send failed: ${response.statusText}`);
    }
  }

  /**
   * Check server status
   */
  async checkStatus(): Promise<boolean> {
    try {
      const response = await fetch(this.config.endpoints.status, {
        headers: {
          'Authorization': `Bearer ${this.getToken()}`
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get auth token
   */
  private getToken(): string {
    return localStorage.getItem('access_token') || '';
  }

  /**
   * Is currently polling
   */
  isActive(): boolean {
    return this.isPolling;
  }
}

// Export singleton instance
export const pollingFallback = new PollingFallback();