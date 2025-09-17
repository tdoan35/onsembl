/**
 * Authentication Service for Onsembl.ai Dashboard
 * Handles user authentication with Supabase integration
 */

import { createClientComponentClient, type User, type Session } from '@supabase/auth-helpers-nextjs';
import { apiClient } from './api.service';
import { webSocketService } from './websocket.service';
import { Database } from '../types/database';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  metadata?: Record<string, any>;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export interface AuthError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface MagicLinkOptions {
  email: string;
  redirectTo?: string;
  data?: Record<string, any>;
}

export interface SignUpOptions {
  email: string;
  password: string;
  data?: Record<string, any>;
}

export interface SignInOptions {
  email: string;
  password: string;
}

export interface AuthConfig {
  autoRefresh: boolean;
  refreshBuffer: number; // Minutes before expiry to refresh
  persistSession: boolean;
  storageKey: string;
}

export type AuthEventType = 'signed_in' | 'signed_out' | 'token_refreshed' | 'user_updated' | 'session_expired';
export type AuthEventCallback = (event: AuthEventType, session?: AuthSession | null) => void;

export class AuthService extends EventTarget {
  private supabase = createClientComponentClient<Database>();
  private config: AuthConfig;
  private currentSession: AuthSession | null = null;
  private authState: AuthState = 'loading';
  private refreshTimer: NodeJS.Timeout | null = null;
  private eventCallbacks: Map<AuthEventType, Set<AuthEventCallback>> = new Map();
  private lastError: AuthError | null = null;

  constructor(config: AuthConfig) {
    super();
    this.config = config;
    this.initializeEventCallbacks();
    this.initialize();
  }

  private initializeEventCallbacks(): void {
    // Initialize callback maps for each event type
    const eventTypes: AuthEventType[] = ['signed_in', 'signed_out', 'token_refreshed', 'user_updated', 'session_expired'];
    eventTypes.forEach(type => {
      this.eventCallbacks.set(type, new Set());
    });
  }

  private async initialize(): Promise<void> {
    try {
      // Set up Supabase auth state change listener
      this.supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Supabase auth state change:', event, session?.user?.id);

        switch (event) {
          case 'SIGNED_IN':
            if (session) {
              await this.handleSignIn(session);
            }
            break;
          case 'SIGNED_OUT':
            await this.handleSignOut();
            break;
          case 'TOKEN_REFRESHED':
            if (session) {
              await this.handleTokenRefresh(session);
            }
            break;
          case 'USER_UPDATED':
            if (session) {
              await this.handleUserUpdate(session);
            }
            break;
        }
      });

      // Try to restore session from storage
      if (this.config.persistSession) {
        await this.restoreSession();
      }

      // Get current session
      const { data: { session }, error } = await this.supabase.auth.getSession();

      if (error) {
        this.handleAuthError('session_error', error.message);
        return;
      }

      if (session) {
        await this.handleSignIn(session);
      } else {
        this.setAuthState('unauthenticated');
      }

    } catch (error) {
      console.error('Auth service initialization failed:', error);
      this.handleAuthError('init_error', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Sign up with email and password
   */
  async signUp(options: SignUpOptions): Promise<AuthSession | null> {
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email: options.email,
        password: options.password,
        options: {
          data: options.data
        }
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        return await this.handleSignIn(data.session);
      }

      // User needs to verify email
      return null;

    } catch (error: any) {
      this.handleAuthError('signup_error', error.message);
      throw error;
    }
  }

  /**
   * Sign in with email and password
   */
  async signIn(options: SignInOptions): Promise<AuthSession> {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: options.email,
        password: options.password
      });

      if (error) {
        throw error;
      }

      if (!data.session) {
        throw new Error('No session returned from sign in');
      }

      return await this.handleSignIn(data.session);

    } catch (error: any) {
      this.handleAuthError('signin_error', error.message);
      throw error;
    }
  }

  /**
   * Send magic link
   */
  async sendMagicLink(options: MagicLinkOptions): Promise<void> {
    try {
      const { error } = await this.supabase.auth.signInWithOtp({
        email: options.email,
        options: {
          emailRedirectTo: options.redirectTo,
          data: options.data
        }
      });

      if (error) {
        throw error;
      }

    } catch (error: any) {
      this.handleAuthError('magic_link_error', error.message);
      throw error;
    }
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    try {
      const { error } = await this.supabase.auth.signOut();

      if (error) {
        console.warn('Supabase sign out error:', error);
      }

      await this.handleSignOut();

    } catch (error: any) {
      console.error('Sign out error:', error);
      // Still proceed with local cleanup
      await this.handleSignOut();
    }
  }

  /**
   * Refresh current session
   */
  async refreshSession(): Promise<AuthSession | null> {
    try {
      const { data, error } = await this.supabase.auth.refreshSession();

      if (error) {
        throw error;
      }

      if (data.session) {
        return await this.handleTokenRefresh(data.session);
      }

      return null;

    } catch (error: any) {
      this.handleAuthError('refresh_error', error.message);
      throw error;
    }
  }

  /**
   * Get current user
   */
  getCurrentUser(): AuthUser | null {
    return this.currentSession?.user || null;
  }

  /**
   * Get current session
   */
  getCurrentSession(): AuthSession | null {
    return this.currentSession;
  }

  /**
   * Get current auth state
   */
  getAuthState(): AuthState {
    return this.authState;
  }

  /**
   * Get last authentication error
   */
  getLastError(): AuthError | null {
    return this.lastError;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.authState === 'authenticated' && this.currentSession !== null;
  }

  /**
   * Check if session is expired
   */
  isSessionExpired(): boolean {
    if (!this.currentSession) return true;
    return new Date() >= this.currentSession.expiresAt;
  }

  /**
   * Get time until session expires (in milliseconds)
   */
  getTimeToExpiry(): number {
    if (!this.currentSession) return 0;
    return Math.max(0, this.currentSession.expiresAt.getTime() - Date.now());
  }

  /**
   * Update user profile
   */
  async updateUser(attributes: { email?: string; password?: string; data?: Record<string, any> }): Promise<AuthUser> {
    try {
      const { data, error } = await this.supabase.auth.updateUser(attributes);

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error('No user returned from update');
      }

      const updatedUser = this.mapSupabaseUser(data.user);

      if (this.currentSession) {
        this.currentSession.user = updatedUser;
        this.persistSession();
        this.emitEvent('user_updated', this.currentSession);
      }

      return updatedUser;

    } catch (error: any) {
      this.handleAuthError('update_error', error.message);
      throw error;
    }
  }

  /**
   * Add auth event listener
   */
  on(event: AuthEventType, callback: AuthEventCallback): void {
    const callbacks = this.eventCallbacks.get(event);
    if (callbacks) {
      callbacks.add(callback);
    }
  }

  /**
   * Remove auth event listener
   */
  off(event: AuthEventType, callback: AuthEventCallback): void {
    const callbacks = this.eventCallbacks.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  private async handleSignIn(session: Session): Promise<AuthSession> {
    const authSession = this.mapSupabaseSession(session);
    this.currentSession = authSession;
    this.lastError = null;
    this.setAuthState('authenticated');

    // Set up services
    this.setupServices(authSession);

    // Persist session
    if (this.config.persistSession) {
      this.persistSession();
    }

    // Set up auto refresh
    if (this.config.autoRefresh) {
      this.scheduleTokenRefresh();
    }

    this.emitEvent('signed_in', authSession);

    return authSession;
  }

  private async handleSignOut(): Promise<void> {
    // Clear refresh timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Clear services
    this.clearServices();

    // Clear session
    this.currentSession = null;
    this.lastError = null;
    this.setAuthState('unauthenticated');

    // Clear persisted session
    if (this.config.persistSession) {
      this.clearPersistedSession();
    }

    this.emitEvent('signed_out');
  }

  private async handleTokenRefresh(session: Session): Promise<AuthSession> {
    const authSession = this.mapSupabaseSession(session);
    this.currentSession = authSession;

    // Update services
    this.setupServices(authSession);

    // Persist session
    if (this.config.persistSession) {
      this.persistSession();
    }

    // Reschedule next refresh
    if (this.config.autoRefresh) {
      this.scheduleTokenRefresh();
    }

    this.emitEvent('token_refreshed', authSession);

    return authSession;
  }

  private async handleUserUpdate(session: Session): Promise<void> {
    if (this.currentSession) {
      const authSession = this.mapSupabaseSession(session);
      this.currentSession = authSession;

      if (this.config.persistSession) {
        this.persistSession();
      }

      this.emitEvent('user_updated', authSession);
    }
  }

  private setupServices(session: AuthSession): void {
    // Set API client tokens
    apiClient.setTokens(session.accessToken, session.refreshToken);

    // Set WebSocket auth
    webSocketService.setAuth(session.accessToken, session.user.id);
  }

  private clearServices(): void {
    // Clear API client tokens
    apiClient.clearTokens();

    // Clear WebSocket auth
    webSocketService.setAuth('', '');
  }

  private scheduleTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.currentSession) return;

    const timeToRefresh = this.getTimeToExpiry() - (this.config.refreshBuffer * 60 * 1000);

    if (timeToRefresh <= 0) {
      // Token is already expired or will expire very soon, refresh immediately
      this.refreshSession().catch(error => {
        console.error('Failed to refresh expired token:', error);
        this.handleSessionExpiry();
      });
      return;
    }

    this.refreshTimer = setTimeout(async () => {
      try {
        await this.refreshSession();
      } catch (error) {
        console.error('Scheduled token refresh failed:', error);
        this.handleSessionExpiry();
      }
    }, timeToRefresh);
  }

  private handleSessionExpiry(): void {
    this.emitEvent('session_expired');
    this.signOut(); // Force sign out
  }

  private mapSupabaseSession(session: Session): AuthSession {
    return {
      user: this.mapSupabaseUser(session.user),
      accessToken: session.access_token,
      refreshToken: session.refresh_token || '',
      expiresAt: new Date(session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000)
    };
  }

  private mapSupabaseUser(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email || '',
      role: user.user_metadata?.role || user.app_metadata?.role || 'user',
      metadata: {
        ...user.user_metadata,
        ...user.app_metadata
      }
    };
  }

  private setAuthState(state: AuthState): void {
    this.authState = state;
    this.dispatchEvent(new CustomEvent('auth_state_change', { detail: state }));
  }

  private handleAuthError(code: string, message: string, details?: Record<string, any>): void {
    this.lastError = { code, message, details };
    this.setAuthState('error');

    this.dispatchEvent(new CustomEvent('auth_error', {
      detail: this.lastError
    }));
  }

  private emitEvent(event: AuthEventType, session?: AuthSession | null): void {
    const callbacks = this.eventCallbacks.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(event, session);
        } catch (error) {
          console.error(`Error in auth event callback for ${event}:`, error);
        }
      });
    }

    // Dispatch custom event
    this.dispatchEvent(new CustomEvent(event, { detail: session }));
  }

  private persistSession(): void {
    if (!this.currentSession || !this.config.persistSession) return;

    try {
      const sessionData = {
        user: this.currentSession.user,
        accessToken: this.currentSession.accessToken,
        refreshToken: this.currentSession.refreshToken,
        expiresAt: this.currentSession.expiresAt.toISOString()
      };

      localStorage.setItem(this.config.storageKey, JSON.stringify(sessionData));
    } catch (error) {
      console.warn('Failed to persist auth session:', error);
    }
  }

  private async restoreSession(): Promise<void> {
    try {
      const sessionData = localStorage.getItem(this.config.storageKey);
      if (!sessionData) return;

      const parsed = JSON.parse(sessionData);
      const expiresAt = new Date(parsed.expiresAt);

      // Check if session is expired
      if (expiresAt <= new Date()) {
        this.clearPersistedSession();
        return;
      }

      const authSession: AuthSession = {
        user: parsed.user,
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        expiresAt
      };

      this.currentSession = authSession;
      this.setAuthState('authenticated');
      this.setupServices(authSession);

      if (this.config.autoRefresh) {
        this.scheduleTokenRefresh();
      }

    } catch (error) {
      console.warn('Failed to restore auth session:', error);
      this.clearPersistedSession();
    }
  }

  private clearPersistedSession(): void {
    try {
      localStorage.removeItem(this.config.storageKey);
    } catch (error) {
      console.warn('Failed to clear persisted session:', error);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.clearServices();
    this.eventCallbacks.clear();
    this.currentSession = null;
    this.setAuthState('unauthenticated');

    if (this.config.persistSession) {
      this.clearPersistedSession();
    }
  }
}

// Default configuration
export const defaultAuthConfig: AuthConfig = {
  autoRefresh: true,
  refreshBuffer: 5, // Refresh 5 minutes before expiry
  persistSession: true,
  storageKey: 'onsembl_auth_session'
};

// Singleton instance
export const authService = new AuthService(defaultAuthConfig);