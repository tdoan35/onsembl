/**
 * AuthService with Supabase Magic Links - T080 Implementation
 *
 * Comprehensive authentication service for Onsembl.ai Agent Control Center.
 * Implements magic link authentication, JWT token management, session handling,
 * and audit logging for all authentication events.
 *
 * Features:
 * - Magic link authentication via Supabase Auth
 * - JWT token validation and refresh logic
 * - Session management with automatic cleanup
 * - Comprehensive audit logging for auth events
 * - Role-based access control support
 * - Graceful error handling with structured logging
 */

import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { FastifyInstance } from 'fastify';
import { Database } from '../types/database';
import { AuditLogModel, AuditEventType, AuditEntityType } from '../models/audit-log';
import { EventEmitter } from 'events';
import { config } from '../config';

// Authentication-related interfaces
export interface AuthUser {
  id: string;
  email: string;
  role?: string;
  metadata?: Record<string, any>;
  email_confirmed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: string;
  user: AuthUser;
}

export interface MagicLinkRequest {
  email: string;
  redirectTo?: string;
  data?: Record<string, any>;
}

export interface MagicLinkResponse {
  success: boolean;
  message: string;
  email: string;
  messageId?: string;
}

export interface TokenValidationResult {
  valid: boolean;
  user?: AuthUser;
  error?: string;
  expired?: boolean;
}

export interface TokenRefreshResult {
  success: boolean;
  session?: AuthSession;
  error?: string;
}

export interface SignOutResult {
  success: boolean;
  message: string;
}

export interface AuthServiceEvents {
  'auth:magic-link-sent': (email: string) => void;
  'auth:user-signed-in': (user: AuthUser) => void;
  'auth:user-signed-out': (userId: string) => void;
  'auth:token-refreshed': (userId: string) => void;
  'auth:token-expired': (userId: string) => void;
  'auth:session-created': (session: AuthSession) => void;
  'auth:session-expired': (userId: string) => void;
}

/**
 * AuthService - Comprehensive authentication service with Supabase integration
 *
 * Handles all authentication-related operations including magic link auth,
 * session management, token validation/refresh, and audit logging.
 */
export class AuthService extends EventEmitter {
  private supabase: SupabaseClient<Database>;
  private auditLogModel: AuditLogModel;
  private activeSessions: Map<string, { userId: string; expiresAt: number }>;
  private sessionCleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private fastify: FastifyInstance,
    supabaseClient?: SupabaseClient<Database>
  ) {
    super();

    // Use provided client or create new one with service role key for admin operations
    this.supabase = supabaseClient || createClient<Database>(
      config.supabaseUrl || process.env['SUPABASE_URL']!,
      config.supabaseServiceKey || process.env['SUPABASE_SERVICE_ROLE_KEY']!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    this.auditLogModel = new AuditLogModel(this.supabase);
    this.activeSessions = new Map();

    this.setupSessionCleanup();
    this.fastify.log.info('AuthService initialized with Supabase magic links');
  }

  /**
   * Send magic link to user's email for authentication
   * @param request Magic link request parameters
   * @param requestMetadata Request metadata for audit logging
   * @returns Magic link response with success status
   */
  async sendMagicLink(
    request: MagicLinkRequest,
    requestMetadata?: { ip_address?: string; user_agent?: string }
  ): Promise<MagicLinkResponse> {
    const { email, redirectTo, data } = request;

    try {
      this.fastify.log.info({ email }, 'Sending magic link');

      // Send magic link via Supabase Auth
      const { data: authData, error } = await this.supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          data: data || {},
        },
      });

      if (error) {
        this.fastify.log.error({ error, email }, 'Failed to send magic link');

        // Log failed attempt in audit log
        await this.auditLogModel.logEvent(
          'USER_LOGIN' as AuditEventType,
          'USER' as AuditEntityType,
          email,
          undefined,
          {
            success: false,
            error: error.message,
            method: 'magic_link',
            email,
          },
          requestMetadata
        );

        throw new Error(error.message);
      }

      // Log successful magic link send
      await this.auditLogModel.logEvent(
        'USER_LOGIN' as AuditEventType,
        'USER' as AuditEntityType,
        email,
        undefined,
        {
          action: 'magic_link_sent',
          email,
          redirectTo: redirectTo || null,
          messageId: authData?.messageId,
        },
        requestMetadata
      );

      this.emit('auth:magic-link-sent', email);

      this.fastify.log.info({ email, messageId: authData?.messageId }, 'Magic link sent successfully');

      return {
        success: true,
        message: 'Magic link sent to your email address',
        email,
        messageId: authData?.messageId,
      };
    } catch (error) {
      this.fastify.log.error({ error, email }, 'Error sending magic link');
      throw error;
    }
  }

  /**
   * Verify and validate JWT token
   * @param token JWT token to validate
   * @returns Token validation result with user data
   */
  async verifyToken(token: string): Promise<TokenValidationResult> {
    try {
      // Create temporary client with user token for verification
      const userSupabase = createClient<Database>(
        config.supabaseUrl || process.env['SUPABASE_URL']!,
        config.supabaseAnonKey || process.env['SUPABASE_ANON_KEY']!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        }
      );

      const { data: { user }, error } = await userSupabase.auth.getUser(token);

      if (error) {
        this.fastify.log.warn({ error: error.message }, 'Token validation failed');

        return {
          valid: false,
          error: error.message,
          expired: error.message.includes('expired') || error.message.includes('JWT expired'),
        };
      }

      if (!user) {
        return {
          valid: false,
          error: 'User not found',
        };
      }

      // Transform Supabase user to our AuthUser format
      const authUser: AuthUser = {
        id: user.id,
        email: user.email!,
        role: user.role,
        metadata: user.user_metadata || {},
        email_confirmed_at: user.email_confirmed_at,
        created_at: user.created_at,
        updated_at: user.updated_at,
      };

      this.fastify.log.debug({ userId: user.id, email: user.email }, 'Token validated successfully');

      return {
        valid: true,
        user: authUser,
      };
    } catch (error) {
      this.fastify.log.error({ error }, 'Error validating token');

      return {
        valid: false,
        error: 'Token validation error',
      };
    }
  }

  /**
   * Get user information from a valid token
   * @param token JWT token
   * @returns User information or null if invalid
   */
  async getUser(token: string): Promise<AuthUser | null> {
    const validation = await this.verifyToken(token);
    return validation.valid ? validation.user! : null;
  }

  /**
   * Refresh JWT token using refresh token
   * @param refreshToken Refresh token
   * @param requestMetadata Request metadata for audit logging
   * @returns Token refresh result with new session
   */
  async refreshToken(
    refreshToken: string,
    requestMetadata?: { ip_address?: string; user_agent?: string }
  ): Promise<TokenRefreshResult> {
    try {
      this.fastify.log.debug('Refreshing token');

      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error || !data.session) {
        this.fastify.log.warn({ error: error?.message }, 'Token refresh failed');

        return {
          success: false,
          error: error?.message || 'Failed to refresh token',
        };
      }

      const { session } = data;

      // Transform to our AuthSession format
      const authSession: AuthSession = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at!,
        expires_in: session.expires_in!,
        token_type: session.token_type!,
        user: {
          id: session.user.id,
          email: session.user.email!,
          role: session.user.role,
          metadata: session.user.user_metadata || {},
          email_confirmed_at: session.user.email_confirmed_at,
          created_at: session.user.created_at,
          updated_at: session.user.updated_at,
        },
      };

      // Update active sessions tracking
      this.activeSessions.set(session.access_token, {
        userId: session.user.id,
        expiresAt: session.expires_at! * 1000, // Convert to milliseconds
      });

      // Log token refresh in audit log
      await this.auditLogModel.logEvent(
        'USER_LOGIN' as AuditEventType,
        'USER' as AuditEntityType,
        session.user.id,
        session.user.id,
        {
          action: 'token_refreshed',
          email: session.user.email,
          expires_at: session.expires_at,
        },
        requestMetadata
      );

      this.emit('auth:token-refreshed', session.user.id);

      this.fastify.log.info({
        userId: session.user.id,
        email: session.user.email,
        expiresAt: new Date(session.expires_at! * 1000).toISOString()
      }, 'Token refreshed successfully');

      return {
        success: true,
        session: authSession,
      };
    } catch (error) {
      this.fastify.log.error({ error }, 'Error refreshing token');

      return {
        success: false,
        error: 'Token refresh error',
      };
    }
  }

  /**
   * Sign out user and invalidate session
   * @param token JWT token to invalidate
   * @param requestMetadata Request metadata for audit logging
   * @returns Sign out result
   */
  async signOut(
    token: string,
    requestMetadata?: { ip_address?: string; user_agent?: string }
  ): Promise<SignOutResult> {
    try {
      // Get user info before signing out for audit logging
      const user = await this.getUser(token);

      this.fastify.log.info({ userId: user?.id, email: user?.email }, 'Signing out user');

      // Create temporary client with user token for sign out
      const userSupabase = createClient<Database>(
        config.supabaseUrl || process.env['SUPABASE_URL']!,
        config.supabaseAnonKey || process.env['SUPABASE_ANON_KEY']!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        }
      );

      const { error } = await userSupabase.auth.signOut();

      if (error) {
        this.fastify.log.error({ error, userId: user?.id }, 'Sign out failed');
        throw new Error(error.message);
      }

      // Remove from active sessions
      this.activeSessions.delete(token);

      // Log sign out in audit log
      if (user) {
        await this.auditLogModel.logEvent(
          'USER_LOGOUT' as AuditEventType,
          'USER' as AuditEntityType,
          user.id,
          user.id,
          {
            email: user.email,
            method: 'explicit',
          },
          requestMetadata
        );

        this.emit('auth:user-signed-out', user.id);
      }

      this.fastify.log.info({ userId: user?.id, email: user?.email }, 'User signed out successfully');

      return {
        success: true,
        message: 'Signed out successfully',
      };
    } catch (error) {
      this.fastify.log.error({ error }, 'Error signing out');

      return {
        success: false,
        message: 'Sign out failed',
      };
    }
  }

  /**
   * Create session from Supabase auth session (used after magic link verification)
   * @param supabaseSession Supabase session object
   * @param requestMetadata Request metadata for audit logging
   * @returns Transformed AuthSession
   */
  async createSession(
    supabaseSession: Session,
    requestMetadata?: { ip_address?: string; user_agent?: string }
  ): Promise<AuthSession> {
    const authSession: AuthSession = {
      access_token: supabaseSession.access_token,
      refresh_token: supabaseSession.refresh_token,
      expires_at: supabaseSession.expires_at!,
      expires_in: supabaseSession.expires_in!,
      token_type: supabaseSession.token_type!,
      user: {
        id: supabaseSession.user.id,
        email: supabaseSession.user.email!,
        role: supabaseSession.user.role,
        metadata: supabaseSession.user.user_metadata || {},
        email_confirmed_at: supabaseSession.user.email_confirmed_at,
        created_at: supabaseSession.user.created_at,
        updated_at: supabaseSession.user.updated_at,
      },
    };

    // Track active session
    this.activeSessions.set(supabaseSession.access_token, {
      userId: supabaseSession.user.id,
      expiresAt: supabaseSession.expires_at! * 1000, // Convert to milliseconds
    });

    // Log successful sign in
    await this.auditLogModel.logEvent(
      'USER_LOGIN' as AuditEventType,
      'USER' as AuditEntityType,
      supabaseSession.user.id,
      supabaseSession.user.id,
      {
        success: true,
        method: 'magic_link',
        email: supabaseSession.user.email,
        expires_at: supabaseSession.expires_at,
      },
      requestMetadata
    );

    this.emit('auth:user-signed-in', authSession.user);
    this.emit('auth:session-created', authSession);

    this.fastify.log.info({
      userId: supabaseSession.user.id,
      email: supabaseSession.user.email,
      expiresAt: new Date(supabaseSession.expires_at! * 1000).toISOString()
    }, 'Session created successfully');

    return authSession;
  }

  /**
   * Check if user has specific role (future-ready for RBAC)
   * @param user User to check
   * @param requiredRole Role to check for
   * @returns True if user has required role
   */
  hasRole(user: AuthUser, requiredRole: string): boolean {
    return user.role === requiredRole || user.role === 'admin'; // Admin can access everything
  }

  /**
   * Check if user has any of the specified roles
   * @param user User to check
   * @param requiredRoles Roles to check for
   * @returns True if user has at least one of the required roles
   */
  hasAnyRole(user: AuthUser, requiredRoles: string[]): boolean {
    return requiredRoles.some(role => this.hasRole(user, role));
  }

  /**
   * Get active session count for monitoring
   * @returns Number of active sessions
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Get all active user IDs (for monitoring/admin purposes)
   * @returns Array of active user IDs
   */
  getActiveUserIds(): string[] {
    return Array.from(this.activeSessions.values()).map(session => session.userId);
  }

  /**
   * Force expire a specific session (admin operation)
   * @param token Token to expire
   * @param adminUserId Admin user performing the operation
   * @param reason Reason for forced expiry
   */
  async forceExpireSession(
    token: string,
    adminUserId: string,
    reason: string = 'Admin forced expiry'
  ): Promise<void> {
    const sessionInfo = this.activeSessions.get(token);

    if (sessionInfo) {
      this.activeSessions.delete(token);

      // Log forced session expiry
      await this.auditLogModel.logEvent(
        'USER_LOGOUT' as AuditEventType,
        'USER' as AuditEntityType,
        sessionInfo.userId,
        adminUserId,
        {
          method: 'admin_forced',
          reason,
          expired_by: adminUserId,
        }
      );

      this.emit('auth:session-expired', sessionInfo.userId);

      this.fastify.log.warn({
        expiredUserId: sessionInfo.userId,
        adminUserId,
        reason
      }, 'Session force expired by admin');
    }
  }

  /**
   * Clean up expired sessions periodically
   */
  private setupSessionCleanup(): void {
    // Clean up every 5 minutes
    this.sessionCleanupTimer = setInterval(() => {
      const now = Date.now();
      const expiredTokens: string[] = [];

      for (const [token, session] of this.activeSessions.entries()) {
        if (session.expiresAt <= now) {
          expiredTokens.push(token);
        }
      }

      for (const token of expiredTokens) {
        const session = this.activeSessions.get(token);
        if (session) {
          this.activeSessions.delete(token);
          this.emit('auth:session-expired', session.userId);
        }
      }

      if (expiredTokens.length > 0) {
        this.fastify.log.info({
          expiredCount: expiredTokens.length
        }, 'Cleaned up expired sessions');
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Cleanup resources when service is shutting down
   */
  async cleanup(): Promise<void> {
    if (this.sessionCleanupTimer) {
      clearInterval(this.sessionCleanupTimer);
      this.sessionCleanupTimer = null;
    }

    // Log cleanup event
    await this.auditLogModel.logEvent(
      'SYSTEM_STOPPED' as AuditEventType,
      'SYSTEM' as AuditEntityType,
      'auth-service',
      undefined,
      {
        component: 'AuthService',
        activeSessions: this.activeSessions.size,
      }
    );

    this.activeSessions.clear();
    this.removeAllListeners();

    this.fastify.log.info('AuthService cleanup completed');
  }

  /**
   * Health check for the auth service
   * @returns Service health status
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    supabaseConnected: boolean;
    activeSessions: number;
    details?: string;
  }> {
    try {
      // Test Supabase connection
      const { error } = await this.supabase.from('agents').select('count').limit(1).single();
      const supabaseConnected = !error || error.message.includes('JSON object requested');

      return {
        healthy: supabaseConnected,
        supabaseConnected,
        activeSessions: this.activeSessions.size,
        details: supabaseConnected ? 'All systems operational' : 'Supabase connection issues',
      };
    } catch (error) {
      return {
        healthy: false,
        supabaseConnected: false,
        activeSessions: this.activeSessions.size,
        details: `Health check failed: ${error}`,
      };
    }
  }
}