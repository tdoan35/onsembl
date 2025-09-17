/**
 * WebSocket Service for Onsembl.ai Dashboard
 * Handles real-time communication with backend WebSocket endpoints
 */

import {
  WebSocketMessage,
  MessageType,
  MessagePayloadMap,
  TypedWebSocketMessage,
  DashboardInitPayload,
  DashboardSubscribePayload,
  DashboardUnsubscribePayload,
  PingPayload,
  PongPayload
} from '@onsembl/agent-protocol';

export type WebSocketConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSocketConfig {
  baseUrl: string;
  endpoints: {
    agent: string;
    dashboard: string;
  };
  reconnect: {
    maxAttempts: number;
    backoffMultiplier: number;
    baseDelay: number;
    maxDelay: number;
  };
  heartbeat: {
    interval: number;
    timeout: number;
  };
}

export interface QueuedMessage {
  message: WebSocketMessage;
  timestamp: number;
  retries: number;
}

export type WebSocketEventCallback<T = any> = (payload: T, message: WebSocketMessage<T>) => void;
export type ConnectionStateCallback = (state: WebSocketConnectionState, error?: Error) => void;

export class WebSocketService extends EventTarget {
  private config: WebSocketConfig;
  private connections: Map<string, WebSocket> = new Map();
  private connectionStates: Map<string, WebSocketConnectionState> = new Map();
  private messageQueue: Map<string, QueuedMessage[]> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
  private heartbeatTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private eventListeners: Map<MessageType, Set<WebSocketEventCallback>> = new Map();
  private connectionStateListeners: Map<string, Set<ConnectionStateCallback>> = new Map();
  private accessToken: string | null = null;
  private userId: string | null = null;
  private messageId: number = 0;

  constructor(config: WebSocketConfig) {
    super();
    this.config = config;
    this.initializeEventListeners();
  }

  private initializeEventListeners(): void {
    // Initialize event listener maps for each message type
    Object.values(MessageType).forEach(type => {
      this.eventListeners.set(type, new Set());
    });
  }

  /**
   * Set authentication token for WebSocket connections
   */
  setAuth(accessToken: string, userId: string): void {
    this.accessToken = accessToken;
    this.userId = userId;

    // Update existing connections with new token
    this.connections.forEach((ws, endpoint) => {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendTokenRefresh(endpoint, accessToken);
      }
    });
  }

  /**
   * Connect to a WebSocket endpoint
   */
  async connect(endpoint: 'agent' | 'dashboard'): Promise<void> {
    const endpointPath = this.config.endpoints[endpoint];
    const url = this.buildWebSocketUrl(endpointPath);

    // Clear any existing connection
    await this.disconnect(endpoint);

    return new Promise((resolve, reject) => {
      try {
        this.setConnectionState(endpoint, 'connecting');

        const ws = new WebSocket(url);
        this.connections.set(endpoint, ws);

        const connectTimeout = setTimeout(() => {
          ws.close();
          const error = new Error(`WebSocket connection timeout for ${endpoint}`);
          this.handleConnectionError(endpoint, error);
          reject(error);
        }, 10000); // 10 second timeout

        ws.onopen = () => {
          clearTimeout(connectTimeout);
          this.handleConnectionOpen(endpoint);
          resolve();
        };

        ws.onmessage = (event) => {
          this.handleMessage(endpoint, event);
        };

        ws.onclose = (event) => {
          clearTimeout(connectTimeout);
          this.handleConnectionClose(endpoint, event);
          if (this.connectionStates.get(endpoint) === 'connecting') {
            reject(new Error(`WebSocket connection failed for ${endpoint}: ${event.reason}`));
          }
        };

        ws.onerror = (error) => {
          clearTimeout(connectTimeout);
          this.handleConnectionError(endpoint, new Error(`WebSocket error for ${endpoint}`));
          if (this.connectionStates.get(endpoint) === 'connecting') {
            reject(error);
          }
        };
      } catch (error) {
        this.handleConnectionError(endpoint, error as Error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from a WebSocket endpoint
   */
  async disconnect(endpoint: 'agent' | 'dashboard'): Promise<void> {
    const ws = this.connections.get(endpoint);
    if (ws) {
      this.clearTimers(endpoint);
      this.connections.delete(endpoint);
      this.setConnectionState(endpoint, 'disconnected');

      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
  }

  /**
   * Disconnect from all endpoints
   */
  async disconnectAll(): Promise<void> {
    const endpoints = Array.from(this.connections.keys()) as ('agent' | 'dashboard')[];
    await Promise.all(endpoints.map(endpoint => this.disconnect(endpoint)));
  }

  /**
   * Send a message to a WebSocket endpoint
   */
  send<T extends MessageType>(
    endpoint: 'agent' | 'dashboard',
    type: T,
    payload: MessagePayloadMap[T]
  ): void {
    const message: WebSocketMessage<MessagePayloadMap[T]> = {
      type,
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload
    };

    const ws = this.connections.get(endpoint);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        // Failed to send message, will be queued
        this.queueMessage(endpoint, message);
      }
    } else {
      this.queueMessage(endpoint, message);
    }
  }

  /**
   * Initialize dashboard connection with subscriptions
   */
  initializeDashboard(subscriptions?: DashboardInitPayload['subscriptions']): void {
    if (!this.userId) {
      throw new Error('User ID is required for dashboard initialization');
    }

    this.send('dashboard', MessageType.DASHBOARD_INIT, {
      userId: this.userId,
      subscriptions
    });
  }

  /**
   * Subscribe to dashboard updates
   */
  subscribe(type: 'agent' | 'command' | 'trace' | 'terminal', id?: string, all?: boolean): void {
    const payload: DashboardSubscribePayload = { type };
    if (id !== undefined) payload.id = id;
    if (all !== undefined) payload.all = all;

    this.send('dashboard', MessageType.DASHBOARD_SUBSCRIBE, payload);
  }

  /**
   * Unsubscribe from dashboard updates
   */
  unsubscribe(type: 'agent' | 'command' | 'trace' | 'terminal', id?: string, all?: boolean): void {
    const payload: DashboardUnsubscribePayload = { type };
    if (id !== undefined) payload.id = id;
    if (all !== undefined) payload.all = all;

    this.send('dashboard', MessageType.DASHBOARD_UNSUBSCRIBE, payload);
  }

  /**
   * Send ping message
   */
  ping(endpoint: 'agent' | 'dashboard'): void {
    this.send(endpoint, MessageType.PING, {
      timestamp: Date.now(),
      sequence: this.messageId
    });
  }

  /**
   * Get connection state for an endpoint
   */
  getConnectionState(endpoint: 'agent' | 'dashboard'): WebSocketConnectionState {
    return this.connectionStates.get(endpoint) || 'disconnected';
  }

  /**
   * Check if endpoint is connected
   */
  isConnected(endpoint: 'agent' | 'dashboard'): boolean {
    return this.getConnectionState(endpoint) === 'connected';
  }

  /**
   * Add event listener for specific message type
   */
  on<T extends MessageType>(
    type: T,
    callback: WebSocketEventCallback<MessagePayloadMap[T]>
  ): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      listeners.add(callback as WebSocketEventCallback);
    }
  }

  /**
   * Remove event listener for specific message type
   */
  off<T extends MessageType>(
    type: T,
    callback: WebSocketEventCallback<MessagePayloadMap[T]>
  ): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      listeners.delete(callback as WebSocketEventCallback);
    }
  }

  /**
   * Add connection state listener
   */
  onConnectionState(endpoint: 'agent' | 'dashboard', callback: ConnectionStateCallback): void {
    if (!this.connectionStateListeners.has(endpoint)) {
      this.connectionStateListeners.set(endpoint, new Set());
    }
    this.connectionStateListeners.get(endpoint)!.add(callback);
  }

  /**
   * Remove connection state listener
   */
  offConnectionState(endpoint: 'agent' | 'dashboard', callback: ConnectionStateCallback): void {
    const listeners = this.connectionStateListeners.get(endpoint);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  private buildWebSocketUrl(path: string): string {
    const wsProtocol = this.config.baseUrl.startsWith('https') ? 'wss' : 'ws';
    const baseUrl = this.config.baseUrl.replace(/^https?:\/\//, '');
    let url = `${wsProtocol}://${baseUrl}${path}`;

    // Add authentication token as query parameter
    if (this.accessToken) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}token=${encodeURIComponent(this.accessToken)}`;
    }

    return url;
  }

  private handleConnectionOpen(endpoint: string): void {
    // Connection established
    this.setConnectionState(endpoint, 'connected');
    this.resetReconnectAttempts(endpoint);
    this.startHeartbeat(endpoint);
    this.processMessageQueue(endpoint);
  }

  private handleConnectionClose(endpoint: string, event: CloseEvent): void {
    // Connection closed
    this.clearTimers(endpoint);
    this.setConnectionState(endpoint, 'disconnected');

    // Attempt reconnection if not intentionally closed
    if (event.code !== 1000) { // 1000 = normal closure
      this.attemptReconnection(endpoint as 'agent' | 'dashboard');
    }
  }

  private handleConnectionError(endpoint: string, error: Error): void {
    // Connection error occurred
    this.setConnectionState(endpoint, 'error', error);
    this.clearTimers(endpoint);
  }

  private handleMessage(endpoint: string, event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      this.processMessage(message);
      this.resetHeartbeatTimeout(endpoint);
    } catch (error) {
      // Failed to parse message
    }
  }

  private processMessage(message: WebSocketMessage): void {
    const { type, payload } = message;

    // Handle heartbeat messages
    if (type === MessageType.PING) {
      this.handlePing(message as TypedWebSocketMessage<MessageType.PING>);
      return;
    }

    if (type === MessageType.PONG) {
      this.handlePong(message as TypedWebSocketMessage<MessageType.PONG>);
      return;
    }

    // Handle token refresh
    if (type === MessageType.TOKEN_REFRESH) {
      this.handleTokenRefresh(message);
      return;
    }

    // Emit event to listeners
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(payload, message);
        } catch (error) {
          // Error in event listener
        }
      });
    }

    // Dispatch custom event
    this.dispatchEvent(new CustomEvent(type, { detail: { payload, message } }));
  }

  private handlePing(message: TypedWebSocketMessage<MessageType.PING>): void {
    // Respond with pong
    const endpoint = this.findEndpointForMessage();
    if (endpoint) {
      const pongPayload: PongPayload = {
        timestamp: Date.now(),
        latency: Date.now() - message.payload.timestamp
      };
      if (message.payload.sequence !== undefined) {
        pongPayload.sequence = message.payload.sequence;
      }

      this.send(endpoint, MessageType.PONG, pongPayload);
    }
  }

  private handlePong(message: TypedWebSocketMessage<MessageType.PONG>): void {
    // Update connection latency metrics
    // Latency measurement received
  }

  private handleTokenRefresh(message: WebSocketMessage): void {
    // Token refresh will be handled by AuthService
    this.dispatchEvent(new CustomEvent('token_refresh', { detail: message.payload }));
  }

  private sendTokenRefresh(endpoint: string, accessToken: string): void {
    const ws = this.connections.get(endpoint);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        type: MessageType.TOKEN_REFRESH,
        id: this.generateMessageId(),
        timestamp: Date.now(),
        payload: {
          accessToken,
          expiresIn: 3600000 // 1 hour default
        }
      };
      ws.send(JSON.stringify(message));
    }
  }

  private queueMessage(endpoint: string, message: WebSocketMessage): void {
    if (!this.messageQueue.has(endpoint)) {
      this.messageQueue.set(endpoint, []);
    }

    const queue = this.messageQueue.get(endpoint)!;
    queue.push({
      message,
      timestamp: Date.now(),
      retries: 0
    });

    // Limit queue size
    if (queue.length > 100) {
      queue.shift(); // Remove oldest message
    }
  }

  private processMessageQueue(endpoint: string): void {
    const queue = this.messageQueue.get(endpoint);
    if (!queue || queue.length === 0) return;

    const ws = this.connections.get(endpoint);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    while (queue.length > 0) {
      const queuedMessage = queue.shift()!;
      try {
        ws.send(JSON.stringify(queuedMessage.message));
      } catch (error) {
        // Failed to send queued message
        // Re-queue if retries available
        if (queuedMessage.retries < 3) {
          queuedMessage.retries++;
          queue.unshift(queuedMessage);
        }
        break;
      }
    }
  }

  private attemptReconnection(endpoint: 'agent' | 'dashboard'): void {
    const attempts = this.reconnectAttempts.get(endpoint) || 0;
    if (attempts >= this.config.reconnect.maxAttempts) {
      // Max reconnection attempts reached
      return;
    }

    const delay = Math.min(
      this.config.reconnect.baseDelay * Math.pow(this.config.reconnect.backoffMultiplier, attempts),
      this.config.reconnect.maxDelay
    );

    // Scheduling reconnection attempt
    this.reconnectAttempts.set(endpoint, attempts + 1);

    const timer = setTimeout(async () => {
      try {
        await this.connect(endpoint);
      } catch (error) {
        // Reconnection failed, will retry
        this.attemptReconnection(endpoint);
      }
    }, delay);

    this.reconnectTimers.set(endpoint, timer);
  }

  private startHeartbeat(endpoint: string): void {
    const timer = setInterval(() => {
      this.ping(endpoint as 'agent' | 'dashboard');
      this.setHeartbeatTimeout(endpoint);
    }, this.config.heartbeat.interval);

    this.heartbeatTimers.set(endpoint, timer);
  }

  private setHeartbeatTimeout(endpoint: string): void {
    this.clearHeartbeatTimeout(endpoint);

    const timeout = setTimeout(() => {
      // Heartbeat timeout detected
      this.handleConnectionError(endpoint, new Error('Heartbeat timeout'));
    }, this.config.heartbeat.timeout);

    this.heartbeatTimeouts.set(endpoint, timeout);
  }

  private resetHeartbeatTimeout(endpoint: string): void {
    this.clearHeartbeatTimeout(endpoint);
    this.setHeartbeatTimeout(endpoint);
  }

  private clearHeartbeatTimeout(endpoint: string): void {
    const timeout = this.heartbeatTimeouts.get(endpoint);
    if (timeout) {
      clearTimeout(timeout);
      this.heartbeatTimeouts.delete(endpoint);
    }
  }

  private clearTimers(endpoint: string): void {
    // Clear reconnect timer
    const reconnectTimer = this.reconnectTimers.get(endpoint);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      this.reconnectTimers.delete(endpoint);
    }

    // Clear heartbeat timer
    const heartbeatTimer = this.heartbeatTimers.get(endpoint);
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      this.heartbeatTimers.delete(endpoint);
    }

    // Clear heartbeat timeout
    this.clearHeartbeatTimeout(endpoint);
  }

  private setConnectionState(endpoint: string, state: WebSocketConnectionState, error?: Error): void {
    this.connectionStates.set(endpoint, state);

    const listeners = this.connectionStateListeners.get(endpoint);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(state, error);
        } catch (callbackError) {
          // Error in state callback
        }
      });
    }

    // Dispatch custom event
    this.dispatchEvent(new CustomEvent('connection_state_change', {
      detail: { endpoint, state, error }
    }));
  }

  private resetReconnectAttempts(endpoint: string): void {
    this.reconnectAttempts.set(endpoint, 0);
  }

  private findEndpointForMessage(): 'agent' | 'dashboard' | null {
    // Simple heuristic - use dashboard endpoint for responses
    return this.isConnected('dashboard') ? 'dashboard' :
           this.isConnected('agent') ? 'agent' : null;
  }

  private generateMessageId(): string {
    return `msg_${++this.messageId}_${Date.now()}`;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.disconnectAll();
    this.eventListeners.clear();
    this.connectionStateListeners.clear();
    this.messageQueue.clear();
    this.reconnectAttempts.clear();
    this.reconnectTimers.clear();
    this.heartbeatTimers.clear();
    this.heartbeatTimeouts.clear();
  }
}

// Default configuration
export const defaultWebSocketConfig: WebSocketConfig = {
  baseUrl: process.env['NEXT_PUBLIC_BACKEND_URL'] || 'http://localhost:3001',
  endpoints: {
    agent: '/ws/agent',
    dashboard: '/ws/dashboard'
  },
  reconnect: {
    maxAttempts: 5,
    backoffMultiplier: 2,
    baseDelay: 1000,
    maxDelay: 30000
  },
  heartbeat: {
    interval: 30000, // 30 seconds
    timeout: 10000   // 10 seconds
  }
};

// Singleton instance
export const webSocketService = new WebSocketService(defaultWebSocketConfig);