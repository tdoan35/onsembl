/**
 * Agent Store WebSocket Integration
 * Connects agent store to WebSocket events
 */

import { useAgentStore, AgentType } from './agent-store'
import { webSocketService } from '../services/websocket.service'
import { MessageType } from '@onsembl/agent-protocol'

// Setup WebSocket event listeners for agent store
export function setupAgentWebSocketIntegration(): void {
  // Handle agent status updates (enriched by backend)
  webSocketService.on(MessageType.AGENT_STATUS, (payload: any) => {
    const {
      agentId,
      status,
      timestamp,
      metrics,
      // Enriched fields from backend (Phase 2)
      name,
      type,
      version,
      capabilities
    } = payload

    // Map WebSocket status (uppercase) to store status (lowercase)
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

    const store = useAgentStore.getState()
    const existingAgent = store.getAgentById(agentId)

    if (existingAgent) {
      // Update existing agent with enriched data
      const updates: any = {
        status: agentStatus,
        lastPing: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString()
      }

      // Update enriched fields if provided by backend
      if (name) updates.name = name
      if (type) updates.type = type.toLowerCase() as AgentType
      if (version) updates.version = version
      if (capabilities) updates.capabilities = capabilities

      store.updateAgent(agentId, updates)

      // Update metrics if provided
      if (metrics) {
        store.updateAgentMetrics(agentId, {
          commandsExecuted: metrics.commandsExecuted || 0,
          uptime: metrics.uptime || 0,
          memoryUsage: metrics.memoryUsage || 0,
          cpuUsage: metrics.cpuUsage || 0
        })
      }
    } else {
      // New agent connected - use enriched data from backend
      const newAgent: any = {
        id: agentId,
        name: name || `Agent ${agentId.substring(0, 8)}`,
        type: (type?.toLowerCase() || 'claude') as AgentType,
        status: agentStatus,
        version: version || 'unknown',
        capabilities: capabilities || [],
        lastPing: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString()
      }

      // Only add metrics if they exist (optional property)
      if (metrics) {
        newAgent.metrics = {
          commandsExecuted: metrics.commandsExecuted || 0,
          uptime: metrics.uptime || 0,
          memoryUsage: metrics.memoryUsage || 0,
          cpuUsage: metrics.cpuUsage || 0
        }
      }

      store.addAgent(newAgent)
    }
  })

  // Handle agent connection
  webSocketService.on(MessageType.AGENT_CONNECT, (payload: any) => {
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
  webSocketService.on(MessageType.AGENT_DISCONNECT, (payload: any) => {
    const { agentId, reason, timestamp } = payload
    const store = useAgentStore.getState()

    console.log(`[Agent] Agent ${agentId} disconnected`, { reason, timestamp })

    // Update agent status to offline and clear error state
    store.updateAgent(agentId, {
      status: 'offline',
      lastPing: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
      error: undefined // Clear any error state on clean disconnect
    })
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

    console.log('Dashboard connected, received agents:', agents)

    // Clear existing agents
    store.clearAgents()

    if (agents && Array.isArray(agents)) {
      agents.forEach((agent: any) => {
        // Map backend status values to frontend values
        let status: 'online' | 'offline' | 'error' | 'connecting' = 'offline'

        const backendStatus = agent.status?.toLowerCase()
        if (backendStatus === 'connected' || backendStatus === 'busy' || backendStatus === 'online') {
          status = 'online'
        } else if (backendStatus === 'disconnected' || backendStatus === 'offline') {
          status = 'offline'
        } else if (backendStatus === 'error') {
          status = 'error'
        } else if (backendStatus === 'connecting') {
          status = 'connecting'
        } else {
          console.warn(`[AgentWebSocketIntegration] Unknown agent status: ${agent.status}, defaulting to offline`)
        }

        store.addAgent({
          id: agent.agentId,
          name: agent.name || `Agent ${agent.agentId.substring(0, 8)}`,
          type: (agent.type?.toLowerCase() || 'claude') as AgentType,
          status,
          version: agent.version || 'unknown',
          capabilities: agent.capabilities || [],
          lastPing: agent.lastHeartbeat || new Date().toISOString(),
          metrics: agent.metrics // Backend now sends structured metrics
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