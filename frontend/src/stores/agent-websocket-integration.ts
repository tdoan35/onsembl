/**
 * Agent Store WebSocket Integration
 * Connects agent store to WebSocket events
 */

import { useAgentStore, AgentType } from './agent-store'
import { useTerminalStore } from './terminal.store'
import { webSocketService } from '../services/websocket.service'
import { mapAgentStatus } from '../utils/agent-status-mapper'
import { MessageType } from '@onsembl/agent-protocol'

// Setup WebSocket event listeners for agent store
export function setupAgentWebSocketIntegration(): void {
  // NOTE: AGENT_STATUS handling is now done exclusively in websocket-store-bridge.ts
  // to avoid duplicate event handlers and race conditions

  // Handle agent connection
  webSocketService.on(MessageType.AGENT_CONNECT, (payload: any) => {
    const { agentId, agentType, version, capabilities, timestamp } = payload
    const store = useAgentStore.getState()

    store.addAgent({
      id: agentId,
      name: payload.name || `Agent ${agentId.substring(0, 8)}`,
      type: agentType?.toLowerCase() || 'claude',
      status: 'online',
      version: version || 'unknown',
      capabilities: capabilities || [],
      // Use timestamp from backend if provided, otherwise null
      lastPing: timestamp ? new Date(timestamp).toISOString() : null
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
      // CRITICAL FIX: Use null instead of fabricating timestamp if backend doesn't provide one
      // This prevents false "fresh heartbeat" detections
      lastPing: timestamp ? new Date(timestamp).toISOString() : null,
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

  // NOTE: AGENT_HEARTBEAT handler removed - it fabricated timestamps with new Date()
  // which caused false "fresh heartbeat" detections and status flickering.
  // Agent heartbeats are now handled exclusively via AGENT_STATUS messages
  // in websocket-store-bridge.ts with actual backend timestamps.

  // Handle agent connected - create terminal session immediately
  webSocketService.on(MessageType.AGENT_CONNECTED, (payload: any) => {
    const { agentId, agentName } = payload
    const terminalStore = useTerminalStore.getState()

    // Create terminal session immediately
    const sessionId = `agent-session-${agentId}`

    // Only create if it doesn't exist
    if (!terminalStore.sessions.has(sessionId)) {
      terminalStore.createSession(
        sessionId,
        agentId,
        `Agent ${agentName || agentId} connected`
      )

      console.log('[AgentWebSocket] Created terminal session for agent:', {
        agentId,
        agentName,
        sessionId
      })
    } else {
      console.log('[AgentWebSocket] Terminal session already exists for agent:', {
        agentId,
        sessionId
      })
    }
  })

  // Handle initial agent list on dashboard connect
  webSocketService.on(MessageType.DASHBOARD_CONNECTED, (payload: any) => {
    const { agents } = payload
    const store = useAgentStore.getState()

    console.log('[AgentWebSocketIntegration] Dashboard connected, received agents:', agents)

    // Instead of clearing all agents, update existing ones and add new ones
    // This preserves terminal sessions and UI state during reconnection
    if (agents && Array.isArray(agents)) {
      agents.forEach((agent: any) => {
        // Map backend status values to frontend values using centralized mapper
        const status = mapAgentStatus(agent.status || 'offline')

        const agentData = {
          id: agent.agentId,
          name: agent.name || `Agent ${agent.agentId.substring(0, 8)}`,
          type: (agent.type?.toLowerCase() || 'claude') as AgentType,
          status,
          version: agent.version || 'unknown',
          capabilities: agent.capabilities || [],
          lastPing: agent.lastHeartbeat || null,  // Use null instead of fabricating timestamps
          metrics: agent.metrics // Backend now sends structured metrics
        }

        // Check if agent already exists in store
        const existingAgent = store.getAgentById(agent.agentId)

        if (existingAgent) {
          // Update existing agent, preserving terminal sessions
          store.updateAgent(agent.agentId, agentData)
        } else {
          // Add new agent
          store.addAgent(agentData)
        }
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