import { FastifyInstance } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { EventEmitter } from 'events';
import { EnhancedWebSocketAuth, SecurityEvent, AuthContext as EnhancedAuthContext, getEnhancedAuth, initializeEnhancedAuth } from './websocket-auth.js';
import { securityLogger } from './security-event-logger.js';
import { DatabaseAdapter } from '../database/adapter.js';
import pino from 'pino';
import { config as serverConfig } from '../config/index.js';

const logger = pino({ name: 'auth-adapter' });

/**
 * Auth Adapter Service
 * Bridges the existing AuthService interface with enhanced security features
 * Maintains backward compatibility while adding advanced security capabilities
 */
export class AuthAdapter extends EventEmitter {
  private enhancedAuth: EnhancedWebSocketAuth;

  constructor(
    private server: FastifyInstance,
    private supabase?: SupabaseClient<any>,
    db?: DatabaseAdapter
  ) {
    super();

    // Use the singleton instance if it exists, otherwise initialize it
    // This ensures we use the same instance that has Fastify JWT support
    // The singleton will be initialized with Fastify JWT support in server.ts
    try {
      // Try to get the existing singleton
      this.enhancedAuth = getEnhancedAuth();
      logger.info('Using existing EnhancedWebSocketAuth singleton');
    } catch {
      // If singleton doesn't exist, initialize it with Fastify support
      logger.info('Initializing EnhancedWebSocketAuth singleton with Fastify JWT');
      this.enhancedAuth = initializeEnhancedAuth(server);
    }

    // Wire up security event logging
    this.enhancedAuth.on('security-event', (event: SecurityEvent) => {
      securityLogger.logEvent(event);
    });

    // Wire up security alerts
    securityLogger.on('security-alert', (alert) => {
      logger.error({ alert }, 'SECURITY ALERT');
      // Could send to monitoring service
    });

    // Wire up user blocking
    securityLogger.on('block-user', ({ userId, reason, alert }) => {
      logger.error({ userId, reason, alert }, 'User blocked due to security violation');
      // Invalidate all user sessions
      this.enhancedAuth.invalidateUserSessions(userId);
    });

    logger.info('Auth adapter initialized with enhanced security features');
  }

  /**
   * Validate token - maintains backward compatibility
   * Returns format expected by existing code
   */
  async validateToken(token: string): Promise<{
    userId: string;
    expiresAt: number;
    refreshToken?: string;
  } | null> {
    try {
      const authContext = await this.enhancedAuth.validateToken(token);

      if (!authContext) {
        return null;
      }

      // Check rate limit
      if (!this.enhancedAuth.checkRateLimit(authContext.userId)) {
        logger.warn({ userId: authContext.userId }, 'Rate limit exceeded');
        return null;
      }

      // Convert to legacy format for backward compatibility
      // Note: expiresAt is expected in seconds by existing code
      return {
        userId: authContext.userId,
        expiresAt: Math.floor((authContext.lastActivity || Date.now()) / 1000) + 3600, // 1 hour from last activity
        refreshToken: undefined // Not available in enhanced auth context
      };
    } catch (error) {
      logger.error({ error }, 'Token validation failed');
      return null;
    }
  }

  /**
   * Enhanced validate token - returns full auth context
   * Use this for new code that needs enhanced features
   */
  async validateTokenEnhanced(token: string): Promise<EnhancedAuthContext | null> {
    const authContext = await this.enhancedAuth.validateToken(token);

    if (!authContext) {
      return null;
    }

    // Check rate limit
    if (!this.enhancedAuth.checkRateLimit(authContext.userId)) {
      logger.warn({ userId: authContext.userId }, 'Rate limit exceeded');
      return null;
    }

    return authContext;
  }

  /**
   * Check if user has permission for an action
   */
  hasPermission(authContext: EnhancedAuthContext, action: string, resource?: string): boolean {
    return this.enhancedAuth.hasPermission(authContext, action, resource);
  }

  /**
   * Blacklist a token
   */
  blacklistToken(tokenId: string, reason: string, duration?: number): void {
    this.enhancedAuth.blacklistToken(tokenId, reason, duration);
  }

  /**
   * Check if token is blacklisted
   */
  isTokenBlacklisted(tokenId: string): boolean {
    return this.enhancedAuth.isTokenBlacklisted(tokenId);
  }

  /**
   * Invalidate all sessions for a user
   */
  invalidateUserSessions(userId: string): void {
    this.enhancedAuth.invalidateUserSessions(userId);
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics() {
    return {
      authMetrics: this.enhancedAuth.getTokenUsageStats(),
      suspiciousActivity: this.enhancedAuth.getSuspiciousActivityReport(),
      eventMetrics: securityLogger.getMetrics()
    };
  }

  /**
   * Get recent security events
   */
  getRecentSecurityEvents(limit: number = 100, userId?: string) {
    return securityLogger.getRecentEvents(limit, userId);
  }

  /**
   * Generate security report
   */
  async generateSecurityReport(startDate: Date, endDate: Date) {
    return securityLogger.generateReport(startDate, endDate);
  }

  /**
   * Refresh token - maintains backward compatibility
   */
  async refreshToken(refreshToken: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_at: number;
  } | null> {
    try {
      const payload = await this.enhancedAuth.verifyRefreshToken(refreshToken);

      if (!payload) {
        return null;
      }

      // Generate new tokens
      const accessToken = this.enhancedAuth.generateAccessToken({
        sub: payload.sub,
        email: payload.email,
        role: payload.role
      });

      const newRefreshToken = this.enhancedAuth.generateRefreshToken({
        sub: payload.sub,
        email: payload.email,
        role: payload.role
      });

      return {
        access_token: accessToken,
        refresh_token: newRefreshToken,
        expires_at: Math.floor(Date.now() / 1000) + 3600 // 1 hour
      };
    } catch (error) {
      logger.error({ error }, 'Token refresh failed');
      return null;
    }
  }

  /**
   * Sign in - maintains backward compatibility
   */
  async signIn(email: string, password: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_at: number;
    user: {
      id: string;
      email: string;
      role?: string;
    };
  } | null> {
    try {
      if (!this.supabase) {
        logger.error('Supabase client not available for sign in');
        return null;
      }

      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error || !data.session) {
        logger.error({ error }, 'Sign in failed');
        return null;
      }

      return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: Math.floor(new Date(data.session.expires_at!).getTime() / 1000),
        user: {
          id: data.user.id,
          email: data.user.email!,
          role: data.user.role
        }
      };
    } catch (error) {
      logger.error({ error }, 'Sign in error');
      return null;
    }
  }

  /**
   * Sign out
   */
  async signOut(userId: string): Promise<void> {
    try {
      // Invalidate all user sessions
      this.enhancedAuth.invalidateUserSessions(userId);

      if (this.supabase) {
        await this.supabase.auth.signOut();
      }

      logger.info({ userId }, 'User signed out');
    } catch (error) {
      logger.error({ error, userId }, 'Sign out error');
    }
  }

  /**
   * Send magic link - maintains backward compatibility
   */
  async sendMagicLink(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.supabase) {
        return { success: false, error: 'Supabase client not available' };
      }

      const { error } = await this.supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${process.env['FRONTEND_URL']}/auth/callback`
        }
      });

      if (error) {
        logger.error({ error, email }, 'Failed to send magic link');
        return { success: false, error: error.message };
      }

      logger.info({ email }, 'Magic link sent');
      return { success: true };
    } catch (error) {
      logger.error({ error, email }, 'Error sending magic link');
      return { success: false, error: 'Failed to send magic link' };
    }
  }

  /**
   * Verify token - maintains backward compatibility
   */
  async verifyToken(token: string): Promise<{
    success: boolean;
    user?: { id: string; email: string; role?: string };
    error?: string;
  }> {
    try {
      const authContext = await this.enhancedAuth.validateToken(token);

      if (!authContext) {
        return { success: false, error: 'Invalid token' };
      }

      return {
        success: true,
        user: {
          id: authContext.userId,
          email: authContext.email || '',
          role: authContext.role
        }
      };
    } catch (error) {
      logger.error({ error }, 'Token verification failed');
      return { success: false, error: 'Token verification failed' };
    }
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    this.enhancedAuth.shutdown();
    securityLogger.shutdown();
    logger.info('Auth adapter shut down');
  }
}

// Export for backward compatibility
export { AuthAdapter as AuthService };
