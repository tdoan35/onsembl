import { FastifyRequest, FastifyInstance } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { EventEmitter } from 'events';
import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';
import { DatabaseAdapter } from '../database/adapter.js';
import { config } from '../config/index.js';
import pino from 'pino';

const logger = pino({ name: 'websocket-auth-service' });

export interface JWTPayload {
  sub: string;
  email?: string;
  role?: string;
  iat: number;
  exp: number;
  aud?: string;
  iss?: string;
  jti?: string; // JWT ID for tracking
}

export interface AuthContext {
  userId: string;
  email?: string;
  role?: string;
  isAuthenticated: boolean;
  tokenId?: string; // For tracking token usage
  sessionId?: string; // For session management
  lastActivity?: number;
}

export interface SecurityEvent {
  type: 'auth_success' | 'auth_failure' | 'token_expired' | 'token_refresh' |
        'suspicious_activity' | 'rate_limit_exceeded' | 'token_blacklisted' |
        'session_invalidated' | 'permission_denied';
  userId?: string;
  tokenId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: any;
  timestamp: Date;
}

export interface TokenUsageStats {
  tokenId: string;
  userId: string;
  requestCount: number;
  lastUsed: Date;
  createdAt: Date;
  expiresAt: Date;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  blockDuration?: number;
}

interface BlacklistEntry {
  tokenId: string;
  reason: string;
  blacklistedAt: Date;
  expiresAt?: Date;
}

interface SuspiciousPattern {
  type: 'rapid_reconnect' | 'token_reuse' | 'geographic_anomaly' | 'unusual_activity';
  count: number;
  firstSeen: Date;
  lastSeen: Date;
}

export class EnhancedWebSocketAuth extends EventEmitter {
  private readonly jwtSecret: string;
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;
  private supabase: any;
  private db: DatabaseAdapter | null = null;
  private fastify: FastifyInstance | null = null;

  // Token blacklisting
  private tokenBlacklist: Map<string, BlacklistEntry> = new Map();
  private blacklistCleanupInterval: NodeJS.Timeout;

  // Token usage tracking
  private tokenUsage: Map<string, TokenUsageStats> = new Map();
  private usageCleanupInterval: NodeJS.Timeout;

  // Rate limiting with enhanced tracking
  private rateLimitMap: Map<string, { count: number; resetTime: number; blocked?: boolean }> = new Map();
  private rateLimitCleanupInterval: NodeJS.Timeout;

  // Session management
  private activeSessions: Map<string, Set<string>> = new Map(); // userId -> Set<sessionId>

  // Suspicious activity tracking
  private suspiciousActivity: Map<string, SuspiciousPattern[]> = new Map();

  // Configuration
  private readonly config: {
    maxSessionsPerUser: number;
    tokenRotationInterval: number;
    suspiciousThreshold: number;
    blacklistTTL: number;
    alertThreshold: number;
    rateLimit: RateLimitConfig;
  };

  constructor(config: {
    jwtSecret?: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    db?: DatabaseAdapter;
    fastify?: FastifyInstance;
    maxSessionsPerUser?: number;
    tokenRotationInterval?: number;
    suspiciousThreshold?: number;
    blacklistTTL?: number;
    rateLimit?: RateLimitConfig;
  }) {
    super();

    this.jwtSecret = config.jwtSecret || process.env['JWT_SECRET'] || 'dev-secret';
    this.supabaseUrl = config.supabaseUrl || process.env['SUPABASE_URL'] || '';
    this.supabaseAnonKey = config.supabaseAnonKey || process.env['SUPABASE_ANON_KEY'] || '';
    this.db = config.db || null;
    this.fastify = config.fastify || null;

    if (this.supabaseUrl && this.supabaseAnonKey) {
      this.supabase = createClient(this.supabaseUrl, this.supabaseAnonKey);
    }

    this.config = {
      maxSessionsPerUser: config.maxSessionsPerUser || 5,
      tokenRotationInterval: config.tokenRotationInterval || 3600000, // 1 hour
      suspiciousThreshold: config.suspiciousThreshold || 10,
      blacklistTTL: config.blacklistTTL || 86400000, // 24 hours
      alertThreshold: 5,
      rateLimit: config.rateLimit || {
        windowMs: 60000,
        maxRequests: 100,
        blockDuration: 300000 // 5 minutes
      }
    };

    // Start cleanup intervals
    this.blacklistCleanupInterval = setInterval(() => this.cleanupBlacklist(), 60000);
    this.usageCleanupInterval = setInterval(() => this.cleanupTokenUsage(), 300000);
    this.rateLimitCleanupInterval = setInterval(() => this.cleanupRateLimits(), 60000);

    // Log startup
    logger.info({
      useFastifyJWT: !!this.fastify,
      jwtMethod: this.fastify ? '@fastify/jwt' : 'jsonwebtoken'
    }, 'Enhanced WebSocketAuth service initialized');
  }

  /**
   * Validate JWT token with blacklist checking
   */
  async validateToken(token: string): Promise<AuthContext | null> {
    try {
      // First try to verify with local JWT secret
      logger.debug({
        jwtSecret: this.jwtSecret?.substring(0, 10) + '...',
        useFastifyJWT: !!this.fastify
      }, 'Attempting JWT verification');

      let payload: JWTPayload;

      if (this.fastify) {
        // Use Fastify JWT (matches signing library used in device auth)
        const decoded = await this.fastify.jwt.verify(token);
        payload = decoded as JWTPayload;
        logger.debug({ userId: payload.sub }, 'JWT verified with Fastify JWT');
      } else {
        // Fallback to plain jsonwebtoken
        const decoded = jwt.verify(token, this.jwtSecret, {
          complete: true
        }) as any;
        payload = decoded.payload as JWTPayload;
        logger.debug({ userId: payload.sub }, 'JWT verified with plain jsonwebtoken');
      }
      const tokenId = payload.jti || this.generateTokenId(token);

      logger.debug({ userId: payload.sub, email: payload.email }, 'JWT verification successful');

      // Check blacklist
      if (this.isTokenBlacklisted(tokenId)) {
        logger.warn({ tokenId, userId: payload.sub }, 'Token is blacklisted');
        this.emitSecurityEvent({
          type: 'token_blacklisted',
          tokenId,
          userId: payload.sub,
          timestamp: new Date()
        });
        return null;
      }

      // Check token expiration
      if (payload.exp && payload.exp < Date.now() / 1000) {
        logger.warn({ tokenId, userId: payload.sub, exp: payload.exp }, 'Token is expired');
        this.emitSecurityEvent({
          type: 'token_expired',
          tokenId,
          userId: payload.sub,
          timestamp: new Date()
        });
        return null;
      }

      // Track token usage
      this.trackTokenUsage(tokenId, payload.sub, payload.exp);

      // Generate session ID
      const sessionId = this.generateSessionId();

      // Register session
      this.registerSession(payload.sub, sessionId);

      const authContext: AuthContext = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        isAuthenticated: true,
        tokenId,
        sessionId,
        lastActivity: Date.now()
      };

      this.emitSecurityEvent({
        type: 'auth_success',
        userId: payload.sub,
        tokenId,
        sessionId,
        timestamp: new Date()
      });

      logger.info({ userId: payload.sub }, 'Token validated successfully');
      return authContext;

    } catch (localError) {
      logger.warn({ error: localError instanceof Error ? localError.message : localError }, 'Local JWT verification failed, trying Supabase');
      // If local verification fails and Supabase is configured, try Supabase
      if (this.supabase) {
        try {
          const { data: { user }, error } = await this.supabase.auth.getUser(token);

          if (error || !user) {
            this.emitSecurityEvent({
              type: 'auth_failure',
              details: { error: error?.message },
              timestamp: new Date()
            });
            return null;
          }

          const tokenId = this.generateTokenId(token);
          const sessionId = this.generateSessionId();

          this.registerSession(user.id, sessionId);

          return {
            userId: user.id,
            email: user.email,
            role: user.role,
            isAuthenticated: true,
            tokenId,
            sessionId,
            lastActivity: Date.now()
          };
        } catch (supabaseError) {
          this.emitSecurityEvent({
            type: 'auth_failure',
            details: { error: 'Supabase auth failed' },
            timestamp: new Date()
          });
          return null;
        }
      }

      this.emitSecurityEvent({
        type: 'auth_failure',
        details: { error: 'Token validation failed' },
        timestamp: new Date()
      });
      return null;
    }
  }

  /**
   * Blacklist a token
   */
  blacklistToken(tokenId: string, reason: string, duration?: number): void {
    const expiresAt = duration ? new Date(Date.now() + duration) : undefined;

    this.tokenBlacklist.set(tokenId, {
      tokenId,
      reason,
      blacklistedAt: new Date(),
      expiresAt
    });

    logger.warn({ tokenId, reason }, 'Token blacklisted');

    // Persist to database if available
    if (this.db) {
      this.db.query(
        `INSERT INTO token_blacklist (token_id, reason, blacklisted_at, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [tokenId, reason, new Date(), expiresAt]
      ).catch(err => logger.error({ err }, 'Failed to persist blacklist entry'));
    }
  }

  /**
   * Check if token is blacklisted
   */
  isTokenBlacklisted(tokenId: string): boolean {
    const entry = this.tokenBlacklist.get(tokenId);

    if (!entry) return false;

    // Check if blacklist entry has expired
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.tokenBlacklist.delete(tokenId);
      return false;
    }

    return true;
  }

  /**
   * Track token usage for analytics and anomaly detection
   */
  private trackTokenUsage(tokenId: string, userId: string, exp: number): void {
    const existing = this.tokenUsage.get(tokenId);

    if (existing) {
      existing.requestCount++;
      existing.lastUsed = new Date();

      // Check for suspicious usage patterns
      const requestsPerMinute = existing.requestCount /
        ((Date.now() - existing.createdAt.getTime()) / 60000);

      if (requestsPerMinute > 100) {
        this.detectSuspiciousActivity(userId, 'unusual_activity');
      }
    } else {
      this.tokenUsage.set(tokenId, {
        tokenId,
        userId,
        requestCount: 1,
        lastUsed: new Date(),
        createdAt: new Date(),
        expiresAt: new Date(exp * 1000)
      });
    }
  }

  /**
   * Detect and track suspicious activity patterns
   */
  private detectSuspiciousActivity(userId: string, type: SuspiciousPattern['type']): void {
    const patterns = this.suspiciousActivity.get(userId) || [];

    const existingPattern = patterns.find(p => p.type === type);

    if (existingPattern) {
      existingPattern.count++;
      existingPattern.lastSeen = new Date();

      // Check if threshold exceeded
      if (existingPattern.count >= this.config.suspiciousThreshold) {
        this.emitSecurityAlert(userId, type, existingPattern);
      }
    } else {
      patterns.push({
        type,
        count: 1,
        firstSeen: new Date(),
        lastSeen: new Date()
      });
    }

    this.suspiciousActivity.set(userId, patterns);
  }

  /**
   * Emit security alert for suspicious activity
   */
  private emitSecurityAlert(userId: string, type: string, pattern: SuspiciousPattern): void {
    const alert = {
      type: 'suspicious_activity' as const,
      userId,
      details: {
        patternType: type,
        occurrences: pattern.count,
        firstSeen: pattern.firstSeen,
        lastSeen: pattern.lastSeen
      },
      timestamp: new Date()
    };

    this.emitSecurityEvent(alert);

    logger.error({ alert }, 'SECURITY ALERT: Suspicious activity detected');

    // Auto-blacklist tokens if critical threshold reached
    if (pattern.count >= this.config.alertThreshold * 2) {
      const userTokens = Array.from(this.tokenUsage.values())
        .filter(t => t.userId === userId);

      userTokens.forEach(token => {
        this.blacklistToken(token.tokenId, `Suspicious activity: ${type}`, this.config.blacklistTTL);
      });

      // Invalidate all user sessions
      this.invalidateUserSessions(userId);
    }
  }

  /**
   * Enhanced rate limiting with blocking
   */
  checkRateLimit(userId: string, limit?: number, window?: number): boolean {
    const now = Date.now();
    const maxRequests = limit || this.config.rateLimit.maxRequests;
    const windowMs = window || this.config.rateLimit.windowMs;

    const userLimit = this.rateLimitMap.get(userId);

    if (!userLimit || userLimit.resetTime < now) {
      this.rateLimitMap.set(userId, {
        count: 1,
        resetTime: now + windowMs,
        blocked: false
      });
      return true;
    }

    // Check if user is blocked
    if (userLimit.blocked && userLimit.resetTime > now) {
      this.emitSecurityEvent({
        type: 'rate_limit_exceeded',
        userId,
        details: { blocked: true },
        timestamp: new Date()
      });
      return false;
    }

    if (userLimit.count >= maxRequests) {
      // Block user for configured duration
      userLimit.blocked = true;
      userLimit.resetTime = now + (this.config.rateLimit.blockDuration || 300000);

      this.emitSecurityEvent({
        type: 'rate_limit_exceeded',
        userId,
        details: {
          requests: userLimit.count,
          limit: maxRequests,
          blockedUntil: new Date(userLimit.resetTime)
        },
        timestamp: new Date()
      });

      // Track as suspicious activity
      this.detectSuspiciousActivity(userId, 'unusual_activity');

      return false;
    }

    userLimit.count++;
    return true;
  }

  /**
   * Register a new session
   */
  private registerSession(userId: string, sessionId: string): void {
    const sessions = this.activeSessions.get(userId) || new Set();

    // Check max sessions limit
    if (sessions.size >= this.config.maxSessionsPerUser) {
      // Revoke oldest session
      const oldestSession = sessions.values().next().value;
      sessions.delete(oldestSession);

      logger.info({ userId, sessionId: oldestSession }, 'Session limit reached, revoking oldest session');
    }

    sessions.add(sessionId);
    this.activeSessions.set(userId, sessions);
  }

  /**
   * Invalidate user sessions
   */
  invalidateUserSessions(userId: string): void {
    const sessions = this.activeSessions.get(userId);

    if (sessions) {
      sessions.forEach(sessionId => {
        this.emitSecurityEvent({
          type: 'session_invalidated',
          userId,
          sessionId,
          timestamp: new Date()
        });
      });

      this.activeSessions.delete(userId);
    }
  }

  /**
   * Check if session is valid
   */
  isSessionValid(userId: string, sessionId: string): boolean {
    const sessions = this.activeSessions.get(userId);
    return sessions ? sessions.has(sessionId) : false;
  }

  /**
   * Generate token ID for tracking
   */
  private generateTokenId(token: string): string {
    const hash = require('crypto').createHash('sha256');
    return hash.update(token).digest('hex').substring(0, 16);
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return require('crypto').randomBytes(16).toString('hex');
  }

  /**
   * Emit security event
   */
  private emitSecurityEvent(event: SecurityEvent): void {
    this.emit('security-event', event);

    // Log to audit log
    if (this.db) {
      this.db.query(
        `INSERT INTO security_audit_log (event_type, user_id, token_id, session_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [event.type, event.userId, event.tokenId, event.sessionId, JSON.stringify(event.details), event.timestamp]
      ).catch(err => logger.error({ err }, 'Failed to log security event'));
    }
  }

  /**
   * Get token usage statistics
   */
  getTokenUsageStats(userId?: string): TokenUsageStats[] {
    const stats = Array.from(this.tokenUsage.values());
    return userId ? stats.filter(s => s.userId === userId) : stats;
  }

  /**
   * Get suspicious activity report
   */
  getSuspiciousActivityReport(userId?: string): Map<string, SuspiciousPattern[]> {
    if (userId) {
      const patterns = this.suspiciousActivity.get(userId);
      return patterns ? new Map([[userId, patterns]]) : new Map();
    }
    return new Map(this.suspiciousActivity);
  }

  /**
   * Cleanup expired blacklist entries
   */
  private cleanupBlacklist(): void {
    const now = new Date();

    for (const [tokenId, entry] of this.tokenBlacklist.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.tokenBlacklist.delete(tokenId);
      }
    }
  }

  /**
   * Cleanup expired token usage entries
   */
  private cleanupTokenUsage(): void {
    const now = new Date();

    for (const [tokenId, usage] of this.tokenUsage.entries()) {
      if (usage.expiresAt < now) {
        this.tokenUsage.delete(tokenId);
      }
    }
  }

  /**
   * Cleanup expired rate limits
   */
  private cleanupRateLimits(): void {
    const now = Date.now();

    for (const [userId, limit] of this.rateLimitMap.entries()) {
      if (limit.resetTime < now && !limit.blocked) {
        this.rateLimitMap.delete(userId);
      }
    }
  }

  /**
   * Extract token from WebSocket upgrade request
   */
  extractToken(request: FastifyRequest): string | null {
    // Try Authorization header first
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) {
        return token;
      }
    }

    // Try query parameter (for browsers that don't support headers in WebSocket)
    const token = (request.query as any)?.token;
    if (token) {
      return token;
    }

    // Try cookie
    const cookies = request.headers.cookie;
    if (cookies) {
      const tokenCookie = cookies
        .split(';')
        .find(c => c.trim().startsWith('token='));

      if (tokenCookie) {
        return tokenCookie.split('=')[1];
      }
    }

    return null;
  }

  /**
   * Authenticate WebSocket connection
   */
  async authenticate(request: FastifyRequest): Promise<AuthContext | null> {
    const token = this.extractToken(request);

    if (!token) {
      return null;
    }

    return this.validateToken(token);
  }

  /**
   * Check if user has permission for a specific action
   */
  hasPermission(
    authContext: AuthContext,
    action: string,
    resource?: string
  ): boolean {
    // Check authentication
    if (!authContext.isAuthenticated) {
      this.emitSecurityEvent({
        type: 'permission_denied',
        userId: authContext.userId,
        details: { action, resource, reason: 'not_authenticated' },
        timestamp: new Date()
      });
      return false;
    }

    // Check session validity
    if (authContext.sessionId && !this.isSessionValid(authContext.userId, authContext.sessionId)) {
      this.emitSecurityEvent({
        type: 'permission_denied',
        userId: authContext.userId,
        sessionId: authContext.sessionId,
        details: { action, resource, reason: 'invalid_session' },
        timestamp: new Date()
      });
      return false;
    }

    // Admin role has all permissions
    if (authContext.role === 'admin') {
      return true;
    }

    // Check specific permissions based on action and resource
    switch (action) {
      case 'command:execute':
        // All authenticated users can execute commands
        return true;

      case 'agent:control':
        // All authenticated users can control agents in MVP
        return true;

      case 'system:emergency-stop':
        // Only admins can emergency stop (in production)
        return authContext.role === 'admin' || true; // MVP: all users

      default:
        this.emitSecurityEvent({
          type: 'permission_denied',
          userId: authContext.userId,
          details: { action, resource, reason: 'unknown_action' },
          timestamp: new Date()
        });
        return false;
    }
  }

  /**
   * Generate new access token with tracking
   */
  generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'jti'>): string {
    const jti = this.generateSessionId(); // Use session ID generator for JWT ID

    if (this.fastify) {
      // Use Fastify JWT (matches signing library used in device auth)
      return this.fastify.jwt.sign({
        ...payload,
        jti
      }, {
        expiresIn: '1h'
      });
    } else {
      // Fallback to plain jsonwebtoken
      return jwt.sign(
        {
          ...payload,
          jti,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
        },
        this.jwtSecret
      );
    }
  }

  /**
   * Generate new refresh token with tracking
   */
  generateRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'jti'>): string {
    const jti = this.generateSessionId();

    if (this.fastify) {
      // Use Fastify JWT (matches signing library used in device auth)
      return this.fastify.jwt.sign({
        ...payload,
        jti
      }, {
        expiresIn: '30d'
      });
    } else {
      // Fallback to plain jsonwebtoken
      return jwt.sign(
        {
          ...payload,
          jti,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
        },
        this.jwtSecret
      );
    }
  }

  /**
   * Verify refresh token
   */
  async verifyRefreshToken(refreshToken: string): Promise<JWTPayload | null> {
    try {
      // For Supabase
      if (this.supabase) {
        const { data: { session }, error } = await this.supabase.auth.refreshSession({
          refresh_token: refreshToken
        });

        if (error || !session) {
          return null;
        }

        return {
          sub: session.user.id,
          email: session.user.email,
          role: session.user.role,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(new Date(session.expires_at!).getTime() / 1000)
        };
      }

      // For local JWT
      let decoded: JWTPayload;

      if (this.fastify) {
        // Use Fastify JWT (matches signing library)
        decoded = await this.fastify.jwt.verify(refreshToken) as JWTPayload;
      } else {
        // Fallback to plain jsonwebtoken
        decoded = jwt.verify(refreshToken, this.jwtSecret) as JWTPayload;
      }

      // Check if refresh token is blacklisted
      if (decoded.jti && this.isTokenBlacklisted(decoded.jti)) {
        return null;
      }

      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    clearInterval(this.blacklistCleanupInterval);
    clearInterval(this.usageCleanupInterval);
    clearInterval(this.rateLimitCleanupInterval);

    this.removeAllListeners();

    logger.info('Enhanced WebSocketAuth service shut down');
  }
}

// Singleton instance - initialized lazily with Fastify instance for optimal JWT handling
let enhancedAuthInstance: EnhancedWebSocketAuth | null = null;

/**
 * Initialize the enhanced auth singleton with Fastify instance
 * This ensures tokens signed with @fastify/jwt can be verified correctly
 */
export function initializeEnhancedAuth(fastify: FastifyInstance): EnhancedWebSocketAuth {
  if (!enhancedAuthInstance) {
    enhancedAuthInstance = new EnhancedWebSocketAuth({
      fastify,
      jwtSecret: config.JWT_SECRET,
      supabaseUrl: config.SUPABASE_URL,
      supabaseAnonKey: config.SUPABASE_ANON_KEY
    });

    logger.info('Enhanced auth singleton initialized with Fastify JWT support');

    // Cleanup on process exit
    process.on('beforeExit', () => {
      enhancedAuthInstance?.shutdown();
    });
  }

  return enhancedAuthInstance;
}

/**
 * Get the enhanced auth singleton
 * @deprecated Use initializeEnhancedAuth() first to ensure Fastify JWT support
 */
export const getEnhancedAuth = (): EnhancedWebSocketAuth => {
  if (!enhancedAuthInstance) {
    // Fallback: create without Fastify instance (will use plain jsonwebtoken)
    logger.warn('Enhanced auth accessed before initialization - using plain jsonwebtoken fallback');
    enhancedAuthInstance = new EnhancedWebSocketAuth({
      jwtSecret: config.JWT_SECRET,
      supabaseUrl: config.SUPABASE_URL,
      supabaseAnonKey: config.SUPABASE_ANON_KEY
    });
  }

  return enhancedAuthInstance;
};

// Export singleton for backward compatibility
// Note: This will not have Fastify JWT support unless initialized via initializeEnhancedAuth()
export const enhancedAuth = getEnhancedAuth();