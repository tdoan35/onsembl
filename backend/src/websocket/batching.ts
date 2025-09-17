import { WebSocket } from 'ws';
import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';

export interface BatchConfig {
  enabled?: boolean;
  maxBatchSize?: number;
  batchInterval?: number;
  maxBatchBytes?: number;
  batchableTypes?: string[];
  priorityTypes?: string[];
}

interface BatchedMessage {
  type: 'batch';
  messages: WebSocketMessage[];
  count: number;
  timestamp: string;
}

interface MessageBuffer {
  messages: WebSocketMessage[];
  size: number;
  timer?: NodeJS.Timeout;
}

export class MessageBatcher {
  private config: Required<BatchConfig>;
  private buffers = new Map<WebSocket, MessageBuffer>();

  constructor(config: BatchConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      maxBatchSize: config.maxBatchSize ?? 100,
      batchInterval: config.batchInterval ?? 100, // 100ms
      maxBatchBytes: config.maxBatchBytes ?? 65536, // 64KB
      batchableTypes: config.batchableTypes ?? [
        'terminal:output',
        'agent:metrics',
        'log:entry'
      ],
      priorityTypes: config.priorityTypes ?? [
        'command:request',
        'command:interrupt',
        'system:emergency-stop',
        'auth:refresh-token'
      ]
    };
  }

  /**
   * Initialize batching for a connection
   */
  initConnection(socket: WebSocket): void {
    if (!this.config.enabled) return;

    this.buffers.set(socket, {
      messages: [],
      size: 0
    });

    socket.on('close', () => {
      this.cleanup(socket);
    });
  }

  /**
   * Add message to batch or send immediately
   */
  async addMessage(socket: WebSocket, message: WebSocketMessage): Promise<void> {
    if (!this.config.enabled || !this.isBatchable(message)) {
      // Send immediately
      this.sendSingle(socket, message);
      return;
    }

    const buffer = this.buffers.get(socket);
    if (!buffer) {
      this.sendSingle(socket, message);
      return;
    }

    // Check if this is a priority message that should flush the batch
    if (this.isPriority(message)) {
      await this.flush(socket);
      this.sendSingle(socket, message);
      return;
    }

    // Add to batch
    const messageSize = JSON.stringify(message).length;

    // Check if adding this message would exceed limits
    if (buffer.messages.length >= this.config.maxBatchSize ||
        buffer.size + messageSize > this.config.maxBatchBytes) {
      await this.flush(socket);
    }

    buffer.messages.push(message);
    buffer.size += messageSize;

    // Start or reset timer
    if (buffer.timer) {
      clearTimeout(buffer.timer);
    }

    buffer.timer = setTimeout(() => {
      this.flush(socket);
    }, this.config.batchInterval);

    // Flush if batch is full
    if (buffer.messages.length >= this.config.maxBatchSize) {
      await this.flush(socket);
    }
  }

  /**
   * Flush batch for a connection
   */
  async flush(socket: WebSocket): Promise<void> {
    const buffer = this.buffers.get(socket);
    if (!buffer || buffer.messages.length === 0) return;

    // Clear timer
    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = undefined;
    }

    // Create batched message
    const batch: BatchedMessage = {
      type: 'batch',
      messages: buffer.messages.slice(),
      count: buffer.messages.length,
      timestamp: new Date().toISOString()
    };

    // Send batch
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(batch));
    }

    // Clear buffer
    buffer.messages = [];
    buffer.size = 0;
  }

  /**
   * Send single message
   */
  private sendSingle(socket: WebSocket, message: WebSocketMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  /**
   * Check if message type is batchable
   */
  private isBatchable(message: WebSocketMessage): boolean {
    return this.config.batchableTypes.includes(message.type);
  }

  /**
   * Check if message is priority
   */
  private isPriority(message: WebSocketMessage): boolean {
    return this.config.priorityTypes.includes(message.type);
  }

  /**
   * Clean up connection resources
   */
  private cleanup(socket: WebSocket): void {
    const buffer = this.buffers.get(socket);
    if (buffer?.timer) {
      clearTimeout(buffer.timer);
    }
    this.buffers.delete(socket);
  }

  /**
   * Flush all connections
   */
  async flushAll(): Promise<void> {
    const promises = Array.from(this.buffers.keys()).map(socket =>
      this.flush(socket)
    );
    await Promise.all(promises);
  }

  /**
   * Get statistics
   */
  getStats(): {
    connections: number;
    totalMessages: number;
    totalBytes: number;
  } {
    let totalMessages = 0;
    let totalBytes = 0;

    for (const buffer of this.buffers.values()) {
      totalMessages += buffer.messages.length;
      totalBytes += buffer.size;
    }

    return {
      connections: this.buffers.size,
      totalMessages,
      totalBytes
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<BatchConfig>): void {
    Object.assign(this.config, config);
  }
}

// Export singleton instance
export const messageBatcher = new MessageBatcher();