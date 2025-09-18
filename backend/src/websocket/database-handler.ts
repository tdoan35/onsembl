/**
 * WebSocket handler for database status events
 * Broadcasts database connection status to all dashboards
 */

import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { HealthCheckService, HealthStatus } from '../database/health-check.service.js';
import { ConnectionPool } from './connection-pool.js';

export interface DatabaseStatusMessage {
  type: 'database:status';
  payload: {
    connected: boolean;
    type: 'supabase' | 'postgres' | 'none';
    environment: 'production' | 'local' | 'none';
    message: string;
    lastCheck: string;
    latency?: number;
  };
}

export class DatabaseStatusHandler {
  private fastify: FastifyInstance;
  private healthService: HealthCheckService;
  private connectionPool: ConnectionPool;
  private broadcastInterval: NodeJS.Timeout | null = null;

  constructor(
    fastify: FastifyInstance,
    healthService: HealthCheckService,
    connectionPool: ConnectionPool
  ) {
    this.fastify = fastify;
    this.healthService = healthService;
    this.connectionPool = connectionPool;
  }

  /**
   * Initialize database status handler
   */
  initialize(): void {
    // Listen to health service events
    this.healthService.on('status', (status: HealthStatus) => {
      this.broadcastStatus(status);
    });

    this.healthService.on('unhealthy', ({ status, error }) => {
      this.fastify.log.warn(
        { status, error: error.message },
        'Database became unhealthy, notifying dashboards'
      );
      this.broadcastStatus(status);
    });

    // Send initial status to new dashboard connections
    this.setupConnectionHandlers();

    this.fastify.log.info('Database status handler initialized');
  }

  /**
   * Setup handlers for new dashboard connections
   */
  private setupConnectionHandlers(): void {
    // Hook into connection pool events
    this.connectionPool.on('dashboard:connected', (connectionId: string) => {
      const connection = this.connectionPool.getConnection(connectionId);
      if (connection?.type === 'dashboard') {
        // Send current database status to new dashboard
        const status = this.healthService.getStatus();
        this.sendStatusToConnection(connection.socket, status);
      }
    });
  }

  /**
   * Broadcast database status to all connected dashboards
   */
  private broadcastStatus(status: HealthStatus): void {
    const message: DatabaseStatusMessage = {
      type: 'database:status',
      payload: {
        connected: status.connected,
        type: status.type,
        environment: status.environment,
        message: status.message,
        lastCheck: status.lastCheck,
        latency: status.latency
      }
    };

    const dashboards = this.connectionPool.getDashboardConnections();
    let sent = 0;

    for (const [connectionId, connection] of dashboards) {
      if (connection.socket.readyState === WebSocket.OPEN) {
        try {
          connection.socket.send(JSON.stringify(message));
          sent++;
        } catch (error) {
          this.fastify.log.error(
            { connectionId, error: (error as Error).message },
            'Failed to send database status to dashboard'
          );
        }
      }
    }

    if (sent > 0) {
      this.fastify.log.debug(
        { dashboardCount: sent, status: status.connected ? 'connected' : 'disconnected' },
        'Broadcasted database status to dashboards'
      );
    }
  }

  /**
   * Send database status to specific connection
   */
  private sendStatusToConnection(socket: WebSocket, status: HealthStatus): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: DatabaseStatusMessage = {
      type: 'database:status',
      payload: {
        connected: status.connected,
        type: status.type,
        environment: status.environment,
        message: status.message,
        lastCheck: status.lastCheck,
        latency: status.latency
      }
    };

    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      this.fastify.log.error(
        { error: (error as Error).message },
        'Failed to send database status'
      );
    }
  }

  /**
   * Handle database check request from dashboard
   */
  async handleCheckRequest(connectionId: string): Promise<void> {
    const connection = this.connectionPool.getConnection(connectionId);
    if (!connection || connection.type !== 'dashboard') {
      return;
    }

    // Perform immediate health check
    const status = await this.healthService.check();

    // Send updated status to requesting dashboard
    this.sendStatusToConnection(connection.socket, status);
  }

  /**
   * Start periodic status broadcasts (optional)
   */
  startPeriodicBroadcast(interval: number = 60000): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
    }

    this.broadcastInterval = setInterval(() => {
      const status = this.healthService.getStatus();
      this.broadcastStatus(status);
    }, interval);

    this.fastify.log.info(
      { interval },
      'Started periodic database status broadcasts'
    );
  }

  /**
   * Stop periodic broadcasts
   */
  stopPeriodicBroadcast(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  /**
   * Get formatted status for API response
   */
  getStatusSummary(): {
    connected: boolean;
    type: string;
    environment: string;
    dashboardsNotified: number;
    lastBroadcast?: string;
  } {
    const status = this.healthService.getStatus();
    const dashboards = this.connectionPool.getDashboardConnections();

    return {
      connected: status.connected,
      type: status.type,
      environment: status.environment,
      dashboardsNotified: dashboards.size,
      lastBroadcast: status.lastCheck
    };
  }

  /**
   * Handle incoming messages related to database status
   */
  handleMessage(connectionId: string, message: any): void {
    if (!message.type) return;

    switch (message.type) {
      case 'database:check':
        // Dashboard requesting immediate status check
        this.handleCheckRequest(connectionId)
          .catch(error => {
            this.fastify.log.error(
              { connectionId, error: error.message },
              'Failed to handle database check request'
            );
          });
        break;

      case 'database:subscribe':
        // Dashboard wants to receive status updates
        // Already handled by default for all dashboards
        const connection = this.connectionPool.getConnection(connectionId);
        if (connection) {
          // Send current status immediately
          const status = this.healthService.getStatus();
          this.sendStatusToConnection(connection.socket, status);
        }
        break;

      default:
        // Not a database-related message
        break;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopPeriodicBroadcast();
    this.healthService.removeAllListeners();
    this.fastify.log.info('Database status handler destroyed');
  }
}