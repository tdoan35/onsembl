'use client';

import { useEffect, useRef } from 'react';
import { webSocketStoreBridge } from '@/services/websocket-store-bridge';
import { useUIStore } from '@/stores/ui-store';

export interface WebSocketProviderProps {
  children: React.ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const initialized = useRef(false);
  const { setWebSocketState } = useUIStore();

  useEffect(() => {
    if (initialized.current) return;

    // Initialize the WebSocket store bridge
    webSocketStoreBridge.initialize();

    // Simulate authentication for now (replace with actual auth)
    const mockAuth = {
      accessToken: 'mock-token',
      userId: 'user-123'
    };

    // Connect to WebSocket
    const connectWebSocket = async () => {
      try {
        setWebSocketState('connecting');
        await webSocketStoreBridge.connect(mockAuth.accessToken, mockAuth.userId);
      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        setWebSocketState('error');
      }
    };

    connectWebSocket();
    initialized.current = true;

    // Cleanup on unmount
    return () => {
      webSocketStoreBridge.disconnect();
      webSocketStoreBridge.destroy();
    };
  }, [setWebSocketState]);

  return <>{children}</>;
}