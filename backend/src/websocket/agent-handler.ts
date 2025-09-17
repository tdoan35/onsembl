/**
 * Agent WebSocket Handler for Onsembl.ai
 * Handles incoming connections from AI agents
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
  AgentConnectPayload,
  AgentHeartbeatPayload,
  CommandAckPayload,
  CommandCompletePayload,
  TerminalOutputPayload,
  TraceEventPayload,
  InvestigationReportPayload,
  AgentErrorPayload,
  TypedWebSocketMessage,
  isAgentMessage
} from '../../../packages/agent-protocol/src/types.js';

export interface AgentConnection {
  connectionId: string;
  agentId: string;
  socket: SocketStream;
  metadata: ReturnType<typeof extractConnectionMetadata>;
  isAuthenticated: boolean;
  lastPing: number;
  missedPings: number;
}

export class AgentWebSocketHandler extends EventEmitter {
  private connections = new Map<string, AgentConnection>();

  constructor(
    private server: FastifyInstance,
    private services: Services,
    private dependencies: WebSocketDependencies
  ) {
    super();
    this.setupEventListeners();
  }

  /**
   * Handle new agent WebSocket connection
   */
  async handleConnection(connection: SocketStream, request: IncomingMessage): Promise<void> {
    const connectionId = this.generateConnectionId();
    const metadata = extractConnectionMetadata(request);

    this.server.log.info({
      connectionId,
      remoteAddress: metadata.remoteAddress
    }, 'Agent WebSocket connection established');

    // Create connection record
    const agentConnection: AgentConnection = {
      connectionId,
      agentId: '', // Will be set on AGENT_CONNECT
      socket: connection,
      metadata,
      isAuthenticated: false,
      lastPing: Date.now(),
      missedPings: 0
    };

    // Add to connection pool
    this.dependencies.connectionPool.addConnection(connectionId, {
      type: 'agent',
      socket: connection,
      metadata,
      isAuthenticated: false
    });

    // Setup message handlers
    connection.socket.on('message', async (rawMessage) => {
      await this.handleMessage(agentConnection, rawMessage);
    });

    connection.socket.on('close', () => {
      this.handleDisconnection(connectionId);
    });

    connection.socket.on('error', (error) => {
      this.handleError(connectionId, error);
    });

    // Store connection temporarily until authentication
    this.connections.set(connectionId, agentConnection);

    // Set authentication timeout
    setTimeout(() => {
      if (!agentConnection.isAuthenticated) {
        this.server.log.warn({ connectionId }, 'Agent connection authentication timeout');
        this.sendError(connection, 'AUTH_TIMEOUT', 'Authentication timeout');
        connection.socket.close();
      }
    }, 30000); // 30 seconds
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(connection: AgentConnection, rawMessage: any): Promise<void> {
    try {
      const message: WebSocketMessage = JSON.parse(rawMessage.toString());

      // Validate message structure
      if (!this.validateMessage(message)) {
        this.sendError(connection.socket, 'INVALID_MESSAGE', 'Invalid message format');
        return;
      }

      // Check if message type is allowed for agents
      if (!isAgentMessage(message.type)) {
        this.sendError(connection.socket, 'INVALID_MESSAGE_TYPE', 'Message type not allowed for agents');
        return;
      }

      // Log message for debugging
      this.server.log.debug({
        connectionId: connection.connectionId,
        type: message.type
      }, 'Agent message received');

      // Route message based on type
      switch (message.type) {
        case MessageType.AGENT_CONNECT:
          await this.handleAgentConnect(connection, message as TypedWebSocketMessage<MessageType.AGENT_CONNECT>);
          break;

        case MessageType.AGENT_HEARTBEAT:
          await this.handleAgentHeartbeat(connection, message as TypedWebSocketMessage<MessageType.AGENT_HEARTBEAT>);
          break;

        case MessageType.AGENT_ERROR:
          await this.handleAgentError(connection, message as TypedWebSocketMessage<MessageType.AGENT_ERROR>);
          break;

        case MessageType.COMMAND_ACK:
          await this.handleCommandAck(connection, message as TypedWebSocketMessage<MessageType.COMMAND_ACK>);
          break;

        case MessageType.COMMAND_COMPLETE:
          await this.handleCommandComplete(connection, message as TypedWebSocketMessage<MessageType.COMMAND_COMPLETE>);
          break;

        case MessageType.TERMINAL_OUTPUT:
          await this.handleTerminalOutput(connection, message as TypedWebSocketMessage<MessageType.TERMINAL_OUTPUT>);
          break;

        case MessageType.TRACE_EVENT:
          await this.handleTraceEvent(connection, message as TypedWebSocketMessage<MessageType.TRACE_EVENT>);
          break;

        case MessageType.INVESTIGATION_REPORT:
          await this.handleInvestigationReport(connection, message as TypedWebSocketMessage<MessageType.INVESTIGATION_REPORT>);
          break;

        case MessageType.PING:
          await this.handlePing(connection, message);
          break;

        default:
          this.sendError(connection.socket, 'UNKNOWN_MESSAGE_TYPE', `Unknown message type: ${message.type}`);
      }

      // Note: Acknowledgments are handled within each message handler

    } catch (error) {
      this.server.log.error({
        error,
        connectionId: connection.connectionId
      }, 'Error handling agent message');
      this.sendError(connection.socket, 'INTERNAL_ERROR', 'Failed to process message');
    }
  }

  /**
   * Handle agent connection request
   */
  private async handleAgentConnect(
    connection: AgentConnection,
    message: TypedWebSocketMessage<MessageType.AGENT_CONNECT>
  ): Promise<void> {
    const { agentId, agentType, version, hostMachine, capabilities } = message.payload;

    try {
      // Authenticate agent using WebSocketAuth
      const token = connection.metadata.headers['authorization']?.replace('Bearer ', '') ||
                   connection.metadata.query?.token as string;

      if (!token) {
        this.sendError(connection.socket, 'UNAUTHORIZED', 'No authentication token provided');
        return;
      }

      const authContext = await this.dependencies.auth.validateToken(token);
      if (!authContext) {
        this.sendError(connection.socket, 'UNAUTHORIZED', 'Invalid authentication token');
        return;
      }

      // Register agent with service
      await this.services.agentService.connectAgent({
        id: agentId,
        type: agentType,
        status: 'CONNECTING',
        version,
        hostMachine,
        capabilities: capabilities || {},
        connectionId: connection.connectionId,
        connectedAt: new Date(),
        lastHeartbeat: new Date()
      });

      // Update connection
      connection.agentId = agentId;
      connection.isAuthenticated = true;

      // Update connection pool
      this.dependencies.connectionPool.updateConnection(connection.connectionId, {
        isAuthenticated: true,
        agentId
      });

      // Send success response with connection details
      this.sendMessage(connection.socket, MessageType.ACK, {
        messageId: message.id,
        success: true,
        connectionId: connection.connectionId,
        agentId,
        authenticated: true
      });

      // Start heartbeat monitoring
      this.dependencies.heartbeatManager.startMonitoring(connection.connectionId);

      // Notify other systems
      this.emit('agentConnected', { agentId, connectionId: connection.connectionId });

      this.server.log.info({
        agentId,
        connectionId: connection.connectionId
      }, 'Agent authenticated and connected');

    } catch (error) {
      this.server.log.error({ error, agentId }, 'Failed to connect agent');
      this.sendError(connection.socket, 'CONNECTION_FAILED', 'Agent connection failed');
      connection.socket.close();
    }
  }

  /**
   * Handle agent heartbeat
   */
  private async handleAgentHeartbeat(
    connection: AgentConnection,
    message: TypedWebSocketMessage<MessageType.AGENT_HEARTBEAT>
  ): Promise<void> {
    const { agentId, healthMetrics } = message.payload;

    try {
      // Update agent heartbeat
      await this.services.agentService.updateHeartbeat(agentId, healthMetrics);

      // Update connection heartbeat
      connection.lastPing = Date.now();
      connection.missedPings = 0;

      // Send heartbeat response
      this.sendMessage(connection.socket, MessageType.SERVER_HEARTBEAT, {
        serverTime: Date.now(),
        nextPingExpected: Date.now() + 30000 // 30 seconds
      });

    } catch (error) {
      this.server.log.error({ error, agentId }, 'Failed to handle heartbeat');
    }
  }

  /**
   * Handle agent error report
   */
  private async handleAgentError(
    connection: AgentConnection,
    message: TypedWebSocketMessage<MessageType.AGENT_ERROR>
  ): Promise<void> {
    const { agentId, errorType, message: errorMessage, recoverable, details, stack } = message.payload;

    try {
      // Log agent error
      this.services.auditService.logEvent({
        type: 'AGENT_ERROR',
        agentId,
        details: {
          errorType,
          message: errorMessage,
          recoverable,
          details,
          stack
        }
      });

      // Update agent status if error is not recoverable
      if (!recoverable) {
        await this.services.agentService.updateAgent(agentId, {
          status: 'ERROR',
          lastError: errorMessage
        });
      }

      // Send acknowledgment
      this.sendMessage(connection.socket, MessageType.ACK, {
        messageId: message.id,
        success: true,
        errorReceived: true
      });

      this.server.log.error({
        agentId,
        errorType,
        message: errorMessage,
        recoverable
      }, 'Agent reported error');

    } catch (error) {
      this.server.log.error({ error, agentId }, 'Failed to handle agent error');
    }
  }

  /**
   * Handle command acknowledgment
   */
  private async handleCommandAck(
    connection: AgentConnection,
    message: TypedWebSocketMessage<MessageType.COMMAND_ACK>
  ): Promise<void> {
    const { commandId, agentId, status, queuePosition } = message.payload;

    try {
      // Update command status
      await this.services.commandService.updateCommandStatus(commandId, status, {
        queuePosition,
        acknowledgedAt: new Date()
      });

      // Route to dashboard
      this.dependencies.messageRouter.routeToDashboard(MessageType.COMMAND_STATUS, {
        commandId,
        agentId,
        status,
        queuePosition
      });

      // Send acknowledgment
      this.sendMessage(connection.socket, MessageType.ACK, {
        messageId: message.id,
        success: true,
        commandId,
        acknowledged: true
      });

      this.server.log.debug({ commandId, status }, 'Command acknowledged');

    } catch (error) {
      this.server.log.error({ error, commandId }, 'Failed to handle command acknowledgment');
    }
  }

  /**
   * Handle command completion
   */
  private async handleCommandComplete(
    connection: AgentConnection,
    message: TypedWebSocketMessage<MessageType.COMMAND_COMPLETE>
  ): Promise<void> {
    const payload = message.payload;

    try {
      // Complete command
      await this.services.commandService.completeCommand(payload.commandId, {
        status: payload.status,
        error: payload.error,
        executionTime: payload.executionTime,
        tokensUsed: payload.tokensUsed,
        outputStats: payload.outputStats
      });

      // Route to dashboard
      this.dependencies.messageRouter.routeToDashboard(MessageType.COMMAND_STATUS, payload);

      // Send acknowledgment
      this.sendMessage(connection.socket, MessageType.ACK, {
        messageId: message.id,
        success: true,
        commandId: payload.commandId,
        completed: true
      });

      this.server.log.info({
        commandId: payload.commandId,
        status: payload.status
      }, 'Command completed');

    } catch (error) {
      this.server.log.error({ error, commandId: payload.commandId }, 'Failed to handle command completion');
    }
  }

  /**
   * Handle terminal output
   */
  private async handleTerminalOutput(
    connection: AgentConnection,
    message: TypedWebSocketMessage<MessageType.TERMINAL_OUTPUT>
  ): Promise<void> {
    const payload = message.payload;

    try {
      // Process terminal output through stream manager
      await this.dependencies.terminalStreamManager.processOutput(payload);

      // Stream to dashboard in real-time
      this.dependencies.messageRouter.routeToDashboard(MessageType.TERMINAL_STREAM, {
        commandId: payload.commandId,
        agentId: payload.agentId,
        content: payload.content,
        streamType: payload.streamType,
        ansiCodes: payload.ansiCodes,
        timestamp: Date.now()
      });

      // Send acknowledgment
      this.sendMessage(connection.socket, MessageType.ACK, {
        messageId: message.id,
        success: true,
        sequence: payload.sequence,
        received: true
      });

    } catch (error) {
      this.server.log.error({ error, commandId: payload.commandId }, 'Failed to handle terminal output');
    }
  }

  /**
   * Handle trace event
   */
  private async handleTraceEvent(
    connection: AgentConnection,
    message: TypedWebSocketMessage<MessageType.TRACE_EVENT>
  ): Promise<void> {
    const payload = message.payload;

    try {
      // Store trace event
      await this.services.commandService.addTraceEvent(payload);

      // Route to dashboard
      this.dependencies.messageRouter.routeToDashboard(MessageType.TRACE_STREAM, {
        commandId: payload.commandId,
        agentId: payload.agentId,
        trace: payload
      });

      // Send acknowledgment
      this.sendMessage(connection.socket, MessageType.ACK, {
        messageId: message.id,
        success: true,
        traceId: payload.traceId,
        received: true
      });

    } catch (error) {
      this.server.log.error({ error, commandId: payload.commandId }, 'Failed to handle trace event');
    }
  }

  /**
   * Handle investigation report
   */
  private async handleInvestigationReport(
    connection: AgentConnection,
    message: TypedWebSocketMessage<MessageType.INVESTIGATION_REPORT>
  ): Promise<void> {
    const payload = message.payload;

    try {
      // Store investigation report
      await this.services.commandService.createInvestigationReport(payload);

      // Send acknowledgment
      this.sendMessage(connection.socket, MessageType.ACK, {
        messageId: message.id,
        success: true,
        reportId: payload.reportId,
        received: true
      });

      this.server.log.info({
        reportId: payload.reportId,
        status: payload.status
      }, 'Investigation report received');

    } catch (error) {
      this.server.log.error({ error, reportId: payload.reportId }, 'Failed to handle investigation report');
    }
  }

  /**
   * Handle ping message
   */
  private async handlePing(connection: AgentConnection, message: WebSocketMessage): Promise<void> {
    // Send pong response
    this.sendMessage(connection.socket, MessageType.PONG, {
      timestamp: message.payload.timestamp,
      latency: Date.now() - message.payload.timestamp
    });
  }

  /**
   * Handle connection disconnection
   */
  private handleDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);

    if (connection) {
      this.server.log.info({
        connectionId,
        agentId: connection.agentId
      }, 'Agent WebSocket connection closed');

      // Stop heartbeat monitoring
      this.dependencies.heartbeatManager.stopMonitoring(connectionId);

      // Remove from connection pool
      this.dependencies.connectionPool.removeConnection(connectionId);

      // Update agent status
      if (connection.agentId) {
        this.services.agentService.updateAgent(connection.agentId, {
          status: 'OFFLINE',
          disconnectedAt: new Date()
        }).catch(error => {
          this.server.log.error({ error, agentId: connection.agentId }, 'Failed to update agent on disconnect');
        });
      }

      // Remove from local store
      this.connections.delete(connectionId);

      // Emit disconnection event
      this.emit('agentDisconnected', { connectionId, agentId: connection.agentId });
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
      agentId: connection?.agentId
    }, 'Agent WebSocket error');
  }

  /**
   * Send message to agent
   */
  sendToAgent(agentId: string, type: MessageType, payload: any): boolean {
    const connection = Array.from(this.connections.values())
      .find(conn => conn.agentId === agentId);

    if (!connection) {
      return false;
    }

    return this.sendMessage(connection.socket, type, payload);
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
   * Send acknowledgment
   */
  private sendAck(socket: SocketStream, messageId: string): void {
    this.sendMessage(socket, MessageType.ACK, {
      messageId,
      success: true
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
    return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
        this.server.log.warn({ connectionId, agentId: connection.agentId }, 'Agent connection timed out');
        connection.socket.socket.close();
      }
    });
  }
}

/**
 * Create agent handler instance
 */
export function createAgentHandler(
  server: FastifyInstance,
  services: Services,
  dependencies: WebSocketDependencies
): AgentWebSocketHandler {
  return new AgentWebSocketHandler(server, services, dependencies);
}