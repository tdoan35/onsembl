/**
 * WebSocket plugin for Fastify
 * Handles WebSocket connections for real-time communication
 */

import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import fastifyWebsocket from '@fastify/websocket'
import type { WebSocket } from 'ws'
import {
  WebSocketMessage,
  DashboardConnectMessage,
  createMessage,
  createErrorMessage,
  isDashboardConnect,
  isCommandRequest,
  isCommandInterrupt,
  isHeartbeat
} from '@onsembl/agent-protocol/websocket-messages'
import { ConnectionManager } from '../services/connection-manager.js'
import { MessageBroadcaster } from '../services/broadcaster.js'
import { dashboardConnectionHandler } from '../websocket/dashboard-handler.js'
import { agentConnectionHandler } from '../websocket/agent-handler.js'

declare module 'fastify' {
  interface FastifyInstance {
    connectionManager: ConnectionManager
    broadcaster: MessageBroadcaster
  }
}

interface WebSocketPluginOptions {
  connectionTimeout?: number
  heartbeatInterval?: number
  maxMessageSize?: number
  maxConnections?: number
}

const websocketPlugin: FastifyPluginAsync<WebSocketPluginOptions> = async (
  fastify,
  options
) => {
  const {
    connectionTimeout = 60000, // 60 seconds
    heartbeatInterval = 30000, // 30 seconds
    maxMessageSize = 1048576, // 1MB
    maxConnections = 100
  } = options

  // Register the fastify-websocket plugin
  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: maxMessageSize,
      perMessageDeflate: true
    }
  })

  // Initialize connection manager
  const connectionManager = new ConnectionManager({
    maxConnections,
    connectionTimeout,
    heartbeatInterval
  })

  // Initialize message broadcaster
  const broadcaster = new MessageBroadcaster(connectionManager)

  // Decorate fastify instance
  fastify.decorate('connectionManager', connectionManager)
  fastify.decorate('broadcaster', broadcaster)

  // Register WebSocket routes
  fastify.register(async function (fastify) {
    // Dashboard WebSocket endpoint
    fastify.get('/ws/dashboard', { websocket: true }, async (connection, req) => {
      const { socket } = connection
      const token = req.query.token as string

      // Validate token
      if (!token) {
        const errorMessage = createErrorMessage(
          'AUTH_FAILED',
          'Missing authentication token',
          false
        )
        socket.send(JSON.stringify(errorMessage))
        socket.close()
        return
      }

      try {
        // Verify JWT token manually since it comes from query param
        const decoded = fastify.jwt.verify(token)

        // Attach decoded token to request for handlers
        ;(req as any).user = decoded

        // Handle dashboard connection
        await dashboardConnectionHandler(
          socket,
          req,
          connectionManager,
          broadcaster,
          fastify.log
        )
      } catch (error) {
        fastify.log.error({ error }, 'WebSocket dashboard auth failed')
        const errorMessage = createErrorMessage(
          'AUTH_FAILED',
          'Invalid authentication token',
          false
        )
        socket.send(JSON.stringify(errorMessage))
        socket.close()
      }
    })

    // Agent WebSocket endpoint
    fastify.get('/ws/agent', { websocket: true }, async (connection, req) => {
      const { socket } = connection
      const token = req.query.token as string
      const agentId = req.query.agentId as string

      // Validate required parameters
      if (!token || !agentId) {
        const errorMessage = createErrorMessage(
          'INVALID_REQUEST',
          'Missing required parameters',
          false
        )
        socket.send(JSON.stringify(errorMessage))
        socket.close()
        return
      }

      try {
        // Verify agent token manually since it comes from query param
        const decoded = fastify.jwt.verify(token)

        // Attach decoded token to request for handlers
        ;(req as any).user = decoded

        // Handle agent connection
        await agentConnectionHandler(
          socket,
          req,
          connectionManager,
          broadcaster,
          fastify.log
        )
      } catch (error) {
        fastify.log.error({ error, agentId }, 'WebSocket agent auth failed')
        const errorMessage = createErrorMessage(
          'AUTH_FAILED',
          'Invalid agent token',
          false
        )
        socket.send(JSON.stringify(errorMessage))
        socket.close()
      }
    })
  })

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await connectionManager.closeAll()
  })

  // Log WebSocket plugin initialization
  fastify.log.info({
    msg: 'WebSocket plugin initialized',
    options: {
      connectionTimeout,
      heartbeatInterval,
      maxMessageSize,
      maxConnections
    }
  })
}

export default fp(websocketPlugin, {
  name: 'websocket',
  dependencies: ['jwt']
})