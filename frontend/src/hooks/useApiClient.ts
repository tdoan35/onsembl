'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/services/api.service';

/**
 * Hook to automatically sync API client with auth state
 */
export function useApiClient() {
  const { session } = useAuth();

  useEffect(() => {
    if (session) {
      // Set tokens in API client
      apiClient.setTokens(session.access_token, session.refresh_token || '');
    } else {
      // Clear tokens when logged out
      apiClient.clearTokens();
    }
  }, [session]);

  return apiClient;
}