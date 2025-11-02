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
  AgentDisconnectPayload,
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

    // DIAGNOSTIC: Re-enable to debug agent connections
    this.server.log.info({
      connectionId,
      remoteAddress: metadata.remoteAddress,
      url: request.url,
      hasToken: !!metadata.query?.token,
      agentId: metadata.query?.agentId
    }, '[AGENT-AUTH] Agent WebSocket connection established');

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
    this.server.log.info({
      connectionId,
      socketExists: !!connection.socket,
      socketReadyState: connection.socket?.readyState
    }, '[HANDLER-SETUP] Setting up message handlers');

    connection.socket.on('message', async (rawMessage) => {
      this.server.log.info({
        connectionId
      }, '[HANDLER-SETUP] Message event handler triggered');
      await this.handleMessage(agentConnection, rawMessage);
    });

    connection.socket.on('close', () => {
      this.server.log.info({ connectionId }, '[HANDLER-SETUP] Close event handler triggered');
      this.handleDisconnection(connectionId);
    });

    connection.socket.on('error', (error) => {
      this.server.log.error({ connectionId, error }, '[HANDLER-SETUP] Error event handler triggered');
      this.handleError(connectionId, error);
    });

    this.server.log.info({
      connectionId
    }, '[HANDLER-SETUP] All message handlers attached successfully');

    // Store connection temporarily until authentication
    this.connections.set(connectionId, agentConnection);

    // Set authentication timeout
    setTimeout(() => {
      if (!agentConnection.isAuthenticated) {
        // TEMP DISABLED FOR COMMAND FORWARDING DEBUG
        // this.server.log.warn({ connectionId }, 'Agent connection authentication timeout');
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

      // Log ALL incoming messages for debugging
      this.server.log.info({
        connectionId: connection.connectionId,
        messageType: message.type,
        messageId: message.id
      }, '[MESSAGE] Received message from agent');

      // Validate message structure
      if (!this.validateMessage(message)) {
        this.server.log.error({
          connectionId: connection.connectionId,
          message
        }, '[MESSAGE] Message failed validation');
        this.sendError(connection.socket, 'INVALID_MESSAGE', 'Invalid message format');
        return;
      }

      // Check if message type is allowed for agents
      if (!isAgentMessage(message.type)) {
        this.server.log.error({
          connectionId: connection.connectionId,
          messageType: message.type
        }, '[MESSAGE] Message type not allowed for agents');
        this.sendError(connection.socket, 'INVALID_MESSAGE_TYPE', 'Message type not allowed for agents');
        return;
      }

      this.server.log.info({
        connectionId: connection.connectionId,
        messageType: message.type
      }, '[MESSAGE] Message passed validation, routing to handler');

      // Route message based on type
      switch (message.type) {
        case MessageType.AGENT_CONNECT:
          await this.handleAgentConnect(connection, message as TypedWebSocketMessage<MessageType.AGENT_CONNECT>);
          break;

        // AGENT_HEARTBEAT removed - now using PING/PONG for connection health

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

        case MessageType.PONG:
          await this.handlePong(connection, message);
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
    const { agentId, name, agentType, version, hostMachine, capabilities } = message.payload;

    // DIAGNOSTIC: Log AGENT_CONNECT received
    this.server.log.info({
      connectionId: connection.connectionId,
      agentId,
      name,
      hasAuthHeader: !!connection.metadata.headers['authorization'],
      hasQueryToken: !!connection.metadata.query?.token
    }, '[AGENT-AUTH] Received AGENT_CONNECT message');

    try {
      // Authenticate agent using WebSocketAuth
      const token = connection.metadata.headers['authorization']?.replace('Bearer ', '') ||
                   connection.metadata.query?.token as string;

      if (!token) {
        this.server.log.error({
          connectionId: connection.connectionId,
          agentId,
          headers: Object.keys(connection.metadata.headers),
          query: connection.metadata.query
        }, '[AGENT-AUTH] No authentication token found in request');
        this.sendError(connection.socket, 'UNAUTHORIZED', 'No authentication token provided');
        return;
      }

      this.server.log.info({
        connectionId: connection.connectionId,
        agentId,
        tokenPrefix: token.substring(0, 20) + '...'
      }, '[AGENT-AUTH] Token extracted, validating...');

      const authContext = await this.services.authService.validateToken(token);
      if (!authContext) {
        this.server.log.error({
          connectionId: connection.connectionId,
          agentId,
          tokenPrefix: token.substring(0, 20) + '...'
        }, '[AGENT-AUTH] Token validation returned null/undefined');
        this.sendError(connection.socket, 'UNAUTHORIZED', 'Invalid authentication token');
        return;
      }

      this.server.log.info({
        connectionId: connection.connectionId,
        agentId,
        userId: authContext.userId
      }, '[AGENT-AUTH] Token validation successful');

      // Log successful authentication with userId
      this.server.log.info({
        agentId,
        userId: authContext.userId,
        connectionId: connection.connectionId
      }, 'Agent authentication successful - userId extracted from token');

      // Resolve or create agent in database so we have a UUID id
      // 1) Try to fetch by UUID id first
      let resolvedAgentId: string | null = null;
      let isReconnection = false;
      let existingAgent: any = null;

      try {
        existingAgent = await this.services.agentService.getAgent(agentId);
        resolvedAgentId = existingAgent.id;
        isReconnection = true;

        // Update agent name if provided and different from current
        if (name && name !== existingAgent.name) {
          await this.services.agentService.updateAgent(resolvedAgentId, {
            name: name
          }, authContext.userId);
          this.server.log.info({
            agentId: resolvedAgentId,
            oldName: existingAgent.name,
            newName: name
          }, 'Agent name updated on reconnection');
        }

        this.server.log.info({
          agentId: resolvedAgentId,
          userId: authContext.userId,
          previousStatus: existingAgent.status
        }, 'Agent reconnection detected - agent found by ID');
      } catch {
        // Not found by UUID, try by unique name (fallback to agentId as name)
        try {
          existingAgent = await this.services.agentService.getAgentByName(authContext.userId, name || agentId);
          resolvedAgentId = existingAgent.id;
          isReconnection = true;

          // Update agent name if provided and different from current
          if (name && name !== existingAgent.name) {
            await this.services.agentService.updateAgent(resolvedAgentId, {
              name: name
            }, authContext.userId);
            this.server.log.info({
              agentId: resolvedAgentId,
              oldName: existingAgent.name,
              newName: name
            }, 'Agent name updated on reconnection');
          }

          this.server.log.info({
            agentId: resolvedAgentId,
            userId: authContext.userId,
            agentName: agentId,
            previousStatus: existingAgent.status
          }, 'Agent reconnection detected - agent found by name');
        } catch {
          // Still not found: register a new agent using provided name or agentId as fallback
          const mappedType = (agentType || 'CUSTOM').toLowerCase() as any;

          // Extract capabilities as string array from protocol format
          let capabilitiesArray: string[] = ['basic']; // Always include basic
          if (capabilities) {
            if (capabilities.supportsInterrupt) {
              capabilitiesArray.push('interrupt');
            }
            if (capabilities.supportsTrace) {
              capabilitiesArray.push('trace');
            }
          }

          const created = await this.services.agentService.registerAgent({
            name: name || agentId, // Use provided name or fall back to agentId
            type: ['claude', 'gemini', 'codex', 'custom'].includes(mappedType)
              ? mappedType
              : 'custom',
            version: version || 'unknown',
            capabilities: capabilitiesArray, // Store as string array in database
            metadata: {
              hostMachine,
              capabilities: capabilities || {}, // Also store protocol format in metadata
            },
            status: 'offline',
            user_id: authContext.userId, // Associate agent with authenticated user
          } as any);
          resolvedAgentId = created.id;
          isReconnection = false;

          this.server.log.info({
            agentId: resolvedAgentId,
            userId: authContext.userId,
            agentName: name || agentId,
            capabilities: capabilitiesArray
          }, 'New agent registered with user association');
        }
      }

      // 2) Mark agent as connected via service (expects UUID id)
      await this.services.agentService.connectAgent(
        resolvedAgentId!,
        connection.connectionId,
        authContext.userId,
        {
          hostMachine,
          version,
          capabilities: capabilities || {},
        }
      );

      // Update connection (use resolved UUID id for routing)
      connection.agentId = resolvedAgentId!;
      connection.isAuthenticated = true;

      // 🔍 DEBUG: Log agent UUID registration
      this.server.log.info({
        connectionId: connection.connectionId,
        cliOriginalId: agentId,
        resolvedDatabaseUUID: resolvedAgentId,
        agentName: name || agentId,
        connectionAgentId: connection.agentId,
        match: connection.agentId === resolvedAgentId
      }, '🔍 [AGENT-ROUTING-DEBUG] Agent registered in connection with UUID');

      // Register token with TokenManager for automatic refresh
      const tokenInfo = authContext;
      if (tokenInfo && tokenInfo.expiresAt) {
        this.dependencies.tokenManager.registerToken(
          connection.connectionId,
          token,
          tokenInfo.expiresAt * 1000, // Convert to milliseconds
          tokenInfo.refreshToken,
          undefined, // No userId for agent connections (they use service accounts)
          agentId
        );
      }

      // Update connection pool
      this.dependencies.connectionPool.updateConnection(connection.connectionId, {
        isAuthenticated: true,
        agentId: resolvedAgentId!  // Use resolved database UUID, not CLI original ID
      });

      // Send success response with connection details
      this.sendMessage(connection.socket, MessageType.ACK, {
        messageId: message.id,
        success: true,
        connectionId: connection.connectionId,
        agentId: resolvedAgentId!,
        authenticated: true
      });

      // Start heartbeat monitoring
      this.dependencies.heartbeatManager.startMonitoring(connection.connectionId);

      // Notify other systems
      this.emit('agentConnected', { agentId: resolvedAgentId!, connectionId: connection.connectionId });

      this.server.log.info({
        agentId: resolvedAgentId!,
        connectionId: connection.connectionId
      }, 'Agent authenticated and connected');

    } catch (error) {
      this.server.log.error({
        error,
        agentId,
        connectionId: connection.connectionId,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      }, '[AGENT-AUTH] Failed to connect agent - exception thrown');
      this.sendError(connection.socket, 'CONNECTION_FAILED', 'Agent connection failed');
      connection.socket.close();
    }
  }

  /**
   * Handle agent heartbeat
   * Using resolved UUID from connection
   */
  private async handleAgentHeartbeat(
    connection: AgentConnection,
    message: TypedWebSocketMessage<MessageType.AGENT_HEARTBEAT>
  ): Promise<void> {
    const { healthMetrics } = message.payload;

    this.server.log.info({
      connectionId: connection.connectionId,
      agentId: connection.agentId
    }, '[HEARTBEAT] Received AGENT_HEARTBEAT message');

    try {
      // Use resolved UUID from connection, not string ID from message
      const resolvedAgentId = connection.agentId;

      this.server.log.info({
        connectionId: connection.connectionId,
        agentId: resolvedAgentId
      }, '[HEARTBEAT] Updating heartbeat in database');

      // Update agent heartbeat
      await this.services.agentService.updateHeartbeat(resolvedAgentId, healthMetrics);

      this.server.log.info({
        connectionId: connection.connectionId,
        agentId: resolvedAgentId
      }, '[HEARTBEAT] Database updated successfully');

      // Update connection heartbeat
      connection.lastPing = Date.now();
      connection.missedPings = 0;

      // Send heartbeat response
      this.sendMessage(connection.socket, MessageType.SERVER_HEARTBEAT, {
        serverTime: Date.now(),
        nextPingExpected: Date.now() + 30000 // 30 seconds
      });

      this.server.log.info({
        connectionId: connection.connectionId,
        agentId: resolvedAgentId
      }, '[HEARTBEAT] Sent SERVER_HEARTBEAT response');

    } catch (error) {
      // Re-enabled for heartbeat debugging
      this.server.log.error({ error, agentId: connection.agentId }, 'Failed to handle heartbeat');
    }
  }

  /**
   * Handle agent error report
   */
  private async handleAgentError(
    connection: AgentConnection,
    message: TypedWebSocketMessage<MessageType.AGENT_ERROR>
  ): Promise<void> {
    const { errorType, message: errorMessage, recoverable, details, stack } = message.payload;

    try {
      // Use resolved UUID from connection
      const resolvedAgentId = connection.agentId;

      // Log agent error
      this.services.auditService.logEvent({
        type: 'AGENT_ERROR',
        agentId: resolvedAgentId,
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
        await this.services.agentService.updateAgent(resolvedAgentId, {
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

      // TEMP DISABLED FOR COMMAND FORWARDING DEBUG
      // this.server.log.error({
      //   agentId: resolvedAgentId,
      //   errorType,
      //   message: errorMessage,
      //   recoverable
      // }, 'Agent reported error');

    } catch (error) {
      this.server.log.error({ error, agentId: connection.agentId }, 'Failed to handle agent error');
    }
  }

  /**
   * Handle command acknowledgment
   */
  private async handleCommandAck(
    connection: AgentConnection,
    message: TypedWebSocketMessage<MessageType.COMMAND_ACK>
  ): Promise<void> {
    const { commandId, status, queuePosition } = message.payload;

    try {
      // Use resolved UUID from connection
      const resolvedAgentId = connection.agentId;

      // Update command status
      await this.services.commandService.updateCommandStatus(commandId, status, {
        queuePosition,
        acknowledgedAt: new Date()
      });

      // T017: Route to dashboard with proper command tracking
      this.dependencies.messageRouter.broadcastCommandStatus(commandId, {
        commandId,
        agentId: resolvedAgentId,
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

      // KEEP FOR COMMAND FORWARDING DEBUG
      this.server.log.info({ commandId, status }, '[CMD-FWD] Command acknowledged by agent');

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

      // T017: Route to dashboard with proper command tracking
      this.dependencies.messageRouter.broadcastCommandStatus(payload.commandId, payload);

      // Send acknowledgment
      this.sendMessage(connection.socket, MessageType.ACK, {
        messageId: message.id,
        success: true,
        commandId: payload.commandId,
        completed: true
      });

      // KEEP FOR COMMAND FORWARDING DEBUG
      this.server.log.info({
        commandId: payload.commandId,
        status: payload.status
      }, '[CMD-FWD] Command completed by agent');

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
      // Use resolved UUID from connection instead of message payload
      const resolvedAgentId = connection.agentId;

      // KEEP FOR COMMAND FORWARDING DEBUG
      this.server.log.info({
        commandId: payload.commandId,
        agentId: resolvedAgentId,
        contentLength: payload.content?.length,
        streamType: payload.streamType
      }, '[CMD-FWD] Received terminal output from agent');

      // Create corrected payload with resolved agent ID
      const correctedPayload = {
        ...payload,
        agentId: resolvedAgentId
      };

      // Process terminal output through stream manager
      await this.dependencies.terminalStreamManager.processOutput(correctedPayload);

      // T017: Stream to dashboard with proper command tracking
      this.dependencies.messageRouter.streamTerminalOutput({
        commandId: payload.commandId,
        agentId: resolvedAgentId,
        content: payload.content,
        streamType: payload.streamType,
        ansiCodes: payload.ansiCodes,
        timestamp: Date.now()
      });

      // KEEP FOR COMMAND FORWARDING DEBUG
      this.server.log.info({
        commandId: payload.commandId,
        agentId: resolvedAgentId
      }, '[CMD-FWD] Streamed terminal output to dashboard');

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
   * Handle ping message from agent
   * This is less common - agent asking if server is alive
   */
  private async handlePing(connection: AgentConnection, message: WebSocketMessage): Promise<void> {
    // Send pong response
    this.sendMessage(connection.socket, MessageType.PONG, {
      timestamp: message.payload.timestamp,
      latency: Date.now() - message.payload.timestamp
    });
  }

  /**
   * Handle pong message from agent
   * Agent is responding to our PING - update database to keep agent alive
   */
  private async handlePong(connection: AgentConnection, message: WebSocketMessage): Promise<void> {
    // Update database last_ping to keep agent alive
    try {
      if (connection.agentId) {
        await this.services.agentService.updateAgent(connection.agentId, {
          last_ping: new Date()
        });

        this.server.log.debug({
          connectionId: connection.connectionId,
          agentId: connection.agentId
        }, '[PING/PONG] Updated agent last_ping from PONG response');
      }
    } catch (error) {
      this.server.log.error({
        error,
        connectionId: connection.connectionId,
        agentId: connection.agentId
      }, 'Failed to update last_ping for agent');
    }

    // Notify HeartbeatManager that pong was received
    if (message.payload.timestamp) {
      this.dependencies.heartbeatManager.recordPong(connection.connectionId, message.payload.timestamp);
    }
  }

  /**
   * Handle connection disconnection
   */
  private async handleDisconnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);

    if (connection) {
      this.server.log.info({
        connectionId,
        agentId: connection.agentId
      }, 'Agent WebSocket connection closed');

      // Broadcast AGENT_DISCONNECT event to dashboards
      if (connection.agentId) {
        const disconnectPayload: AgentDisconnectPayload = {
          agentId: connection.agentId,
          reason: 'Normal disconnection',
          timestamp: Date.now()
        };

        this.dependencies.messageRouter.routeToDashboard(
          MessageType.AGENT_DISCONNECT,
          disconnectPayload,
          8 // High priority
        );
      }

      // Unregister token from TokenManager
      this.dependencies.tokenManager.unregisterToken(connectionId);

      // Stop heartbeat monitoring
      this.dependencies.heartbeatManager.stopMonitoring(connectionId);

      // Remove from connection pool
      this.dependencies.connectionPool.removeConnection(connectionId);

      // Update agent status and cancel executing commands
      if (connection.agentId) {
        try {
          // Update agent status to OFFLINE
          await this.services.agentService.updateAgent(connection.agentId, {
            status: 'OFFLINE',
            disconnectedAt: new Date()
          });

          // Cancel any executing commands
          const runningCommands = await this.services.commandService.getRunningCommands(connection.agentId);
          const queuedCommands = await this.services.commandService.getQueuedCommands(connection.agentId);
          const activeCommands = [...(runningCommands || []), ...(queuedCommands || [])];

          if (activeCommands.length > 0) {
            this.server.log.info({
              agentId: connection.agentId,
              commandCount: activeCommands.length
            }, 'Cancelling active commands due to agent disconnect');

            for (const command of activeCommands) {
              await this.services.commandService.updateCommandStatus(command.id, 'CANCELLED', {
                error: 'Agent disconnected',
                completedAt: new Date()
              });
            }
          }
        } catch (error) {
          this.server.log.error({ error, agentId: connection.agentId }, 'Failed to handle agent disconnect cleanup');
        }
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
   * Check if an agent is currently connected
   */
  public isAgentConnected(agentId: string): boolean {
    return Array.from(this.connections.values()).some(conn => conn.agentId === agentId && conn.isAuthenticated);
  }

  /**
   * Get agent metrics from active connection
   */
  public getAgentMetrics(agentId: string): any {
    const connection = Array.from(this.connections.values()).find(conn => conn.agentId === agentId);
    if (!connection) {
      return null;
    }

    // Return connection metadata (metrics would be stored here during heartbeat)
    return connection.metadata;
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
