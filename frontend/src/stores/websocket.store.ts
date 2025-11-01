/**
 * WebSocket Store
 * Manages WebSocket connection state and messaging
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { webSocketService, WebSocketConnectionState } from '../services/websocket.service'
import { ConnectionState, ConnectionInfo, MessageType } from '@onsembl/agent-protocol'

interface WebSocketState {
  // Connection states
  dashboardState: WebSocketConnectionState
  agentState: WebSocketConnectionState
  connectionInfo: ConnectionInfo | null

  // Connection metrics
  latency: number
  messagesReceived: number
  messagesSent: number
  lastMessageTime: number | null

  // Error state
  lastError: Error | null

  // Actions
  connect: () => Promise<void>
  disconnect: () => void
  sendCommand: (
    agentId: string,
    command: string,
    args?: string[],
    env?: Record<string, string>,
    workingDirectory?: string,
    priority?: 'high' | 'normal' | 'low'
  ) => Promise<void>
  interruptCommand: (commandId: string, agentId: string) => Promise<void>
  subscribeToAgent: (agentId: string) => void
  unsubscribeFromAgent: (agentId: string) => void
  subscribeToCommand: (commandId: string) => void
  unsubscribeFromCommand: (commandId: string) => void
  clearError: () => void
  reset: () => void
}

const initialState = {
  dashboardState: 'disconnected' as WebSocketConnectionState,
  agentState: 'disconnected' as WebSocketConnectionState,
  connectionInfo: null,
  latency: 0,
  messagesReceived: 0,
  messagesSent: 0,
  lastMessageTime: null,
  lastError: null
}

export const useWebSocketStore = create<WebSocketState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      connect: async () => {
        try {
          set({ lastError: null })

          // Connect to dashboard endpoint
          await webSocketService.connect('dashboard')

          // Initialize dashboard with subscriptions
          webSocketService.initializeDashboard({
            agents: { all: true },
            commands: { all: true },
            terminals: { all: true }
          })
        } catch (error) {
          set({ lastError: error as Error })
          throw error
        }
      },

      disconnect: () => {
        webSocketService.disconnectAll()
        set(initialState)
      },

      sendCommand: async (
        agentId: string,
        command: string,
        args?: string[],
        env?: Record<string, string>,
        workingDirectory?: string,
        priority?: 'high' | 'normal' | 'low'
      ) => {
        try {
          // Generate unique command ID
          const commandId = `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

          // Map priority to number (0=high, 5=normal, 10=low)
          const priorityNum = priority === 'high' ? 0 : priority === 'low' ? 10 : 5

          // Send command request through WebSocket
          webSocketService.send('dashboard', MessageType.COMMAND_REQUEST, {
            commandId,
            content: command,
            type: 'NATURAL',
            priority: priorityNum,
            executionConstraints: {
              timeLimitMs: 300000, // 5 minutes
              tokenBudget: undefined,
              maxRetries: 1
            },
            context: {
              parameters: {
                agentId,
                args,
                env,
                workingDirectory
              }
            }
          })

          set(state => ({
            messagesSent: state.messagesSent + 1,
            lastMessageTime: Date.now()
          }))

          return commandId
        } catch (error) {
          set({ lastError: error as Error })
          throw error
        }
      },

      interruptCommand: async (commandId: string, agentId: string) => {
        try {
          webSocketService.send('dashboard', MessageType.COMMAND_CANCEL, {
            commandId,
            agentId
          })

          set(state => ({
            messagesSent: state.messagesSent + 1,
            lastMessageTime: Date.now()
          }))
        } catch (error) {
          set({ lastError: error as Error })
          throw error
        }
      },

      subscribeToAgent: (agentId: string) => {
        webSocketService.subscribe('agent', agentId)
        set(state => ({
          messagesSent: state.messagesSent + 1,
          lastMessageTime: Date.now()
        }))
      },

      unsubscribeFromAgent: (agentId: string) => {
        webSocketService.unsubscribe('agent', agentId)
        set(state => ({
          messagesSent: state.messagesSent + 1,
          lastMessageTime: Date.now()
        }))
      },

      subscribeToCommand: (commandId: string) => {
        webSocketService.subscribe('command', commandId)
        set(state => ({
          messagesSent: state.messagesSent + 1,
          lastMessageTime: Date.now()
        }))
      },

      unsubscribeFromCommand: (commandId: string) => {
        webSocketService.unsubscribe('command', commandId)
        set(state => ({
          messagesSent: state.messagesSent + 1,
          lastMessageTime: Date.now()
        }))
      },

      clearError: () => {
        set({ lastError: null })
      },

      reset: () => {
        set(initialState)
      }
    }),
    {
      name: 'websocket-store'
    }
  )
)

// Setup WebSocket event listeners
webSocketService.onConnectionState('dashboard', (state, error) => {
  useWebSocketStore.setState({
    dashboardState: state,
    lastError: error || null
  })
})

webSocketService.onConnectionState('agent', (state, error) => {
  useWebSocketStore.setState({
    agentState: state,
    lastError: error || null
  })
})

// Track message metrics
webSocketService.addEventListener('message', () => {
  useWebSocketStore.setState(state => ({
    messagesReceived: state.messagesReceived + 1,
    lastMessageTime: Date.now()
  }))
})

// Handle connection info updates
webSocketService.on('DASHBOARD_INIT' as any, (payload: any) => {
  useWebSocketStore.setState({
    connectionInfo: {
      id: payload.connectionId,
      state: 'connected',
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      reconnectAttempts: 0
    }
  })
})

// Handle pong messages for latency tracking
webSocketService.on('PONG' as any, (payload: any) => {
  if (payload.latency) {
    useWebSocketStore.setState({ latency: payload.latency })
  }
})

// Export actions for external use
export const webSocketActions = {
  connect: () => useWebSocketStore.getState().connect(),
  disconnect: () => useWebSocketStore.getState().disconnect(),
  sendCommand: (
    agentId: string,
    command: string,
    args?: string[],
    env?: Record<string, string>,
    workingDirectory?: string,
    priority?: 'high' | 'normal' | 'low'
  ) => useWebSocketStore.getState().sendCommand(agentId, command, args, env, workingDirectory, priority),
  interruptCommand: (commandId: string, agentId: string) =>
    useWebSocketStore.getState().interruptCommand(commandId, agentId)
}