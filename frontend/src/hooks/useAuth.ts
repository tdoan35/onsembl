/**
 * React hook wrapper for AuthService
 * Provides reactive authentication state for React components
 */

import { useState, useEffect, useCallback } from 'react';
import {
  authService,
  type AuthUser,
  type AuthSession,
  type AuthState,
  type AuthError,
  type AuthEventType,
} from '../services/auth.service';

export interface UseAuthReturn {
  user: AuthUser | null;
  session: AuthSession | null;
  authState: AuthState;
  error: AuthError | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthSession>;
  signUp: (
    email: string,
    password: string,
    data?: Record<string, any>,
  ) => Promise<AuthSession | null>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<AuthSession | null>;
  sendMagicLink: (email: string, redirectTo?: string) => Promise<void>;
  updateUser: (attributes: {
    email?: string;
    password?: string;
    data?: Record<string, any>;
  }) => Promise<AuthUser>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(
    authService.getCurrentUser(),
  );
  const [session, setSession] = useState<AuthSession | null>(
    authService.getCurrentSession(),
  );
  const [authState, setAuthState] = useState<AuthState>(
    authService.getAuthState(),
  );
  const [error, setError] = useState<AuthError | null>(
    authService.getLastError(),
  );

  useEffect(() => {
    // Subscribe to auth events
    const handleAuthEvent = (
      event: AuthEventType,
      eventSession?: AuthSession | null,
    ) => {
      switch (event) {
        case 'signed_in':
        case 'token_refreshed':
        case 'user_updated':
          if (eventSession) {
            setSession(eventSession);
            setUser(eventSession.user);
            setError(null);
          }
          break;
        case 'signed_out':
        case 'session_expired':
          setSession(null);
          setUser(null);
          setError(null);
          break;
      }
    };

    // Subscribe to all relevant events
    authService.on('signed_in', handleAuthEvent);
    authService.on('signed_out', handleAuthEvent);
    authService.on('token_refreshed', handleAuthEvent);
    authService.on('user_updated', handleAuthEvent);
    authService.on('session_expired', handleAuthEvent);

    // Subscribe to auth state changes
    const handleAuthStateChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      setAuthState(customEvent.detail as AuthState);
    };

    // Subscribe to auth errors
    const handleAuthError = (event: Event) => {
      const customEvent = event as CustomEvent;
      setError(customEvent.detail as AuthError);
    };

    authService.addEventListener('auth_state_change', handleAuthStateChange);
    authService.addEventListener('auth_error', handleAuthError);

    // Set initial state
    setUser(authService.getCurrentUser());
    setSession(authService.getCurrentSession());
    setAuthState(authService.getAuthState());
    setError(authService.getLastError());

    // Cleanup
    return () => {
      authService.off('signed_in', handleAuthEvent);
      authService.off('signed_out', handleAuthEvent);
      authService.off('token_refreshed', handleAuthEvent);
      authService.off('user_updated', handleAuthEvent);
      authService.off('session_expired', handleAuthEvent);
      authService.removeEventListener(
        'auth_state_change',
        handleAuthStateChange,
      );
      authService.removeEventListener('auth_error', handleAuthError);
    };
  }, []);

  // Auth methods
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const session = await authService.signIn({ email, password });
      return session;
    } catch (error) {
      throw error;
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, data?: Record<string, any>) => {
      try {
        const session = await authService.signUp({ email, password, data });
        return session;
      } catch (error) {
        throw error;
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await authService.signOut();
    } catch (error) {
      throw error;
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const newSession = await authService.refreshSession();
      return newSession;
    } catch (error) {
      throw error;
    }
  }, []);

  const sendMagicLink = useCallback(
    async (email: string, redirectTo?: string) => {
      try {
        await authService.sendMagicLink({ email, redirectTo });
      } catch (error) {
        throw error;
      }
    },
    [],
  );

  const updateUser = useCallback(
    async (attributes: {
      email?: string;
      password?: string;
      data?: Record<string, any>;
    }) => {
      try {
        const updatedUser = await authService.updateUser(attributes);
        return updatedUser;
      } catch (error) {
        throw error;
      }
    },
    [],
  );

  return {
    user,
    session,
    authState,
    error,
    isAuthenticated: authService.isAuthenticated(),
    isLoading: authState === 'loading',
    signIn,
    signUp,
    signOut,
    refreshSession,
    sendMagicLink,
    updateUser,
  };
}
