/**
 * Agent Store WebSocket Integration
 * Connects agent store to WebSocket events
 */

import { useAgentStore } from './agent-store'
import { webSocketService } from '../services/websocket.service'
import { MessageType } from '@onsembl/agent-protocol'

// Setup WebSocket event listeners for agent store
export function setupAgentWebSocketIntegration(): void {
  // Handle agent status updates
  webSocketService.on(MessageType.AGENT_STATUS, (payload: any) => {
    const { agentId, status, timestamp, metrics } = payload

    // Map WebSocket status to store status
    let agentStatus: 'online' | 'offline' | 'error' | 'connecting'
    switch (status) {
      case 'ONLINE':
      case 'IDLE':
        agentStatus = 'online'
        break
      case 'OFFLINE':
      case 'DISCONNECTED':
        agentStatus = 'offline'
        break
      case 'ERROR':
      case 'CRASHED':
        agentStatus = 'error'
        break
      case 'CONNECTING':
        agentStatus = 'connecting'
        break
      default:
        agentStatus = 'offline'
    }

    // Update agent in store
    const store = useAgentStore.getState()
    const existingAgent = store.getAgentById(agentId)

    if (existingAgent) {
      store.updateAgent(agentId, {
        status: agentStatus,
        lastPing: new Date(timestamp).toISOString()
      })

      if (metrics) {
        store.updateAgentMetrics(agentId, {
          commandsExecuted: metrics.commandsExecuted || 0,
          uptime: metrics.uptime || 0,
          memoryUsage: metrics.memoryUsage || 0,
          cpuUsage: metrics.cpuUsage || 0
        })
      }
    } else {
      // New agent connected
      store.addAgent({
        id: agentId,
        name: payload.name || `Agent ${agentId.substring(0, 8)}`,
        type: payload.type || 'claude',
        status: agentStatus,
        version: payload.version || 'unknown',
        capabilities: payload.capabilities || [],
        lastPing: new Date(timestamp).toISOString(),
        metrics: metrics || undefined
      })
    }
  })

  // Handle agent connection
  webSocketService.on('AGENT_CONNECT' as any, (payload: any) => {
    const { agentId, agentType, version, capabilities } = payload
    const store = useAgentStore.getState()

    store.addAgent({
      id: agentId,
      name: payload.name || `Agent ${agentId.substring(0, 8)}`,
      type: agentType?.toLowerCase() || 'claude',
      status: 'online',
      version: version || 'unknown',
      capabilities: capabilities || [],
      lastPing: new Date().toISOString()
    })
  })

  // Handle agent disconnection
  webSocketService.on('AGENT_DISCONNECT' as any, (payload: any) => {
    const { agentId } = payload
    const store = useAgentStore.getState()
    store.updateAgentStatus(agentId, 'offline')
  })

  // Handle agent error
  webSocketService.on(MessageType.AGENT_ERROR, (payload: any) => {
    const { agentId, message, recoverable } = payload
    const store = useAgentStore.getState()

    store.updateAgent(agentId, {
      status: recoverable ? 'error' : 'offline',
      error: message
    })
  })

  // Handle agent heartbeat
  webSocketService.on(MessageType.AGENT_HEARTBEAT, (payload: any) => {
    const { agentId, healthMetrics } = payload
    const store = useAgentStore.getState()

    store.updateAgent(agentId, {
      lastPing: new Date().toISOString()
    })

    if (healthMetrics) {
      store.updateAgentMetrics(agentId, {
        commandsExecuted: healthMetrics.commandsExecuted || 0,
        uptime: healthMetrics.uptime || 0,
        memoryUsage: healthMetrics.memoryUsage || 0,
        cpuUsage: healthMetrics.cpuUsage || 0
      })
    }
  })

  // Handle initial agent list on dashboard connect
  webSocketService.on('dashboard:connected' as any, (payload: any) => {
    const { agents } = payload
    const store = useAgentStore.getState()

    // Clear and repopulate agents
    store.clearAgents()

    if (agents && Array.isArray(agents)) {
      agents.forEach((agent: any) => {
        store.addAgent({
          id: agent.agentId,
          name: agent.name || `Agent ${agent.agentId.substring(0, 8)}`,
          type: agent.type?.toLowerCase() || 'claude',
          status: agent.status === 'connected' ? 'online' : 'offline',
          version: agent.version || 'unknown',
          capabilities: agent.capabilities || [],
          lastPing: new Date(agent.lastHeartbeat || Date.now()).toISOString()
        })
      })
    }
  })
}

// Export initialization function
export function initializeAgentWebSocket(): void {
  setupAgentWebSocketIntegration()
}

// Cleanup function
export function cleanupAgentWebSocket(): void {
  // Remove listeners if needed
  // WebSocket service handles this internally
}