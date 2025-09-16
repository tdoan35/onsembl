import { FastifyInstance, FastifyRequest } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import {
  MessageType,
  validateMessage,
  validateAgentConnect,
  createErrorMessage,
  createAckMessage,
  AgentConnectMessage,
  AgentHeartbeatMessage,
  CommandAckMessage,
  CommandCompleteMessage,
  TerminalOutputMessage,
  TraceEventMessage,
  StatusUpdateMessage,
} from '@onsembl/agent-protocol';

export class AgentWebSocketHandler {
  private connections: Map<string, {
    agentId: string;
    socket: SocketStream;
    connectionId: string;
  }>;

  constructor(private fastify: FastifyInstance) {
    this.connections = new Map();
  }

  handleConnection(connection: SocketStream, request: FastifyRequest) {
    const connectionId = this.generateConnectionId();
    let agentId: string | null = null;

    this.fastify.log.info({ connectionId }, 'Agent WebSocket connection opened');

    connection.socket.on('message', async (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString());
        const validation = validateMessage(message);

        if (!validation.success) {
          const error = createErrorMessage('INVALID_MESSAGE', 'Invalid message format', validation.error);
          connection.socket.send(JSON.stringify(error));
          return;
        }

        // Handle different message types
        switch (message.type) {
          case MessageType.AGENT_CONNECT:
            agentId = await this.handleAgentConnect(message as AgentConnectMessage, connection, connectionId);
            break;

          case MessageType.AGENT_HEARTBEAT:
            await this.handleAgentHeartbeat(message as AgentHeartbeatMessage, connection);
            break;

          case MessageType.COMMAND_ACK:
            await this.handleCommandAck(message as CommandAckMessage);
            break;

          case MessageType.COMMAND_COMPLETE:
            await this.handleCommandComplete(message as CommandCompleteMessage);
            break;

          case MessageType.TERMINAL_OUTPUT:
            await this.handleTerminalOutput(message as TerminalOutputMessage);
            break;

          case MessageType.TRACE_EVENT:
            await this.handleTraceEvent(message as TraceEventMessage);
            break;

          case MessageType.STATUS_UPDATE:
            await this.handleStatusUpdate(message as StatusUpdateMessage);
            break;

          default:
            const error = createErrorMessage('UNKNOWN_MESSAGE_TYPE', `Unknown message type: ${message.type}`);
            connection.socket.send(JSON.stringify(error));
        }
      } catch (error) {
        this.fastify.log.error({ error, connectionId }, 'Error handling WebSocket message');
        const errorMessage = createErrorMessage('INTERNAL_ERROR', 'Failed to process message');
        connection.socket.send(JSON.stringify(errorMessage));
      }
    });

    connection.socket.on('close', async () => {
      this.fastify.log.info({ connectionId, agentId }, 'Agent WebSocket connection closed');

      if (agentId) {
        await this.handleAgentDisconnect(connectionId);
      }

      this.connections.delete(connectionId);
    });

    connection.socket.on('error', (error) => {
      this.fastify.log.error({ error, connectionId, agentId }, 'Agent WebSocket error');
    });
  }

  private async handleAgentConnect(
    message: AgentConnectMessage,
    connection: SocketStream,
    connectionId: string
  ): Promise<string> {
    const { agentId, token, version, capabilities, metadata, reconnecting } = message.payload;

    try {
      // Verify agent token (simplified for now)
      // In production, validate against Supabase or JWT
      if (!token) {
        throw new Error('Invalid authentication token');
      }

      // Connect agent through service
      const agentService = (this.fastify as any).agentService;
      await agentService.connectAgent(agentId, connectionId, {
        version,
        capabilities,
        ...metadata,
      });

      // Store connection
      this.connections.set(connectionId, {
        agentId,
        socket: connection,
        connectionId,
      });

      // Send acknowledgment
      const ack = createAckMessage(MessageType.CONNECTION_ACK, {
        agentId,
        connectionId,
        serverVersion: '1.0.0',
      });

      connection.socket.send(JSON.stringify(ack));

      this.fastify.log.info({ agentId, connectionId, reconnecting }, 'Agent connected');

      return agentId;
    } catch (error) {
      this.fastify.log.error({ error, agentId }, 'Failed to connect agent');
      const errorMessage = createErrorMessage('CONNECTION_FAILED', (error as Error).message, { fatal: true });
      connection.socket.send(JSON.stringify(errorMessage));
      connection.socket.close();
      throw error;
    }
  }

  private async handleAgentDisconnect(connectionId: string) {
    try {
      const agentService = (this.fastify as any).agentService;
      await agentService.disconnectAgent(connectionId);
    } catch (error) {
      this.fastify.log.error({ error, connectionId }, 'Failed to disconnect agent');
    }
  }

  private async handleAgentHeartbeat(message: AgentHeartbeatMessage, connection: SocketStream) {
    const { agentId, timestamp, metrics } = message.payload;

    try {
      const agentService = (this.fastify as any).agentService;
      const response = await agentService.handleHeartbeat(agentId, metrics);

      const ack = createAckMessage(MessageType.HEARTBEAT_ACK, {
        timestamp,
        serverTime: response.serverTime,
      });

      connection.socket.send(JSON.stringify(ack));
    } catch (error) {
      this.fastify.log.error({ error, agentId }, 'Failed to handle heartbeat');
    }
  }

  private async handleCommandAck(message: CommandAckMessage) {
    const { commandId, status, queuePosition, estimatedStartTime } = message.payload;

    try {
      const commandService = (this.fastify as any).commandService;
      await commandService.updateCommandStatus(commandId, status, {
        queuePosition,
        estimatedStartTime,
      });

      this.fastify.log.info({ commandId, status }, 'Command acknowledged');
    } catch (error) {
      this.fastify.log.error({ error, commandId }, 'Failed to handle command acknowledgment');
    }
  }

  private async handleCommandComplete(message: CommandCompleteMessage) {
    const { commandId, status, exitCode, result, error, duration, startedAt, completedAt } = message.payload;

    try {
      const commandService = (this.fastify as any).commandService;
      await commandService.completeCommand(commandId, {
        status,
        exitCode,
        result,
        error,
        duration,
        startedAt,
        completedAt,
      });

      this.fastify.log.info({ commandId, status, duration }, 'Command completed');
    } catch (err) {
      this.fastify.log.error({ error: err, commandId }, 'Failed to handle command completion');
    }
  }

  private async handleTerminalOutput(message: TerminalOutputMessage) {
    const { commandId, agentId, output, type, sequence, timestamp } = message.payload;

    try {
      const commandService = (this.fastify as any).commandService;
      await commandService.appendTerminalOutput(commandId, {
        agentId,
        output,
        type,
        sequence,
        timestamp,
      });

      // Forward to dashboard connections
      this.broadcastToDashboard({
        type: MessageType.TERMINAL_OUTPUT,
        timestamp: new Date().toISOString(),
        payload: message.payload,
      });
    } catch (error) {
      this.fastify.log.error({ error, commandId }, 'Failed to handle terminal output');
    }
  }

  private async handleTraceEvent(message: TraceEventMessage) {
    const { commandId, agentId, parentId, type, content, metadata } = message.payload;

    try {
      const commandService = (this.fastify as any).commandService;
      await commandService.addTraceEntry({
        commandId,
        agentId,
        parentId,
        type,
        content,
        metadata,
      });

      // Forward to dashboard connections
      this.broadcastToDashboard({
        type: MessageType.TRACE_EVENT,
        timestamp: new Date().toISOString(),
        payload: message.payload,
      });
    } catch (error) {
      this.fastify.log.error({ error, commandId }, 'Failed to handle trace event');
    }
  }

  private async handleStatusUpdate(message: StatusUpdateMessage) {
    const { agentId, status, reason, metadata } = message.payload;

    try {
      const agentService = (this.fastify as any).agentService;
      await agentService.updateAgent(agentId, {
        status,
        metadata: {
          ...metadata,
          statusReason: reason,
          lastStatusUpdate: new Date().toISOString(),
        },
      });

      // Forward to dashboard connections
      this.broadcastToDashboard({
        type: MessageType.STATUS_UPDATE,
        timestamp: new Date().toISOString(),
        payload: message.payload,
      });

      this.fastify.log.info({ agentId, status, reason }, 'Agent status updated');
    } catch (error) {
      this.fastify.log.error({ error, agentId }, 'Failed to handle status update');
    }
  }

  private broadcastToDashboard(message: any) {
    // This would send to dashboard connections
    // Implementation depends on dashboard handler
    this.fastify.log.debug({ message }, 'Broadcasting to dashboard');
  }

  sendCommandToAgent(agentId: string, command: any) {
    const connection = Array.from(this.connections.values()).find(c => c.agentId === agentId);

    if (!connection) {
      throw new Error(`No connection found for agent ${agentId}`);
    }

    const message = {
      type: MessageType.COMMAND_REQUEST,
      timestamp: new Date().toISOString(),
      payload: command,
    };

    connection.socket.socket.send(JSON.stringify(message));
  }

  cancelCommandOnAgent(agentId: string, commandId: string) {
    const connection = Array.from(this.connections.values()).find(c => c.agentId === agentId);

    if (!connection) {
      throw new Error(`No connection found for agent ${agentId}`);
    }

    const message = {
      type: MessageType.COMMAND_CANCEL,
      timestamp: new Date().toISOString(),
      payload: {
        commandId,
        reason: 'User requested cancellation',
      },
    };

    connection.socket.socket.send(JSON.stringify(message));
  }

  private generateConnectionId(): string {
    return `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}