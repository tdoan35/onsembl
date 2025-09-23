'use client';

import { useEffect, useRef, useState } from 'react';
import { webSocketStoreBridge } from '@/services/websocket-store-bridge';
import { useUIStore } from '@/stores/ui-store';
import { useAuth } from '@/contexts/auth-context';

export interface WebSocketProviderProps {
  children: React.ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const initialized = useRef(false);
  const previousToken = useRef<string | null>(null);
  const { setWebSocketState } = useUIStore();
  const { session, user, loading: authLoading } = useAuth();
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    // Wait for auth to be loaded
    if (authLoading) return;

    // Don't connect if not authenticated
    if (!session || !user) {
      console.log('[WebSocketProvider] Not authenticated, skipping WebSocket connection');
      setWebSocketState('disconnected');

      // If we were previously connected, disconnect
      if (initialized.current) {
        webSocketStoreBridge.disconnect();
        initialized.current = false;
        previousToken.current = null;
      }
      return;
    }

    // Check if token has changed (refresh occurred)
    const tokenChanged = previousToken.current && previousToken.current !== session.access_token;

    if (tokenChanged) {
      console.log('[WebSocketProvider] Token refreshed, reconnecting with new token...');
      // Disconnect existing connection
      webSocketStoreBridge.disconnect();
      initialized.current = false;
    }

    // Avoid re-initialization if already connected with same token
    if (initialized.current && !tokenChanged) return;

    // Initialize the WebSocket store bridge
    webSocketStoreBridge.initialize();

    // Connect to WebSocket with auth token
    const connectWebSocket = async () => {
      try {
        setWebSocketState('connecting');
        console.log('[WebSocketProvider] Attempting to connect to WebSocket...');

        await webSocketStoreBridge.connect(session.access_token, user.id);

        console.log('[WebSocketProvider] WebSocket connected successfully');
        setWebSocketState('connected');
        setRetryCount(0);

        // Store the current token for comparison
        previousToken.current = session.access_token;
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

    connectWebSocket();
    initialized.current = true;

    // Cleanup on unmount
    return () => {
      console.log('[WebSocketProvider] Cleaning up WebSocket connection...');
      webSocketStoreBridge.disconnect();
      webSocketStoreBridge.destroy();
      initialized.current = false;
    };
  }, [setWebSocketState, retryCount, authLoading, session, user]);

  return <>{children}</>;
}