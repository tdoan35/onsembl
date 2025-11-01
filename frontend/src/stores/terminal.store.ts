/**
 * Terminal Store
 * Manages terminal output and WebSocket streaming
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { TerminalBufferManager, TerminalLine } from '../services/terminal-buffer'
import { webSocketService } from '../services/websocket.service'
import { MessageType } from '@onsembl/agent-protocol'

interface TerminalSession {
  commandId: string
  agentId: string
  command: string
  startTime: number
  endTime?: number
  exitCode?: number
  isActive: boolean
}

interface TerminalState {
  // Sessions
  sessions: Map<string, TerminalSession>
  activeSessionId: string | null

  // Output management
  bufferManager: TerminalBufferManager

  // UI state
  isScrollLocked: boolean
  searchQuery: string
  searchResults: TerminalLine[]

  // Actions
  createSession: (commandId: string, agentId: string, command: string) => void
  endSession: (commandId: string, exitCode: number) => void
  setActiveSession: (sessionId: string | null) => void
  addOutput: (commandId: string, content: string, type: 'stdout' | 'stderr', ansiCodes?: string[], isCommand?: boolean) => void
  clearSession: (commandId: string) => void
  clearAllSessions: () => void

  // Terminal operations
  getSessionOutput: (commandId: string) => TerminalLine[]
  getActiveSessionOutput: () => TerminalLine[]
  exportSession: (commandId: string) => string
  searchOutput: (query: string, caseSensitive?: boolean) => void
  clearSearch: () => void

  // UI actions
  setScrollLocked: (locked: boolean) => void
  scrollToBottom: () => void
}

const bufferManager = new TerminalBufferManager({
  maxLines: 10000,
  maxBufferSize: 1024 * 1024, // 1MB
  flushInterval: 50,
  onFlush: (lines) => {
    // Handle flushed lines if needed
    console.debug(`Flushed ${lines.length} terminal lines`)
  }
})

export const useTerminalStore = create<TerminalState>()(
  devtools(
    (set, get) => ({
      sessions: new Map(),
      activeSessionId: null,
      bufferManager,
      isScrollLocked: false,
      searchQuery: '',
      searchResults: [],

      createSession: (commandId: string, agentId: string, command: string) => {
        const session: TerminalSession = {
          commandId,
          agentId,
          command,
          startTime: Date.now(),
          isActive: true
        }

        set(state => {
          const sessions = new Map(state.sessions)
          sessions.set(commandId, session)
          return {
            sessions,
            activeSessionId: commandId // Auto-switch to new session
          }
        })
      },

      endSession: (commandId: string, exitCode: number) => {
        set(state => {
          const sessions = new Map(state.sessions)
          const session = sessions.get(commandId)
          if (session) {
            sessions.set(commandId, {
              ...session,
              endTime: Date.now(),
              exitCode,
              isActive: false
            })
          }
          return { sessions }
        })
      },

      setActiveSession: (sessionId: string | null) => {
        set({ activeSessionId: sessionId, searchQuery: '', searchResults: [] })
      },

      addOutput: (commandId: string, content: string, type: 'stdout' | 'stderr', ansiCodes?: string[], isCommand?: boolean) => {
        bufferManager.addOutput(commandId, content, type, ansiCodes, isCommand)

        // If this is the active session and scroll is not locked, trigger scroll
        const state = get()
        if (state.activeSessionId === commandId && !state.isScrollLocked) {
          state.scrollToBottom()
        }
      },

      clearSession: (commandId: string) => {
        bufferManager.clearBuffer(commandId)
        set(state => {
          const sessions = new Map(state.sessions)
          sessions.delete(commandId)
          return {
            sessions,
            activeSessionId: state.activeSessionId === commandId ? null : state.activeSessionId
          }
        })
      },

      clearAllSessions: () => {
        bufferManager.clearAll()
        set({
          sessions: new Map(),
          activeSessionId: null,
          searchQuery: '',
          searchResults: []
        })
      },

      getSessionOutput: (commandId: string): TerminalLine[] => {
        const buffer = bufferManager.getBuffer(commandId)
        return buffer.getLines()
      },

      getActiveSessionOutput: (): TerminalLine[] => {
        const { activeSessionId } = get()
        if (!activeSessionId) return []
        return get().getSessionOutput(activeSessionId)
      },

      exportSession: (commandId: string): string => {
        const buffer = bufferManager.getBuffer(commandId)
        return buffer.toAnsiText()
      },

      searchOutput: (query: string, caseSensitive = false) => {
        const { activeSessionId } = get()
        if (!activeSessionId || !query) {
          set({ searchQuery: '', searchResults: [] })
          return
        }

        const buffer = bufferManager.getBuffer(activeSessionId)
        const results = buffer.search(query, caseSensitive)
        set({ searchQuery: query, searchResults: results })
      },

      clearSearch: () => {
        set({ searchQuery: '', searchResults: [] })
      },

      setScrollLocked: (locked: boolean) => {
        set({ isScrollLocked: locked })
      },

      scrollToBottom: () => {
        // This will be handled by the terminal component
        window.dispatchEvent(new CustomEvent('terminal:scrollToBottom'))
      }
    }),
    {
      name: 'terminal-store'
    }
  )
)

// Setup WebSocket event listeners
webSocketService.on(MessageType.TERMINAL_OUTPUT, (payload: any) => {
  const { commandId, agentId, content, streamType, ansiCodes } = payload
  const store = useTerminalStore.getState()

  // For agent terminal output, route to the monitoring session
  // The agent sends its ID, and we route it to agent-session-{agentId}
  const sessionId = commandId || `agent-session-${agentId}`

  console.log('[TerminalStore] TERMINAL_OUTPUT received:', {
    commandId,
    agentId,
    sessionId,
    contentLength: content?.length,
    streamType,
    activeSessionId: store.activeSessionId,
    sessions: Array.from(store.sessions.keys())
  })

  // Create session if it doesn't exist
  const sessions = store.sessions
  if (!sessions.has(sessionId)) {
    // For agent monitoring sessions, use a descriptive name
    const sessionName = sessionId.startsWith('agent-session-')
      ? `Monitoring ${agentId}`
      : 'Unknown command'
    store.createSession(sessionId, agentId, sessionName)
  }

  // Add output to buffer
  store.addOutput(
    sessionId,
    content,
    streamType === 'STDERR' ? 'stderr' : 'stdout',
    ansiCodes
  )
})

webSocketService.on(MessageType.TERMINAL_STREAM, (payload: any) => {
  const { commandId, agentId, content, streamType, ansiCodes } = payload
  const store = useTerminalStore.getState()

  // For agent terminal output, route to the monitoring session
  // The agent sends its ID, and we route it to agent-session-{agentId}
  const sessionId = commandId || `agent-session-${agentId}`

  console.log('[TerminalStore] TERMINAL_STREAM received:', {
    commandId,
    agentId,
    sessionId,
    contentLength: Array.isArray(content) ? content.length : content?.length,
    streamType,
    activeSessionId: store.activeSessionId,
    sessions: Array.from(store.sessions.keys())
  })

  // Create session if it doesn't exist
  const sessions = store.sessions
  if (!sessions.has(sessionId)) {
    // For agent monitoring sessions, use a descriptive name
    const sessionName = sessionId.startsWith('agent-session-')
      ? `Monitoring ${agentId}`
      : 'Unknown command'
    store.createSession(sessionId, agentId, sessionName)
  }

  // Handle batched output
  if (Array.isArray(content)) {
    content.forEach((line: string) => {
      store.addOutput(
        sessionId,
        line,
        streamType === 'STDERR' ? 'stderr' : 'stdout',
        ansiCodes
      )
    })
  } else {
    store.addOutput(
      sessionId,
      content,
      streamType === 'STDERR' ? 'stderr' : 'stdout',
      ansiCodes
    )
  }

  // Log buffer state after adding
  const buffer = bufferManager.getBuffer(sessionId)
  console.log('[TerminalStore] Buffer state after add:', {
    commandId,
    bufferLineCount: buffer.getLines().length
  })
})

webSocketService.on(MessageType.COMMAND_COMPLETE, (payload: any) => {
  const { commandId, status, exitCode } = payload
  const store = useTerminalStore.getState()

  store.endSession(commandId, exitCode || (status === 'COMPLETED' ? 0 : 1))
})

webSocketService.on('terminal:batch' as any, (payload: any) => {
  const { messages, key } = payload
  const store = useTerminalStore.getState()

  // Process batched terminal output
  messages.forEach((msg: any) => {
    store.addOutput(
      key,
      msg.output,
      msg.streamType === 'stderr' ? 'stderr' : 'stdout',
      msg.ansiCodes
    )
  })
})

// Export actions for external use
export const terminalActions = {
  createSession: (commandId: string, agentId: string, command: string) =>
    useTerminalStore.getState().createSession(commandId, agentId, command),
  addOutput: (commandId: string, content: string, type: 'stdout' | 'stderr', ansiCodes?: string[]) =>
    useTerminalStore.getState().addOutput(commandId, content, type, ansiCodes),
  setActiveSession: (sessionId: string | null) =>
    useTerminalStore.getState().setActiveSession(sessionId),
  exportSession: (commandId: string) =>
    useTerminalStore.getState().exportSession(commandId)
}