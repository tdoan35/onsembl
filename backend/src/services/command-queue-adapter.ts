/**
 * Command Queue Adapter
 * Integrates WebSocket with the command queue system
 */

import { EventEmitter } from 'events'
import type { ConnectionManager } from './connection-manager.js'
import type { MessageBroadcaster } from './broadcaster.js'
import {
  WebSocketMessage,
  CommandRequestMessage,
  createMessage,
  createErrorMessage
} from '@onsembl/agent-protocol/websocket-messages'

export interface CommandRequest {
  id: string
  agentId: string
  command: string
  args?: string[]
  env?: Record<string, string>
  workingDirectory?: string
  priority: 'high' | 'normal' | 'low'
  userId: string
  dashboardConnectionId: string
}

export interface CommandResult {
  id: string
  exitCode: number
  stdout?: string
  stderr?: string
  duration: number
  error?: string
}

export class CommandQueueAdapter extends EventEmitter {
  private activeCommands: Map<string, CommandRequest>
  private commandTimeouts: Map<string, NodeJS.Timeout>
  private readonly commandTimeout = 300000 // 5 minutes default

  constructor(
    private connectionManager: ConnectionManager,
    private broadcaster: MessageBroadcaster
  ) {
    super()
    this.activeCommands = new Map()
    this.commandTimeouts = new Map()
    this.setupEventListeners()
  }

  /**
   * Queue a command request
   */
  async queueCommand(
    message: CommandRequestMessage,
    dashboardConnectionId: string
  ): Promise<string> {
    const { agentId, command, args, env, workingDirectory, priority } = message.payload
    const commandId = this.generateCommandId()

    // Get dashboard connection to retrieve userId
    const dashboardConnection = this.connectionManager.getConnection(dashboardConnectionId)
    if (!dashboardConnection) {
      throw new Error('Dashboard connection not found')
    }

    // Check if agent is online
    if (!this.connectionManager.isAgentOnline(agentId)) {
      const errorMessage = createErrorMessage(
        'AGENT_OFFLINE',
        `Agent ${agentId} is not connected`,
        false
      )
      this.connectionManager.sendToConnection(dashboardConnectionId, errorMessage)
      throw new Error('Agent is offline')
    }

    const commandRequest: CommandRequest = {
      id: commandId,
      agentId,
      command,
      args,
      env,
      workingDirectory,
      priority: priority || 'normal',
      userId: dashboardConnection.userId!,
      dashboardConnectionId
    }

    // Store active command
    this.activeCommands.set(commandId, commandRequest)

    // Send command to agent
    const agentConnection = this.connectionManager.getAgentConnection(agentId)
    if (agentConnection) {
      const commandMessage = createMessage('command:execute', {
        commandId,
        command,
        args,
        env,
        workingDirectory,
        priority,
        timestamp: Date.now()
      })

      const sent = this.connectionManager.sendToConnection(
        agentConnection.id,
        commandMessage
      )

      if (sent) {
        // Set command timeout
        this.setCommandTimeout(commandId)

        // Notify dashboard of queued status
        this.broadcaster.broadcastCommandStatus(
          commandId,
          agentId,
          'queued',
          { priority }
        )

        this.emit('command:queued', commandRequest)
        return commandId
      }
    }

    // Failed to send to agent
    this.activeCommands.delete(commandId)
    throw new Error('Failed to send command to agent')
  }

  /**
   * Handle command start
   */
  handleCommandStart(commandId: string, agentId: string): void {
    const command = this.activeCommands.get(commandId)
    if (!command) return

    // Clear timeout and set a new one for execution
    this.clearCommandTimeout(commandId)
    this.setCommandTimeout(commandId, this.commandTimeout)

    // Broadcast status update
    this.broadcaster.broadcastCommandStatus(
      commandId,
      agentId,
      'running'
    )

    this.emit('command:started', { commandId, agentId })
  }

  /**
   * Handle command completion
   */
  handleCommandComplete(
    commandId: string,
    agentId: string,
    result: CommandResult
  ): void {
    const command = this.activeCommands.get(commandId)
    if (!command) return

    // Clear timeout
    this.clearCommandTimeout(commandId)

    // Broadcast completion status
    const status = result.exitCode === 0 ? 'completed' : 'failed'
    this.broadcaster.broadcastCommandStatus(
      commandId,
      agentId,
      status,
      {
        exitCode: result.exitCode,
        duration: result.duration,
        error: result.error
      }
    )

    // Clean up
    this.activeCommands.delete(commandId)

    this.emit('command:completed', {
      commandId,
      agentId,
      result
    })
  }

  /**
   * Interrupt a command
   */
  async interruptCommand(commandId: string): Promise<boolean> {
    const command = this.activeCommands.get(commandId)
    if (!command) {
      return false
    }

    // Send interrupt signal to agent
    const agentConnection = this.connectionManager.getAgentConnection(command.agentId)
    if (!agentConnection) {
      return false
    }

    const interruptMessage = createMessage('command:interrupt', {
      commandId,
      timestamp: Date.now()
    })

    const sent = this.connectionManager.sendToConnection(
      agentConnection.id,
      interruptMessage
    )

    if (sent) {
      // Clear timeout
      this.clearCommandTimeout(commandId)

      // Update status
      this.broadcaster.broadcastCommandStatus(
        commandId,
        command.agentId,
        'interrupted'
      )

      // Clean up
      this.activeCommands.delete(commandId)

      this.emit('command:interrupted', {
        commandId,
        agentId: command.agentId
      })

      return true
    }

    return false
  }

  /**
   * Get active commands for an agent
   */
  getAgentCommands(agentId: string): CommandRequest[] {
    return Array.from(this.activeCommands.values())
      .filter(cmd => cmd.agentId === agentId)
  }

  /**
   * Get all active commands
   */
  getAllActiveCommands(): CommandRequest[] {
    return Array.from(this.activeCommands.values())
  }

  /**
   * Handle agent disconnection
   */
  handleAgentDisconnect(agentId: string): void {
    // Find all commands for this agent
    const agentCommands = this.getAgentCommands(agentId)

    // Mark all commands as failed
    for (const command of agentCommands) {
      this.handleCommandComplete(command.id, agentId, {
        id: command.id,
        exitCode: -1,
        error: 'Agent disconnected',
        duration: 0
      })
    }
  }

  /**
   * Set command timeout
   */
  private setCommandTimeout(commandId: string, timeout: number = 60000): void {
    const timer = setTimeout(() => {
      const command = this.activeCommands.get(commandId)
      if (command) {
        this.handleCommandComplete(commandId, command.agentId, {
          id: commandId,
          exitCode: -1,
          error: 'Command timed out',
          duration: timeout
        })
      }
    }, timeout)

    this.commandTimeouts.set(commandId, timer)
  }

  /**
   * Clear command timeout
   */
  private clearCommandTimeout(commandId: string): void {
    const timer = this.commandTimeouts.get(commandId)
    if (timer) {
      clearTimeout(timer)
      this.commandTimeouts.delete(commandId)
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for agent disconnections from connection manager
    this.connectionManager.on('agent:disconnected', ({ agentId }) => {
      this.handleAgentDisconnect(agentId)
    })

    // Listen for dashboard disconnections
    this.connectionManager.on('dashboard:disconnected', ({ connectionId }) => {
      // Optionally handle dashboard disconnection
      // For now, commands continue even if dashboard disconnects
    })
  }

  /**
   * Generate unique command ID
   */
  private generateCommandId(): string {
    return `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Clear all timeouts
    for (const timer of this.commandTimeouts.values()) {
      clearTimeout(timer)
    }
    this.commandTimeouts.clear()

    // Mark all active commands as failed
    for (const command of this.activeCommands.values()) {
      this.handleCommandComplete(command.id, command.agentId, {
        id: command.id,
        exitCode: -1,
        error: 'Service shutting down',
        duration: 0
      })
    }

    this.activeCommands.clear()
    this.removeAllListeners()
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    activeCommands: number
    commandsByAgent: Map<string, number>
    commandsByPriority: { high: number; normal: number; low: number }
  } {
    const commandsByAgent = new Map<string, number>()
    const commandsByPriority = { high: 0, normal: 0, low: 0 }

    for (const command of this.activeCommands.values()) {
      // Count by agent
      const current = commandsByAgent.get(command.agentId) || 0
      commandsByAgent.set(command.agentId, current + 1)

      // Count by priority
      commandsByPriority[command.priority]++
    }

    return {
      activeCommands: this.activeCommands.size,
      commandsByAgent,
      commandsByPriority
    }
  }
}