'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useWebSocketStore } from '@/stores/websocket.store';
import { useAgentStore } from '@/stores/agent.store';
import { useTerminalStore } from '@/stores/terminal.store';
import { useCommandStore } from '@/stores/command.store';
import { WebSocketService } from '@/services/websocket.service';
import { MessageHandlerRegistry } from '@/services/message-handlers';
import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';

export interface UseWebSocketOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { autoConnect = true, onConnect, onDisconnect, onError } = options;
  const serviceRef = useRef<WebSocketService | null>(null);
  const registryRef = useRef<MessageHandlerRegistry | null>(null);

  const {
    isConnected,
    connectionState,
    error,
    connect,
    disconnect,
    sendMessage,
    setConnectionState,
    setError,
    clearError
  } = useWebSocketStore();

  const { updateAgent, removeAgent } = useAgentStore();
  const { addOutput, clearTerminal } = useTerminalStore();
  const { updateCommandStatus, addCommand } = useCommandStore();

  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (registryRef.current) {
      registryRef.current.handleMessage(message);
    }
  }, []);

  const handleConnectionStateChange = useCallback((state: 'connected' | 'disconnected' | 'connecting' | 'error') => {
    setConnectionState(state);

    if (state === 'connected' && onConnect) {
      onConnect();
    } else if (state === 'disconnected' && onDisconnect) {
      onDisconnect();
    }
  }, [setConnectionState, onConnect, onDisconnect]);

  const handleError = useCallback((err: Error) => {
    setError(err.message);
    if (onError) {
      onError(err);
    }
  }, [setError, onError]);

  const initializeWebSocket = useCallback(async () => {
    if (serviceRef.current) {
      return;
    }

    try {
      clearError();
      setConnectionState('connecting');

      // Get auth token (in production, this would come from your auth system)
      const token = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'dev-token';
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

      // Create message handler registry
      registryRef.current = new MessageHandlerRegistry({
        onAgentStatus: (agent) => updateAgent(agent.agentId, agent),
        onAgentDisconnected: (agentId) => removeAgent(agentId),
        onCommandStatus: (update) => updateCommandStatus(update.commandId, update.status),
        onTerminalOutput: (output) => addOutput(output.agentId, output),
        onCommandQueued: (command) => addCommand(command),
        onError: (error) => setError(error.message)
      });

      // Create WebSocket service
      serviceRef.current = new WebSocketService(wsUrl, {
        token,
        onMessage: handleMessage,
        onConnect: () => handleConnectionStateChange('connected'),
        onDisconnect: () => handleConnectionStateChange('disconnected'),
        onError: handleError,
        reconnectOptions: {
          maxRetries: 5,
          initialDelay: 1000,
          maxDelay: 30000,
          factor: 2
        }
      });

      // Connect
      await serviceRef.current.connect();

    } catch (err) {
      handleError(err instanceof Error ? err : new Error('Failed to initialize WebSocket'));
    }
  }, [
    clearError,
    setConnectionState,
    updateAgent,
    removeAgent,
    updateCommandStatus,
    addOutput,
    addCommand,
    setError,
    handleMessage,
    handleConnectionStateChange,
    handleError
  ]);

  const cleanupWebSocket = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.disconnect();
      serviceRef.current = null;
    }
    if (registryRef.current) {
      registryRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (autoConnect) {
      initializeWebSocket();
    }

    return () => {
      cleanupWebSocket();
    };
  }, [autoConnect]); // Only run on mount/unmount

  const connectWebSocket = useCallback(async () => {
    if (!serviceRef.current) {
      await initializeWebSocket();
    } else if (!serviceRef.current.isConnected()) {
      await serviceRef.current.connect();
    }
  }, [initializeWebSocket]);

  const disconnectWebSocket = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.disconnect();
    }
  }, []);

  const send = useCallback((message: WebSocketMessage) => {
    if (serviceRef.current && serviceRef.current.isConnected()) {
      serviceRef.current.send(message);
    } else {
      // WebSocket not connected, message will be queued
    }
  }, []);

  const requestCommand = useCallback((agentId: string, command: string, args?: string[]) => {
    send({
      type: 'command:request',
      agentId,
      command,
      args
    });
  }, [send]);

  const interruptCommand = useCallback((commandId: string) => {
    send({
      type: 'command:interrupt',
      commandId
    });
  }, [send]);

  return {
    // Connection state
    isConnected,
    connectionState,
    error,

    // Connection controls
    connect: connectWebSocket,
    disconnect: disconnectWebSocket,

    // Message sending
    send,
    sendMessage,
    requestCommand,
    interruptCommand,

    // Service reference (for advanced usage)
    service: serviceRef.current
  };
}

export default useWebSocket;