'use client';

import { useEffect, useRef, useState } from 'react';
import { webSocketStoreBridge } from '@/services/websocket-store-bridge';
import { useUIStore } from '@/stores/ui-store';

export interface WebSocketProviderProps {
  children: React.ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const initialized = useRef(false);
  const { setWebSocketState } = useUIStore();
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (initialized.current) return;

    // Initialize the WebSocket store bridge
    webSocketStoreBridge.initialize();

    // Generate session ID for development (in production, this would come from auth)
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // For development, we'll use a basic auth setup
    // In production, this should come from your auth provider
    const auth = {
      accessToken: process.env['NEXT_PUBLIC_API_TOKEN'] || sessionId,
      userId: process.env['NEXT_PUBLIC_USER_ID'] || 'dashboard_user'
    };

    // Connect to WebSocket
    const connectWebSocket = async () => {
      try {
        setWebSocketState('connecting');
        console.log('[WebSocketProvider] Attempting to connect to WebSocket...');

        await webSocketStoreBridge.connect(auth.accessToken, auth.userId);

        console.log('[WebSocketProvider] WebSocket connected successfully');
        setWebSocketState('connected');
        setRetryCount(0);
      } catch (error) {
        console.error('[WebSocketProvider] Failed to connect WebSocket:', error);
        setWebSocketState('error');

        // Retry connection after delay
        if (retryCount < 3) {
          setTimeout(() => {
            console.log(`[WebSocketProvider] Retrying connection (attempt ${retryCount + 1}/3)...`);
            setRetryCount(prev => prev + 1);
            connectWebSocket();
          }, 2000 * Math.pow(2, retryCount)); // Exponential backoff
        }
      }
    };

    // Listen for connection state changes
    webSocketStoreBridge.onConnectionStateChange((state) => {
      console.log('[WebSocketProvider] Connection state changed:', state);
      setWebSocketState(state as any);
    });

    connectWebSocket();
    initialized.current = true;

    // Cleanup on unmount
    return () => {
      console.log('[WebSocketProvider] Cleaning up WebSocket connection...');
      webSocketStoreBridge.disconnect();
      webSocketStoreBridge.destroy();
    };
  }, [setWebSocketState, retryCount]);

  return <>{children}</>;
}