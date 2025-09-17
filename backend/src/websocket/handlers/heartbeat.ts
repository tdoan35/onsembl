/**
 * Heartbeat Handler
 * Handles heartbeat messages for connection health monitoring
 */

import type { WebSocket } from 'ws'
import type { FastifyBaseLogger } from 'fastify'
import type { ConnectionManager } from '../../services/connection-manager.js'
import {
  HeartbeatMessage,
  createMessage
} from '@onsembl/agent-protocol/websocket-messages'

export async function handleHeartbeat(
  socket: WebSocket,
  message: HeartbeatMessage,
  connectionId: string,
  connectionManager: ConnectionManager,
  logger: FastifyBaseLogger
): Promise<void> {
  const { timestamp, sequence } = message.payload

  logger.debug({
    msg: 'Heartbeat received',
    connectionId,
    sequence
  })

  try {
    // Update connection heartbeat
    connectionManager.updateHeartbeat(connectionId)

    // Send heartbeat acknowledgment
    const ackMessage = createMessage('heartbeat:ack', {
      timestamp: Date.now(),
      originalTimestamp: timestamp,
      sequence,
      latency: Date.now() - timestamp
    })

    socket.send(JSON.stringify(ackMessage))

    logger.debug({
      msg: 'Heartbeat acknowledged',
      connectionId,
      latency: Date.now() - timestamp
    })
  } catch (error) {
    logger.error({
      msg: 'Failed to handle heartbeat',
      connectionId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}