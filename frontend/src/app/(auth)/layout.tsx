'use client';

import { useEffect } from 'react';
import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { initializeAgentWebSocket, cleanupAgentWebSocket } from '@/stores/agent-websocket-integration';
import { webSocketService } from '@/services/websocket.service';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    console.log('Initializing WebSocket connection...');

    // Connect WebSocket to dashboard endpoint
    webSocketService.connect('dashboard');

    // Setup agent store integration
    initializeAgentWebSocket();

    // Cleanup on unmount
    return () => {
      console.log('Cleaning up WebSocket connection...');
      cleanupAgentWebSocket();
      webSocketService.disconnect('dashboard');
    };
  }, []);

  return (
    <ProtectedRoute>
      <AuthenticatedLayout>{children}</AuthenticatedLayout>
    </ProtectedRoute>
  );
}