/**
 * Dashboard Connect Handler
 * Handles dashboard connection initialization
 */

import type { WebSocket } from 'ws'
import type { FastifyBaseLogger } from 'fastify'
import type { ConnectionManager } from '../../services/connection-manager.js'
import type { MessageBroadcaster } from '../../services/broadcaster.js'
import {
  DashboardConnectMessage,
  createMessage
} from '@onsembl/agent-protocol/websocket-messages'

export async function handleDashboardConnect(
  socket: WebSocket,
  message: DashboardConnectMessage,
  connectionId: string,
  connectionManager: ConnectionManager,
  broadcaster: MessageBroadcaster,
  logger: FastifyBaseLogger
): Promise<void> {
  const { userId, dashboardId, preferences } = message.payload

  logger.info({
    msg: 'Dashboard connect request',
    connectionId,
    userId,
    dashboardId
  })

  try {
    // Get online agents
    const onlineAgents = connectionManager.getOnlineAgents()

    // Send connection acknowledgment with agent list
    const ackMessage = createMessage('dashboard:connected', {
      connectionId,
      timestamp: Date.now(),
      agents: onlineAgents.map(({ agentId }) => ({
        agentId,
        status: 'connected',
        lastHeartbeat: Date.now()
      }))
    })

    socket.send(JSON.stringify(ackMessage))

    // Notify other dashboards about new dashboard connection (optional)
    broadcaster.broadcastToDashboards(
      createMessage('dashboard:joined', {
        dashboardId,
        userId,
        timestamp: Date.now()
      }),
      { excludeConnectionIds: [connectionId] }
    )

    logger.info({
      msg: 'Dashboard connected successfully',
      connectionId,
      userId,
      onlineAgents: onlineAgents.length
    })
  } catch (error) {
    logger.error({
      msg: 'Failed to handle dashboard connect',
      connectionId,
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}