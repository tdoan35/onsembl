/**
 * Error Handler
 * Handles error messages and error recovery
 */

import type { WebSocket } from 'ws'
import type { FastifyBaseLogger } from 'fastify'
import {
  ErrorMessage,
  createMessage
} from '@onsembl/agent-protocol/websocket-messages'

export async function handleError(
  socket: WebSocket,
  message: ErrorMessage,
  connectionId: string,
  logger: FastifyBaseLogger
): Promise<void> {
  const { code, error, details, recoverable } = message.payload

  logger.error({
    msg: 'Error message received',
    connectionId,
    code,
    error,
    details,
    recoverable
  })

  try {
    // Send acknowledgment
    const ackMessage = createMessage('error:ack', {
      timestamp: Date.now(),
      code,
      received: true
    })

    socket.send(JSON.stringify(ackMessage))

    // If error is not recoverable, consider closing connection
    if (!recoverable) {
      logger.warn({
        msg: 'Non-recoverable error, connection will be closed',
        connectionId,
        code
      })

      // Send close notification before closing
      const closeMessage = createMessage('connection:closing', {
        reason: 'Non-recoverable error',
        code,
        timestamp: Date.now()
      })

      socket.send(JSON.stringify(closeMessage))

      // Close connection after a short delay
      setTimeout(() => {
        socket.close(1011, `Error: ${code}`)
      }, 1000)
    }
  } catch (error) {
    logger.error({
      msg: 'Failed to handle error message',
      connectionId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}