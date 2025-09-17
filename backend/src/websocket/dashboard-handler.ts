/**
 * Dashboard WebSocket Handler for Onsembl.ai
 * Handles incoming connections from dashboard clients
 */

import { FastifyInstance } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { IncomingMessage } from 'http';
import { EventEmitter } from 'events';
import { Services } from '../server.js';
import { WebSocketDependencies } from './setup.js';
import { extractConnectionMetadata } from './setup.js';
import {
  WebSocketMessage,
  MessageType,
  DashboardInitPayload,
  DashboardSubscribePayload,
  DashboardUnsubscribePayload,
  TypedWebSocketMessage,
  isDashboardMessage
} from '../../../packages/agent-protocol/src/types.js';

export interface DashboardConnection {
  connectionId: string;
  userId: string;
  socket: SocketStream;
  metadata: ReturnType<typeof extractConnectionMetadata>;
  isAuthenticated: boolean;
  subscriptions: {
    agents: Set<string>;
    commands: Set<string>;
    traces: boolean;
    terminals: boolean;
  };
  lastPing: number;
}

export class DashboardWebSocketHandler extends EventEmitter {
  private connections = new Map<string, DashboardConnection>();

  constructor(
    private server: FastifyInstance,
    private services: Services,
    private dependencies: WebSocketDependencies
  ) {
    super();
    this.setupEventListeners();
  }

  /**
   * Handle new dashboard WebSocket connection
   */
  async handleConnection(connection: SocketStream, request: IncomingMessage): Promise<void> {
    const connectionId = this.generateConnectionId();
    const metadata = extractConnectionMetadata(request);

    this.server.log.info({
      connectionId,
      remoteAddress: metadata.remoteAddress
    }, 'Dashboard WebSocket connection established');

    // Create connection record
    const dashboardConnection: DashboardConnection = {
      connectionId,
      userId: '', // Will be set on DASHBOARD_INIT
      socket: connection,
      metadata,
      isAuthenticated: false,
      subscriptions: {
        agents: new Set(),
        commands: new Set(),
        traces: false,
        terminals: false
      },
      lastPing: Date.now()
    };

    // Add to connection pool
    this.dependencies.connectionPool.addConnection(connectionId, {
      type: 'dashboard',
      socket: connection,
      metadata,
      isAuthenticated: false
    });

    // Setup message handlers
    connection.socket.on('message', async (rawMessage) => {
      await this.handleMessage(dashboardConnection, rawMessage);
    });

    connection.socket.on('close', () => {
      this.handleDisconnection(connectionId);
    });

    connection.socket.on('error', (error) => {
      this.handleError(connectionId, error);
    });

    // Store connection temporarily until authentication
    this.connections.set(connectionId, dashboardConnection);

    // Set authentication timeout
    setTimeout(() => {
      if (!dashboardConnection.isAuthenticated) {
        this.server.log.warn({ connectionId }, 'Dashboard connection authentication timeout');
        this.sendError(connection, 'AUTH_TIMEOUT', 'Authentication timeout');
        connection.socket.close();
      }
    }, 30000); // 30 seconds
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(connection: DashboardConnection, rawMessage: any): Promise<void> {
    try {
      const message: WebSocketMessage = JSON.parse(rawMessage.toString());

      // Validate message structure
      if (!this.validateMessage(message)) {
        this.sendError(connection.socket, 'INVALID_MESSAGE', 'Invalid message format');
        return;
      }

      // Check if message type is allowed for dashboard
      if (!isDashboardMessage(message.type) && ![MessageType.PING, MessageType.PONG].includes(message.type)) {
        this.sendError(connection.socket, 'INVALID_MESSAGE_TYPE', 'Message type not allowed for dashboard');
        return;
      }

      // Log message for debugging
      this.server.log.debug({
        connectionId: connection.connectionId,
        type: message.type
      }, 'Dashboard message received');

      // Route message based on type
      switch (message.type) {
        case MessageType.DASHBOARD_INIT:
          await this.handleDashboardInit(connection, message as TypedWebSocketMessage<MessageType.DASHBOARD_INIT>);
          break;

        case MessageType.DASHBOARD_SUBSCRIBE:
          await this.handleDashboardSubscribe(connection, message as TypedWebSocketMessage<MessageType.DASHBOARD_SUBSCRIBE>);
          break;

        case MessageType.DASHBOARD_UNSUBSCRIBE:
          await this.handleDashboardUnsubscribe(connection, message as TypedWebSocketMessage<MessageType.DASHBOARD_UNSUBSCRIBE>);
          break;

        case MessageType.PING:
          await this.handlePing(connection, message);
          break;

        case MessageType.PONG:
          await this.handlePong(connection, message);
          break;

        default:
          this.sendError(connection.socket, 'UNKNOWN_MESSAGE_TYPE', `Unknown message type: ${message.type}`);
      }

      // Note: ACK messages are not sent here anymore. Each handler should send appropriate response messages

    } catch (error) {
      this.server.log.error({
        error,
        connectionId: connection.connectionId
      }, 'Error handling dashboard message');
      this.sendError(connection.socket, 'INTERNAL_ERROR', 'Failed to process message');
    }
  }

  /**
   * Handle dashboard initialization
   */
  private async handleDashboardInit(
    connection: DashboardConnection,
    message: TypedWebSocketMessage<MessageType.DASHBOARD_INIT>
  ): Promise<void> {
    const { userId, subscriptions } = message.payload;

    try {
      // Authenticate user using WebSocketAuth
      const token = connection.metadata.headers['authorization']?.replace('Bearer ', '') ||
                   connection.metadata.query?.token as string;

      if (!token) {
        this.sendError(connection.socket, 'UNAUTHORIZED', 'No authentication token provided');
        return;
      }

      const authContext = await this.dependencies.auth.validateToken(token);
      if (!authContext || authContext.userId !== userId) {
        this.sendError(connection.socket, 'UNAUTHORIZED', 'Invalid authentication token');
        return;
      }

      // Set user ID and authenticate
      connection.userId = userId;
      connection.isAuthenticated = true;

      // Setup initial subscriptions if provided
      if (subscriptions) {
        if (subscriptions.agents) {
          subscriptions.agents.forEach(agentId => connection.subscriptions.agents.add(agentId));
        }
        if (subscriptions.commands) {
          subscriptions.commands.forEach(commandId => connection.subscriptions.commands.add(commandId));
        }
        if (subscriptions.traces !== undefined) {
          connection.subscriptions.traces = subscriptions.traces;
        }
        if (subscriptions.terminals !== undefined) {
          connection.subscriptions.terminals = subscriptions.terminals;
        }
      }

      // Update connection pool
      this.dependencies.connectionPool.updateConnection(connection.connectionId, {
        isAuthenticated: true,
        userId
      });

      // Start heartbeat monitoring
      this.dependencies.heartbeatManager.startMonitoring(connection.connectionId);

      // Send initial data
      await this.sendInitialData(connection);

      // Send success acknowledgment with connection details
      this.sendMessage(connection.socket, MessageType.ACK, {
        messageId: message.id,
        success: true,
        connectionId: connection.connectionId,
        subscriptions: {
          agents: Array.from(connection.subscriptions.agents),
          commands: Array.from(connection.subscriptions.commands),
          traces: connection.subscriptions.traces,
          terminals: connection.subscriptions.terminals
        }
      });

      // Notify other systems
      this.emit('dashboardConnected', { userId, connectionId: connection.connectionId });

      this.server.log.info({
        userId,
        connectionId: connection.connectionId
      }, 'Dashboard authenticated and connected');

    } catch (error) {
      this.server.log.error({ error, userId }, 'Failed to initialize dashboard');
      this.sendError(connection.socket, 'INIT_FAILED', 'Dashboard initialization failed');
      connection.socket.close();
    }
  }

  /**
   * Handle dashboard subscription request
   */
  private async handleDashboardSubscribe(
    connection: DashboardConnection,
    message: TypedWebSocketMessage<MessageType.DASHBOARD_SUBSCRIBE>
  ): Promise<void> {
    const { type, id, all } = message.payload;

    try {
      switch (type) {
        case 'agent':
          if (all) {
            // Subscribe to all agents
            const agents = await this.services.agentService.listAgents();
            agents.forEach(agent => connection.subscriptions.agents.add(agent.id));
          } else if (id) {
            connection.subscriptions.agents.add(id);
          }
          break;

        case 'command':
          if (all) {
            // Subscribe to all commands (not practical, so subscribe to active ones)
            const commands = await this.services.commandService.getActiveCommands();
            commands.forEach(command => connection.subscriptions.commands.add(command.id));
          } else if (id) {
            connection.subscriptions.commands.add(id);
          }
          break;

        case 'trace':
          connection.subscriptions.traces = true;
          break;

        case 'terminal':
          connection.subscriptions.terminals = true;
          break;
      }

      // Send current data for new subscriptions
      await this.sendSubscriptionData(connection, type, id, all);

      // Send success acknowledgment
      this.sendMessage(connection.socket, MessageType.ACK, {
        messageId: message.id,
        success: true,
        subscription: { type, id, all },
        subscriptions: {
          agents: Array.from(connection.subscriptions.agents),
          commands: Array.from(connection.subscriptions.commands),
          traces: connection.subscriptions.traces,
          terminals: connection.subscriptions.terminals
        }
      });

      this.server.log.debug({
        connectionId: connection.connectionId,
        type,
        id,
        all
      }, 'Dashboard subscription added');

    } catch (error) {
      this.server.log.error({ error, type, id }, 'Failed to handle dashboard subscription');
      this.sendError(connection.socket, 'SUBSCRIPTION_FAILED', 'Failed to add subscription');
    }
  }

  /**
   * Handle dashboard unsubscription request
   */
  private async handleDashboardUnsubscribe(
    connection: DashboardConnection,
    message: TypedWebSocketMessage<MessageType.DASHBOARD_UNSUBSCRIBE>
  ): Promise<void> {
    const { type, id, all } = message.payload;

    try {
      switch (type) {
        case 'agent':
          if (all) {
            connection.subscriptions.agents.clear();
          } else if (id) {
            connection.subscriptions.agents.delete(id);
          }
          break;

        case 'command':
          if (all) {
            connection.subscriptions.commands.clear();
          } else if (id) {
            connection.subscriptions.commands.delete(id);
          }
          break;

        case 'trace':
          connection.subscriptions.traces = false;
          break;

        case 'terminal':
          connection.subscriptions.terminals = false;
          break;
      }

      // Send success acknowledgment
      this.sendMessage(connection.socket, MessageType.ACK, {
        messageId: message.id,
        success: true,
        unsubscription: { type, id, all },
        subscriptions: {
          agents: Array.from(connection.subscriptions.agents),
          commands: Array.from(connection.subscriptions.commands),
          traces: connection.subscriptions.traces,
          terminals: connection.subscriptions.terminals
        }
      });

      this.server.log.debug({
        connectionId: connection.connectionId,
        type,
        id,
        all
      }, 'Dashboard subscription removed');

    } catch (error) {
      this.server.log.error({ error, type, id }, 'Failed to handle dashboard unsubscription');
      this.sendError(connection.socket, 'UNSUBSCRIPTION_FAILED', 'Failed to remove subscription');
    }
  }

  /**
   * Handle ping message
   */
  private async handlePing(connection: DashboardConnection, message: WebSocketMessage): Promise<void> {
    connection.lastPing = Date.now();

    // Send pong response
    this.sendMessage(connection.socket, MessageType.PONG, {
      timestamp: message.payload.timestamp,
      latency: Date.now() - message.payload.timestamp
    });
  }

  /**
   * Handle pong message
   */
  private async handlePong(connection: DashboardConnection, message: WebSocketMessage): Promise<void> {
    // Update connection health
    connection.lastPing = Date.now();

    // Record pong with heartbeat manager
    if (message.payload?.timestamp) {
      this.dependencies.heartbeatManager.recordPong(connection.connectionId, message.payload.timestamp);
    }
  }

  /**
   * Handle connection disconnection
   */
  private handleDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);

    if (connection) {
      this.server.log.info({
        connectionId,
        userId: connection.userId
      }, 'Dashboard WebSocket connection closed');

      // Stop heartbeat monitoring
      this.dependencies.heartbeatManager.stopMonitoring(connectionId);

      // Remove from connection pool
      this.dependencies.connectionPool.removeConnection(connectionId);

      // Remove from local store
      this.connections.delete(connectionId);

      // Emit disconnection event
      this.emit('dashboardDisconnected', { connectionId, userId: connection.userId });
    }
  }

  /**
   * Handle connection errors
   */
  private handleError(connectionId: string, error: Error): void {
    const connection = this.connections.get(connectionId);
    this.server.log.error({
      error,
      connectionId,
      userId: connection?.userId
    }, 'Dashboard WebSocket error');
  }

  /**
   * Broadcast message to specific dashboard connections
   */
  broadcast(type: MessageType, payload: any, filter?: (connection: DashboardConnection) => boolean): void {
    const connections = filter
      ? Array.from(this.connections.values()).filter(filter)
      : Array.from(this.connections.values());

    connections.forEach(connection => {
      if (connection.isAuthenticated) {
        this.sendMessage(connection.socket, type, payload);
      }
    });
  }

  /**
   * Send message to specific dashboard connection
   */
  sendToConnection(connectionId: string, type: MessageType, payload: any): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.isAuthenticated) {
      return false;
    }

    return this.sendMessage(connection.socket, type, payload);
  }

  /**
   * Send agent status updates to subscribed dashboards
   */
  broadcastAgentStatus(agentId: string, payload: any): void {
    this.broadcast(
      MessageType.AGENT_STATUS,
      payload,
      conn => conn.subscriptions.agents.has(agentId)
    );
  }

  /**
   * Send command status updates to subscribed dashboards
   */
  broadcastCommandStatus(commandId: string, payload: any): void {
    this.broadcast(
      MessageType.COMMAND_STATUS,
      payload,
      conn => conn.subscriptions.commands.has(commandId)
    );
  }

  /**
   * Send terminal stream to subscribed dashboards
   */
  broadcastTerminalStream(payload: any): void {
    this.broadcast(
      MessageType.TERMINAL_STREAM,
      payload,
      conn => conn.subscriptions.terminals
    );
  }

  /**
   * Send trace stream to subscribed dashboards
   */
  broadcastTraceStream(payload: any): void {
    this.broadcast(
      MessageType.TRACE_STREAM,
      payload,
      conn => conn.subscriptions.traces
    );
  }

  /**
   * Send emergency stop notification
   */
  broadcastEmergencyStop(payload: any): void {
    this.broadcast(MessageType.EMERGENCY_STOP, payload);
  }

  /**
   * Send queue update to relevant dashboards
   */
  broadcastQueueUpdate(agentId: string, payload: any): void {
    this.broadcast(
      MessageType.QUEUE_UPDATE,
      payload,
      conn => conn.subscriptions.agents.has(agentId)
    );
  }

  /**
   * Send initial data to newly connected dashboard
   */
  private async sendInitialData(connection: DashboardConnection): Promise<void> {
    try {
      // Send agent statuses
      const agents = await this.services.agentService.listAgents();
      agents.forEach(agent => {
        if (connection.subscriptions.agents.has(agent.id)) {
          this.sendMessage(connection.socket, MessageType.AGENT_STATUS, {
            agentId: agent.id,
            status: agent.status,
            activityState: agent.activityState || 'IDLE',
            healthMetrics: agent.healthMetrics,
            currentCommand: agent.currentCommand,
            queuedCommands: agent.queuedCommands || 0
          });
        }
      });

      // Send command statuses
      const commands = await this.services.commandService.getActiveCommands();
      commands.forEach(command => {
        if (connection.subscriptions.commands.has(command.id)) {
          this.sendMessage(connection.socket, MessageType.COMMAND_STATUS, {
            commandId: command.id,
            agentId: command.agentId,
            status: command.status,
            progress: command.progress,
            startedAt: command.startedAt?.getTime(),
            completedAt: command.completedAt?.getTime()
          });
        }
      });

    } catch (error) {
      this.server.log.error({ error, connectionId: connection.connectionId }, 'Failed to send initial data');
    }
  }

  /**
   * Send subscription-specific data
   */
  private async sendSubscriptionData(
    connection: DashboardConnection,
    type: string,
    id?: string,
    all?: boolean
  ): Promise<void> {
    try {
      switch (type) {
        case 'agent':
          if (id) {
            const agent = await this.services.agentService.getAgent(id);
            if (agent) {
              this.sendMessage(connection.socket, MessageType.AGENT_STATUS, {
                agentId: agent.id,
                status: agent.status,
                activityState: agent.activityState || 'IDLE',
                healthMetrics: agent.healthMetrics,
                currentCommand: agent.currentCommand,
                queuedCommands: agent.queuedCommands || 0
              });
            }
          }
          break;

        case 'command':
          if (id) {
            const command = await this.services.commandService.getCommand(id);
            if (command) {
              this.sendMessage(connection.socket, MessageType.COMMAND_STATUS, {
                commandId: command.id,
                agentId: command.agentId,
                status: command.status,
                progress: command.progress,
                startedAt: command.startedAt?.getTime(),
                completedAt: command.completedAt?.getTime()
              });
            }
          }
          break;
      }
    } catch (error) {
      this.server.log.error({ error, type, id }, 'Failed to send subscription data');
    }
  }

  /**
   * Send message helper
   */
  private sendMessage(socket: SocketStream, type: MessageType, payload: any): boolean {
    try {
      const message: WebSocketMessage = {
        type,
        id: this.generateMessageId(),
        timestamp: Date.now(),
        payload
      };

      socket.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      this.server.log.error({ error, type }, 'Failed to send message');
      return false;
    }
  }

  /**
   * Send error message
   */
  private sendError(socket: SocketStream, code: string, message: string, details?: any): void {
    this.sendMessage(socket, MessageType.ERROR, {
      code,
      message,
      details
    });
  }


  /**
   * Validate message structure
   */
  private validateMessage(message: any): message is WebSocketMessage {
    return (
      message &&
      typeof message.type === 'string' &&
      typeof message.id === 'string' &&
      typeof message.timestamp === 'number' &&
      message.payload !== undefined
    );
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `dashboard-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Setup event listeners for dependencies
   */
  private setupEventListeners(): void {
    // Listen for token refresh events
    this.dependencies.tokenManager.on('tokenRefreshed', ({ connectionId, token }) => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        this.sendMessage(connection.socket, MessageType.TOKEN_REFRESH, token);
      }
    });

    // Listen for heartbeat timeout events
    this.dependencies.heartbeatManager.on('connectionTimeout', (connectionId) => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        this.server.log.warn({ connectionId, userId: connection.userId }, 'Dashboard connection timed out');
        connection.socket.socket.close();
      }
    });
  }
}

/**
 * Create dashboard handler instance
 */
export function createDashboardHandler(
  server: FastifyInstance,
  services: Services,
  dependencies: WebSocketDependencies
): DashboardWebSocketHandler {
  return new DashboardWebSocketHandler(server, services, dependencies);
}