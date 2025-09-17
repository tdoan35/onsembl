/**
 * Message Broadcaster Service
 * Handles broadcasting messages to multiple WebSocket connections
 */

import type { ConnectionManager, ManagedConnection } from './connection-manager.js'
import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket-messages'
import { EventEmitter } from 'events'

export interface BroadcastOptions {
  excludeConnectionIds?: string[]
  includeOffline?: boolean
  retryOnFailure?: boolean
}

export interface BroadcastResult {
  totalTargets: number
  successful: number
  failed: number
  failedConnectionIds: string[]
}

export class MessageBroadcaster extends EventEmitter {
  private messageQueue: Map<string, WebSocketMessage[]>
  private batchTimer: NodeJS.Timeout | null = null
  private readonly batchInterval = 50 // 50ms batching interval
  private readonly maxBatchSize = 100

  constructor(private connectionManager: ConnectionManager) {
    super()
    this.messageQueue = new Map()
    this.setupBatching()
  }

  /**
   * Broadcast message to all dashboard connections
   */
  broadcastToDashboards(
    message: WebSocketMessage,
    options: BroadcastOptions = {}
  ): BroadcastResult {
    const dashboards = this.connectionManager.getDashboardConnections()
    return this.broadcastToConnections(dashboards, message, options)
  }

  /**
   * Broadcast message to specific user's dashboards
   */
  broadcastToUser(
    userId: string,
    message: WebSocketMessage,
    options: BroadcastOptions = {}
  ): BroadcastResult {
    const userDashboards = this.connectionManager.getDashboardConnections(userId)
    return this.broadcastToConnections(userDashboards, message, options)
  }

  /**
   * Broadcast message to all agent connections
   */
  broadcastToAgents(
    message: WebSocketMessage,
    options: BroadcastOptions = {}
  ): BroadcastResult {
    const agents = this.connectionManager.getAllAgentConnections()
    return this.broadcastToConnections(agents, message, options)
  }

  /**
   * Broadcast message to specific agent
   */
  sendToAgent(
    agentId: string,
    message: WebSocketMessage
  ): boolean {
    const agentConnection = this.connectionManager.getAgentConnection(agentId)
    if (!agentConnection) {
      this.emit('send:failed', { agentId, reason: 'Agent not connected' })
      return false
    }

    return this.connectionManager.sendToConnection(
      agentConnection.id,
      message
    )
  }

  /**
   * Broadcast message to all connections
   */
  broadcastToAll(
    message: WebSocketMessage,
    options: BroadcastOptions = {}
  ): BroadcastResult {
    const allConnections = this.connectionManager.getAllConnections()
    return this.broadcastToConnections(allConnections, message, options)
  }

  /**
   * Broadcast terminal output with batching
   */
  broadcastTerminalOutput(
    agentId: string,
    commandId: string,
    output: string,
    streamType: 'stdout' | 'stderr'
  ): void {
    const message: WebSocketMessage = {
      version: '1.0.0',
      type: 'terminal:output',
      timestamp: Date.now(),
      payload: {
        agentId,
        commandId,
        output,
        streamType,
        timestamp: Date.now()
      }
    }

    // Add to batch queue
    this.addToBatch(commandId, message)
  }

  /**
   * Broadcast agent status update
   */
  broadcastAgentStatus(
    agentId: string,
    status: 'connected' | 'disconnected' | 'busy' | 'idle',
    metadata?: any
  ): BroadcastResult {
    const message: WebSocketMessage = {
      version: '1.0.0',
      type: 'agent:status',
      timestamp: Date.now(),
      payload: {
        agentId,
        status,
        timestamp: Date.now(),
        ...metadata
      }
    }

    return this.broadcastToDashboards(message)
  }

  /**
   * Broadcast command status update
   */
  broadcastCommandStatus(
    commandId: string,
    agentId: string,
    status: 'queued' | 'running' | 'completed' | 'failed' | 'interrupted',
    metadata?: any
  ): BroadcastResult {
    const message: WebSocketMessage = {
      version: '1.0.0',
      type: 'command:status',
      timestamp: Date.now(),
      payload: {
        commandId,
        agentId,
        status,
        timestamp: Date.now(),
        ...metadata
      }
    }

    return this.broadcastToDashboards(message)
  }

  /**
   * Broadcast error to dashboards
   */
  broadcastError(
    error: string,
    details?: any
  ): BroadcastResult {
    const message: WebSocketMessage = {
      version: '1.0.0',
      type: 'error',
      timestamp: Date.now(),
      payload: {
        error,
        details,
        timestamp: Date.now()
      }
    }

    return this.broadcastToDashboards(message)
  }

  /**
   * Internal: Broadcast to multiple connections
   */
  private broadcastToConnections(
    connections: ManagedConnection[],
    message: WebSocketMessage,
    options: BroadcastOptions = {}
  ): BroadcastResult {
    const { excludeConnectionIds = [] } = options

    // Filter connections
    const targetConnections = connections.filter(conn =>
      !excludeConnectionIds.includes(conn.id)
    )

    const result: BroadcastResult = {
      totalTargets: targetConnections.length,
      successful: 0,
      failed: 0,
      failedConnectionIds: []
    }

    // Send to each connection
    for (const connection of targetConnections) {
      const success = this.connectionManager.sendToConnection(
        connection.id,
        message
      )

      if (success) {
        result.successful++
      } else {
        result.failed++
        result.failedConnectionIds.push(connection.id)
      }
    }

    // Emit broadcast result
    this.emit('broadcast:complete', {
      type: message.type,
      result
    })

    // Log if there were failures
    if (result.failed > 0) {
      this.emit('broadcast:partial', {
        type: message.type,
        failedConnections: result.failedConnectionIds
      })
    }

    return result
  }

  /**
   * Add message to batch queue
   */
  private addToBatch(key: string, message: WebSocketMessage): void {
    if (!this.messageQueue.has(key)) {
      this.messageQueue.set(key, [])
    }

    const queue = this.messageQueue.get(key)!
    queue.push(message)

    // If batch is full, flush immediately
    if (queue.length >= this.maxBatchSize) {
      this.flushBatch(key)
    }
  }

  /**
   * Flush a specific batch
   */
  private flushBatch(key: string): void {
    const messages = this.messageQueue.get(key)
    if (!messages || messages.length === 0) return

    // Create batched message
    const batchedMessage: WebSocketMessage = {
      version: '1.0.0',
      type: 'terminal:batch',
      timestamp: Date.now(),
      payload: {
        messages: messages.map(m => m.payload),
        count: messages.length,
        key
      }
    }

    // Broadcast the batch
    this.broadcastToDashboards(batchedMessage)

    // Clear the queue
    this.messageQueue.delete(key)
  }

  /**
   * Flush all batches
   */
  private flushAllBatches(): void {
    for (const key of this.messageQueue.keys()) {
      this.flushBatch(key)
    }
  }

  /**
   * Setup batching timer
   */
  private setupBatching(): void {
    // Set up periodic batch flushing
    this.batchTimer = setInterval(() => {
      this.flushAllBatches()
    }, this.batchInterval)

    // Ensure timer doesn't prevent process from exiting
    this.batchTimer.unref()
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Stop batch timer
    if (this.batchTimer) {
      clearInterval(this.batchTimer)
      this.batchTimer = null
    }

    // Flush any remaining batches
    this.flushAllBatches()

    // Clear queue
    this.messageQueue.clear()

    // Remove all listeners
    this.removeAllListeners()
  }

  /**
   * Get broadcast statistics
   */
  getStats(): {
    queuedBatches: number
    totalQueuedMessages: number
  } {
    let totalMessages = 0
    for (const messages of this.messageQueue.values()) {
      totalMessages += messages.length
    }

    return {
      queuedBatches: this.messageQueue.size,
      totalQueuedMessages: totalMessages
    }
  }
}