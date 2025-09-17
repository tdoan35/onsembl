/**
 * Command Store WebSocket Integration
 * Connects command store to WebSocket events
 */

import { useCommandStore } from './command-store'
import { webSocketService } from '../services/websocket.service'
import { MessageType } from '@onsembl/agent-protocol'
import { terminalActions } from './terminal.store'

// Setup WebSocket event listeners for command store
export function setupCommandWebSocketIntegration(): void {
  // Handle command status updates
  webSocketService.on(MessageType.COMMAND_STATUS, (payload: any) => {
    const { commandId, agentId, status, queuePosition, timestamp } = payload
    const store = useCommandStore.getState()

    // Map WebSocket status to store status
    let commandStatus: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    switch (status) {
      case 'PENDING':
      case 'QUEUED':
        commandStatus = 'pending'
        break
      case 'EXECUTING':
      case 'RUNNING':
        commandStatus = 'running'
        break
      case 'COMPLETED':
        commandStatus = 'completed'
        break
      case 'FAILED':
      case 'ERROR':
        commandStatus = 'failed'
        break
      case 'CANCELLED':
      case 'INTERRUPTED':
        commandStatus = 'cancelled'
        break
      default:
        commandStatus = 'pending'
    }

    // Update command in store
    store.updateCommand(commandId, {
      status: commandStatus,
      ...(status === 'EXECUTING' && { startedAt: new Date(timestamp).toISOString() })
    })

    // Update executing state
    if (status === 'EXECUTING') {
      store.setExecuting(true)
    } else if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
      store.setExecuting(false)
    }
  })

  // Handle command acknowledgment
  webSocketService.on(MessageType.COMMAND_ACK, (payload: any) => {
    const { commandId, agentId, status, queuePosition } = payload
    const store = useCommandStore.getState()

    store.updateCommand(commandId, {
      status: status === 'QUEUED' ? 'pending' : 'running'
    })
  })

  // Handle command completion
  webSocketService.on(MessageType.COMMAND_COMPLETE, (payload: any) => {
    const {
      commandId,
      agentId,
      status,
      exitCode,
      executionTime,
      error,
      tokensUsed,
      outputStats
    } = payload

    const store = useCommandStore.getState()

    // Determine final status
    let finalStatus: 'completed' | 'failed' | 'cancelled'
    if (status === 'SUCCESS' || exitCode === 0) {
      finalStatus = 'completed'
    } else if (status === 'CANCELLED') {
      finalStatus = 'cancelled'
    } else {
      finalStatus = 'failed'
    }

    // Update command
    store.updateCommand(commandId, {
      status: finalStatus,
      completedAt: new Date().toISOString(),
      exitCode,
      actualDuration: executionTime,
      error
    })

    // End terminal session
    terminalActions.createSession(commandId, agentId, 'Command completed')

    // Add to history
    const command = store.getCommandById(commandId)
    if (command) {
      store.addToHistory({
        command: command.content,
        agentId: command.agentId,
        timestamp: new Date().toISOString()
      })
    }

    store.setExecuting(false)
  })

  // Handle command queued
  webSocketService.on('command:queued' as any, (payload: any) => {
    const { commandId, agentId } = payload
    const store = useCommandStore.getState()

    // Find command and update its status
    const command = store.getCommandById(commandId)
    if (command) {
      store.updateCommand(commandId, {
        status: 'pending'
      })
    }
  })

  // Handle command started
  webSocketService.on('command:started' as any, (payload: any) => {
    const { commandId, agentId } = payload
    const store = useCommandStore.getState()

    store.updateCommand(commandId, {
      status: 'running',
      startedAt: new Date().toISOString()
    })

    store.setExecuting(true)

    // Create terminal session for this command
    const command = store.getCommandById(commandId)
    if (command) {
      terminalActions.createSession(commandId, agentId, command.content)
    }
  })

  // Handle command interrupted
  webSocketService.on('command:interrupted' as any, (payload: any) => {
    const { commandId, agentId } = payload
    const store = useCommandStore.getState()

    store.updateCommand(commandId, {
      status: 'cancelled',
      completedAt: new Date().toISOString()
    })

    store.setExecuting(false)
  })

  // Handle queue updates
  webSocketService.on(MessageType.QUEUE_UPDATE, (payload: any) => {
    const { queue, stats } = payload
    const store = useCommandStore.getState()

    // Update pending commands with their queue positions
    if (queue && Array.isArray(queue)) {
      queue.forEach((item: any, index: number) => {
        store.updateCommand(item.commandId, {
          status: 'pending'
          // Could add queuePosition as a new field if needed
        })
      })
    }
  })

  // Handle errors
  webSocketService.on(MessageType.ERROR, (payload: any) => {
    const { code, message, details } = payload
    const store = useCommandStore.getState()

    // Set error in store
    store.setError(message)

    // If error relates to a specific command, update it
    if (details?.commandId) {
      store.updateCommand(details.commandId, {
        status: 'failed',
        error: message
      })
    }
  })
}

// Export initialization function
export function initializeCommandWebSocket(): void {
  setupCommandWebSocketIntegration()
}

// Cleanup function
export function cleanupCommandWebSocket(): void {
  // Remove listeners if needed
  // WebSocket service handles this internally
}