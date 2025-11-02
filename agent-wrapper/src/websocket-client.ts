import WebSocket from 'ws';
import { EventEmitter } from 'events';
import os from 'os';
import jwt from 'jsonwebtoken';
import { pino } from 'pino';
import { Config } from './config.js';
import AuthManager from './auth/auth-manager.js';
import { MessageType, WebSocketMessage, TerminalOutputPayload } from '@onsembl/agent-protocol';
import { ReconnectionManager, ConnectionCircuitBreaker } from './reconnection.js';

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

export interface TokenRefreshMessage {
  type: typeof MessageType.TOKEN_REFRESH;
  payload: {
    accessToken: string;
    expiresIn: number;
    refreshToken?: string;
  };
}

export type IncomingMessage = CommandMessage | ErrorMessage | TokenRefreshMessage;
export type OutgoingMessage = AgentStatusMessage | OutputMessage | CommandCompleteMessage | HeartbeatMessage | AuthMessage | WebSocketMessage<any>;

export interface WebSocketClientOptions {
  config: Config;
  agentId: string;
  agentName?: string | undefined; // Optional agent display name
  onCommand: (message: CommandMessage) => Promise<void>;
  onError: (error: Error) => void;
}

export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: Config;
  private agentId: string;
  private agentName?: string | undefined;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatTimeout: NodeJS.Timeout | null = null;
  private isConnected = false;
  private messageQueue: OutgoingMessage[] = [];
  private sequenceCounters: Map<string, number> = new Map();
  private reconnectionManager: ReconnectionManager | null = null;
  private circuitBreaker: ConnectionCircuitBreaker;
  private lastPongReceived: number = Date.now();
  private authManager: AuthManager | null = null;
  private logger: pino.Logger;

  private onCommand: (message: CommandMessage) => Promise<void>;
  private onError: (error: Error) => void;

  constructor(options: WebSocketClientOptions) {
    super();
    this.config = options.config;
    this.agentId = options.agentId;
    this.agentName = options.agentName;
    this.onCommand = options.onCommand;
    this.onError = options.onError;

    // Initialize logger
    this.logger = pino({
      name: 'websocket-client',
      level: process.env['LOG_LEVEL'] || 'info'
    });

    // Always initialize AuthManager to check for stored credentials
    this.authManager = new AuthManager({
      serverUrl: options.config.serverUrl
    });

    // Initialize circuit breaker with sensible defaults
    this.circuitBreaker = new ConnectionCircuitBreaker(
      5,     // failureThreshold: 5 failures before opening
      60000, // timeoutMs: 1 minute
      30000  // recoveryTimeoutMs: 30 seconds
    );

    // Listen to circuit breaker state changes
    this.circuitBreaker.on('state_changed', (state) => {
      this.logger.debug(`[Circuit Breaker] State changed to: ${state}`);
      this.emit('circuit_breaker_state', state);
    });
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    if (this.ws && this.isConnected) {
      return;
    }

    // Check circuit breaker before attempting connection
    if (!this.circuitBreaker.canAttempt()) {
      const error = new Error('Circuit breaker is open - too many connection failures');
      console.error('[Connection] Circuit breaker is open');
      this.onError(error);
      throw error;
    }

    const wsUrl = await this.getWebSocketUrl();
    this.logger.debug(`[Connection] Attempting connection to ${wsUrl}`);

    try {
      const token = await this.buildAuthToken();
      this.ws = new WebSocket(wsUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
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

      // Send agent connect after connection established
      await this.sendAgentConnect();

      this.isConnected = true;
      this.startHeartbeat();
      this.flushMessageQueue();

      // Record successful connection in circuit breaker
      this.circuitBreaker.recordSuccess();

      // Reset reconnection manager if exists
      if (this.reconnectionManager) {
        this.reconnectionManager.reset();
      }

      this.emit('connected');
      this.logger.debug('[Connection] WebSocket connection established successfully');

    } catch (error) {
      // Record failure in circuit breaker
      this.circuitBreaker.recordFailure();

      console.error('[Connection] Connection failed:', error);
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

    // Stop reconnection manager if it exists
    if (this.reconnectionManager) {
      this.reconnectionManager.stopReconnection();
      this.reconnectionManager.destroy();
      this.reconnectionManager = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }

    this.emit('disconnected');
    this.logger.debug('[Connection] WebSocket connection closed');
  }

  /**
   * Send a message to the server
   */
  async sendMessage(message: OutgoingMessage): Promise<void> {
    if (!this.isConnected || !this.ws) {
      // Queue message for later sending
      this.logger.debug(`[SEND-DEBUG] Message queued (not connected): type=${message.type}`);
      this.messageQueue.push(message);
      return;
    }

    try {
      const payload = JSON.stringify(message);
      this.logger.debug(`[SEND-DEBUG] Attempting to send message: type=${message.type}, size=${payload.length}, readyState=${this.ws?.readyState}`);

      // Use callback to detect send errors
      this.ws.send(payload, (error) => {
        if (error) {
          console.error(`[SEND-ERROR] Failed to send ${message.type}:`, error);
        } else {
          this.logger.debug(`[SEND-SUCCESS] Message sent successfully: type=${message.type}`);
        }
      });
    } catch (error) {
      console.error(`[SEND-EXCEPTION] Exception sending message ${message.type}:`, error);
      this.messageQueue.push(message);
      throw error;
    }
  }

  /**
   * Send agent status update
   */
  async sendStatus(status: AgentStatusMessage['status'], metadata?: AgentStatusMessage['metadata']): Promise<void> {
    // Skip sending AGENT_STATUS (server→dashboard type). Only operate when connected.
    if (!this.isConnected) return;
    // Optionally, could log or send a trace event here in the future.
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
      sequence: this.getNextSequence(commandId)
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
    return this.reconnectionManager?.isReconnecting || false;
  }

  /**
   * Get circuit breaker state
   */
  get circuitBreakerState(): ReturnType<ConnectionCircuitBreaker['getState']> {
    return this.circuitBreaker.getState();
  }

  private async getWebSocketUrl(): Promise<string> {
    const url = new URL(this.config.serverUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/agent';
    // Append backend-required query parameters
    url.searchParams.set('agentId', this.agentId);
    const token = await this.buildAuthToken();
    if (token) url.searchParams.set('token', token);
    return url.toString();
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => {
      this.logger.debug('WebSocket connection opened');
    });

    this.ws.on('message', async (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString()) as IncomingMessage | WebSocketMessage<any>;
        await this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse incoming message:', error);
      }
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      this.logger.debug(`[Connection] WebSocket closed with code ${code}: ${reason.toString()}`);
      this.isConnected = false;
      this.stopHeartbeat();
      this.emit('disconnected');

      // Attempt reconnection if not intentionally closed (1000 = normal closure)
      if (code !== 1000) {
        this.handleUnexpectedDisconnection();
      }
    });

    this.ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      this.onError(error);
    });

    this.ws.on('pong', () => {
      // Server responded to ping
      this.lastPongReceived = Date.now();
      this.clearHeartbeatTimeout();
      this.emit('pong');
    });
  }

  private async handleMessage(message: IncomingMessage | WebSocketMessage<any>): Promise<void> {
    switch (message.type) {
      case 'command':
        try {
          await this.onCommand(message as CommandMessage);
        } catch (error) {
          console.error('Failed to handle command:', error);
        }
        break;

      case MessageType.TOKEN_REFRESH:
        this.handleTokenRefresh(message as TokenRefreshMessage);
        break;

      case MessageType.ACK:
        // Server acknowledged a prior message; no action needed yet.
        break;

      case MessageType.PING:
        // Respond to server PING with PONG
        await this.sendMessage({
          type: MessageType.PONG,
          id: `pong-${Date.now()}`,
          timestamp: Date.now(),
          payload: {
            timestamp: message.payload?.timestamp || Date.now()
          }
        });
        break;

      case MessageType.PONG:
        // Server responded to our ping
        break;

      case 'error':
        const errorMessage = message as ErrorMessage;
        console.error('Server error:', errorMessage);
        this.onError(new Error(`Server error: ${errorMessage.message}`));
        break;

      case MessageType.ERROR:
        console.error('Server error (protocol):', message);
        this.onError(new Error('Server protocol error'));
        break;

      case MessageType.SERVER_HEARTBEAT:
        // Server heartbeat received
        break;

      case MessageType.COMMAND_REQUEST:
        // Handle command requests from dashboard
        this.logger.info('[WebSocket] Received COMMAND_REQUEST:', message);
        try {
          const commandPayload = message.payload as any;
          const commandMessage: CommandMessage = {
            type: 'command',
            commandId: commandPayload.commandId || `cmd-${Date.now()}`,
            agentId: this.agentId,
            command: commandPayload.command,
            args: commandPayload.args || [],
            options: {
              timeout: commandPayload.executionConstraints?.timeLimitMs,
              workingDirectory: commandPayload.workingDirectory,
              environment: commandPayload.env || {}
            },
            timestamp: new Date().toISOString()
          };
          await this.onCommand(commandMessage);
        } catch (error) {
          console.error('Failed to handle COMMAND_REQUEST:', error);
        }
        break;

      default:
        console.warn('Unknown message type:', (message as any).type);
    }
  }

  private handleTokenRefresh(message: TokenRefreshMessage): void {
    const { accessToken, expiresIn } = message.payload;

    if (accessToken && this.config.apiKey) {
      // Update the stored token
      this.config.apiKey = accessToken;

      // Store in environment if available
      if (process.env['ONSEMBL_API_KEY']) {
        process.env['ONSEMBL_API_KEY'] = accessToken;
      }

      this.logger.info(`[Token Refresh] Token refreshed successfully, expires in ${expiresIn} seconds`);
      this.emit('token_refreshed', { accessToken, expiresIn });
    }
  }


  private async sendAgentConnect(): Promise<void> {
    const message: WebSocketMessage = {
      type: MessageType.AGENT_CONNECT,
      id: `connect-${Date.now()}`,
      timestamp: Date.now(),
      payload: {
        agentId: this.agentId,
        name: this.agentName, // Include agent name from config
        agentType: this.mapAgentType(this.config.agentType),
        version: '1.0.0',
        hostMachine: os.hostname(),
        capabilities: {
          maxTokens: 0,
          supportsInterrupt: true,
          supportsTrace: true,
        },
      },
    };

    await this.sendMessage(message);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(async () => {
      if (this.isConnected && this.ws) {
        try {
          // Send native WebSocket ping to server
          // Backend will respond with JSON PING message which we'll answer with PONG
          this.ws.ping();

          // Set a timeout for pong response
          this.setHeartbeatTimeout();

          this.logger.debug('[Heartbeat] Sent native WebSocket ping');
        } catch (error) {
          console.error('[Heartbeat] Failed to send ping:', error);
          // Connection might be dead, trigger reconnection
          this.handleHeartbeatFailure();
        }
      }
    }, this.config.heartbeatInterval);
  }

  private setHeartbeatTimeout(): void {
    this.clearHeartbeatTimeout();

    // Wait for pong response (10 seconds timeout)
    this.heartbeatTimeout = setTimeout(() => {
      console.error('[Heartbeat] No pong received within timeout');
      this.handleHeartbeatFailure();
    }, 10000);
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private handleHeartbeatFailure(): void {
    console.error('[Heartbeat] Heartbeat failure detected');
    this.circuitBreaker.recordFailure();

    // Close the connection to trigger reconnection
    if (this.ws) {
      this.ws.close(4000, 'Heartbeat timeout');
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearHeartbeatTimeout();
  }

  private handleUnexpectedDisconnection(): void {
    this.logger.warn('[Reconnection] Unexpected disconnection detected');

    // Record failure in circuit breaker
    this.circuitBreaker.recordFailure();

    // Initialize reconnection manager if not exists
    if (!this.reconnectionManager) {
      this.reconnectionManager = new ReconnectionManager({
        config: this.config,
        onReconnect: async () => {
          await this.connect();
        },
        onReconnectFailed: (error) => {
          console.error('[Reconnection] Reconnection attempt failed:', error.message);
          this.emit('reconnect_attempt_failed', error);
        },
        onMaxAttemptsReached: () => {
          console.error('[Reconnection] Maximum reconnection attempts reached');
          this.emit('reconnect_failed');
          // Clean up reconnection manager
          if (this.reconnectionManager) {
            this.reconnectionManager.destroy();
            this.reconnectionManager = null;
          }
        }
      });

      // Forward reconnection events
      this.reconnectionManager.on('reconnection_started', () => {
        this.emit('reconnecting');
      });

      this.reconnectionManager.on('attempt_scheduled', (data) => {
        this.emit('reconnect_scheduled', data);
      });

      this.reconnectionManager.on('attempt_started', (data) => {
        this.emit('reconnect_attempt', data);
      });

      this.reconnectionManager.on('reconnection_successful', () => {
        this.logger.info('[Reconnection] Successfully reconnected');
        this.emit('reconnected');
      });
    }

    // Start reconnection process
    this.reconnectionManager.startReconnection();
  }

  /**
   * Force immediate reconnection
   */
  forceReconnect(): void {
    if (this.reconnectionManager) {
      this.reconnectionManager.forceReconnect();
    } else {
      this.handleUnexpectedDisconnection();
    }
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

  private async buildAuthToken(): Promise<string | null> {
    // Use stored CLI tokens for authentication
    try {
      const token = await this.authManager!.getAccessToken();
      return token;
    } catch (error) {
      // Not authenticated - throw clear error with instructions
      const errorMessage = error instanceof Error ? error.message : 'Authentication required';
      throw new Error(
        `Authentication required. Please run: onsembl-agent auth login\n` +
        `Details: ${errorMessage}`
      );
    }
  }

  private mapAgentType(type: Config['agentType']): 'CLAUDE' | 'GEMINI' | 'CODEX' | 'CUSTOM' {
    switch (type) {
      case 'claude':
        return 'CLAUDE';
      case 'gemini':
        return 'GEMINI';
      case 'codex':
        return 'CODEX';
      default:
        return 'CUSTOM';
    }
  }
}
