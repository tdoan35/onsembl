/**
 * Command Interrupt Handler
 * Handles command interruption requests from dashboards
 */

import type { WebSocket } from 'ws'
import type { FastifyBaseLogger } from 'fastify'
import type { CommandQueueAdapter } from '../../services/command-queue-adapter.js'
import {
  CommandInterruptMessage,
  createMessage,
  createErrorMessage
} from '@onsembl/agent-protocol/websocket-messages'

export async function handleCommandInterrupt(
  socket: WebSocket,
  message: CommandInterruptMessage,
  connectionId: string,
  commandQueueAdapter: CommandQueueAdapter,
  logger: FastifyBaseLogger
): Promise<void> {
  const { commandId, agentId } = message.payload

  logger.info({
    msg: 'Command interrupt request',
    connectionId,
    commandId,
    agentId
  })

  try {
    // Interrupt the command
    const success = await commandQueueAdapter.interruptCommand(commandId)

    if (success) {
      // Send success acknowledgment
      const ackMessage = createMessage('command:interrupted', {
        commandId,
        agentId,
        timestamp: Date.now()
      })

      socket.send(JSON.stringify(ackMessage))

      logger.info({
        msg: 'Command interrupted successfully',
        commandId,
        agentId
      })
    } else {
      // Command not found or already completed
      const errorMessage = createErrorMessage(
        'COMMAND_NOT_FOUND',
        'Command not found or already completed',
        false
      )
      socket.send(JSON.stringify(errorMessage))

      logger.warn({
        msg: 'Command interrupt failed - not found',
        commandId
      })
    }
  } catch (error) {
    logger.error({
      msg: 'Failed to interrupt command',
      connectionId,
      commandId,
      error: error instanceof Error ? error.message : String(error)
    })

    // Send error to dashboard
    const errorMessage = createErrorMessage(
      'INTERRUPT_FAILED',
      error instanceof Error ? error.message : 'Failed to interrupt command',
      false
    )
    socket.send(JSON.stringify(errorMessage))
  }
}