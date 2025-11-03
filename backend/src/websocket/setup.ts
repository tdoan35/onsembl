/**
 * WebSocket Plugin Setup for Onsembl.ai
 * Configures WebSocket endpoints and handlers
 */

import { FastifyInstance } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { IncomingMessage } from 'http';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import { Services } from '../server.js';
import { Database } from '../types/database.js';
import { createAgentHandler } from './agent-handler.js';
import { createDashboardHandler } from './dashboard-handler.js';
import { ConnectionPool } from './connection-pool.js';
import { HeartbeatManager } from './heartbeat.js';
import { MessageRouter } from './message-router.js';
import { TerminalStreamManager } from './terminal-stream.js';
import { TokenManager } from './token-manager.js';
import { AgentHeartbeatMonitor, createAgentHeartbeatMonitor } from '../services/agent-heartbeat-monitor.js';

export interface WebSocketDependencies {
  connectionPool: ConnectionPool;
  heartbeatManager: HeartbeatManager;
  agentHeartbeatMonitor: AgentHeartbeatMonitor;
  messageRouter: MessageRouter;
  terminalStreamManager: TerminalStreamManager;
  tokenManager: TokenManager;
}

/**
 * Register WebSocket endpoints and initialize dependencies
 */
export async function setupWebSocketPlugin(
  server: FastifyInstance,
  services: Services,
  supabaseClient?: ReturnType<typeof createClient<Database>> | null
): Promise<void> {
  // Initialize WebSocket dependencies
  const dependencies = initializeWebSocketDependencies(server, services, supabaseClient);

  // Create persistent handler instances (CRITICAL: must persist to avoid GC destroying event handlers)
  const agentHandler = createAgentHandler(server, services, dependencies);
  const dashboardHandler = createDashboardHandler(server, services, dependencies);

  server.log.info('Created persistent WebSocket handler instances');

  // Register WebSocket routes
  await server.register(async function (server) {
    // Agent WebSocket endpoint
    server.get('/ws/agent', { websocket: true }, async (connection: SocketStream, request: IncomingMessage) => {
      await agentHandler.handleConnection(connection, request);
    });

    // Dashboard WebSocket endpoint
    server.get('/ws/dashboard', { websocket: true }, async (connection: SocketStream, request: IncomingMessage) => {
      await dashboardHandler.handleConnection(connection, request);
    });
  });

  // Setup cleanup on server close
  server.addHook('onClose', async () => {
    server.log.info('Cleaning up WebSocket dependencies');

    // Stop heartbeat manager
    dependencies.heartbeatManager.stop();

    // Stop agent heartbeat monitor
    dependencies.agentHeartbeatMonitor.stop();

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
  services: Services,
  supabaseClient?: ReturnType<typeof createClient<Database>> | null
): WebSocketDependencies {
  // Initialize connection pool
  const connectionPool = new ConnectionPool(server, {
    maxConnections: config.wsMaxConnections,
    maxPayload: config.wsMaxPayload,
    connectionTimeout: 90000, // 90 seconds (3x PING interval for safety margin)
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

  // Initialize terminal stream manager with database persistence
  const terminalStreamManager = new TerminalStreamManager(
    server,
    messageRouter,
    {
      bufferSize: 8192,
      flushIntervalMs: 10, // 10ms for <200ms latency requirement
      maxBufferedLines: 1000
    },
    supabaseClient || undefined // Pass supabase client for database persistence
  );

  // Initialize heartbeat manager
  const heartbeatManager = new HeartbeatManager(server, connectionPool, {
    pingIntervalMs: 30000,   // 30 seconds
    pongTimeoutMs: 10000,    // 10 seconds
    maxMissedPings: 3
  });

  // Initialize agent heartbeat monitor (application-level heartbeat tracking)
  const agentHeartbeatMonitor = createAgentHeartbeatMonitor(server, services.agentService, {
    checkIntervalMs: 30000,      // Check every 30 seconds
    heartbeatTimeoutMs: 90000,   // 90 seconds timeout (3x agent heartbeat interval)
    enableLogging: false         // Disable debug logging by default
  });

  // Start background services
  heartbeatManager.start();
  agentHeartbeatMonitor.start();
  tokenManager.start();
  terminalStreamManager.start();

  return {
    connectionPool,
    heartbeatManager,
    agentHeartbeatMonitor,
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
  // Parse query from the incoming upgrade request URL
  let query: Record<string, string | string[] | undefined> | undefined;
  try {
    const reqUrl = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    query = Object.fromEntries(reqUrl.searchParams.entries());
  } catch {
    query = undefined;
  }

  return {
    remoteAddress: request.socket.remoteAddress,
    userAgent: request.headers['user-agent'],
    origin: request.headers.origin,
    forwardedFor: request.headers['x-forwarded-for'],
    headers: request.headers as Record<string, string>,
    query,
    connectionTime: Date.now()
  } as any;
}
