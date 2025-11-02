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
import { DashboardSubscriptions } from './connection-pool.js';
import {
  WebSocketMessage,
  MessageType,
  DashboardInitPayload,
  DashboardConnectedPayload,
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
  subscriptions: DashboardSubscriptions;
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

    // TEMP DISABLED FOR COMMAND FORWARDING DEBUG
    // this.server.log.info({
    //   connectionId,
    //   remoteAddress: metadata.remoteAddress
    // }, 'Dashboard WebSocket connection established');

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
      isAuthenticated: false,
      subscriptions: dashboardConnection.subscriptions
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
        // TEMP DISABLED FOR COMMAND FORWARDING DEBUG
        // this.server.log.warn({ connectionId }, 'Dashboard connection authentication timeout');
        this.sendError(connection, 'AUTH_TIMEOUT', 'Authentication timeout');
        connection.socket.close();
      }
    }, 30000); // 30 seconds
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(connection: DashboardConnection, rawMessage: any): Promise<void> {
    let message: WebSocketMessage | undefined;
    try {
      // 🔍 DEBUG: Log raw message receipt
      this.server.log.info({
        connectionId: connection.connectionId,
        rawMessageType: typeof rawMessage,
        rawMessageLength: rawMessage.toString().length,
        timestamp: new Date().toISOString()
      }, '🔍 [MSG-ROUTING-DEBUG] Raw WebSocket message received from dashboard');

      message = JSON.parse(rawMessage.toString());

      // 🔍 DEBUG: Log parsed message
      this.server.log.info({
        connectionId: connection.connectionId,
        messageType: message.type,
        messageId: message.id,
        hasPayload: !!message.payload,
        payloadKeys: message.payload ? Object.keys(message.payload) : []
      }, '🔍 [MSG-ROUTING-DEBUG] Message parsed successfully');

      // Validate message structure
      if (!this.validateMessage(message)) {
        this.server.log.error({ message }, '🔍 [MSG-ROUTING-DEBUG] Message validation FAILED');
        this.sendError(connection.socket, 'INVALID_MESSAGE', 'Invalid message format');
        return;
      }

      this.server.log.info('🔍 [MSG-ROUTING-DEBUG] Message validation PASSED');

      // Check if message type is allowed for dashboard
      const isDashboardMsg = isDashboardMessage(message.type);
      const isPingPong = [MessageType.PING, MessageType.PONG].includes(message.type);

      this.server.log.info({
        messageType: message.type,
        isDashboardMessage: isDashboardMsg,
        isPingPong: isPingPong,
        allowedForDashboard: isDashboardMsg || isPingPong
      }, '🔍 [MSG-ROUTING-DEBUG] Message type check');

      if (!isDashboardMsg && !isPingPong) {
        this.server.log.error({
          messageType: message.type,
          isDashboardMessage: isDashboardMsg
        }, '🔍 [MSG-ROUTING-DEBUG] Message type NOT ALLOWED for dashboard - REJECTED');
        this.sendError(connection.socket, 'INVALID_MESSAGE_TYPE', 'Message type not allowed for dashboard');
        return;
      }

      this.server.log.info({
        messageType: message.type
      }, '🔍 [MSG-ROUTING-DEBUG] Message type check PASSED - routing to switch statement');

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

        // T012: Add COMMAND_REQUEST handler
        case MessageType.COMMAND_REQUEST:
          await this.handleCommandRequest(connection, message);
          break;

        // T013: Add COMMAND_CANCEL handler
        case MessageType.COMMAND_CANCEL:
          await this.handleCommandCancel(connection, message);
          break;

        // T014: Add AGENT_CONTROL handler
        case MessageType.AGENT_CONTROL:
          await this.handleAgentControl(connection, message);
          break;

        // T015: Add EMERGENCY_STOP handler
        case MessageType.EMERGENCY_STOP:
          await this.handleEmergencyStop(connection, message);
          break;

        default:
          this.sendError(connection.socket, 'UNKNOWN_MESSAGE_TYPE', `Unknown message type: ${message.type}`);
      }

      // Note: ACK messages are not sent here anymore. Each handler should send appropriate response messages

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.server.log.error({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
          ...(error.cause && { cause: error.cause })
        },
        rawError: err,
        connectionId: connection.connectionId,
        messageType: message?.type
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

      const authContext = await this.services.authService.validateToken(token);
      if (!authContext || authContext.userId !== userId) {
        this.sendError(connection.socket, 'UNAUTHORIZED', 'Invalid authentication token');
        return;
      }

      // Set user ID and authenticate
      connection.userId = userId;
      connection.isAuthenticated = true;

      // Register token with TokenManager for automatic refresh
      const tokenInfo = authContext;
      if (tokenInfo && tokenInfo.expiresAt) {
        this.dependencies.tokenManager.registerToken(
          connection.connectionId,
          token,
          tokenInfo.expiresAt * 1000, // Convert to milliseconds
          tokenInfo.refreshToken,
          userId,
          undefined // No agentId for dashboard connections
        );
      }

      // Setup initial subscriptions if provided
      if (subscriptions) {
        // Handle agent subscriptions - empty array means "subscribe to all"
        if (subscriptions.agents !== undefined) {
          // Ensure agents is an array
          const agentsArray = Array.isArray(subscriptions.agents)
            ? subscriptions.agents
            : [];

          if (agentsArray.length === 0) {
            // Empty array = subscribe to all agents
            connection.subscriptions.agents.add('*');
            this.server.log.info('Dashboard subscribed to all agents');
          } else {
            // Specific agent IDs
            agentsArray.forEach(agentId => connection.subscriptions.agents.add(agentId));
            this.server.log.info('Dashboard subscribed to specific agents:', agentsArray);
          }
        }

        // Handle command subscriptions - empty array means "subscribe to all"
        if (subscriptions.commands !== undefined) {
          // Ensure commands is an array
          const commandsArray = Array.isArray(subscriptions.commands)
            ? subscriptions.commands
            : [];

          if (commandsArray.length === 0) {
            // Empty array = subscribe to all commands
            connection.subscriptions.commands.add('*');
            this.server.log.info('Dashboard subscribed to all commands');
          } else {
            // Specific command IDs
            commandsArray.forEach(commandId => connection.subscriptions.commands.add(commandId));
            this.server.log.info('Dashboard subscribed to specific commands:', commandsArray);
          }
        }

        // Handle trace subscriptions - boolean flag
        if (subscriptions.traces !== undefined) {
          connection.subscriptions.traces = Boolean(subscriptions.traces);
          this.server.log.info('Dashboard trace subscription:', subscriptions.traces);
        }

        // Handle terminal subscriptions - boolean flag
        if (subscriptions.terminals !== undefined) {
          connection.subscriptions.terminals = Boolean(subscriptions.terminals);
          this.server.log.info('Dashboard terminal subscription:', subscriptions.terminals);
        }
      }

      // Update connection pool with auth info and subscriptions
      this.dependencies.connectionPool.updateConnection(connection.connectionId, {
        isAuthenticated: true,
        userId,
        subscriptions: connection.subscriptions
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

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.server.log.error({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
          ...(error.cause && { cause: error.cause })
        },
        rawError: err,
        userId,
        connectionId: connection.connectionId
      }, 'Failed to initialize dashboard');
      this.sendError(connection.socket, 'INIT_FAILED', `Dashboard initialization failed: ${error.message}`);
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

      // TEMP DISABLED FOR COMMAND FORWARDING DEBUG
      // this.server.log.debug({
      //   connectionId: connection.connectionId,
      //   type,
      //   id,
      //   all
      // }, 'Dashboard subscription added');

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.server.log.error({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        type,
        id,
        connectionId: connection.connectionId
      }, 'Failed to handle dashboard subscription');
      this.sendError(connection.socket, 'SUBSCRIPTION_FAILED', `Failed to add subscription: ${error.message}`);
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

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.server.log.error({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        type,
        id,
        connectionId: connection.connectionId
      }, 'Failed to handle dashboard unsubscription');
      this.sendError(connection.socket, 'UNSUBSCRIPTION_FAILED', `Failed to remove subscription: ${error.message}`);
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

      // T019: Clean up tracked commands for this dashboard
      this.dependencies.messageRouter.cleanupDashboardCommands(connectionId);

      // Unregister token from TokenManager
      this.dependencies.tokenManager.unregisterToken(connectionId);

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
      // Step 1: Fetch agents
      this.server.log.debug({
        connectionId: connection.connectionId,
        userId: connection.userId,
        step: 'fetch_agents'
      }, 'sendInitialData: Fetching agents for user');

      const agents = await this.services.agentService.listAgents({
        user_id: connection.userId
      });

      this.server.log.debug({
        connectionId: connection.connectionId,
        agentCount: agents.length,
        step: 'fetch_agents_complete'
      }, 'sendInitialData: Agents fetched successfully');

      // Step 2: Build agent list
      this.server.log.debug({
        connectionId: connection.connectionId,
        step: 'build_agent_list'
      }, 'sendInitialData: Building agent list');

      const agentList = agents.map(agent => ({
        agentId: agent.id,
        name: agent.name,
        type: agent.type?.toUpperCase() || 'UNKNOWN',
        status: agent.status?.toUpperCase() || 'OFFLINE',
        version: agent.version || 'unknown',
        capabilities: agent.capabilities || [],
        lastHeartbeat: agent.last_ping,
      }));

      // Step 3: Send dashboard:connected message
      this.server.log.debug({
        connectionId: connection.connectionId,
        step: 'send_connected_message',
        agentCount: agentList.length
      }, 'sendInitialData: Sending DASHBOARD_CONNECTED message');

      const dashboardConnectedMessage: TypedWebSocketMessage<MessageType.DASHBOARD_CONNECTED> = {
        type: MessageType.DASHBOARD_CONNECTED,
        id: this.generateMessageId(),
        timestamp: Date.now(),
        payload: {
          agents: agentList,
          timestamp: Date.now()
        }
      };

      connection.socket.socket.send(JSON.stringify(dashboardConnectedMessage));

      this.server.log.debug({
        connectionId: connection.connectionId,
        step: 'send_connected_message_complete'
      }, 'sendInitialData: DASHBOARD_CONNECTED message sent');

      // Step 4: Send agent statuses
      this.server.log.debug({
        connectionId: connection.connectionId,
        step: 'send_agent_statuses',
        subscribedAgents: Array.from(connection.subscriptions.agents)
      }, 'sendInitialData: Sending agent statuses');

      // Get live agent connections from connection pool to determine actual connection status
      const liveAgentConnections = this.dependencies.connectionPool.getConnectionsByType('agent');
      const liveAgentIds = new Set<string>();

      for (const [_, conn] of liveAgentConnections) {
        if (conn.agentId && conn.isAuthenticated) {
          liveAgentIds.add(conn.agentId);
        }
      }

      agents.forEach(agent => {
        // Check if subscribed to this specific agent OR subscribed to all agents (*)
        if (connection.subscriptions.agents.has(agent.id) || connection.subscriptions.agents.has('*')) {
          // Check if agent has an active WebSocket connection
          const isConnected = liveAgentIds.has(agent.id);

          this.sendMessage(connection.socket, MessageType.AGENT_STATUS, {
            agentId: agent.id,
            status: isConnected ? 'connected' : (agent.status || 'disconnected'),
            activityState: agent.activityState || 'IDLE',
            healthMetrics: agent.healthMetrics,
            currentCommand: agent.currentCommand,
            queuedCommands: agent.queuedCommands || 0
          });
        }
      });

      // Step 5: Send command statuses
      this.server.log.debug({
        connectionId: connection.connectionId,
        step: 'fetch_commands'
      }, 'sendInitialData: Fetching active commands');

      const commands = await this.services.commandService.getActiveCommands();

      this.server.log.debug({
        connectionId: connection.connectionId,
        commandCount: commands.length,
        step: 'fetch_commands_complete'
      }, 'sendInitialData: Active commands fetched');

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

      this.server.log.info({
        connectionId: connection.connectionId,
        userId: connection.userId,
        agentCount: agents.length,
        commandCount: commands.length
      }, 'sendInitialData: Complete - Sent initial data to dashboard');

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.server.log.error({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        connectionId: connection.connectionId,
        userId: connection.userId
      }, 'sendInitialData: Failed to send initial data');
      throw error;  // Re-throw to be caught by parent handler
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
              // Check if agent has an active WebSocket connection
              const liveAgents = this.dependencies.connectionPool.getConnectionsByType('agent');
              let isConnected = false;
              for (const [_, conn] of liveAgents) {
                if (conn.agentId === id && conn.isAuthenticated) {
                  isConnected = true;
                  break;
                }
              }

              this.sendMessage(connection.socket, MessageType.AGENT_STATUS, {
                agentId: agent.id,
                status: isConnected ? 'connected' : (agent.status || 'disconnected'),
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
   * T012: Handle COMMAND_REQUEST from dashboard
   */
  private async handleCommandRequest(
    connection: DashboardConnection,
    message: WebSocketMessage
  ): Promise<void> {
    this.server.log.info('==================== COMMAND REQUEST START ====================');
    this.server.log.info('Command request received:', {
      connectionId: connection.connectionId,
      isAuthenticated: connection.isAuthenticated,
      messageId: message.id,
      payload: message.payload,
      timestamp: new Date().toISOString()
    });

    if (!connection.isAuthenticated) {
      this.server.log.error('Command rejected: Not authenticated');
      this.sendError(connection.socket, 'UNAUTHORIZED', 'Must be authenticated to send commands');
      return;
    }

    const { agentId, commandId, command, args } = message.payload;

    this.server.log.info('Command details:', {
      agentId,
      commandId,
      command,
      commandType: typeof command,
      commandLength: command?.length,
      args,
      hasArgs: !!args && args.length > 0
    });

    // Track command for this dashboard
    this.dependencies.messageRouter.registerCommandForDashboard(commandId, connection.connectionId);
    this.server.log.info('Command registered for dashboard tracking');

    // Add to dashboard's command subscriptions
    connection.subscriptions.commands.add(commandId);
    this.server.log.info('Command added to dashboard subscriptions');

    // Route command to agent with protocol-compliant payload
    this.server.log.info('Attempting to route command to agent:', agentId);
    const routed = this.dependencies.messageRouter.sendCommandToAgent(agentId, {
      commandId,
      content: command,           // Protocol-compliant field name
      command,                    // Maintain backward compatibility
      type: 'NATURAL',            // Command type from protocol
      priority: 5,                // Normal priority (0=high, 5=normal, 10=low)
      args: args || [],           // Ensure args is always an array
      executionConstraints: {     // Protocol-compliant constraints
        timeLimitMs: 300000,      // 5 minutes
        maxRetries: 1
      },
      dashboardId: connection.connectionId,
      userId: connection.userId
    });

    if (routed) {
      this.server.log.info({
        connectionId: connection.connectionId,
        agentId,
        commandId,
        command
      }, 'Command request routed to agent');

      // Send ACK to dashboard
      this.sendMessage(connection.socket, MessageType.ACK, {
        messageId: message.id,
        success: true,
        commandId
      });
      this.server.log.info('==================== COMMAND REQUEST SUCCESS ====================');
    } else {
      this.server.log.error('Failed to route command to agent:', {
        agentId,
        commandId,
        possibleReasons: [
          'Agent not connected',
          'Agent not in connection pool',
          'Message router failed',
          'Agent ID mismatch'
        ]
      });
      this.sendError(connection.socket, 'ROUTING_FAILED', 'Failed to route command to agent');
      this.dependencies.messageRouter.cleanupCommand(commandId);
      this.server.log.error('==================== COMMAND REQUEST FAILED ====================');
    }
  }

  /**
   * T013: Handle COMMAND_CANCEL from dashboard
   */
  private async handleCommandCancel(
    connection: DashboardConnection,
    message: WebSocketMessage
  ): Promise<void> {
    if (!connection.isAuthenticated) {
      this.sendError(connection.socket, 'UNAUTHORIZED', 'Must be authenticated to cancel commands');
      return;
    }

    const { agentId, commandId, reason } = message.payload;

    // Verify dashboard initiated this command
    const dashboardId = this.dependencies.messageRouter.getDashboardForCommand(commandId);
    if (dashboardId !== connection.connectionId) {
      this.sendError(connection.socket, 'FORBIDDEN', 'Cannot cancel command from another dashboard');
      return;
    }

    // Route cancellation to agent
    const routed = this.dependencies.messageRouter.cancelCommandOnAgent(agentId, commandId, reason);

    if (routed) {
      this.server.log.info({
        connectionId: connection.connectionId,
        agentId,
        commandId
      }, 'Command cancel routed to agent');

      // Send ACK
      this.sendMessage(connection.socket, MessageType.ACK, {
        messageId: message.id,
        success: true,
        commandId
      });
    } else {
      this.sendError(connection.socket, 'ROUTING_FAILED', 'Failed to route cancellation to agent');
    }
  }

  /**
   * T014: Handle AGENT_CONTROL from dashboard
   */
  private async handleAgentControl(
    connection: DashboardConnection,
    message: WebSocketMessage
  ): Promise<void> {
    if (!connection.isAuthenticated) {
      this.sendError(connection.socket, 'UNAUTHORIZED', 'Must be authenticated to control agents');
      return;
    }

    const { agentId, action } = message.payload;

    // Route control command to agent
    const routed = this.dependencies.messageRouter.sendAgentControl(
      agentId,
      action,
      `Control from dashboard ${connection.userId}`
    );

    if (routed) {
      this.server.log.info({
        connectionId: connection.connectionId,
        agentId,
        action
      }, 'Agent control command routed');

      // Send ACK
      this.sendMessage(connection.socket, MessageType.ACK, {
        messageId: message.id,
        success: true,
        agentId,
        action
      });
    } else {
      this.sendError(connection.socket, 'ROUTING_FAILED', 'Failed to route control command to agent');
    }
  }

  /**
   * T015: Handle EMERGENCY_STOP from dashboard
   */
  private async handleEmergencyStop(
    connection: DashboardConnection,
    message: WebSocketMessage
  ): Promise<void> {
    if (!connection.isAuthenticated) {
      this.sendError(connection.socket, 'UNAUTHORIZED', 'Must be authenticated to trigger emergency stop');
      return;
    }

    const { reason } = message.payload;

    this.server.log.warn({
      connectionId: connection.connectionId,
      userId: connection.userId,
      reason
    }, 'Emergency stop triggered by dashboard');

    // Broadcast emergency stop to all agents
    this.dependencies.messageRouter.broadcastEmergencyStop({
      reason,
      triggeredBy: connection.userId,
      timestamp: Date.now()
    });

    // Send ACK
    this.sendMessage(connection.socket, MessageType.ACK, {
      messageId: message.id,
      success: true
    });

    // Emit event for audit logging
    this.emit('emergencyStopTriggered', {
      userId: connection.userId,
      connectionId: connection.connectionId,
      reason
    });
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
