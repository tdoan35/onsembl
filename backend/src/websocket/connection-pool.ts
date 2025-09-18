/**
 * Connection Pool Management for Onsembl.ai WebSockets
 * Manages and monitors all WebSocket connections
 */

import { FastifyInstance } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { EventEmitter } from 'events';
import { extractConnectionMetadata } from './setup.js';

export interface ConnectionMetadata {
  type: 'agent' | 'dashboard';
  socket: SocketStream;
  metadata: ReturnType<typeof extractConnectionMetadata>;
  isAuthenticated: boolean;
  agentId?: string;
  userId?: string;
  connectedAt: number;
  lastActivity: number;
  lastPing?: number;
  lastPong?: number;
  messageCount: number;
  bytesTransferred: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  failedPings: number;
}

export interface ConnectionPoolConfig {
  maxConnections: number;
  maxPayload: number;
  connectionTimeout: number;
  cleanupInterval: number;
}

export interface ConnectionStats {
  total: number;
  authenticated: number;
  agents: number;
  dashboards: number;
  active: number;
  idle: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
}

export class ConnectionPool extends EventEmitter {
  private connections = new Map<string, ConnectionMetadata>();
  private cleanupTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private pingTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private server: FastifyInstance,
    private config: ConnectionPoolConfig
  ) {
    super();
    this.startCleanupTimer();
    this.startHealthCheckTimer();
  }

  /**
   * Add new connection to pool
   */
  addConnection(connectionId: string, metadata: Omit<ConnectionMetadata, 'connectedAt' | 'lastActivity' | 'lastPing' | 'lastPong' | 'messageCount' | 'bytesTransferred' | 'healthStatus' | 'failedPings'>): void {
    const connection: ConnectionMetadata = {
      ...metadata,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      messageCount: 0,
      bytesTransferred: 0,
      healthStatus: 'healthy',
      failedPings: 0
    };

    this.connections.set(connectionId, connection);

    // Setup connection monitoring
    this.setupConnectionMonitoring(connectionId, connection);

    this.server.log.debug({
      connectionId,
      type: connection.type,
      total: this.connections.size
    }, 'Connection added to pool');

    this.emit('connectionAdded', { connectionId, type: connection.type });

    // Check connection limits
    if (this.connections.size > this.config.maxConnections) {
      this.server.log.warn({
        current: this.connections.size,
        max: this.config.maxConnections
      }, 'Connection pool approaching limit');
    }
  }

  /**
   * Update existing connection
   */
  updateConnection(connectionId: string, updates: Partial<ConnectionMetadata>): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      this.server.log.warn({ connectionId }, 'Attempted to update non-existent connection');
      return;
    }

    Object.assign(connection, updates);
    connection.lastActivity = Date.now();

    this.server.log.debug({ connectionId, updates }, 'Connection updated');
    this.emit('connectionUpdated', { connectionId, updates });
  }

  /**
   * Remove connection from pool
   */
  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    this.connections.delete(connectionId);

    this.server.log.debug({
      connectionId,
      type: connection.type,
      duration: Date.now() - connection.connectedAt,
      messageCount: connection.messageCount,
      bytesTransferred: connection.bytesTransferred
    }, 'Connection removed from pool');

    this.emit('connectionRemoved', {
      connectionId,
      type: connection.type,
      stats: {
        duration: Date.now() - connection.connectedAt,
        messageCount: connection.messageCount,
        bytesTransferred: connection.bytesTransferred
      }
    });
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): ConnectionMetadata | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all connections of specific type
   */
  getConnectionsByType(type: 'agent' | 'dashboard'): Map<string, ConnectionMetadata> {
    const filtered = new Map<string, ConnectionMetadata>();

    for (const [id, connection] of this.connections.entries()) {
      if (connection.type === type) {
        filtered.set(id, connection);
      }
    }

    return filtered;
  }

  /**
   * Get connections by agent ID
   */
  getConnectionsByAgentId(agentId: string): Map<string, ConnectionMetadata> {
    const filtered = new Map<string, ConnectionMetadata>();

    for (const [id, connection] of this.connections.entries()) {
      if (connection.agentId === agentId) {
        filtered.set(id, connection);
      }
    }

    return filtered;
  }

  /**
   * Get connections by user ID
   */
  getConnectionsByUserId(userId: string): Map<string, ConnectionMetadata> {
    const filtered = new Map<string, ConnectionMetadata>();

    for (const [id, connection] of this.connections.entries()) {
      if (connection.userId === userId) {
        filtered.set(id, connection);
      }
    }

    return filtered;
  }

  /**
   * Get authenticated connections only
   */
  getAuthenticatedConnections(): Map<string, ConnectionMetadata> {
    const filtered = new Map<string, ConnectionMetadata>();

    for (const [id, connection] of this.connections.entries()) {
      if (connection.isAuthenticated) {
        filtered.set(id, connection);
      }
    }

    return filtered;
  }

  /**
   * Get connection statistics
   */
  getStats(): ConnectionStats {
    let authenticated = 0;
    let agents = 0;
    let dashboards = 0;
    let active = 0;
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;
    const now = Date.now();

    for (const connection of this.connections.values()) {
      if (connection.isAuthenticated) authenticated++;
      if (connection.type === 'agent') agents++;
      if (connection.type === 'dashboard') dashboards++;

      // Consider active if had activity in last 5 minutes
      if (now - connection.lastActivity < 300000) active++;

      // Count health statuses
      switch (connection.healthStatus) {
        case 'healthy':
          healthy++;
          break;
        case 'degraded':
          degraded++;
          break;
        case 'unhealthy':
          unhealthy++;
          break;
      }
    }

    return {
      total: this.connections.size,
      authenticated,
      agents,
      dashboards,
      active,
      idle: this.connections.size - active,
      healthy,
      degraded,
      unhealthy
    };
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    this.server.log.info({ count: this.connections.size }, 'Closing all connections');

    // Clear all ping timeouts
    for (const timeout of this.pingTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.pingTimeouts.clear();

    for (const [connectionId, connection] of this.connections.entries()) {
      try {
        connection.socket.socket.close();
      } catch (error) {
        this.server.log.error({ error, connectionId }, 'Error closing connection');
      }
    }

    this.connections.clear();
    this.stopCleanupTimer();
    this.stopHealthCheckTimer();
    this.emit('allConnectionsClosed');
  }

  /**
   * Close connections by type
   */
  closeByType(type: 'agent' | 'dashboard'): void {
    const toClose: string[] = [];

    for (const [connectionId, connection] of this.connections.entries()) {
      if (connection.type === type) {
        toClose.push(connectionId);
      }
    }

    this.server.log.info({ type, count: toClose.length }, 'Closing connections by type');

    toClose.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        try {
          connection.socket.socket.close();
        } catch (error) {
          this.server.log.error({ error, connectionId }, 'Error closing connection');
        }
      }
    });
  }

  /**
   * Close idle connections
   */
  closeIdleConnections(maxIdleTime: number = 1800000): number {
    const now = Date.now();
    const toClose: string[] = [];

    for (const [connectionId, connection] of this.connections.entries()) {
      if (now - connection.lastActivity > maxIdleTime) {
        toClose.push(connectionId);
      }
    }

    this.server.log.info({ count: toClose.length, maxIdleTime }, 'Closing idle connections');

    toClose.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        try {
          connection.socket.socket.close();
        } catch (error) {
          this.server.log.error({ error, connectionId }, 'Error closing idle connection');
        }
      }
    });

    return toClose.length;
  }

  /**
   * Broadcast message to connections
   */
  broadcast(
    message: string,
    filter?: (connection: ConnectionMetadata) => boolean
  ): number {
    let sent = 0;

    for (const [connectionId, connection] of this.connections.entries()) {
      if (!connection.isAuthenticated) continue;
      if (filter && !filter(connection)) continue;

      try {
        connection.socket.socket.send(message);
        connection.messageCount++;
        connection.bytesTransferred += Buffer.byteLength(message);
        connection.lastActivity = Date.now();
        sent++;
      } catch (error) {
        this.server.log.error({ error, connectionId }, 'Error broadcasting message');
        // Connection might be dead, it will be cleaned up later
      }
    }

    return sent;
  }

  /**
   * Send message to specific connection
   */
  sendToConnection(connectionId: string, message: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.isAuthenticated) {
      return false;
    }

    try {
      connection.socket.socket.send(message);
      connection.messageCount++;
      connection.bytesTransferred += Buffer.byteLength(message);
      connection.lastActivity = Date.now();
      return true;
    } catch (error) {
      this.server.log.error({ error, connectionId }, 'Error sending message to connection');
      return false;
    }
  }

  /**
   * Check if connection exists and is healthy
   */
  isConnectionHealthy(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    // Check socket state and health status
    try {
      return connection.socket.socket.readyState === 1 && // WebSocket.OPEN
             connection.healthStatus !== 'unhealthy';
    } catch {
      return false;
    }
  }

  /**
   * Send ping to a connection and monitor response
   */
  sendPing(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.isAuthenticated) {
      return;
    }

    try {
      // Send WebSocket ping frame
      connection.socket.socket.ping();
      connection.lastPing = Date.now();

      // Set timeout for pong response
      const timeout = setTimeout(() => {
        this.handlePingTimeout(connectionId);
      }, 10000); // 10 second timeout

      // Store timeout to clear it later
      this.pingTimeouts.set(connectionId, timeout);

      this.server.log.debug({ connectionId }, 'Ping sent');
    } catch (error) {
      this.server.log.error({ error, connectionId }, 'Failed to send ping');
      this.updateConnectionHealth(connectionId, 'unhealthy');
    }
  }

  /**
   * Handle pong response from connection
   */
  handlePong(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    connection.lastPong = Date.now();
    connection.lastActivity = Date.now();
    connection.failedPings = 0;

    // Clear ping timeout
    const timeout = this.pingTimeouts.get(connectionId);
    if (timeout) {
      clearTimeout(timeout);
      this.pingTimeouts.delete(connectionId);
    }

    // Update health status based on latency
    const latency = connection.lastPong - (connection.lastPing || 0);
    if (latency < 1000) {
      this.updateConnectionHealth(connectionId, 'healthy');
    } else if (latency < 5000) {
      this.updateConnectionHealth(connectionId, 'degraded');
    } else {
      this.updateConnectionHealth(connectionId, 'unhealthy');
    }

    this.server.log.debug({ connectionId, latency }, 'Pong received');
  }

  /**
   * Handle ping timeout (no pong received)
   */
  private handlePingTimeout(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    connection.failedPings++;
    this.server.log.warn({ connectionId, failedPings: connection.failedPings }, 'Ping timeout');

    // Update health status based on failed pings
    if (connection.failedPings >= 3) {
      this.updateConnectionHealth(connectionId, 'unhealthy');
      // Consider closing the connection after too many failures
      if (connection.failedPings >= 5) {
        this.server.log.error({ connectionId }, 'Too many failed pings, closing connection');
        try {
          connection.socket.socket.close();
        } catch (error) {
          // Ignore errors when closing
        }
      }
    } else if (connection.failedPings >= 2) {
      this.updateConnectionHealth(connectionId, 'degraded');
    }
  }

  /**
   * Update connection health status
   */
  private updateConnectionHealth(connectionId: string, status: 'healthy' | 'degraded' | 'unhealthy'): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    const previousStatus = connection.healthStatus;
    if (previousStatus !== status) {
      connection.healthStatus = status;
      this.server.log.info({
        connectionId,
        previousStatus,
        newStatus: status,
        type: connection.type
      }, 'Connection health status changed');

      this.emit('health_changed', {
        connectionId,
        type: connection.type,
        previousStatus,
        newStatus: status
      });
    }
  }

  /**
   * Get connection uptime
   */
  getConnectionUptime(connectionId: string): number | null {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return null;
    }

    return Date.now() - connection.connectedAt;
  }

  /**
   * Get connection last activity time
   */
  getLastActivity(connectionId: string): number | null {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return null;
    }

    return connection.lastActivity;
  }

  /**
   * Record message activity for connection
   */
  recordActivity(connectionId: string, bytesSent: number = 0): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    connection.lastActivity = Date.now();
    connection.messageCount++;
    connection.bytesTransferred += bytesSent;
  }

  /**
   * Setup connection monitoring
   */
  private setupConnectionMonitoring(connectionId: string, connection: ConnectionMetadata): void {
    // Monitor for connection close
    connection.socket.socket.on('close', () => {
      // Clear ping timeout if exists
      const timeout = this.pingTimeouts.get(connectionId);
      if (timeout) {
        clearTimeout(timeout);
        this.pingTimeouts.delete(connectionId);
      }
      this.removeConnection(connectionId);
    });

    // Monitor for connection errors
    connection.socket.socket.on('error', (error) => {
      this.server.log.error({ error, connectionId }, 'Connection error detected');
      this.updateConnectionHealth(connectionId, 'unhealthy');
      this.emit('connectionError', { connectionId, error });
    });

    // Monitor message activity
    connection.socket.socket.on('message', (data) => {
      connection.lastActivity = Date.now();
      connection.messageCount++;
      connection.bytesTransferred += data.length;
    });

    // Monitor pong responses
    connection.socket.socket.on('pong', () => {
      this.handlePong(connectionId);
    });
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Start health check timer
   */
  private startHealthCheckTimer(): void {
    // Send pings every 30 seconds to check connection health
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, 30000); // 30 seconds
  }

  /**
   * Stop health check timer
   */
  private stopHealthCheckTimer(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Perform health checks on all connections
   */
  private performHealthChecks(): void {
    for (const [connectionId, connection] of this.connections.entries()) {
      if (connection.isAuthenticated) {
        this.sendPing(connectionId);
      }
    }
  }

  /**
   * Stop cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Perform periodic cleanup
   */
  private performCleanup(): void {
    const now = Date.now();
    const staleConnections: string[] = [];
    const unauthenticatedConnections: string[] = [];

    for (const [connectionId, connection] of this.connections.entries()) {
      // Remove connections that haven't been active for too long
      if (now - connection.lastActivity > this.config.connectionTimeout) {
        staleConnections.push(connectionId);
        continue;
      }

      // Remove connections that failed to authenticate within 60 seconds
      if (!connection.isAuthenticated && now - connection.connectedAt > 60000) {
        unauthenticatedConnections.push(connectionId);
        continue;
      }

      // Check if socket is still valid or unhealthy for too long
      if (!this.isConnectionHealthy(connectionId)) {
        staleConnections.push(connectionId);
      } else if (connection.healthStatus === 'unhealthy' && connection.failedPings >= 5) {
        // Remove persistently unhealthy connections
        staleConnections.push(connectionId);
      }
    }

    // Clean up stale connections
    staleConnections.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        this.server.log.info({ connectionId, type: connection.type }, 'Cleaning up stale connection');
        try {
          connection.socket.socket.close();
        } catch (error) {
          // Ignore errors when closing stale connections
        }
        this.removeConnection(connectionId);
      }
    });

    // Clean up unauthenticated connections
    unauthenticatedConnections.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        this.server.log.info({ connectionId, type: connection.type }, 'Cleaning up unauthenticated connection');
        try {
          connection.socket.socket.close();
        } catch (error) {
          // Ignore errors when closing stale connections
        }
        this.removeConnection(connectionId);
      }
    });

    if (staleConnections.length > 0 || unauthenticatedConnections.length > 0) {
      this.server.log.info({
        stale: staleConnections.length,
        unauthenticated: unauthenticatedConnections.length,
        remaining: this.connections.size
      }, 'Connection pool cleanup completed');
    }

    // Emit cleanup event
    this.emit('cleanup', {
      staleRemoved: staleConnections.length,
      unauthenticatedRemoved: unauthenticatedConnections.length,
      totalConnections: this.connections.size
    });
  }
}