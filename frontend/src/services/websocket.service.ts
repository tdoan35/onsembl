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
import {
  ReconnectionManager,
  ConnectionCircuitBreaker,
  ConnectionHealthMonitor
} from './reconnection.service';

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
  private heartbeatTimers: Map<string, number> = new Map();
  private heartbeatTimeouts: Map<string, number> = new Map();
  private eventListeners: Map<MessageType, Set<WebSocketEventCallback>> = new Map();
  private connectionStateListeners: Map<string, Set<ConnectionStateCallback>> = new Map();
  private reconnectionManagers: Map<string, ReconnectionManager> = new Map();
  private circuitBreakers: Map<string, ConnectionCircuitBreaker> = new Map();
  private healthMonitors: Map<string, ConnectionHealthMonitor> = new Map();
  private accessToken: string | null = null;
  private userId: string | null = null;
  private messageId: number = 0;

  constructor(config: WebSocketConfig) {
    super();
    this.config = config;
    this.initializeEventListeners();
    this.initializeCircuitBreakers();
  }

  private initializeCircuitBreakers(): void {
    // Initialize circuit breakers for each endpoint
    ['agent', 'dashboard'].forEach(endpoint => {
      const circuitBreaker = new ConnectionCircuitBreaker(
        5,     // failureThreshold: 5 failures before opening
        60000, // timeoutMs: 1 minute
        30000  // recoveryTimeoutMs: 30 seconds
      );

      // Listen to circuit breaker state changes
      circuitBreaker.addEventListener('state_changed', (event) => {
        const customEvent = event as CustomEvent;
        console.log(`[WebSocket][${endpoint}] Circuit breaker state: ${customEvent.detail.state}`);
        this.dispatchEvent(new CustomEvent('circuit_breaker_state', {
          detail: { endpoint, ...customEvent.detail }
        }));
      });

      this.circuitBreakers.set(endpoint, circuitBreaker);
    });
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
    // Check circuit breaker before attempting connection
    const circuitBreaker = this.circuitBreakers.get(endpoint);
    if (circuitBreaker && !circuitBreaker.canAttempt()) {
      const error = new Error(`Circuit breaker is open for ${endpoint} - too many connection failures`);
      console.error(`[WebSocket][${endpoint}] Circuit breaker is open`);
      throw error;
    }

    const endpointPath = this.config.endpoints[endpoint];
    const url = this.buildWebSocketUrl(endpointPath);

    // Clear any existing connection
    await this.disconnect(endpoint);

    return new Promise((resolve, reject) => {
      try {
        this.setConnectionState(endpoint, 'connecting');
        console.log(`[WebSocket][${endpoint}] Connecting to ${url}`);

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
        // Record failure in circuit breaker
        if (circuitBreaker) {
          circuitBreaker.recordFailure();
        }
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
      this.stopReconnection(endpoint);
      this.stopHealthMonitor(endpoint);
      this.connections.delete(endpoint);
      this.setConnectionState(endpoint, 'disconnected');

      // Reset dashboard initialization flag when disconnecting
      if (endpoint === 'dashboard') {
        this.dashboardInitialized = false;
        this.lastInitConnectionId = null;
      }

      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, 'Normal closure');
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

  private dashboardInitialized = false;
  private lastInitConnectionId: string | null = null;

  /**
   * Initialize dashboard connection with subscriptions
   */
  initializeDashboard(subscriptions?: DashboardInitPayload['subscriptions']): void {
    if (!this.userId) {
      throw new Error('User ID is required for dashboard initialization');
    }

    // Get current connection to check if we've already initialized it
    const ws = this.connections.get('dashboard');
    const currentConnectionId = ws?.toString(); // Use object reference as ID

    // Prevent duplicate initialization for the same connection
    if (this.dashboardInitialized && currentConnectionId === this.lastInitConnectionId) {
      console.log('[WebSocketService] Dashboard already initialized for this connection, skipping');
      return;
    }

    console.log('[WebSocketService] Sending DASHBOARD_INIT');
    this.send('dashboard', MessageType.DASHBOARD_INIT, {
      userId: this.userId,
      subscriptions
    });

    this.dashboardInitialized = true;
    this.lastInitConnectionId = currentConnectionId;
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
    // Use the WebSocket base URL directly from config (already has ws:// or wss://)
    const baseUrl = this.config.baseUrl.replace(/\/$/, ''); // Remove trailing slash if present
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    let url = `${baseUrl}${cleanPath}`;

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
    console.log(`[WebSocket][${endpoint}] Connection established`);

    // Record successful connection in circuit breaker
    const circuitBreaker = this.circuitBreakers.get(endpoint);
    if (circuitBreaker) {
      circuitBreaker.recordSuccess();
    }

    // Reset reconnection manager if it exists
    const reconnectionManager = this.reconnectionManagers.get(endpoint);
    if (reconnectionManager) {
      reconnectionManager.reset();
    }

    // Start health monitoring
    this.startHealthMonitor(endpoint);
    this.startHeartbeat(endpoint);
    this.processMessageQueue(endpoint);
  }

  private handleConnectionClose(endpoint: string, event: CloseEvent): void {
    // Connection closed
    console.log(`[WebSocket][${endpoint}] Connection closed with code ${event.code}: ${event.reason}`);
    this.clearTimers(endpoint);
    this.stopHealthMonitor(endpoint);
    this.setConnectionState(endpoint, 'disconnected');

    // Attempt reconnection if not intentionally closed (1000 = normal closure)
    if (event.code !== 1000) {
      this.handleUnexpectedDisconnection(endpoint as 'agent' | 'dashboard');
    }
  }

  private handleConnectionError(endpoint: string, error: Error): void {
    // Connection error occurred
    console.error(`[WebSocket][${endpoint}] Connection error:`, error.message);
    this.setConnectionState(endpoint, 'error', error);
    this.clearTimers(endpoint);
    this.stopHealthMonitor(endpoint);

    // Record failure in circuit breaker
    const circuitBreaker = this.circuitBreakers.get(endpoint);
    if (circuitBreaker) {
      circuitBreaker.recordFailure();
    }
  }

  private handleMessage(endpoint: string, event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      this.processMessage(message);
      this.resetHeartbeatTimeout(endpoint);

      // Record activity in health monitor
      const healthMonitor = this.healthMonitors.get(endpoint);
      if (healthMonitor) {
        healthMonitor.recordActivity();
      }
    } catch (error) {
      console.error(`[WebSocket][${endpoint}] Failed to parse message:`, error);
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
    const endpoint = this.findEndpointForMessage();
    if (endpoint) {
      // Record pong in health monitor
      const healthMonitor = this.healthMonitors.get(endpoint);
      if (healthMonitor) {
        healthMonitor.recordPong();
      }

      // Clear heartbeat timeout
      this.clearHeartbeatTimeout(endpoint);
    }
  }

  private handleTokenRefresh(message: WebSocketMessage): void {
    // Update stored access token
    const { accessToken, expiresIn } = message.payload as { accessToken: string; expiresIn: number };

    if (accessToken) {
      this.accessToken = accessToken;

      // Store in localStorage for persistence
      const existingAuth = localStorage.getItem('auth');
      if (existingAuth) {
        try {
          const auth = JSON.parse(existingAuth);
          auth.accessToken = accessToken;
          auth.expiresAt = Date.now() + (expiresIn * 1000);
          localStorage.setItem('auth', JSON.stringify(auth));
        } catch (error) {
          console.error('Failed to update stored auth token:', error);
        }
      }

      // Notify auth service of token refresh
      this.dispatchEvent(new CustomEvent('token_refreshed', {
        detail: {
          accessToken,
          expiresIn,
          timestamp: Date.now()
        }
      }));

      console.log('Token refreshed successfully, expires in', expiresIn, 'seconds');
    }
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

  private handleUnexpectedDisconnection(endpoint: 'agent' | 'dashboard'): void {
    console.log(`[WebSocket][${endpoint}] Handling unexpected disconnection`);

    // Record failure in circuit breaker
    const circuitBreaker = this.circuitBreakers.get(endpoint);
    if (circuitBreaker) {
      circuitBreaker.recordFailure();
    }

    // Get or create reconnection manager
    let reconnectionManager = this.reconnectionManagers.get(endpoint);
    if (!reconnectionManager) {
      const config = {
        maxAttempts: this.config.reconnect.maxAttempts,
        baseDelay: this.config.reconnect.baseDelay,
        maxDelay: this.config.reconnect.maxDelay,
        backoffMultiplier: this.config.reconnect.backoffMultiplier,
        jitterFactor: 0.1
      };

      reconnectionManager = new ReconnectionManager(
        config,
        async () => {
          await this.connect(endpoint);
        },
        (error) => {
          console.error(`[WebSocket][${endpoint}] Reconnection attempt failed:`, error.message);
          this.dispatchEvent(new CustomEvent('reconnect_attempt_failed', {
            detail: { endpoint, error }
          }));
        },
        () => {
          console.error(`[WebSocket][${endpoint}] Maximum reconnection attempts reached`);
          this.dispatchEvent(new CustomEvent('reconnect_failed', {
            detail: { endpoint }
          }));
          // Clean up reconnection manager
          const manager = this.reconnectionManagers.get(endpoint);
          if (manager) {
            manager.destroy();
            this.reconnectionManagers.delete(endpoint);
          }
        }
      );

      // Forward reconnection events
      reconnectionManager.addEventListener('reconnection_started', () => {
        this.dispatchEvent(new CustomEvent('reconnecting', {
          detail: { endpoint }
        }));
      });

      reconnectionManager.addEventListener('reconnection_successful', () => {
        console.log(`[WebSocket][${endpoint}] Successfully reconnected`);
        this.dispatchEvent(new CustomEvent('reconnected', {
          detail: { endpoint }
        }));
      });

      this.reconnectionManagers.set(endpoint, reconnectionManager);
    }

    // Start reconnection process
    reconnectionManager.startReconnection();
  }

  private stopReconnection(endpoint: string): void {
    const reconnectionManager = this.reconnectionManagers.get(endpoint);
    if (reconnectionManager) {
      reconnectionManager.stopReconnection();
      reconnectionManager.destroy();
      this.reconnectionManagers.delete(endpoint);
    }
  }

  private startHeartbeat(endpoint: string): void {
    const timer = window.setInterval(() => {
      // Record ping in health monitor
      const healthMonitor = this.healthMonitors.get(endpoint);
      if (healthMonitor) {
        healthMonitor.recordPing();
      }

      this.ping(endpoint as 'agent' | 'dashboard');
      this.setHeartbeatTimeout(endpoint);
    }, this.config.heartbeat.interval);

    this.heartbeatTimers.set(endpoint, timer);
  }

  private startHealthMonitor(endpoint: string): void {
    // Clean up existing monitor
    this.stopHealthMonitor(endpoint);

    const healthMonitor = new ConnectionHealthMonitor(
      () => {
        console.error(`[WebSocket][${endpoint}] Connection unhealthy, triggering reconnection`);
        // Connection is unhealthy, close it to trigger reconnection
        const ws = this.connections.get(endpoint);
        if (ws) {
          ws.close(4000, 'Health check failed');
        }
      },
      5000,  // Check every 5 seconds
      30000  // Unhealthy after 30 seconds of inactivity
    );

    healthMonitor.start();
    this.healthMonitors.set(endpoint, healthMonitor);
  }

  private stopHealthMonitor(endpoint: string): void {
    const healthMonitor = this.healthMonitors.get(endpoint);
    if (healthMonitor) {
      healthMonitor.destroy();
      this.healthMonitors.delete(endpoint);
    }
  }

  private setHeartbeatTimeout(endpoint: string): void {
    this.clearHeartbeatTimeout(endpoint);

    const timeout = window.setTimeout(() => {
      console.error(`[WebSocket][${endpoint}] Heartbeat timeout`);
      // Record failure and close connection to trigger reconnection
      const circuitBreaker = this.circuitBreakers.get(endpoint);
      if (circuitBreaker) {
        circuitBreaker.recordFailure();
      }

      const ws = this.connections.get(endpoint);
      if (ws) {
        ws.close(4001, 'Heartbeat timeout');
      }
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
      window.clearTimeout(timeout);
      this.heartbeatTimeouts.delete(endpoint);
    }
  }

  private clearTimers(endpoint: string): void {
    // Clear heartbeat timer
    const heartbeatTimer = this.heartbeatTimers.get(endpoint);
    if (heartbeatTimer) {
      window.clearInterval(heartbeatTimer);
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


  private findEndpointForMessage(): 'agent' | 'dashboard' | null {
    // Simple heuristic - use dashboard endpoint for responses
    return this.isConnected('dashboard') ? 'dashboard' :
           this.isConnected('agent') ? 'agent' : null;
  }

  private generateMessageId(): string {
    return `msg_${++this.messageId}_${Date.now()}`;
  }

  /**
   * Force immediate reconnection for an endpoint
   */
  forceReconnect(endpoint: 'agent' | 'dashboard'): void {
    const reconnectionManager = this.reconnectionManagers.get(endpoint);
    if (reconnectionManager) {
      reconnectionManager.forceReconnect();
    } else {
      this.handleUnexpectedDisconnection(endpoint);
    }
  }

  /**
   * Get connection health for an endpoint
   */
  getConnectionHealth(endpoint: 'agent' | 'dashboard'): ReturnType<ConnectionHealthMonitor['getHealth']> | null {
    const healthMonitor = this.healthMonitors.get(endpoint);
    return healthMonitor?.getHealth() || null;
  }

  /**
   * Get circuit breaker state for an endpoint
   */
  getCircuitBreakerState(endpoint: 'agent' | 'dashboard'): ReturnType<ConnectionCircuitBreaker['getState']> | null {
    const circuitBreaker = this.circuitBreakers.get(endpoint);
    return circuitBreaker?.getState() || null;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.disconnectAll();

    // Cleanup reconnection managers
    this.reconnectionManagers.forEach(manager => manager.destroy());
    this.reconnectionManagers.clear();

    // Cleanup circuit breakers
    this.circuitBreakers.forEach(breaker => breaker.destroy());
    this.circuitBreakers.clear();

    // Cleanup health monitors
    this.healthMonitors.forEach(monitor => monitor.destroy());
    this.healthMonitors.clear();

    // Clear other resources
    this.eventListeners.clear();
    this.connectionStateListeners.clear();
    this.messageQueue.clear();
    this.heartbeatTimers.clear();
    this.heartbeatTimeouts.clear();
  }
}

// Import configuration
import { config } from '@/services/config';

// Default configuration
export const defaultWebSocketConfig: WebSocketConfig = {
  baseUrl: config.websocket.baseUrl,
  endpoints: config.websocket.endpoints,
  reconnect: {
    maxAttempts: 5,
    backoffMultiplier: 2,
    baseDelay: 1000,
    maxDelay: 30000
  },
  heartbeat: {
    interval: 30000, // 30 seconds - client sends PING every 30s
    timeout: 45000   // 45 seconds - must be > backend ping interval (30s) to avoid false timeouts
  }
};

// Singleton instance
export const webSocketService = new WebSocketService(defaultWebSocketConfig);