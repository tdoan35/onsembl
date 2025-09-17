/**
 * Command Request Handler
 * Handles command execution requests from dashboards
 */

import type { WebSocket } from 'ws'
import type { FastifyBaseLogger } from 'fastify'
import type { CommandQueueAdapter } from '../../services/command-queue-adapter.js'
import {
  CommandRequestMessage,
  createMessage,
  createErrorMessage
} from '@onsembl/agent-protocol/websocket-messages'

export async function handleCommandRequest(
  socket: WebSocket,
  message: CommandRequestMessage,
  connectionId: string,
  commandQueueAdapter: CommandQueueAdapter,
  logger: FastifyBaseLogger
): Promise<void> {
  const { agentId, command } = message.payload

  logger.info({
    msg: 'Command request received',
    connectionId,
    agentId,
    command: command.substring(0, 100) // Log truncated command
  })

  try {
    // Queue the command
    const commandId = await commandQueueAdapter.queueCommand(
      message,
      connectionId
    )

    // Send acknowledgment
    const ackMessage = createMessage('command:queued', {
      commandId,
      agentId,
      timestamp: Date.now()
    })

    socket.send(JSON.stringify(ackMessage))

    logger.info({
      msg: 'Command queued successfully',
      commandId,
      agentId
    })
  } catch (error) {
    logger.error({
      msg: 'Failed to queue command',
      connectionId,
      agentId,
      error: error instanceof Error ? error.message : String(error)
    })

    // Send error to dashboard
    const errorMessage = createErrorMessage(
      'COMMAND_QUEUE_FAILED',
      error instanceof Error ? error.message : 'Failed to queue command',
      false
    )
    socket.send(JSON.stringify(errorMessage))
  }
}