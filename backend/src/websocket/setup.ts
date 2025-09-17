/**
 * WebSocket Plugin Setup for Onsembl.ai
 * Configures WebSocket endpoints and handlers
 */

import { FastifyInstance } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { IncomingMessage } from 'http';
import { config } from '../config/index.js';
import { Services } from '../server.js';
import { createAgentHandler } from './agent-handler.js';
import { createDashboardHandler } from './dashboard-handler.js';
import { ConnectionPool } from './connection-pool.js';
import { HeartbeatManager } from './heartbeat.js';
import { MessageRouter } from './message-router.js';
import { TerminalStreamManager } from './terminal-stream.js';
import { TokenManager } from './token-manager.js';

export interface WebSocketDependencies {
  connectionPool: ConnectionPool;
  heartbeatManager: HeartbeatManager;
  messageRouter: MessageRouter;
  terminalStreamManager: TerminalStreamManager;
  tokenManager: TokenManager;
}

/**
 * Register WebSocket endpoints and initialize dependencies
 */
export async function setupWebSocketPlugin(
  server: FastifyInstance,
  services: Services
): Promise<void> {
  // Initialize WebSocket dependencies
  const dependencies = initializeWebSocketDependencies(server, services);

  // Register WebSocket routes
  await server.register(async function (server) {
    // Agent WebSocket endpoint
    server.get('/ws/agent', { websocket: true }, async (connection: SocketStream, request: IncomingMessage) => {
      const agentHandler = createAgentHandler(server, services, dependencies);
      await agentHandler.handleConnection(connection, request);
    });

    // Dashboard WebSocket endpoint
    server.get('/ws/dashboard', { websocket: true }, async (connection: SocketStream, request: IncomingMessage) => {
      const dashboardHandler = createDashboardHandler(server, services, dependencies);
      await dashboardHandler.handleConnection(connection, request);
    });
  });

  // Setup cleanup on server close
  server.addHook('onClose', async () => {
    server.log.info('Cleaning up WebSocket dependencies');

    // Stop heartbeat manager
    dependencies.heartbeatManager.stop();

    // Close all connections
    dependencies.connectionPool.closeAll();

    // Stop terminal stream manager
    dependencies.terminalStreamManager.stop();
  });

  server.log.info('WebSocket plugin setup completed');
}

/**
 * Initialize WebSocket system dependencies
 */
function initializeWebSocketDependencies(
  server: FastifyInstance,
  services: Services
): WebSocketDependencies {
  // Initialize connection pool
  const connectionPool = new ConnectionPool(server, {
    maxConnections: config.wsMaxConnections,
    maxPayload: config.wsMaxPayload,
    connectionTimeout: 30000, // 30 seconds
    cleanupInterval: 60000    // 1 minute
  });

  // Initialize token manager
  const tokenManager = new TokenManager(server, services.authService, {
    refreshThresholdMs: 300000, // 5 minutes before expiry
    maxRefreshAttempts: 3,
    refreshIntervalMs: 60000    // Check every minute
  });

  // Initialize message router
  const messageRouter = new MessageRouter(server, connectionPool, {
    maxQueueSize: 1000,
    messageTimeoutMs: 30000,
    retryAttempts: 3
  });

  // Initialize terminal stream manager
  const terminalStreamManager = new TerminalStreamManager(server, messageRouter, {
    bufferSize: 8192,
    flushIntervalMs: 10, // 10ms for <200ms latency requirement
    maxBufferedLines: 1000
  });

  // Initialize heartbeat manager
  const heartbeatManager = new HeartbeatManager(server, connectionPool, {
    pingIntervalMs: 30000,   // 30 seconds
    pongTimeoutMs: 10000,    // 10 seconds
    maxMissedPings: 3
  });

  // Start background services
  heartbeatManager.start();
  tokenManager.start();
  terminalStreamManager.start();

  return {
    connectionPool,
    heartbeatManager,
    messageRouter,
    terminalStreamManager,
    tokenManager
  };
}

/**
 * WebSocket connection verification
 */
export function verifyWebSocketConnection(info: any): boolean {
  // Basic connection limit check
  const connections = info.req.server?.websocketServer?.clients?.size || 0;

  if (connections >= config.wsMaxConnections) {
    return false;
  }

  // Additional security checks can be added here
  // - Rate limiting by IP
  // - Origin verification
  // - User agent validation

  return true;
}

/**
 * Extract connection metadata from request
 */
export function extractConnectionMetadata(request: IncomingMessage) {
  return {
    remoteAddress: request.socket.remoteAddress,
    userAgent: request.headers['user-agent'],
    origin: request.headers.origin,
    forwardedFor: request.headers['x-forwarded-for'],
    connectionTime: Date.now()
  };
}