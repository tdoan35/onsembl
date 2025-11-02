/**
 * Message Router for Onsembl.ai WebSockets
 * Routes messages between agents, dashboards, and internal systems
 */

import { FastifyInstance } from 'fastify';
import { EventEmitter } from 'events';
import { ConnectionPool } from './connection-pool.js';
import {
  WebSocketMessage,
  MessageType,
  AgentStatusPayload,
  CommandStatusPayload,
  TerminalStreamPayload,
  TraceStreamPayload,
  QueueUpdatePayload,
  EmergencyStopPayload
} from '../../../packages/agent-protocol/src/types.js';

export interface MessageRouterConfig {
  maxQueueSize: number;
  messageTimeoutMs: number;
  retryAttempts: number;
}

export interface QueuedMessage {
  id: string;
  message: WebSocketMessage;
  targetType: 'agent' | 'dashboard' | 'specific';
  targetId?: string;
  priority: number;
  attempts: number;
  createdAt: number;
  scheduledAt?: number;
  filter?: (connectionId: string, metadata: any) => boolean;
}

export interface RoutingStats {
  messagesSent: number;
  messagesQueued: number;
  messagesFailed: number;
  messagesDropped: number;
  averageLatency: number;
  queueSize: number;
}

export class MessageRouter extends EventEmitter {
  private messageQueue = new Map<string, QueuedMessage>();
  private routingStats: RoutingStats = {
    messagesSent: 0,
    messagesQueued: 0,
    messagesFailed: 0,
    messagesDropped: 0,
    averageLatency: 0,
    queueSize: 0
  };

  private processingTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private latencyHistory: number[] = [];

  // T011: Command-to-Dashboard tracking for response routing
  private commandToDashboard = new Map<string, string>(); // commandId -> dashboardConnectionId
  private dashboardCommands = new Map<string, Set<string>>(); // dashboardConnectionId -> Set<commandId>

  // T021: Command TTL tracking
  private commandTimestamps = new Map<string, number>(); // commandId -> timestamp
  private commandTTL = 3600000; // 1 hour default TTL

  constructor(
    private server: FastifyInstance,
    private connectionPool: ConnectionPool,
    private config: MessageRouterConfig
  ) {
    super();
    this.startMessageProcessing();
  }

  /**
   * Route message to specific agent
   */
  routeToAgent(agentId: string, type: MessageType, payload: any, priority: number = 5): boolean {
    const message: WebSocketMessage = {
      type,
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload
    };

    // KEEP FOR COMMAND FORWARDING DEBUG
    this.server.log.info('==================== [CMD-FWD] ROUTE TO AGENT START ====================');
    this.server.log.info({
      action: 'route_to_agent',
      agentId,
      messageType: type,
      messageId: message.id,
      priority,
      payloadKeys: Object.keys(payload),
      payload: type === MessageType.COMMAND_REQUEST ? payload : undefined
    }, '[CMD-FWD] Routing message to specific agent');

    // Check if agent is in connection pool
    const agentConnections = this.connectionPool.getConnectionsByAgentId(agentId);

    // 🔍 DEBUG: Log connection pool lookup details
    this.server.log.info({
      lookingForAgentId: agentId,
      agentIdType: typeof agentId,
      connectionsFound: agentConnections.size,
      connectionEntries: Array.from(agentConnections.entries()).map(([id, conn]) => ({
        key: id,
        keyType: typeof id,
        agentId: conn.agentId,
        agentIdType: typeof conn.agentId,
        match: conn.agentId === agentId,
        strictMatch: conn.agentId === agentId
      }))
    }, '🔍 [AGENT-ROUTING-DEBUG] Connection pool lookup result');

    const agentConnection = agentConnections.size > 0
      ? Array.from(agentConnections.entries())[0]
      : null;

    if (!agentConnection) {
      // KEEP FOR COMMAND FORWARDING DEBUG
      // Get all agent connections for debugging
      const allAgentConnections = this.connectionPool.getConnectionsByType('agent');
      this.server.log.error(`[CMD-FWD] Agent ${agentId} not found in connection pool. Available agents:`, {
        availableAgents: Array.from(allAgentConnections.entries()).map(([id, conn]) => ({
          connectionId: id,
          agentId: conn.agentId,
          type: conn.type,
          isAuthenticated: conn.isAuthenticated
        }))
      });
      this.server.log.error('==================== [CMD-FWD] ROUTE TO AGENT FAILED ====================');
      return false;
    }

    // KEEP FOR COMMAND FORWARDING DEBUG
    this.server.log.info(`[CMD-FWD] Found agent connection for ${agentId}:`, {
      connectionId: agentConnection[0],
      isAuthenticated: agentConnection[1].isAuthenticated,
      agentId: agentConnection[1].agentId,
      type: agentConnection[1].type,
      userId: agentConnection[1].userId
    });

    const queued = this.queueMessage({
      id: message.id,
      message,
      targetType: 'specific',
      targetId: agentId,
      priority,
      attempts: 0,
      createdAt: Date.now(),
      filter: (connectionId, metadata) => metadata.agentId === agentId
    });

    // KEEP FOR COMMAND FORWARDING DEBUG
    this.server.log.info(`[CMD-FWD] Message queued: ${queued}`);
    this.server.log.info('==================== [CMD-FWD] ROUTE TO AGENT SUCCESS ====================');

    return queued;
  }

  /**
   * Route message to all agents
   */
  routeToAllAgents(type: MessageType, payload: any, priority: number = 5): boolean {
    const message: WebSocketMessage = {
      type,
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload
    };

    return this.queueMessage({
      id: message.id,
      message,
      targetType: 'agent',
      priority,
      attempts: 0,
      createdAt: Date.now(),
      filter: (connectionId, metadata) => metadata.type === 'agent' && metadata.isAuthenticated
    });
  }

  /**
   * Route message to dashboard connections
   */
  routeToDashboard(type: MessageType, payload: any, priority: number = 5, filter?: (connectionId: string, metadata: any) => boolean): boolean {
    const message: WebSocketMessage = {
      type,
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload
    };

    return this.queueMessage({
      id: message.id,
      message,
      targetType: 'dashboard',
      priority,
      attempts: 0,
      createdAt: Date.now(),
      filter: filter || ((connectionId, metadata) => metadata.type === 'dashboard' && metadata.isAuthenticated)
    });
  }

  /**
   * Route message to specific dashboard connection
   */
  routeToSpecificDashboard(connectionId: string, type: MessageType, payload: any, priority: number = 5): boolean {
    const message: WebSocketMessage = {
      type,
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload
    };

    return this.queueMessage({
      id: message.id,
      message,
      targetType: 'specific',
      targetId: connectionId,
      priority,
      attempts: 0,
      createdAt: Date.now(),
      filter: (connId, metadata) => connId === connectionId && metadata.isAuthenticated
    });
  }

  /**
   * Broadcast agent status updates
   */
  broadcastAgentStatus(agentId: string, payload: AgentStatusPayload): void {
    this.routeToDashboard(
      MessageType.AGENT_STATUS,
      payload,
      8, // High priority
      (connectionId, metadata) => {
        // Only send to dashboards that are subscribed to this agent
        return metadata.type === 'dashboard' &&
               metadata.isAuthenticated &&
               this.isDashboardSubscribedToAgent(connectionId, agentId);
      }
    );
  }

  /**
   * Broadcast command status updates
   */
  broadcastCommandStatus(commandId: string, payload: CommandStatusPayload): void {
    // KEEP FOR COMMAND FORWARDING DEBUG
    const dashboardId = this.commandToDashboard.get(commandId);
    this.server.log.info({
      action: 'broadcast_command_status',
      commandId,
      targetDashboard: dashboardId,
      status: payload.status,
      hasTracking: !!dashboardId
    }, '[CMD-FWD] Broadcasting command status to dashboard');

    this.routeToDashboard(
      MessageType.COMMAND_STATUS,
      payload,
      7, // High priority
      (connectionId, metadata) => {
        // Only send to dashboards that are subscribed to this command
        return metadata.type === 'dashboard' &&
               metadata.isAuthenticated &&
               this.isDashboardSubscribedToCommand(connectionId, commandId);
      }
    );
  }

  /**
   * Stream terminal output to dashboards
   */
  streamTerminalOutput(payload: TerminalStreamPayload): void {
    // Check if payload contains commandId
    const commandId = (payload as any).commandId;

    // T029: Debug logging for terminal stream routing
    const dashboardId = commandId ? this.commandToDashboard.get(commandId) : undefined;
    // Get count of dashboard connections from the connection pool (safely)
    let dashboardCount = 0;
    try {
      const dashboardConnections = this.connectionPool?.getConnectionsByType?.('dashboard');
      dashboardCount = dashboardConnections?.size || 0;
    } catch (error) {
      this.server.log.warn({ error }, 'Could not get dashboard connection count');
    }

    // KEEP FOR COMMAND FORWARDING DEBUG
    this.server.log.info({
      action: 'stream_terminal_output',
      commandId,
      agentId: (payload as any).agentId,
      targetDashboard: dashboardId,
      hasCommandTracking: !!dashboardId,
      contentLength: (payload as any).content?.length || 0,
      subscribedDashboards: dashboardCount
    }, '[CMD-FWD] Streaming terminal output to dashboard');

    if (commandId && dashboardId) {
      // Route to specific dashboard that initiated the command
      this.routeToSpecificDashboard(dashboardId, MessageType.TERMINAL_STREAM, payload, 9);
      return;
    }

    // Fall back to broadcast if no command tracking
    this.routeToDashboard(
      MessageType.TERMINAL_STREAM,
      payload,
      9, // Very high priority for real-time streaming
      (connectionId, metadata) => {
        // Only send to dashboards that have terminal subscriptions
        return metadata.type === 'dashboard' &&
               metadata.isAuthenticated &&
               this.isDashboardSubscribedToTerminals(connectionId);
      }
    );
  }

  /**
   * Stream trace events to dashboards
   */
  streamTraceEvents(payload: TraceStreamPayload): void {
    this.routeToDashboard(
      MessageType.TRACE_STREAM,
      payload,
      6, // Medium-high priority
      (connectionId, metadata) => {
        // Only send to dashboards that have trace subscriptions
        return metadata.type === 'dashboard' &&
               metadata.isAuthenticated &&
               this.isDashboardSubscribedToTraces(connectionId);
      }
    );
  }

  /**
   * Broadcast queue updates
   */
  broadcastQueueUpdate(agentId: string, payload: QueueUpdatePayload): void {
    this.routeToDashboard(
      MessageType.QUEUE_UPDATE,
      payload,
      7, // High priority
      (connectionId, metadata) => {
        return metadata.type === 'dashboard' &&
               metadata.isAuthenticated &&
               this.isDashboardSubscribedToAgent(connectionId, agentId);
      }
    );
  }

  /**
   * Broadcast emergency stop to all connections
   */
  broadcastEmergencyStop(payload: EmergencyStopPayload): void {
    // T029: Debug logging for emergency stop
    this.server.log.warn({
      action: 'broadcast_emergency_stop',
      reason: payload.reason,
      triggeredBy: (payload as any).triggeredBy,
      timestamp: payload.timestamp
    }, 'Broadcasting emergency stop to all connections');

    // Send to all agents
    this.routeToAllAgents(MessageType.EMERGENCY_STOP, payload, 10);

    // Send to all dashboards
    this.routeToDashboard(MessageType.EMERGENCY_STOP, payload, 10);
  }

  /**
   * Send command request to specific agent
   */
  sendCommandToAgent(agentId: string, commandPayload: any): boolean {
    return this.routeToAgent(agentId, MessageType.COMMAND_REQUEST, commandPayload, 8);
  }

  /**
   * Send command cancellation to specific agent
   */
  cancelCommandOnAgent(agentId: string, commandId: string, reason: string = 'User requested cancellation'): boolean {
    return this.routeToAgent(agentId, MessageType.COMMAND_CANCEL, {
      commandId,
      reason,
      force: false
    }, 9);
  }

  /**
   * Send agent control command
   */
  sendAgentControl(agentId: string, action: string, reason: string): boolean {
    return this.routeToAgent(agentId, MessageType.AGENT_CONTROL, {
      action,
      reason,
      gracefulShutdown: action === 'STOP',
      timeout: 30000
    }, 9);
  }

  /**
   * Queue message for processing
   */
  private queueMessage(queuedMessage: QueuedMessage): boolean {
    if (this.messageQueue.size >= this.config.maxQueueSize) {
      // Drop lowest priority message to make room
      this.dropLowestPriorityMessage();
    }

    this.messageQueue.set(queuedMessage.id, queuedMessage);
    this.routingStats.messagesQueued++;
    this.routingStats.queueSize = this.messageQueue.size;

    // KEEP FOR COMMAND FORWARDING DEBUG
    this.server.log.info({
      messageId: queuedMessage.id,
      type: queuedMessage.message.type,
      priority: queuedMessage.priority,
      targetType: queuedMessage.targetType,
      targetId: queuedMessage.targetId
    }, '[CMD-FWD] Message queued for routing');

    this.emit('messageQueued', queuedMessage);
    return true;
  }

  /**
   * Process message queue
   */
  private processMessageQueue(): void {
    if (this.messageQueue.size === 0) {
      return;
    }

    // Sort messages by priority (higher number = higher priority)
    const sortedMessages = Array.from(this.messageQueue.values())
      .sort((a, b) => b.priority - a.priority);

    const now = Date.now();
    let processed = 0;

    for (const queuedMessage of sortedMessages) {
      // Skip if scheduled for future delivery
      if (queuedMessage.scheduledAt && queuedMessage.scheduledAt > now) {
        continue;
      }

      // Skip if message has timed out
      if (now - queuedMessage.createdAt > this.config.messageTimeoutMs) {
        // TEMP DISABLED FOR COMMAND FORWARDING DEBUG
        // this.server.log.warn({
        //   messageId: queuedMessage.id,
        //   age: now - queuedMessage.createdAt
        // }, 'Message timed out, dropping');

        this.messageQueue.delete(queuedMessage.id);
        this.routingStats.messagesDropped++;
        this.emit('messageDropped', { message: queuedMessage, reason: 'timeout' });
        continue;
      }

      // Try to deliver message
      if (this.deliverMessage(queuedMessage)) {
        this.messageQueue.delete(queuedMessage.id);
        processed++;
      } else {
        // Handle delivery failure
        this.handleDeliveryFailure(queuedMessage);
      }

      // Limit processing per cycle to maintain performance
      if (processed >= 10) {
        break;
      }
    }

    this.routingStats.queueSize = this.messageQueue.size;
  }

  /**
   * Deliver message to target connections
   */
  private deliverMessage(queuedMessage: QueuedMessage): boolean {
    const startTime = Date.now();
    let delivered = 0;
    let targetConnections: Map<string, any>;

    // KEEP FOR COMMAND FORWARDING DEBUG
    this.server.log.info({
      action: 'deliver_message_start',
      messageId: queuedMessage.id,
      messageType: queuedMessage.message.type,
      targetType: queuedMessage.targetType,
      targetId: queuedMessage.targetId,
      priority: queuedMessage.priority,
      queueAge: Date.now() - queuedMessage.createdAt
    }, '[CMD-FWD] Starting message delivery');

    // Get target connections based on type
    switch (queuedMessage.targetType) {
      case 'agent':
        targetConnections = this.connectionPool.getConnectionsByType('agent');
        break;
      case 'dashboard':
        targetConnections = this.connectionPool.getConnectionsByType('dashboard');
        break;
      case 'specific':
        if (queuedMessage.targetId) {
          // targetId is the agentId, not connectionId - use getConnectionsByAgentId
          targetConnections = this.connectionPool.getConnectionsByAgentId(queuedMessage.targetId);
        } else {
          targetConnections = new Map();
        }
        break;
      default:
        targetConnections = new Map();
    }

    // Apply filter if provided
    if (queuedMessage.filter) {
      const filteredConnections = new Map();
      for (const [connectionId, connection] of targetConnections) {
        if (queuedMessage.filter(connectionId, connection)) {
          filteredConnections.set(connectionId, connection);
        }
      }
      targetConnections = filteredConnections;
    }

    // Send message to target connections
    const messageString = JSON.stringify(queuedMessage.message);

    for (const [connectionId, connection] of targetConnections) {
      try {
        if (connection.isAuthenticated && this.connectionPool.isConnectionHealthy(connectionId)) {
          connection.socket.socket.send(messageString);
          delivered++;

          // Record activity
          this.connectionPool.recordActivity(connectionId, Buffer.byteLength(messageString));
        }
      } catch (error) {
        this.server.log.error({
          error,
          connectionId,
          messageId: queuedMessage.id
        }, 'Failed to send message to connection');
      }
    }

    const deliveryTime = Date.now() - startTime;

    if (delivered > 0) {
      // Update statistics
      this.routingStats.messagesSent++;
      this.updateAverageLatency(Date.now() - queuedMessage.createdAt);

      // KEEP FOR COMMAND FORWARDING DEBUG
      this.server.log.info({
        messageId: queuedMessage.id,
        type: queuedMessage.message.type,
        delivered,
        deliveryTime,
        queueAge: Date.now() - queuedMessage.createdAt
      }, '[CMD-FWD] Message delivered successfully');

      this.emit('messageDelivered', {
        message: queuedMessage,
        delivered,
        deliveryTime
      });

      return true;
    }

    return false;
  }

  /**
   * Handle message delivery failure
   */
  private handleDeliveryFailure(queuedMessage: QueuedMessage): void {
    queuedMessage.attempts++;

    if (queuedMessage.attempts >= this.config.retryAttempts) {
      // Give up on this message
      this.messageQueue.delete(queuedMessage.id);
      this.routingStats.messagesFailed++;

      // KEEP FOR COMMAND FORWARDING DEBUG
      this.server.log.error({
        messageId: queuedMessage.id,
        attempts: queuedMessage.attempts,
        messageType: queuedMessage.message.type,
        targetType: queuedMessage.targetType
      }, '[CMD-FWD] Message delivery failed after max attempts');

      this.emit('messageDeliveryFailed', queuedMessage);
    } else {
      // Schedule retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, queuedMessage.attempts - 1), 30000);
      queuedMessage.scheduledAt = Date.now() + delay;

      // KEEP FOR COMMAND FORWARDING DEBUG
      this.server.log.info({
        messageId: queuedMessage.id,
        attempt: queuedMessage.attempts,
        retryIn: delay,
        messageType: queuedMessage.message.type
      }, '[CMD-FWD] Scheduling message retry');

      this.emit('messageRetryScheduled', { message: queuedMessage, delay });
    }
  }

  /**
   * Drop lowest priority message to make room
   */
  private dropLowestPriorityMessage(): void {
    let lowestPriority = Number.MAX_SAFE_INTEGER;
    let oldestMessage: QueuedMessage | null = null;

    for (const message of this.messageQueue.values()) {
      if (message.priority < lowestPriority ||
          (message.priority === lowestPriority && (!oldestMessage || message.createdAt < oldestMessage.createdAt))) {
        lowestPriority = message.priority;
        oldestMessage = message;
      }
    }

    if (oldestMessage) {
      this.messageQueue.delete(oldestMessage.id);
      this.routingStats.messagesDropped++;

      this.server.log.warn({
        messageId: oldestMessage.id,
        priority: oldestMessage.priority,
        age: Date.now() - oldestMessage.createdAt
      }, 'Dropped message due to queue limit');

      this.emit('messageDropped', { message: oldestMessage, reason: 'queue_full' });
    }
  }

  /**
   * Update average latency
   */
  private updateAverageLatency(latency: number): void {
    this.latencyHistory.push(latency);
    if (this.latencyHistory.length > 100) {
      this.latencyHistory.shift();
    }

    this.routingStats.averageLatency =
      this.latencyHistory.reduce((sum, lat) => sum + lat, 0) / this.latencyHistory.length;
  }

  /**
   * Check if dashboard is subscribed to agent
   */
  private isDashboardSubscribedToAgent(connectionId: string, agentId: string): boolean {
    const connection = this.connectionPool.getConnection(connectionId);
    if (!connection || !connection.subscriptions) return false;

    // Check if subscribed to all agents ('*') or specific agent ID
    return connection.subscriptions.agents.has('*') || connection.subscriptions.agents.has(agentId);
  }

  /**
   * Check if dashboard is subscribed to command
   */
  private isDashboardSubscribedToCommand(connectionId: string, commandId: string): boolean {
    const connection = this.connectionPool.getConnection(connectionId);
    if (!connection || !connection.subscriptions) return false;

    // Check if this dashboard initiated the command
    const dashboardId = this.commandToDashboard.get(commandId);
    const isInitiator = dashboardId === connectionId;

    // Check if subscribed to all commands ('*') or specific command ID, or is the initiator
    const isSubscribed = connection.subscriptions.commands &&
      (connection.subscriptions.commands.has('*') || connection.subscriptions.commands.has(commandId));

    return isInitiator || isSubscribed;
  }

  /**
   * Check if dashboard is subscribed to terminals
   */
  private isDashboardSubscribedToTerminals(connectionId: string): boolean {
    const connection = this.connectionPool.getConnection(connectionId);
    if (!connection || !connection.subscriptions) return false;

    // Check if terminals subscription is enabled (boolean flag)
    return connection.subscriptions.terminals === true;
  }

  /**
   * Check if dashboard is subscribed to traces
   */
  private isDashboardSubscribedToTraces(connectionId: string): boolean {
    const connection = this.connectionPool.getConnection(connectionId);
    if (!connection || !connection.subscriptions) return false;

    // Check if traces subscription is enabled (boolean flag)
    return connection.subscriptions.traces === true;
  }

  /**
   * Get routing statistics
   */
  getStats(): RoutingStats {
    return { ...this.routingStats };
  }

  /**
   * Clear message queue
   */
  clearQueue(): void {
    const clearedCount = this.messageQueue.size;
    this.messageQueue.clear();
    this.routingStats.queueSize = 0;

    this.server.log.info({ clearedCount }, 'Message queue cleared');
    this.emit('queueCleared', { clearedCount });
  }

  /**
   * Start message processing timer
   */
  private startMessageProcessing(): void {
    this.processingTimer = setInterval(() => {
      this.processMessageQueue();
    }, 100); // Process every 100ms for low latency

    // T021: Start command TTL cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredCommands();
    }, 60000); // Clean up every minute

    this.server.log.debug('Message router processing started');
  }

  /**
   * Stop message processing
   */
  stop(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    this.clearQueue();
    this.server.log.info('Message router stopped');
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Register a command as initiated by a dashboard
   */
  registerCommandForDashboard(commandId: string, dashboardConnectionId: string): void {
    this.commandToDashboard.set(commandId, dashboardConnectionId);

    // Track commands per dashboard
    let commands = this.dashboardCommands.get(dashboardConnectionId);
    if (!commands) {
      commands = new Set();
      this.dashboardCommands.set(dashboardConnectionId, commands);
    }
    commands.add(commandId);

    // T021: Track command timestamp for TTL
    this.commandTimestamps.set(commandId, Date.now());

    this.server.log.debug({
      commandId,
      dashboardConnectionId,
      totalCommands: this.commandToDashboard.size
    }, 'Command registered for dashboard');
  }

  /**
   * Clean up commands for a disconnected dashboard
   */
  cleanupDashboardCommands(dashboardConnectionId: string): void {
    const commands = this.dashboardCommands.get(dashboardConnectionId);
    if (commands) {
      for (const commandId of commands) {
        this.commandToDashboard.delete(commandId);
      }
      this.dashboardCommands.delete(dashboardConnectionId);

      this.server.log.debug({
        dashboardConnectionId,
        cleanedCommands: commands.size
      }, 'Cleaned up commands for disconnected dashboard');
    }
  }

  /**
   * Clean up a completed or cancelled command
   */
  cleanupCommand(commandId: string): void {
    const dashboardId = this.commandToDashboard.get(commandId);
    if (dashboardId) {
      this.commandToDashboard.delete(commandId);
      this.commandTimestamps.delete(commandId); // T021: Clean up timestamp

      const commands = this.dashboardCommands.get(dashboardId);
      if (commands) {
        commands.delete(commandId);
        if (commands.size === 0) {
          this.dashboardCommands.delete(dashboardId);
        }
      }

      this.server.log.debug({
        commandId,
        dashboardId
      }, 'Cleaned up completed command');
    }
  }

  /**
   * Get dashboard connection ID for a command
   */
  getDashboardForCommand(commandId: string): string | undefined {
    return this.commandToDashboard.get(commandId);
  }

  /**
   * T021: Clean up expired commands based on TTL
   */
  private cleanupExpiredCommands(): void {
    const now = Date.now();
    const expiredCommands: string[] = [];

    for (const [commandId, timestamp] of this.commandTimestamps) {
      if (now - timestamp > this.commandTTL) {
        expiredCommands.push(commandId);
      }
    }

    if (expiredCommands.length > 0) {
      this.server.log.info({
        count: expiredCommands.length
      }, 'Cleaning up expired commands');

      for (const commandId of expiredCommands) {
        this.cleanupCommand(commandId);
      }
    }
  }
}
