/**
 * Connection Manager Service
 * Manages WebSocket connections for dashboards and agents
 */

import { WebSocket } from 'ws'
import { EventEmitter } from 'events'
import { nanoid } from 'nanoid'
import type {
  ConnectionInfo,
  ConnectionState,
  ConnectionMetadata
} from '@onsembl/agent-protocol/connection-types'

export interface ManagedConnection {
  id: string
  type: 'dashboard' | 'agent'
  socket: WebSocket
  connectionInfo: ConnectionInfo
  userId?: string
  agentId?: string
  lastHeartbeat: number
  authenticated: boolean
}

export interface ConnectionManagerOptions {
  maxConnections: number
  connectionTimeout: number
  heartbeatInterval: number
}

export class ConnectionManager extends EventEmitter {
  private connections: Map<string, ManagedConnection>
  private dashboardConnections: Map<string, Set<string>>
  private agentConnections: Map<string, string>
  private heartbeatTimers: Map<string, NodeJS.Timeout>
  private options: ConnectionManagerOptions

  constructor(options: ConnectionManagerOptions) {
    super()
    this.connections = new Map()
    this.dashboardConnections = new Map() // userId -> Set<connectionId>
    this.agentConnections = new Map() // agentId -> connectionId
    this.heartbeatTimers = new Map()
    this.options = options
  }

  /**
   * Add a new dashboard connection
   */
  addDashboardConnection(
    socket: WebSocket,
    userId: string,
    metadata?: ConnectionMetadata
  ): string {
    if (this.connections.size >= this.options.maxConnections) {
      throw new Error('Maximum connections reached')
    }

    const connectionId = `dash-${nanoid()}`
    const now = Date.now()

    const connection: ManagedConnection = {
      id: connectionId,
      type: 'dashboard',
      socket,
      connectionInfo: {
        id: connectionId,
        state: 'connected',
        connectedAt: now,
        lastActivity: now,
        reconnectAttempts: 0,
        metadata
      },
      userId,
      lastHeartbeat: now,
      authenticated: true
    }

    this.connections.set(connectionId, connection)

    // Track dashboard connections by user
    if (!this.dashboardConnections.has(userId)) {
      this.dashboardConnections.set(userId, new Set())
    }
    this.dashboardConnections.get(userId)!.add(connectionId)

    // Setup heartbeat monitoring
    this.startHeartbeatTimer(connectionId)

    // Setup socket event handlers
    this.setupSocketHandlers(socket, connectionId)

    this.emit('dashboard:connected', { connectionId, userId })

    return connectionId
  }

  /**
   * Add a new agent connection
   */
  addAgentConnection(
    socket: WebSocket,
    agentId: string,
    metadata?: ConnectionMetadata
  ): string {
    if (this.connections.size >= this.options.maxConnections) {
      throw new Error('Maximum connections reached')
    }

    // Check if agent is already connected
    if (this.agentConnections.has(agentId)) {
      const existingId = this.agentConnections.get(agentId)!
      this.removeConnection(existingId)
    }

    const connectionId = `agent-${nanoid()}`
    const now = Date.now()

    const connection: ManagedConnection = {
      id: connectionId,
      type: 'agent',
      socket,
      connectionInfo: {
        id: connectionId,
        state: 'connected',
        connectedAt: now,
        lastActivity: now,
        reconnectAttempts: 0,
        metadata
      },
      agentId,
      lastHeartbeat: now,
      authenticated: true
    }

    this.connections.set(connectionId, connection)
    this.agentConnections.set(agentId, connectionId)

    // Setup heartbeat monitoring
    this.startHeartbeatTimer(connectionId)

    // Setup socket event handlers
    this.setupSocketHandlers(socket, connectionId)

    this.emit('agent:connected', { connectionId, agentId })

    return connectionId
  }

  /**
   * Remove a connection
   */
  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId)
    if (!connection) return

    // Clear heartbeat timer
    this.stopHeartbeatTimer(connectionId)

    // Remove from tracking maps
    if (connection.type === 'dashboard' && connection.userId) {
      const userConnections = this.dashboardConnections.get(connection.userId)
      if (userConnections) {
        userConnections.delete(connectionId)
        if (userConnections.size === 0) {
          this.dashboardConnections.delete(connection.userId)
        }
      }
      this.emit('dashboard:disconnected', {
        connectionId,
        userId: connection.userId
      })
    } else if (connection.type === 'agent' && connection.agentId) {
      this.agentConnections.delete(connection.agentId)
      this.emit('agent:disconnected', {
        connectionId,
        agentId: connection.agentId
      })
    }

    // Close socket if still open
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.close()
    }

    this.connections.delete(connectionId)
  }

  /**
   * Get a connection by ID
   */
  getConnection(connectionId: string): ManagedConnection | undefined {
    return this.connections.get(connectionId)
  }

  /**
   * Get all dashboard connections for a user
   */
  getDashboardConnections(userId?: string): ManagedConnection[] {
    if (userId) {
      const connectionIds = this.dashboardConnections.get(userId)
      if (!connectionIds) return []
      return Array.from(connectionIds)
        .map(id => this.connections.get(id))
        .filter(Boolean) as ManagedConnection[]
    }

    // Return all dashboard connections
    return Array.from(this.connections.values())
      .filter(conn => conn.type === 'dashboard')
  }

  /**
   * Get agent connection by agent ID
   */
  getAgentConnection(agentId: string): ManagedConnection | undefined {
    const connectionId = this.agentConnections.get(agentId)
    if (!connectionId) return undefined
    return this.connections.get(connectionId)
  }

  /**
   * Get all agent connections
   */
  getAllAgentConnections(): ManagedConnection[] {
    return Array.from(this.connections.values())
      .filter(conn => conn.type === 'agent')
  }

  /**
   * Get all connections
   */
  getAllConnections(): ManagedConnection[] {
    return Array.from(this.connections.values())
  }

  /**
   * Update heartbeat timestamp
   */
  updateHeartbeat(connectionId: string): void {
    const connection = this.connections.get(connectionId)
    if (connection) {
      connection.lastHeartbeat = Date.now()
      connection.connectionInfo.lastActivity = Date.now()

      // Reset heartbeat timer
      this.stopHeartbeatTimer(connectionId)
      this.startHeartbeatTimer(connectionId)
    }
  }

  /**
   * Check if agent is online
   */
  isAgentOnline(agentId: string): boolean {
    const connection = this.getAgentConnection(agentId)
    return connection !== undefined &&
           connection.socket.readyState === WebSocket.OPEN
  }

  /**
   * Get online agents
   */
  getOnlineAgents(): Array<{ agentId: string; connectionId: string }> {
    return Array.from(this.agentConnections.entries())
      .filter(([agentId]) => this.isAgentOnline(agentId))
      .map(([agentId, connectionId]) => ({ agentId, connectionId }))
  }

  /**
   * Send message to a specific connection
   */
  sendToConnection(connectionId: string, message: any): boolean {
    const connection = this.connections.get(connectionId)
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) {
      return false
    }

    try {
      const data = typeof message === 'string' ? message : JSON.stringify(message)
      connection.socket.send(data)
      return true
    } catch (error) {
      this.emit('send:error', { connectionId, error })
      return false
    }
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    // Clear all heartbeat timers
    this.heartbeatTimers.forEach(timer => clearTimeout(timer))
    this.heartbeatTimers.clear()

    // Close all connections
    const closePromises = Array.from(this.connections.values()).map(connection => {
      return new Promise<void>((resolve) => {
        if (connection.socket.readyState === WebSocket.OPEN) {
          connection.socket.on('close', () => resolve())
          connection.socket.close()
        } else {
          resolve()
        }
      })
    })

    await Promise.all(closePromises)

    this.connections.clear()
    this.dashboardConnections.clear()
    this.agentConnections.clear()
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketHandlers(socket: WebSocket, connectionId: string): void {
    socket.on('close', () => {
      this.removeConnection(connectionId)
    })

    socket.on('error', (error) => {
      this.emit('connection:error', { connectionId, error })
      this.removeConnection(connectionId)
    })

    socket.on('pong', () => {
      this.updateHeartbeat(connectionId)
    })
  }

  /**
   * Start heartbeat timer for a connection
   */
  private startHeartbeatTimer(connectionId: string): void {
    const timer = setTimeout(() => {
      const connection = this.connections.get(connectionId)
      if (!connection) return

      const now = Date.now()
      const timeSinceLastHeartbeat = now - connection.lastHeartbeat

      if (timeSinceLastHeartbeat > this.options.connectionTimeout) {
        // Connection timed out
        this.emit('connection:timeout', { connectionId })
        this.removeConnection(connectionId)
      } else {
        // Send ping
        if (connection.socket.readyState === WebSocket.OPEN) {
          connection.socket.ping()
        }
        // Restart timer
        this.startHeartbeatTimer(connectionId)
      }
    }, this.options.heartbeatInterval)

    this.heartbeatTimers.set(connectionId, timer)
  }

  /**
   * Stop heartbeat timer for a connection
   */
  private stopHeartbeatTimer(connectionId: string): void {
    const timer = this.heartbeatTimers.get(connectionId)
    if (timer) {
      clearTimeout(timer)
      this.heartbeatTimers.delete(connectionId)
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number
    dashboardConnections: number
    agentConnections: number
    onlineAgents: number
  } {
    return {
      totalConnections: this.connections.size,
      dashboardConnections: Array.from(this.connections.values())
        .filter(c => c.type === 'dashboard').length,
      agentConnections: Array.from(this.connections.values())
        .filter(c => c.type === 'agent').length,
      onlineAgents: this.getOnlineAgents().length
    }
  }
}