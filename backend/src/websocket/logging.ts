import { WebSocket } from 'ws';
import pino from 'pino';
import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';
import { AuthContext } from './auth.js';

export interface ConnectionLogContext {
  connectionId: string;
  userId?: string;
  userEmail?: string;
  role?: string;
  ipAddress?: string;
  userAgent?: string;
  connectedAt: Date;
  lastActivity?: Date;
  messageCount: number;
  bytesReceived: number;
  bytesSent: number;
}

export class WebSocketLogger {
  private logger: pino.Logger;
  private connections = new Map<WebSocket, ConnectionLogContext>();
  private messageLog: Array<{
    timestamp: Date;
    connectionId: string;
    messageType: string;
    direction: 'in' | 'out';
    size: number;
    metadata?: Record<string, any>;
  }> = [];
  private maxLogSize = 10000; // Keep last 10k messages in memory

  constructor(logger?: pino.Logger) {
    this.logger = logger || pino({
      level: process.env['LOG_LEVEL'] || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'UTC:yyyy-mm-dd HH:MM:ss'
        }
      }
    });
  }

  /**
   * Log new WebSocket connection
   */
  logConnection(
    socket: WebSocket,
    connectionId: string,
    authContext?: AuthContext,
    request?: any
  ): void {
    const context: ConnectionLogContext = {
      connectionId,
      userId: authContext?.userId,
      userEmail: authContext?.email,
      role: authContext?.role,
      ipAddress: request?.socket?.remoteAddress || 'unknown',
      userAgent: request?.headers?.['user-agent'] || 'unknown',
      connectedAt: new Date(),
      messageCount: 0,
      bytesReceived: 0,
      bytesSent: 0
    };

    this.connections.set(socket, context);

    this.logger.info({
      event: 'websocket.connected',
      connectionId,
      userId: context.userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    }, 'WebSocket connection established');

    // Log to audit trail
    this.auditLog('CONNECTION', connectionId, {
      userId: context.userId,
      ipAddress: context.ipAddress
    });
  }

  /**
   * Log WebSocket disconnection
   */
  logDisconnection(socket: WebSocket, code?: number, reason?: string): void {
    const context = this.connections.get(socket);
    if (!context) return;

    const duration = Date.now() - context.connectedAt.getTime();

    this.logger.info({
      event: 'websocket.disconnected',
      connectionId: context.connectionId,
      userId: context.userId,
      code,
      reason,
      duration,
      stats: {
        messages: context.messageCount,
        bytesReceived: context.bytesReceived,
        bytesSent: context.bytesSent
      }
    }, 'WebSocket connection closed');

    // Log to audit trail
    this.auditLog('DISCONNECTION', context.connectionId, {
      userId: context.userId,
      duration,
      messageCount: context.messageCount
    });

    this.connections.delete(socket);
  }

  /**
   * Log incoming message
   */
  logIncomingMessage(socket: WebSocket, message: WebSocketMessage, raw: Buffer): void {
    const context = this.connections.get(socket);
    if (!context) return;

    context.lastActivity = new Date();
    context.messageCount++;
    context.bytesReceived += raw.length;

    const logEntry = {
      timestamp: new Date(),
      connectionId: context.connectionId,
      messageType: message.type,
      direction: 'in' as const,
      size: raw.length,
      metadata: this.extractMessageMetadata(message)
    };

    this.messageLog.push(logEntry);
    if (this.messageLog.length > this.maxLogSize) {
      this.messageLog.shift();
    }

    this.logger.debug({
      event: 'websocket.message.received',
      ...logEntry,
      userId: context.userId
    }, `Received ${message.type}`);

    // Log important messages at info level
    if (this.isImportantMessage(message.type)) {
      this.logger.info({
        event: 'websocket.action',
        connectionId: context.connectionId,
        userId: context.userId,
        action: message.type,
        metadata: logEntry.metadata
      }, `Action: ${message.type}`);
    }
  }

  /**
   * Log outgoing message
   */
  logOutgoingMessage(socket: WebSocket, message: WebSocketMessage): void {
    const context = this.connections.get(socket);
    if (!context) return;

    const raw = JSON.stringify(message);
    context.bytesSent += raw.length;

    const logEntry = {
      timestamp: new Date(),
      connectionId: context.connectionId,
      messageType: message.type,
      direction: 'out' as const,
      size: raw.length,
      metadata: this.extractMessageMetadata(message)
    };

    this.messageLog.push(logEntry);
    if (this.messageLog.length > this.maxLogSize) {
      this.messageLog.shift();
    }

    this.logger.debug({
      event: 'websocket.message.sent',
      ...logEntry,
      userId: context.userId
    }, `Sent ${message.type}`);
  }

  /**
   * Log error
   */
  logError(socket: WebSocket | null, error: Error, context?: any): void {
    const connContext = socket ? this.connections.get(socket) : null;

    this.logger.error({
      event: 'websocket.error',
      connectionId: connContext?.connectionId,
      userId: connContext?.userId,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      context
    }, 'WebSocket error occurred');

    // Log to audit trail for serious errors
    if (this.isSeriousError(error)) {
      this.auditLog('ERROR', connContext?.connectionId || 'unknown', {
        error: error.message,
        context
      });
    }
  }

  /**
   * Log rate limit violation
   */
  logRateLimitViolation(socket: WebSocket, reason: string): void {
    const context = this.connections.get(socket);
    if (!context) return;

    this.logger.warn({
      event: 'websocket.rate_limit',
      connectionId: context.connectionId,
      userId: context.userId,
      reason
    }, 'Rate limit violation');

    this.auditLog('RATE_LIMIT_VIOLATION', context.connectionId, {
      userId: context.userId,
      reason
    });
  }

  /**
   * Log authentication failure
   */
  logAuthFailure(request: any, reason: string): void {
    this.logger.warn({
      event: 'websocket.auth_failure',
      ipAddress: request?.socket?.remoteAddress || 'unknown',
      userAgent: request?.headers?.['user-agent'] || 'unknown',
      reason
    }, 'WebSocket authentication failed');

    this.auditLog('AUTH_FAILURE', 'none', {
      ipAddress: request?.socket?.remoteAddress,
      reason
    });
  }

  /**
   * Extract metadata from message for logging
   */
  private extractMessageMetadata(message: WebSocketMessage): Record<string, any> {
    const metadata: Record<string, any> = {};

    switch (message.type) {
      case 'command:request':
        metadata.command = (message as any).command;
        metadata.agentId = (message as any).agentId;
        break;
      case 'agent:status':
        metadata.agentId = (message as any).agentId;
        metadata.status = (message as any).status;
        break;
      case 'terminal:output':
        metadata.agentId = (message as any).agentId;
        metadata.outputType = (message as any).output?.type;
        break;
    }

    return metadata;
  }

  /**
   * Check if message type is important enough for info-level logging
   */
  private isImportantMessage(type: string): boolean {
    const importantTypes = [
      'command:request',
      'command:interrupt',
      'agent:connect',
      'agent:disconnect',
      'dashboard:connect',
      'dashboard:disconnect',
      'system:emergency-stop'
    ];
    return importantTypes.includes(type);
  }

  /**
   * Check if error is serious enough for audit logging
   */
  private isSeriousError(error: Error): boolean {
    const seriousPatterns = [
      /auth/i,
      /security/i,
      /permission/i,
      /unauthorized/i,
      /forbidden/i
    ];
    return seriousPatterns.some(p => p.test(error.message));
  }

  /**
   * Write to audit log (would integrate with Supabase in production)
   */
  private auditLog(action: string, connectionId: string, metadata: any): void {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      connectionId,
      metadata
    };

    // In production, write to Supabase AuditLog table
    this.logger.info({ event: 'audit', ...entry }, `Audit: ${action}`);
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(socket: WebSocket): ConnectionLogContext | null {
    return this.connections.get(socket) || null;
  }

  /**
   * Get recent message log
   */
  getRecentMessages(limit: number = 100): typeof this.messageLog {
    return this.messageLog.slice(-limit);
  }

  /**
   * Get aggregated statistics
   */
  getStats(): {
    activeConnections: number;
    totalMessages: number;
    totalBytesReceived: number;
    totalBytesSent: number;
    messageTypes: Record<string, number>;
  } {
    let totalMessages = 0;
    let totalBytesReceived = 0;
    let totalBytesSent = 0;
    const messageTypes: Record<string, number> = {};

    for (const context of this.connections.values()) {
      totalMessages += context.messageCount;
      totalBytesReceived += context.bytesReceived;
      totalBytesSent += context.bytesSent;
    }

    for (const entry of this.messageLog) {
      messageTypes[entry.messageType] = (messageTypes[entry.messageType] || 0) + 1;
    }

    return {
      activeConnections: this.connections.size,
      totalMessages,
      totalBytesReceived,
      totalBytesSent,
      messageTypes
    };
  }
}

// Export singleton instance
export const wsLogger = new WebSocketLogger();
