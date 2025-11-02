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
  const retryCountRef = useRef(0);
  const { setWebSocketState } = useUIStore();
  const { session, user, loading: authLoading } = useAuth();

  // Extract primitive values to avoid unnecessary re-renders when objects are recreated
  const accessToken = session?.access_token;
  const userId = user?.id;

  useEffect(() => {
    console.log('[WebSocketProvider] useEffect triggered', {
      authLoading,
      accessToken: accessToken ? `${accessToken.substring(0, 20)}...` : null,
      userId,
      initialized: initialized.current,
      previousToken: previousToken.current ? `${previousToken.current.substring(0, 20)}...` : null
    });

    // Wait for auth to be loaded
    if (authLoading) return;

    // Don't connect if not authenticated
    if (!accessToken || !userId) {
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
    const tokenChanged = previousToken.current && previousToken.current !== accessToken;

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

        await webSocketStoreBridge.connect(accessToken, userId);

        console.log('[WebSocketProvider] WebSocket connected successfully');
        setWebSocketState('connected');
        retryCountRef.current = 0;

        // Store the current token for comparison
        previousToken.current = accessToken;
      } catch (error) {
        console.error('[WebSocketProvider] Failed to connect WebSocket:', error);
        setWebSocketState('error');

        // Retry connection after delay
        if (retryCountRef.current < 3) {
          const currentRetry = retryCountRef.current;
          setTimeout(() => {
            console.log(`[WebSocketProvider] Retrying connection (attempt ${currentRetry + 1}/3)...`);
            retryCountRef.current = currentRetry + 1;
            connectWebSocket();
          }, 2000 * Math.pow(2, currentRetry)); // Exponential backoff
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
  }, [authLoading, accessToken, userId]);

  return <>{children}</>;
}