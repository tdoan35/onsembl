/**
 * WebSocket Store Bridge
 * Connects WebSocket service to Zustand stores for real-time updates
 */

import { webSocketService } from './websocket.service';
import { useAgentStore } from '@/stores/agent-store';
import { useCommandStore } from '@/stores/command-store';
import { useTerminalStore } from '@/stores/terminal-store';
import { useUIStore } from '@/stores/ui-store';
import {
  MessageType,
  AgentStatusPayload,
  CommandStatusPayload,
  CommandProgressPayload,
  TerminalOutputPayload,
  ErrorPayload,
  AgentMetricsPayload,
  CommandRequestPayload,
  CommandCancelPayload,
  EmergencyStopPayload,
  CommandResultPayload,
  CommandQueueUpdatePayload
} from '@onsembl/agent-protocol';

// Use globalThis to persist across HMR reloads
declare global {
  var __WEBSOCKET_BRIDGE_LISTENERS_SETUP__: boolean | undefined;
  var __WEBSOCKET_BRIDGE_MESSAGE_HANDLERS_SETUP__: boolean | undefined;
}

export class WebSocketStoreBridge {
  private initialized = false;
  private subscriptions: Set<() => void> = new Set();

  /**
   * Initialize the WebSocket store bridge
   */
  initialize(): void {
    if (this.initialized) return;

    // Only setup message handlers ONCE, ever (survives HMR)
    if (!globalThis.__WEBSOCKET_BRIDGE_MESSAGE_HANDLERS_SETUP__) {
      console.log('[WebSocketStoreBridge] Setting up message handlers (first time)');
      this.setupMessageHandlers();
      globalThis.__WEBSOCKET_BRIDGE_MESSAGE_HANDLERS_SETUP__ = true;
    }

    // Only setup connection handlers ONCE, ever (survives HMR)
    if (!globalThis.__WEBSOCKET_BRIDGE_LISTENERS_SETUP__) {
      console.log('[WebSocketStoreBridge] Setting up connection handlers (first time)');
      this.setupConnectionHandlers();
      globalThis.__WEBSOCKET_BRIDGE_LISTENERS_SETUP__ = true;
    }

    this.initialized = true;
  }

  /**
   * Map backend agent status values to frontend values
   */
  private mapAgentStatus(backendStatus: string): 'online' | 'offline' | 'error' | 'connecting' {
    switch (backendStatus) {
      case 'connected':
        return 'online';
      case 'disconnected':
        return 'offline';
      case 'busy':
        return 'online'; // busy agents are still online
      case 'error':
        return 'error';
      case 'connecting':
        return 'connecting';
      default:
        console.warn(`[WebSocketStoreBridge] Unknown agent status: ${backendStatus}, defaulting to offline`);
        return 'offline';
    }
  }

  /**
   * Setup message handlers for WebSocket events
   */
  private setupMessageHandlers(): void {
    // Agent status updates
    webSocketService.on(MessageType.AGENT_STATUS, (payload: AgentStatusPayload) => {
      const agentStore = useAgentStore.getState();

      // Map backend status to frontend status
      const mappedStatus = this.mapAgentStatus(payload.status);

      console.log('[WebSocketStoreBridge] 📡 AGENT_STATUS received:', {
        agentId: payload.agentId,
        backendStatus: payload.status,
        mappedStatus,
        error: payload.error
      });

      // Update agent in store
      agentStore.updateAgent(payload.agentId, {
        status: mappedStatus,
        lastPing: new Date().toISOString(),
        error: payload.error
      });

      // Handle agent connection/disconnection
      if (mappedStatus === 'offline' || mappedStatus === 'error') {
        // Clear any running commands for this agent
        const commandStore = useCommandStore.getState();
        commandStore.getCommandsByAgent(payload.agentId).forEach(cmd => {
          if (cmd.status === 'running' || cmd.status === 'pending') {
            commandStore.updateCommand(cmd.id, {
              status: 'failed',
              error: `Agent ${payload.status}`,
              completedAt: new Date().toISOString()
            });
          }
        });
      }
    });

    // Agent metrics updates
    webSocketService.on(MessageType.AGENT_METRICS, (payload: AgentMetricsPayload) => {
      const agentStore = useAgentStore.getState();
      agentStore.updateAgentMetrics(payload.agentId, {
        commandsExecuted: payload.commandsExecuted,
        uptime: payload.uptime,
        memoryUsage: payload.memoryUsage,
        cpuUsage: payload.cpuUsage
      });
    });

    // Command status updates
    webSocketService.on(MessageType.COMMAND_STATUS, (payload: CommandStatusPayload) => {
      const commandStore = useCommandStore.getState();
      const updates: any = {
        status: payload.status
      };

      if (payload.status === 'running') {
        updates.startedAt = new Date().toISOString();
      } else if (payload.status === 'completed' || payload.status === 'failed' || payload.status === 'cancelled') {
        updates.completedAt = new Date().toISOString();
        if (payload.error) {
          updates.error = payload.error;
        }
      }

      commandStore.updateCommand(payload.commandId, updates);
    });

    // Command progress updates
    webSocketService.on(MessageType.COMMAND_PROGRESS, (payload: CommandProgressPayload) => {
      const commandStore = useCommandStore.getState();
      const command = commandStore.getCommandById(payload.commandId);

      if (command) {
        const updates: any = {};

        if (payload.progress !== undefined) {
          // Calculate estimated duration based on progress
          if (command.startedAt && payload.progress > 0 && payload.progress < 100) {
            const elapsed = Date.now() - new Date(command.startedAt).getTime();
            updates.estimatedDuration = Math.round(elapsed / (payload.progress / 100));
          }
        }

        if (payload.message) {
          updates.output = (command.output || '') + payload.message + '\n';
        }

        commandStore.updateCommand(payload.commandId, updates);
      }
    });

    // Command result updates
    webSocketService.on(MessageType.COMMAND_RESULT, (payload: CommandResultPayload) => {
      const commandStore = useCommandStore.getState();

      commandStore.updateCommand(payload.commandId, {
        status: 'completed',
        output: payload.output,
        exitCode: payload.exitCode,
        completedAt: new Date().toISOString(),
        actualDuration: payload.duration
      });

      // Add to history
      const command = commandStore.getCommandById(payload.commandId);
      if (command) {
        commandStore.addToHistory({
          command: command.content,
          agentId: command.agentId,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Command queue updates
    webSocketService.on(MessageType.COMMAND_QUEUE_UPDATE, (payload: CommandQueueUpdatePayload) => {
      const commandStore = useCommandStore.getState();

      // Update queue positions for pending commands
      payload.queue.forEach((item, index) => {
        const command = commandStore.getCommandById(item.commandId);
        if (command && command.status === 'pending') {
          commandStore.updateCommand(item.commandId, {
            priority: item.priority as any,
            estimatedDuration: item.estimatedStartTime
              ? item.estimatedStartTime - Date.now()
              : undefined
          });
        }
      });
    });

    // Terminal output updates
    webSocketService.on(MessageType.TERMINAL_OUTPUT, (payload: TerminalOutputPayload) => {
      const terminalStore = useTerminalStore.getState();

      // Add output to terminal
      terminalStore.addOutput({
        id: Date.now().toString(),
        commandId: payload.commandId,
        agentId: payload.agentId,
        content: payload.content,
        type: payload.type || 'stdout',
        timestamp: payload.timestamp || Date.now()
      });

      // Also append to command output
      if (payload.commandId) {
        const commandStore = useCommandStore.getState();
        const command = commandStore.getCommandById(payload.commandId);
        if (command) {
          commandStore.updateCommand(payload.commandId, {
            output: (command.output || '') + payload.content
          });
        }
      }
    });

    // Error handling
    webSocketService.on(MessageType.ERROR, (payload: ErrorPayload) => {
      const uiStore = useUIStore.getState();

      // Show error notification
      uiStore.addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'WebSocket Error',
        message: payload.message,
        timestamp: Date.now()
      });

      // Update relevant stores based on error context
      if (payload.context?.commandId) {
        const commandStore = useCommandStore.getState();
        commandStore.updateCommand(payload.context.commandId, {
          status: 'failed',
          error: payload.message,
          completedAt: new Date().toISOString()
        });
      }

      if (payload.context?.agentId) {
        const agentStore = useAgentStore.getState();
        agentStore.updateAgent(payload.context.agentId, {
          status: 'error',
          error: payload.message
        });
      }
    });
  }

  /**
   * Setup connection state handlers
   */
  private setupConnectionHandlers(): void {
    // Dashboard connection state
    webSocketService.onConnectionState('dashboard', (state, error) => {
      const uiStore = useUIStore.getState();

      // Update connection state in UI
      uiStore.setWebSocketState(state);

      if (state === 'connected') {
        // Subscribe to all updates
        webSocketService.initializeDashboard({
          agents: { all: true },
          commands: { all: true },
          terminal: { all: true },
          traces: { all: true }
        });

        uiStore.addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Connected',
          message: 'WebSocket connection established',
          timestamp: Date.now()
        });
      } else if (state === 'error' || state === 'disconnected') {
        uiStore.addNotification({
          id: Date.now().toString(),
          type: state === 'error' ? 'error' : 'warning',
          title: state === 'error' ? 'Connection Error' : 'Disconnected',
          message: error?.message || 'WebSocket connection lost',
          timestamp: Date.now()
        });
      }
    });

    // Handle reconnection events
    webSocketService.addEventListener('reconnecting', () => {
      const uiStore = useUIStore.getState();
      uiStore.setWebSocketState('connecting');
      uiStore.addNotification({
        id: Date.now().toString(),
        type: 'info',
        title: 'Reconnecting',
        message: 'Attempting to reconnect to server...',
        timestamp: Date.now()
      });
    });

    webSocketService.addEventListener('reconnected', () => {
      const uiStore = useUIStore.getState();
      uiStore.addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Reconnected',
        message: 'Connection restored',
        timestamp: Date.now()
      });
    });

    webSocketService.addEventListener('reconnect_failed', () => {
      const uiStore = useUIStore.getState();
      uiStore.addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Connection Failed',
        message: 'Unable to reconnect. Please check your network connection.',
        timestamp: Date.now()
      });
    });
  }

  /**
   * Send command request via WebSocket
   */
  sendCommand(agentId: string, commandId: string, content: string, priority?: string): void {
    const payload: CommandRequestPayload = {
      commandId,
      agentId,
      content,
      priority: priority as any || 'normal',
      timestamp: Date.now()
    };

    webSocketService.send('dashboard', MessageType.COMMAND_REQUEST, payload);

    // Optimistic update
    const commandStore = useCommandStore.getState();
    commandStore.addCommand({
      id: commandId,
      agentId,
      content,
      status: 'pending',
      priority: (priority as any) || 'normal',
      createdAt: new Date().toISOString()
    });
  }

  /**
   * Cancel command via WebSocket
   */
  cancelCommand(commandId: string, agentId: string): void {
    const payload: CommandCancelPayload = {
      commandId,
      agentId
    };

    webSocketService.send('dashboard', MessageType.COMMAND_CANCEL, payload);

    // Optimistic update
    const commandStore = useCommandStore.getState();
    commandStore.updateCommand(commandId, {
      status: 'cancelled',
      completedAt: new Date().toISOString()
    });
  }

  /**
   * Send emergency stop to all agents
   */
  emergencyStop(): void {
    const payload: EmergencyStopPayload = {
      timestamp: Date.now()
    };

    webSocketService.send('dashboard', MessageType.EMERGENCY_STOP, payload);

    // Optimistic update - cancel all running commands
    const commandStore = useCommandStore.getState();
    commandStore.getRunningCommands().forEach(cmd => {
      commandStore.updateCommand(cmd.id, {
        status: 'cancelled',
        error: 'Emergency stop',
        completedAt: new Date().toISOString()
      });
    });
  }

  /**
   * Connect to WebSocket
   */
  async connect(accessToken: string, userId: string): Promise<void> {
    webSocketService.setAuth(accessToken, userId);
    await webSocketService.connect('dashboard');
  }

  /**
   * Disconnect from WebSocket
   */
  async disconnect(): Promise<void> {
    await webSocketService.disconnect('dashboard');
  }

  /**
   * Cleanup and destroy the bridge
   */
  destroy(): void {
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    this.subscriptions.clear();
    this.initialized = false;
  }
}

// Create singleton instance
export const webSocketStoreBridge = new WebSocketStoreBridge();