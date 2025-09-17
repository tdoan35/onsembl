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
  private latencyHistory: number[] = [];

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

    return this.queueMessage({
      id: message.id,
      message,
      targetType: 'specific',
      targetId: agentId,
      priority,
      attempts: 0,
      createdAt: Date.now(),
      filter: (connectionId, metadata) => metadata.agentId === agentId
    });
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

    this.server.log.debug({
      messageId: queuedMessage.id,
      type: queuedMessage.message.type,
      priority: queuedMessage.priority,
      targetType: queuedMessage.targetType,
      targetId: queuedMessage.targetId
    }, 'Message queued for routing');

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
        this.server.log.warn({
          messageId: queuedMessage.id,
          age: now - queuedMessage.createdAt
        }, 'Message timed out, dropping');

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
          const connection = this.connectionPool.getConnection(queuedMessage.targetId);
          targetConnections = connection ? new Map([[queuedMessage.targetId, connection]]) : new Map();
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

      this.server.log.debug({
        messageId: queuedMessage.id,
        type: queuedMessage.message.type,
        delivered,
        deliveryTime,
        queueAge: Date.now() - queuedMessage.createdAt
      }, 'Message delivered successfully');

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

      this.server.log.error({
        messageId: queuedMessage.id,
        attempts: queuedMessage.attempts
      }, 'Message delivery failed after max attempts');

      this.emit('messageDeliveryFailed', queuedMessage);
    } else {
      // Schedule retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, queuedMessage.attempts - 1), 30000);
      queuedMessage.scheduledAt = Date.now() + delay;

      this.server.log.debug({
        messageId: queuedMessage.id,
        attempt: queuedMessage.attempts,
        retryIn: delay
      }, 'Scheduling message retry');

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
    // This would need to be implemented based on how subscriptions are stored
    // For now, assume all dashboards are interested in all agents
    return true;
  }

  /**
   * Check if dashboard is subscribed to command
   */
  private isDashboardSubscribedToCommand(connectionId: string, commandId: string): boolean {
    // This would need to be implemented based on how subscriptions are stored
    // For now, assume all dashboards are interested in all commands
    return true;
  }

  /**
   * Check if dashboard is subscribed to terminals
   */
  private isDashboardSubscribedToTerminals(connectionId: string): boolean {
    // This would need to be implemented based on how subscriptions are stored
    // For now, assume all dashboards want terminal output
    return true;
  }

  /**
   * Check if dashboard is subscribed to traces
   */
  private isDashboardSubscribedToTraces(connectionId: string): boolean {
    // This would need to be implemented based on how subscriptions are stored
    // For now, assume all dashboards want trace events
    return true;
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

    this.clearQueue();
    this.server.log.info('Message router stopped');
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}