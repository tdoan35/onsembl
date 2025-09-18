import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { Config } from './config.js';
import { MessageType, WebSocketMessage, TerminalOutputPayload } from '@onsembl/agent-protocol';

// Message types for WebSocket communication
export interface AgentStatusMessage {
  type: 'agent_status';
  agentId: string;
  status: 'starting' | 'ready' | 'busy' | 'error' | 'stopping';
  metadata?: {
    version?: string;
    capabilities?: string[];
    pid?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
  timestamp: string;
}

export interface CommandMessage {
  type: 'command';
  commandId: string;
  agentId: string;
  command: string;
  args?: string[];
  options?: {
    timeout?: number;
    workingDirectory?: string;
    environment?: Record<string, string>;
  };
  timestamp: string;
}

export interface OutputMessage {
  type: 'output' | MessageType.TERMINAL_OUTPUT;
  commandId: string;
  agentId: string;
  stream: 'stdout' | 'stderr';
  data: string;
  ansiCodes?: string;
  timestamp: string;
}

export interface CommandCompleteMessage {
  type: 'command_complete' | MessageType.COMMAND_COMPLETE;
  commandId: string;
  agentId: string;
  exitCode: number;
  duration: number;
  error?: string;
  timestamp: string;
}

export interface HeartbeatMessage {
  type: 'heartbeat';
  agentId: string;
  timestamp: string;
}

export interface AuthMessage {
  type: 'auth';
  token: string;
  agentId: string;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
  details?: any;
  timestamp: string;
}

export type IncomingMessage = CommandMessage | ErrorMessage;
export type OutgoingMessage = AgentStatusMessage | OutputMessage | CommandCompleteMessage | HeartbeatMessage | AuthMessage;

export interface WebSocketClientOptions {
  config: Config;
  agentId: string;
  onCommand: (message: CommandMessage) => Promise<void>;
  onError: (error: Error) => void;
}

export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: Config;
  private agentId: string;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnected = false;
  private isReconnecting = false;
  private messageQueue: OutgoingMessage[] = [];
  private sequenceCounters: Map<string, number> = new Map();

  private onCommand: (message: CommandMessage) => Promise<void>;
  private onError: (error: Error) => void;

  constructor(options: WebSocketClientOptions) {
    super();
    this.config = options.config;
    this.agentId = options.agentId;
    this.onCommand = options.onCommand;
    this.onError = options.onError;
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    if (this.ws && this.isConnected) {
      return;
    }

    const wsUrl = this.getWebSocketUrl();
    console.log(`Connecting to WebSocket server at ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);
      this.setupEventHandlers();

      // Wait for connection to be established
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.ws!.once('open', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.ws!.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      // Authenticate after connection
      await this.authenticate();

      this.isConnected = true;
      this.isReconnecting = false;
      this.startHeartbeat();
      this.flushMessageQueue();

      this.emit('connected');
      console.log('WebSocket connection established');

    } catch (error) {
      this.onError(error as Error);
      throw error;
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.stopHeartbeat();
    this.stopReconnect();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.emit('disconnected');
    console.log('WebSocket connection closed');
  }

  /**
   * Send a message to the server
   */
  async sendMessage(message: OutgoingMessage): Promise<void> {
    if (!this.isConnected || !this.ws) {
      // Queue message for later sending
      this.messageQueue.push(message);
      return;
    }

    try {
      const payload = JSON.stringify(message);
      this.ws.send(payload);
    } catch (error) {
      console.error('Failed to send message:', error);
      this.messageQueue.push(message);
      throw error;
    }
  }

  /**
   * Send agent status update
   */
  async sendStatus(status: AgentStatusMessage['status'], metadata?: AgentStatusMessage['metadata']): Promise<void> {
    // For initial connection, send AGENT_CONNECT
    if (status === 'ready' && !this.isConnected) {
      const connectMessage: WebSocketMessage = {
        type: MessageType.AGENT_CONNECT,
        id: `connect-${Date.now()}`,
        timestamp: Date.now(),
        payload: {
          agentId: this.agentId,
          agentType: (this.config as any).agentType || 'mock',
          metadata: {
            version: metadata?.version || '1.0.0',
            capabilities: metadata?.capabilities || [],
            pid: metadata?.pid || process.pid
          },
          authToken: '', // Auth handled separately
          timestamp: Date.now()
        }
      };
      await this.sendMessage(connectMessage);
    }

    // Send regular status update
    const message: WebSocketMessage = {
      type: MessageType.AGENT_STATUS,
      id: `status-${Date.now()}`,
      timestamp: Date.now(),
      payload: {
        agentId: this.agentId,
        status,
        metadata,
        timestamp: Date.now()
      }
    };

    await this.sendMessage(message);
  }

  /**
   * Send command output
   */
  async sendOutput(commandId: string, stream: 'stdout' | 'stderr', data: string, ansiCodes?: string): Promise<void> {
    const payload: TerminalOutputPayload = {
      commandId,
      agentId: this.agentId,
      content: data,
      streamType: stream === 'stderr' ? 'STDERR' : 'STDOUT',
      ansiCodes: !!ansiCodes,
      sequence: this.getNextSequence(commandId),
      timestamp: Date.now()
    };

    const message: WebSocketMessage<TerminalOutputPayload> = {
      type: MessageType.TERMINAL_OUTPUT,
      id: `${commandId}-${Date.now()}`,
      timestamp: Date.now(),
      payload
    };

    await this.sendMessage(message);
  }

  /**
   * Send command completion
   */
  async sendCommandComplete(commandId: string, exitCode: number, duration: number, error?: string): Promise<void> {
    const message: WebSocketMessage = {
      type: MessageType.COMMAND_COMPLETE,
      id: `${commandId}-complete`,
      timestamp: Date.now(),
      payload: {
        commandId,
        agentId: this.agentId,
        status: exitCode === 0 ? 'COMPLETED' : 'FAILED',
        exitCode,
        duration,
        error,
        timestamp: Date.now()
      }
    };

    // Clean up sequence counter
    this.sequenceCounters.delete(commandId);

    await this.sendMessage(message);
  }

  /**
   * Get next sequence number for a command
   */
  private getNextSequence(commandId: string): number {
    const current = this.sequenceCounters.get(commandId) || 0;
    const next = current + 1;
    this.sequenceCounters.set(commandId, next);
    return next;
  }

  /**
   * Get connection status
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Get reconnection status
   */
  get reconnecting(): boolean {
    return this.isReconnecting;
  }

  private getWebSocketUrl(): string {
    const url = new URL(this.config.serverUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/agent';
    return url.toString();
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => {
      console.log('WebSocket connection opened');
    });

    this.ws.on('message', async (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString()) as IncomingMessage;
        await this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse incoming message:', error);
      }
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      console.log(`WebSocket connection closed: ${code} ${reason.toString()}`);
      this.isConnected = false;
      this.stopHeartbeat();
      this.emit('disconnected');

      // Attempt reconnection if not intentionally closed
      if (code !== 1000 && !this.isReconnecting) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      this.onError(error);
    });

    this.ws.on('pong', () => {
      // Server responded to ping
      this.emit('pong');
    });
  }

  private async handleMessage(message: IncomingMessage): Promise<void> {
    switch (message.type) {
      case 'command':
        try {
          await this.onCommand(message);
        } catch (error) {
          console.error('Failed to handle command:', error);
        }
        break;

      case 'error':
        console.error('Server error:', message);
        this.onError(new Error(`Server error: ${message.message}`));
        break;

      default:
        console.warn('Unknown message type:', (message as any).type);
    }
  }

  private async authenticate(): Promise<void> {
    const authMessage: AuthMessage = {
      type: 'auth',
      token: this.config.apiKey,
      agentId: this.agentId,
    };

    await this.sendMessage(authMessage);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(async () => {
      if (this.isConnected && this.ws) {
        try {
          // Send ping to server
          this.ws.ping();

          // Also send heartbeat message
          const heartbeatMessage: HeartbeatMessage = {
            type: 'heartbeat',
            agentId: this.agentId,
            timestamp: new Date().toISOString(),
          };

          await this.sendMessage(heartbeatMessage);
        } catch (error) {
          console.error('Failed to send heartbeat:', error);
        }
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.isReconnecting) return;

    this.isReconnecting = true;
    this.emit('reconnecting');

    // Use exponential backoff for reconnection
    const delay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.getReconnectAttempt()),
      30000 // Max 30 seconds
    );

    console.log(`Scheduling reconnection in ${delay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('Reconnection failed:', error);

        // Schedule another reconnection attempt
        if (this.getReconnectAttempt() < this.config.reconnectAttempts) {
          this.scheduleReconnect();
        } else {
          console.error('Maximum reconnection attempts reached');
          this.isReconnecting = false;
          this.emit('reconnect_failed');
        }
      }
    }, delay);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isReconnecting = false;
  }

  private getReconnectAttempt(): number {
    // This would need to be tracked properly in a real implementation
    return 0;
  }

  private async flushMessageQueue(): Promise<void> {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      if (message) {
        try {
          await this.sendMessage(message);
        } catch (error) {
          console.error('Failed to send queued message:', error);
          // Re-queue the message
          this.messageQueue.unshift(message);
          break;
        }
      }
    }
  }
}