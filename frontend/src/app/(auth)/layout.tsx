'use client';

import { useEffect } from 'react';
import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { initializeAgentWebSocket, cleanupAgentWebSocket } from '@/stores/agent-websocket-integration';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // NOTE: WebSocket connection to dashboard is managed by WebSocketProvider
    // (components/providers/websocket-provider.tsx) at the application level.
    // Individual layouts/pages should NOT manage the connection lifecycle.

    // Setup agent store integration
    initializeAgentWebSocket();

    // Cleanup on unmount
    return () => {
      cleanupAgentWebSocket();
    };
  }, []);

  return (
    <ProtectedRoute>
      <AuthenticatedLayout>{children}</AuthenticatedLayout>
    </ProtectedRoute>
  );
}