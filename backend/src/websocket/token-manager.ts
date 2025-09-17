/**
 * JWT Token Manager for WebSocket Connections
 * Handles token rotation and refresh without disconnecting clients
 */

import { FastifyInstance } from 'fastify';
import { EventEmitter } from 'events';
import { AuthService } from '../services/auth.service.js';
import { TokenRefreshPayload } from '../../../packages/agent-protocol/src/types.js';

export interface TokenManagerConfig {
  refreshThresholdMs: number;
  maxRefreshAttempts: number;
  refreshIntervalMs: number;
}

export interface TokenRecord {
  connectionId: string;
  userId?: string;
  agentId?: string;
  currentToken: string;
  refreshToken?: string;
  expiresAt: number;
  lastRefreshAt: number;
  refreshAttempts: number;
  isRefreshing: boolean;
}

export interface TokenStats {
  totalTokens: number;
  activeTokens: number;
  expiringSoon: number;
  refreshInProgress: number;
  refreshSuccessRate: number;
  averageTokenLifetime: number;
}

export class TokenManager extends EventEmitter {
  private tokens = new Map<string, TokenRecord>();
  private refreshTimer?: NodeJS.Timeout;
  private isRunning = false;
  private refreshHistory: { success: boolean; timestamp: number }[] = [];

  constructor(
    private server: FastifyInstance,
    private authService: AuthService,
    private config: TokenManagerConfig
  ) {
    super();
  }

  /**
   * Start token management
   */
  start(): void {
    if (this.isRunning) {
      this.server.log.warn('Token manager already running');
      return;
    }

    this.isRunning = true;
    this.startRefreshTimer();

    this.server.log.info({
      refreshThreshold: this.config.refreshThresholdMs,
      refreshInterval: this.config.refreshIntervalMs,
      maxAttempts: this.config.maxRefreshAttempts
    }, 'Token manager started');

    this.emit('started');
  }

  /**
   * Stop token management
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.stopRefreshTimer();
    this.tokens.clear();

    this.server.log.info('Token manager stopped');
    this.emit('stopped');
  }

  /**
   * Register token for management
   */
  registerToken(
    connectionId: string,
    token: string,
    expiresAt: number,
    refreshToken?: string,
    userId?: string,
    agentId?: string
  ): void {
    const tokenRecord: TokenRecord = {
      connectionId,
      userId,
      agentId,
      currentToken: token,
      refreshToken,
      expiresAt,
      lastRefreshAt: Date.now(),
      refreshAttempts: 0,
      isRefreshing: false
    };

    this.tokens.set(connectionId, tokenRecord);

    this.server.log.debug({
      connectionId,
      userId,
      agentId,
      expiresAt: new Date(expiresAt).toISOString()
    }, 'Token registered for management');

    this.emit('tokenRegistered', { connectionId, expiresAt });
  }

  /**
   * Unregister token
   */
  unregisterToken(connectionId: string): void {
    const token = this.tokens.get(connectionId);
    if (!token) {
      return;
    }

    this.tokens.delete(connectionId);

    this.server.log.debug({
      connectionId,
      userId: token.userId,
      agentId: token.agentId
    }, 'Token unregistered');

    this.emit('tokenUnregistered', { connectionId });
  }

  /**
   * Update token after successful refresh
   */
  updateToken(
    connectionId: string,
    newToken: string,
    expiresAt: number,
    refreshToken?: string
  ): void {
    const token = this.tokens.get(connectionId);
    if (!token) {
      this.server.log.warn({ connectionId }, 'Attempted to update non-existent token');
      return;
    }

    token.currentToken = newToken;
    token.expiresAt = expiresAt;
    token.lastRefreshAt = Date.now();
    token.refreshAttempts = 0;
    token.isRefreshing = false;

    if (refreshToken) {
      token.refreshToken = refreshToken;
    }

    this.server.log.debug({
      connectionId,
      newExpiresAt: new Date(expiresAt).toISOString()
    }, 'Token updated successfully');

    this.emit('tokenUpdated', { connectionId, expiresAt });
  }

  /**
   * Get token information
   */
  getToken(connectionId: string): TokenRecord | null {
    const token = this.tokens.get(connectionId);
    return token ? { ...token } : null;
  }

  /**
   * Check if token needs refresh
   */
  needsRefresh(connectionId: string): boolean {
    const token = this.tokens.get(connectionId);
    if (!token) {
      return false;
    }

    const now = Date.now();
    const timeUntilExpiry = token.expiresAt - now;

    return timeUntilExpiry <= this.config.refreshThresholdMs;
  }

  /**
   * Check if token is expired
   */
  isExpired(connectionId: string): boolean {
    const token = this.tokens.get(connectionId);
    if (!token) {
      return true;
    }

    return Date.now() >= token.expiresAt;
  }

  /**
   * Get tokens expiring soon
   */
  getExpiringSoon(): TokenRecord[] {
    const now = Date.now();
    const expiring: TokenRecord[] = [];

    for (const token of this.tokens.values()) {
      const timeUntilExpiry = token.expiresAt - now;
      if (timeUntilExpiry <= this.config.refreshThresholdMs && timeUntilExpiry > 0) {
        expiring.push({ ...token });
      }
    }

    return expiring;
  }

  /**
   * Get expired tokens
   */
  getExpiredTokens(): TokenRecord[] {
    const now = Date.now();
    const expired: TokenRecord[] = [];

    for (const token of this.tokens.values()) {
      if (token.expiresAt <= now) {
        expired.push({ ...token });
      }
    }

    return expired;
  }

  /**
   * Force refresh token
   */
  async refreshToken(connectionId: string): Promise<boolean> {
    const token = this.tokens.get(connectionId);
    if (!token) {
      this.server.log.warn({ connectionId }, 'Attempted to refresh non-existent token');
      return false;
    }

    if (token.isRefreshing) {
      this.server.log.debug({ connectionId }, 'Token refresh already in progress');
      return false;
    }

    if (token.refreshAttempts >= this.config.maxRefreshAttempts) {
      this.server.log.error({
        connectionId,
        attempts: token.refreshAttempts
      }, 'Token refresh failed - max attempts reached');

      this.emit('tokenRefreshFailed', {
        connectionId,
        reason: 'max_attempts_reached'
      });

      return false;
    }

    token.isRefreshing = true;
    token.refreshAttempts++;

    try {
      this.server.log.debug({
        connectionId,
        attempt: token.refreshAttempts
      }, 'Attempting token refresh');

      // Attempt to refresh token
      const refreshResult = await this.performTokenRefresh(token);

      if (refreshResult) {
        // Update token record
        this.updateToken(
          connectionId,
          refreshResult.accessToken,
          Date.now() + (refreshResult.expiresIn * 1000),
          refreshResult.refreshToken
        );

        // Record success
        this.recordRefreshResult(true);

        // Emit refresh success
        this.emit('tokenRefreshed', {
          connectionId,
          token: {
            accessToken: refreshResult.accessToken,
            expiresIn: refreshResult.expiresIn,
            refreshToken: refreshResult.refreshToken
          }
        });

        this.server.log.info({
          connectionId,
          userId: token.userId,
          agentId: token.agentId
        }, 'Token refreshed successfully');

        return true;
      } else {
        throw new Error('Refresh returned null result');
      }

    } catch (error) {
      token.isRefreshing = false;

      this.server.log.error({
        error,
        connectionId,
        attempt: token.refreshAttempts
      }, 'Token refresh failed');

      // Record failure
      this.recordRefreshResult(false);

      // Emit refresh failure
      this.emit('tokenRefreshFailed', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        attempt: token.refreshAttempts
      });

      return false;
    }
  }

  /**
   * Perform actual token refresh
   */
  private async performTokenRefresh(token: TokenRecord): Promise<TokenRefreshPayload | null> {
    try {
      if (!token.refreshToken) {
        // If no refresh token, try to generate new one using current token
        const result = await this.authService.refreshToken(token.currentToken);
        return result;
      }

      // Use refresh token to get new access token
      const result = await this.authService.refreshTokenWithRefreshToken(token.refreshToken);
      return result;

    } catch (error) {
      this.server.log.error({
        error,
        connectionId: token.connectionId,
        hasRefreshToken: !!token.refreshToken
      }, 'Failed to perform token refresh');

      throw error;
    }
  }

  /**
   * Get token statistics
   */
  getStats(): TokenStats {
    const now = Date.now();
    let activeTokens = 0;
    let expiringSoon = 0;
    let refreshInProgress = 0;
    let totalLifetime = 0;

    for (const token of this.tokens.values()) {
      if (token.expiresAt > now) {
        activeTokens++;

        if (token.expiresAt - now <= this.config.refreshThresholdMs) {
          expiringSoon++;
        }
      }

      if (token.isRefreshing) {
        refreshInProgress++;
      }

      totalLifetime += (token.expiresAt - token.lastRefreshAt);
    }

    // Calculate success rate from recent history
    const recentHistory = this.refreshHistory.slice(-100);
    const successCount = recentHistory.filter(r => r.success).length;
    const refreshSuccessRate = recentHistory.length > 0 ?
      (successCount / recentHistory.length) * 100 : 100;

    return {
      totalTokens: this.tokens.size,
      activeTokens,
      expiringSoon,
      refreshInProgress,
      refreshSuccessRate,
      averageTokenLifetime: this.tokens.size > 0 ? totalLifetime / this.tokens.size : 0
    };
  }

  /**
   * Clean up expired tokens
   */
  cleanupExpiredTokens(): number {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [connectionId, token] of this.tokens.entries()) {
      // Remove tokens that have been expired for more than 1 hour
      if (token.expiresAt < now - 3600000) {
        toRemove.push(connectionId);
      }
    }

    toRemove.forEach(connectionId => {
      this.tokens.delete(connectionId);
    });

    if (toRemove.length > 0) {
      this.server.log.info({ removedCount: toRemove.length }, 'Cleaned up expired tokens');
    }

    return toRemove.length;
  }

  /**
   * Force refresh all expiring tokens
   */
  async refreshExpiring(): Promise<void> {
    const expiring = this.getExpiringSoon();

    this.server.log.debug({ count: expiring.length }, 'Refreshing expiring tokens');

    // Refresh tokens in batches to avoid overwhelming the auth service
    const batchSize = 5;
    for (let i = 0; i < expiring.length; i += batchSize) {
      const batch = expiring.slice(i, i + batchSize);
      const refreshPromises = batch.map(token =>
        this.refreshToken(token.connectionId).catch(error => {
          this.server.log.error({
            error,
            connectionId: token.connectionId
          }, 'Batch token refresh failed');
        })
      );

      await Promise.all(refreshPromises);

      // Small delay between batches
      if (i + batchSize < expiring.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Start refresh timer
   */
  private startRefreshTimer(): void {
    this.refreshTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.processRefreshCycle();
      }
    }, this.config.refreshIntervalMs);
  }

  /**
   * Stop refresh timer
   */
  private stopRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /**
   * Process refresh cycle
   */
  private async processRefreshCycle(): Promise<void> {
    try {
      // Clean up old tokens
      this.cleanupExpiredTokens();

      // Refresh expiring tokens
      await this.refreshExpiring();

      // Update statistics
      this.emit('refreshCycle', { stats: this.getStats() });

    } catch (error) {
      this.server.log.error({ error }, 'Error during token refresh cycle');
    }
  }

  /**
   * Record refresh result for statistics
   */
  private recordRefreshResult(success: boolean): void {
    this.refreshHistory.push({
      success,
      timestamp: Date.now()
    });

    // Keep only recent history (last 24 hours)
    const cutoff = Date.now() - 86400000; // 24 hours
    this.refreshHistory = this.refreshHistory.filter(r => r.timestamp > cutoff);
  }

  /**
   * Get token health report
   */
  getHealthReport(): {
    connectionId: string;
    userId?: string;
    agentId?: string;
    timeUntilExpiry: number;
    isExpired: boolean;
    needsRefresh: boolean;
    isRefreshing: boolean;
    refreshAttempts: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  }[] {
    const now = Date.now();
    const report: any[] = [];

    for (const token of this.tokens.values()) {
      const timeUntilExpiry = token.expiresAt - now;
      const isExpired = timeUntilExpiry <= 0;
      const needsRefresh = timeUntilExpiry <= this.config.refreshThresholdMs;

      let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

      if (isExpired) {
        riskLevel = 'critical';
      } else if (needsRefresh && token.refreshAttempts >= this.config.maxRefreshAttempts) {
        riskLevel = 'critical';
      } else if (needsRefresh && token.refreshAttempts > 1) {
        riskLevel = 'high';
      } else if (needsRefresh) {
        riskLevel = 'medium';
      }

      report.push({
        connectionId: token.connectionId,
        userId: token.userId,
        agentId: token.agentId,
        timeUntilExpiry,
        isExpired,
        needsRefresh,
        isRefreshing: token.isRefreshing,
        refreshAttempts: token.refreshAttempts,
        riskLevel
      });
    }

    return report;
  }
}