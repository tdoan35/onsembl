/**
 * Heartbeat Management System for Onsembl.ai WebSockets
 * Manages ping/pong health checks for all connections
 */

import { FastifyInstance } from 'fastify';
import { EventEmitter } from 'events';
import { ConnectionPool } from './connection-pool.js';
import { MessageType } from '../../../packages/agent-protocol/src/types.js';

export interface HeartbeatConfig {
  pingIntervalMs: number;
  pongTimeoutMs: number;
  maxMissedPings: number;
}

export interface ConnectionHealth {
  connectionId: string;
  lastPing: number;
  lastPong: number;
  missedPings: number;
  averageLatency: number;
  latencyHistory: number[];
  isHealthy: boolean;
}

export class HeartbeatManager extends EventEmitter {
  private healthMap = new Map<string, ConnectionHealth>();
  private pingTimer?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    private server: FastifyInstance,
    private connectionPool: ConnectionPool,
    private config: HeartbeatConfig
  ) {
    super();
    this.setupConnectionPoolListeners();
  }

  /**
   * Start heartbeat monitoring
   */
  start(): void {
    if (this.isRunning) {
      this.server.log.warn('Heartbeat manager already running');
      return;
    }

    this.isRunning = true;
    this.startPingTimer();

    this.server.log.info({
      pingInterval: this.config.pingIntervalMs,
      pongTimeout: this.config.pongTimeoutMs,
      maxMissedPings: this.config.maxMissedPings
    }, 'Heartbeat manager started');

    this.emit('started');
  }

  /**
   * Stop heartbeat monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.stopPingTimer();
    this.healthMap.clear();

    this.server.log.info('Heartbeat manager stopped');
    this.emit('stopped');
  }

  /**
   * Start monitoring specific connection
   */
  startMonitoring(connectionId: string): void {
    if (this.healthMap.has(connectionId)) {
      this.server.log.warn({ connectionId }, 'Connection already being monitored');
      return;
    }

    const health: ConnectionHealth = {
      connectionId,
      lastPing: Date.now(),
      lastPong: Date.now(),
      missedPings: 0,
      averageLatency: 0,
      latencyHistory: [],
      isHealthy: true
    };

    this.healthMap.set(connectionId, health);

    this.server.log.debug({ connectionId }, 'Started monitoring connection health');
    this.emit('monitoringStarted', { connectionId });
  }

  /**
   * Stop monitoring specific connection
   */
  stopMonitoring(connectionId: string): void {
    const health = this.healthMap.get(connectionId);
    if (!health) {
      return;
    }

    this.healthMap.delete(connectionId);

    this.server.log.debug({
      connectionId,
      finalStats: {
        averageLatency: health.averageLatency,
        missedPings: health.missedPings,
        wasHealthy: health.isHealthy
      }
    }, 'Stopped monitoring connection health');

    this.emit('monitoringStopped', { connectionId, finalStats: health });
  }

  /**
   * Record pong response from connection
   */
  recordPong(connectionId: string, originalTimestamp: number): void {
    const health = this.healthMap.get(connectionId);
    if (!health) {
      return;
    }

    const now = Date.now();
    const latency = now - originalTimestamp;

    health.lastPong = now;
    health.missedPings = Math.max(0, health.missedPings - 1);

    // Update latency history (keep last 10 measurements)
    health.latencyHistory.push(latency);
    if (health.latencyHistory.length > 10) {
      health.latencyHistory.shift();
    }

    // Calculate average latency
    health.averageLatency = health.latencyHistory.reduce((sum, lat) => sum + lat, 0) / health.latencyHistory.length;

    // Update health status
    const wasHealthy = health.isHealthy;
    health.isHealthy = health.missedPings < this.config.maxMissedPings;

    this.server.log.debug({
      connectionId,
      latency,
      averageLatency: health.averageLatency,
      missedPings: health.missedPings,
      isHealthy: health.isHealthy
    }, 'Pong received');

    // Emit health change event
    if (!wasHealthy && health.isHealthy) {
      this.emit('connectionHealthy', { connectionId, health: { ...health } });
    }

    this.emit('pongReceived', { connectionId, latency, health: { ...health } });
  }

  /**
   * Get health status of connection
   */
  getConnectionHealth(connectionId: string): ConnectionHealth | null {
    const health = this.healthMap.get(connectionId);
    return health ? { ...health } : null;
  }

  /**
   * Get all connection health statuses
   */
  getAllHealthStatuses(): Map<string, ConnectionHealth> {
    const statuses = new Map<string, ConnectionHealth>();
    for (const [id, health] of this.healthMap.entries()) {
      statuses.set(id, { ...health });
    }
    return statuses;
  }

  /**
   * Get healthy connections
   */
  getHealthyConnections(): string[] {
    const healthy: string[] = [];
    for (const [connectionId, health] of this.healthMap.entries()) {
      if (health.isHealthy) {
        healthy.push(connectionId);
      }
    }
    return healthy;
  }

  /**
   * Get unhealthy connections
   */
  getUnhealthyConnections(): string[] {
    const unhealthy: string[] = [];
    for (const [connectionId, health] of this.healthMap.entries()) {
      if (!health.isHealthy) {
        unhealthy.push(connectionId);
      }
    }
    return unhealthy;
  }

  /**
   * Get average latency for connection
   */
  getAverageLatency(connectionId: string): number | null {
    const health = this.healthMap.get(connectionId);
    return health ? health.averageLatency : null;
  }

  /**
   * Get overall health statistics
   */
  getHealthStats(): {
    total: number;
    healthy: number;
    unhealthy: number;
    averageLatency: number;
    minLatency: number;
    maxLatency: number;
  } {
    const healths = Array.from(this.healthMap.values());
    const healthyConnections = healths.filter(h => h.isHealthy);

    const latencies = healths
      .filter(h => h.latencyHistory.length > 0)
      .map(h => h.averageLatency);

    return {
      total: healths.length,
      healthy: healthyConnections.length,
      unhealthy: healths.length - healthyConnections.length,
      averageLatency: latencies.length > 0 ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length : 0,
      minLatency: latencies.length > 0 ? Math.min(...latencies) : 0,
      maxLatency: latencies.length > 0 ? Math.max(...latencies) : 0
    };
  }

  /**
   * Force ping all connections
   */
  pingAllConnections(): void {
    if (!this.isRunning) {
      return;
    }

    const connections = this.connectionPool.getAuthenticatedConnections();
    let sentCount = 0;

    for (const [connectionId] of connections) {
      if (this.sendPing(connectionId)) {
        sentCount++;
      }
    }

    this.server.log.debug({
      totalConnections: connections.size,
      pingsSent: sentCount
    }, 'Ping cycle completed');

    this.emit('pingCycle', { total: connections.size, sent: sentCount });
  }

  /**
   * Send ping to specific connection
   */
  sendPing(connectionId: string): boolean {
    const connection = this.connectionPool.getConnection(connectionId);
    if (!connection || !connection.isAuthenticated) {
      return false;
    }

    const health = this.healthMap.get(connectionId);
    if (!health) {
      // Connection not being monitored, skip
      return false;
    }

    const timestamp = Date.now();

    try {
      const pingMessage = {
        type: MessageType.PING,
        id: this.generateMessageId(),
        timestamp,
        payload: { timestamp }
      };

      connection.socket.socket.send(JSON.stringify(pingMessage));

      // Update health tracking
      health.lastPing = timestamp;
      health.missedPings++;

      this.server.log.debug({ connectionId, timestamp }, 'Ping sent');

      // Schedule pong timeout check
      setTimeout(() => {
        this.checkPongTimeout(connectionId, timestamp);
      }, this.config.pongTimeoutMs);

      return true;

    } catch (error) {
      this.server.log.error({ error, connectionId }, 'Failed to send ping');
      this.handlePingError(connectionId, error);
      return false;
    }
  }

  /**
   * Handle missed pong timeout
   */
  private checkPongTimeout(connectionId: string, pingTimestamp: number): void {
    const health = this.healthMap.get(connectionId);
    if (!health) {
      return; // Connection no longer monitored
    }

    // If we received a pong after this ping, ignore timeout
    if (health.lastPong >= pingTimestamp) {
      return;
    }

    const wasHealthy = health.isHealthy;

    // Check if connection exceeded missed ping threshold
    if (health.missedPings >= this.config.maxMissedPings) {
      health.isHealthy = false;

      this.server.log.warn({
        connectionId,
        missedPings: health.missedPings,
        maxMissedPings: this.config.maxMissedPings
      }, 'Connection health degraded - exceeded missed ping threshold');

      if (wasHealthy) {
        this.emit('connectionUnhealthy', { connectionId, health: { ...health } });
      }

      // Trigger connection timeout
      this.emit('connectionTimeout', connectionId);
    }
  }

  /**
   * Handle ping send errors
   */
  private handlePingError(connectionId: string, error: any): void {
    const health = this.healthMap.get(connectionId);
    if (!health) {
      return;
    }

    health.missedPings++;
    health.isHealthy = false;

    this.server.log.error({
      connectionId,
      error,
      missedPings: health.missedPings
    }, 'Ping send error - marking connection as unhealthy');

    this.emit('connectionUnhealthy', { connectionId, health: { ...health }, error });
    this.emit('pingError', { connectionId, error });
  }

  /**
   * Start ping timer
   */
  private startPingTimer(): void {
    this.pingTimer = setInterval(() => {
      if (this.isRunning) {
        this.pingAllConnections();
      }
    }, this.config.pingIntervalMs);
  }

  /**
   * Stop ping timer
   */
  private stopPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  /**
   * Setup connection pool event listeners
   */
  private setupConnectionPoolListeners(): void {
    this.connectionPool.on('connectionAdded', ({ connectionId }) => {
      // Don't auto-start monitoring here - let handlers decide when to start
      // after authentication is complete
    });

    this.connectionPool.on('connectionRemoved', ({ connectionId }) => {
      this.stopMonitoring(connectionId);
    });

    this.connectionPool.on('connectionUpdated', ({ connectionId, updates }) => {
      // If connection became authenticated, we might want to start monitoring
      if (updates.isAuthenticated && !this.healthMap.has(connectionId)) {
        // Let the handler start monitoring explicitly
      }
    });
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `ping-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connection uptime vs health correlation
   */
  getHealthAnalytics(): {
    connectionId: string;
    uptime: number;
    healthScore: number; // 0-1 based on missed pings
    latencyTrend: 'improving' | 'stable' | 'degrading';
    riskLevel: 'low' | 'medium' | 'high';
  }[] {
    const analytics: any[] = [];

    for (const [connectionId, health] of this.healthMap.entries()) {
      const uptime = this.connectionPool.getConnectionUptime(connectionId) || 0;
      const healthScore = Math.max(0, 1 - (health.missedPings / this.config.maxMissedPings));

      // Calculate latency trend
      let latencyTrend: 'improving' | 'stable' | 'degrading' = 'stable';
      if (health.latencyHistory.length >= 3) {
        const recent = health.latencyHistory.slice(-3);
        const earlier = health.latencyHistory.slice(0, 3);
        const recentAvg = recent.reduce((sum, lat) => sum + lat, 0) / recent.length;
        const earlierAvg = earlier.reduce((sum, lat) => sum + lat, 0) / earlier.length;

        if (recentAvg > earlierAvg * 1.2) {
          latencyTrend = 'degrading';
        } else if (recentAvg < earlierAvg * 0.8) {
          latencyTrend = 'improving';
        }
      }

      // Calculate risk level
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      if (!health.isHealthy || health.missedPings > 1) {
        riskLevel = 'high';
      } else if (health.averageLatency > 1000 || latencyTrend === 'degrading') {
        riskLevel = 'medium';
      }

      analytics.push({
        connectionId,
        uptime,
        healthScore,
        latencyTrend,
        riskLevel
      });
    }

    return analytics;
  }
}