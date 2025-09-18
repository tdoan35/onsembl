import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type {
  WebSocketMessage,
  DashboardMessage,
  AgentMessage,
  ConnectionType
} from '@onsembl/agent-protocol';

export interface WebSocketClientOptions {
  url: string;
  connectionType: ConnectionType;
  connectionId?: string;
  agentId?: string;
  authToken?: string;
  metadata?: Record<string, any>;
}

export class WebSocketTestClient {
  private ws: WebSocket | null = null;
  private messages: WebSocketMessage[] = [];
  private messageHandlers: Map<string, (msg: WebSocketMessage) => void> = new Map();
  public connectionId: string;
  public agentId?: string;

  constructor(private options: WebSocketClientOptions) {
    this.connectionId = options.connectionId || uuidv4();
    this.agentId = options.agentId;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        'x-connection-type': this.options.connectionType,
        'x-connection-id': this.connectionId,
      };

      if (this.options.authToken) {
        headers['authorization'] = `Bearer ${this.options.authToken}`;
      }

      if (this.options.agentId) {
        headers['x-agent-id'] = this.options.agentId;
      }

      this.ws = new WebSocket(this.options.url, { headers });

      this.ws.on('open', () => {
        this.setupMessageHandler();
        resolve();
      });

      this.ws.on('error', (error) => {
        reject(error);
      });

      this.ws.on('close', () => {
        this.ws = null;
      });

      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });
  }

  private setupMessageHandler(): void {
    if (!this.ws) return;

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        this.messages.push(message);

        // Call registered handlers
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
          handler(message);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    });
  }

  sendMessage(message: Partial<WebSocketMessage>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const fullMessage: WebSocketMessage = {
      id: message.id || uuidv4(),
      timestamp: message.timestamp || Date.now(),
      type: message.type || 'UNKNOWN',
      connectionId: this.connectionId,
      ...message,
    } as WebSocketMessage;

    this.ws.send(JSON.stringify(fullMessage));
  }

  sendDashboardMessage(message: Partial<DashboardMessage>): void {
    this.sendMessage({
      ...message,
      connectionId: this.connectionId,
    });
  }

  sendAgentMessage(message: Partial<AgentMessage>): void {
    if (!this.agentId) {
      throw new Error('Agent ID is required for agent messages');
    }

    this.sendMessage({
      ...message,
      agentId: this.agentId,
      connectionId: this.connectionId,
    });
  }

  async waitForMessage(
    predicate: (message: WebSocketMessage) => boolean,
    timeout = 5000
  ): Promise<WebSocketMessage> {
    // Check existing messages first
    const existing = this.messages.find(predicate);
    if (existing) return existing;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for message'));
      }, timeout);

      const checkMessage = (msg: WebSocketMessage) => {
        if (predicate(msg)) {
          clearTimeout(timer);
          resolve(msg);
        }
      };

      // Register temporary handler
      const handlerId = uuidv4();
      this.messageHandlers.set(handlerId, checkMessage);

      // Clean up on resolution
      const cleanup = () => {
        this.messageHandlers.delete(handlerId);
      };

      setTimeout(cleanup, timeout + 100);
    });
  }

  async waitForMessageType(type: string, timeout = 5000): Promise<WebSocketMessage> {
    return this.waitForMessage(msg => msg.type === type, timeout);
  }

  async collectMessages(count: number, timeout = 5000): Promise<WebSocketMessage[]> {
    const startLength = this.messages.length;
    const deadline = Date.now() + timeout;

    while (this.messages.length < startLength + count) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`Timeout collecting messages. Got ${this.messages.length - startLength}/${count}`);
      }

      // Wait a bit for more messages
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    return this.messages.slice(startLength, startLength + count);
  }

  getMessages(): WebSocketMessage[] {
    return [...this.messages];
  }

  clearMessages(): void {
    this.messages = [];
  }

  onMessage(type: string, handler: (msg: WebSocketMessage) => void): void {
    this.messageHandlers.set(type, handler);
  }

  async disconnect(): Promise<void> {
    if (!this.ws) return;

    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }

      this.ws.on('close', () => {
        this.ws = null;
        resolve();
      });

      this.ws.close();

      // Force close after 1 second
      setTimeout(() => {
        if (this.ws) {
          this.ws.terminate();
          this.ws = null;
        }
        resolve();
      }, 1000);
    });
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Helper functions for quick setup
export async function createDashboardClient(
  url: string,
  authToken?: string,
  connectionId?: string
): Promise<WebSocketTestClient> {
  const client = new WebSocketTestClient({
    url,
    connectionType: 'dashboard',
    authToken,
    connectionId,
  });
  await client.connect();
  return client;
}

export async function createAgentClient(
  url: string,
  agentId: string,
  authToken?: string,
  connectionId?: string
): Promise<WebSocketTestClient> {
  const client = new WebSocketTestClient({
    url,
    connectionType: 'agent',
    agentId,
    authToken,
    connectionId,
  });
  await client.connect();
  return client;
}