import { WebSocket } from 'ws';
import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';

export interface RateLimitConfig {
  // Global limits
  globalRequestsPerMinute?: number;
  globalRequestsPerHour?: number;

  // Per-connection limits
  messagesPerMinute?: number;
  messagesPerHour?: number;
  burstLimit?: number; // Max messages in a burst
  burstWindow?: number; // Burst window in ms

  // Per-message-type limits
  messageTypeLimits?: Record<string, {
    perMinute?: number;
    perHour?: number;
  }>;

  // Penalties
  violationPenalty?: number; // Penalty duration in ms
  maxViolations?: number; // Max violations before disconnect
}

interface RateLimitState {
  // Message counts
  minuteCount: number;
  hourCount: number;
  minuteReset: number;
  hourReset: number;

  // Burst tracking
  burstCount: number;
  burstReset: number;

  // Per-type counts
  typeCounts: Map<string, {
    minuteCount: number;
    hourCount: number;
    minuteReset: number;
    hourReset: number;
  }>;

  // Violations
  violations: number;
  penaltyUntil: number;
}

export class WebSocketRateLimiter {
  private config: Required<RateLimitConfig>;
  private connectionStates = new Map<WebSocket, RateLimitState>();
  private globalState: {
    requestsThisMinute: number;
    requestsThisHour: number;
    minuteReset: number;
    hourReset: number;
  };

  constructor(config: RateLimitConfig = {}) {
    // Use more permissive limits for development
    const isDevelopment = process.env['NODE_ENV'] === 'development' || !process.env['NODE_ENV'];

    this.config = {
      globalRequestsPerMinute: config.globalRequestsPerMinute || (isDevelopment ? 50000 : 10000),
      globalRequestsPerHour: config.globalRequestsPerHour || (isDevelopment ? 500000 : 100000),
      messagesPerMinute: config.messagesPerMinute || (isDevelopment ? 1000 : 100),
      messagesPerHour: config.messagesPerHour || (isDevelopment ? 10000 : 1000),
      burstLimit: config.burstLimit || (isDevelopment ? 50 : 10),
      burstWindow: config.burstWindow || 1000,
      messageTypeLimits: config.messageTypeLimits || {
        'command:request': { perMinute: isDevelopment ? 100 : 10, perHour: isDevelopment ? 1000 : 100 },
        'terminal:output': { perMinute: isDevelopment ? 5000 : 1000, perHour: isDevelopment ? 50000 : 10000 },
        'heartbeat:ping': { perMinute: 60, perHour: 3600 }
      },
      violationPenalty: config.violationPenalty || (isDevelopment ? 5000 : 60000), // 5 seconds in dev, 1 minute in prod
      maxViolations: config.maxViolations || (isDevelopment ? 10 : 5)
    };

    // Initialize global state
    const now = Date.now();
    this.globalState = {
      requestsThisMinute: 0,
      requestsThisHour: 0,
      minuteReset: now + 60000,
      hourReset: now + 3600000
    };

    // Clean up expired states periodically
    setInterval(() => this.cleanup(), 60000);

    // Log rate limiting mode
    // TEMP DISABLED FOR COMMAND FORWARDING DEBUG
    // if (isDevelopment) {
    //   console.log('[RateLimiter] Running in development mode with relaxed rate limits');
    // }
  }

  /**
   * Register a new WebSocket connection
   */
  register(socket: WebSocket): void {
    const now = Date.now();
    this.connectionStates.set(socket, {
      minuteCount: 0,
      hourCount: 0,
      minuteReset: now + 60000,
      hourReset: now + 3600000,
      burstCount: 0,
      burstReset: now + this.config.burstWindow,
      typeCounts: new Map(),
      violations: 0,
      penaltyUntil: 0
    });

    // Clean up on disconnect
    socket.on('close', () => {
      this.unregister(socket);
    });
  }

  /**
   * Unregister a WebSocket connection
   */
  unregister(socket: WebSocket): void {
    this.connectionStates.delete(socket);
  }

  /**
   * Check if a message is allowed under rate limits
   */
  async checkLimit(socket: WebSocket, message: WebSocketMessage): Promise<{
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  }> {
    const state = this.connectionStates.get(socket);
    if (!state) {
      return { allowed: false, reason: 'Connection not registered' };
    }

    const now = Date.now();

    // Check if in penalty period
    if (state.penaltyUntil > now) {
      return {
        allowed: false,
        reason: 'Rate limit penalty in effect',
        retryAfter: Math.ceil((state.penaltyUntil - now) / 1000)
      };
    }

    // Reset counters if needed
    this.resetCounters(state, now);
    this.resetGlobalCounters(now);

    // Check global limits
    if (!this.checkGlobalLimits()) {
      return {
        allowed: false,
        reason: 'Global rate limit exceeded',
        retryAfter: 60
      };
    }

    // Check burst limit
    if (!this.checkBurstLimit(state, now)) {
      this.recordViolation(socket, state, now);
      return {
        allowed: false,
        reason: 'Burst limit exceeded',
        retryAfter: Math.ceil((state.burstReset - now) / 1000)
      };
    }

    // Check per-minute limit
    if (state.minuteCount >= this.config.messagesPerMinute) {
      this.recordViolation(socket, state, now);
      return {
        allowed: false,
        reason: 'Per-minute message limit exceeded',
        retryAfter: Math.ceil((state.minuteReset - now) / 1000)
      };
    }

    // Check per-hour limit
    if (state.hourCount >= this.config.messagesPerHour) {
      this.recordViolation(socket, state, now);
      return {
        allowed: false,
        reason: 'Per-hour message limit exceeded',
        retryAfter: Math.ceil((state.hourReset - now) / 1000)
      };
    }

    // Check per-message-type limits
    const typeLimit = this.checkMessageTypeLimit(state, message.type, now);
    if (!typeLimit.allowed) {
      this.recordViolation(socket, state, now);
      return typeLimit;
    }

    // Update counters
    this.incrementCounters(state, message.type, now);
    this.incrementGlobalCounters();

    return { allowed: true };
  }

  /**
   * Reset expired counters
   */
  private resetCounters(state: RateLimitState, now: number): void {
    if (now >= state.minuteReset) {
      state.minuteCount = 0;
      state.minuteReset = now + 60000;
    }

    if (now >= state.hourReset) {
      state.hourCount = 0;
      state.hourReset = now + 3600000;
    }

    if (now >= state.burstReset) {
      state.burstCount = 0;
      state.burstReset = now + this.config.burstWindow;
    }

    // Reset per-type counters
    for (const [type, counts] of state.typeCounts.entries()) {
      if (now >= counts.minuteReset) {
        counts.minuteCount = 0;
        counts.minuteReset = now + 60000;
      }
      if (now >= counts.hourReset) {
        counts.hourCount = 0;
        counts.hourReset = now + 3600000;
      }
    }
  }

  /**
   * Reset global counters
   */
  private resetGlobalCounters(now: number): void {
    if (now >= this.globalState.minuteReset) {
      this.globalState.requestsThisMinute = 0;
      this.globalState.minuteReset = now + 60000;
    }

    if (now >= this.globalState.hourReset) {
      this.globalState.requestsThisHour = 0;
      this.globalState.hourReset = now + 3600000;
    }
  }

  /**
   * Check global rate limits
   */
  private checkGlobalLimits(): boolean {
    return (
      this.globalState.requestsThisMinute < this.config.globalRequestsPerMinute &&
      this.globalState.requestsThisHour < this.config.globalRequestsPerHour
    );
  }

  /**
   * Check burst limit
   */
  private checkBurstLimit(state: RateLimitState, now: number): boolean {
    if (now >= state.burstReset) {
      state.burstCount = 0;
      state.burstReset = now + this.config.burstWindow;
    }
    return state.burstCount < this.config.burstLimit;
  }

  /**
   * Check per-message-type limits
   */
  private checkMessageTypeLimit(
    state: RateLimitState,
    messageType: string,
    now: number
  ): { allowed: boolean; reason?: string; retryAfter?: number } {
    const typeLimit = this.config.messageTypeLimits[messageType];
    if (!typeLimit) {
      return { allowed: true };
    }

    let typeState = state.typeCounts.get(messageType);
    if (!typeState) {
      typeState = {
        minuteCount: 0,
        hourCount: 0,
        minuteReset: now + 60000,
        hourReset: now + 3600000
      };
      state.typeCounts.set(messageType, typeState);
    }

    if (typeLimit.perMinute && typeState.minuteCount >= typeLimit.perMinute) {
      return {
        allowed: false,
        reason: `Per-minute limit for ${messageType} exceeded`,
        retryAfter: Math.ceil((typeState.minuteReset - now) / 1000)
      };
    }

    if (typeLimit.perHour && typeState.hourCount >= typeLimit.perHour) {
      return {
        allowed: false,
        reason: `Per-hour limit for ${messageType} exceeded`,
        retryAfter: Math.ceil((typeState.hourReset - now) / 1000)
      };
    }

    return { allowed: true };
  }

  /**
   * Increment counters after allowing a message
   */
  private incrementCounters(state: RateLimitState, messageType: string, now: number): void {
    state.minuteCount++;
    state.hourCount++;
    state.burstCount++;

    // Increment type-specific counters
    let typeState = state.typeCounts.get(messageType);
    if (!typeState) {
      typeState = {
        minuteCount: 0,
        hourCount: 0,
        minuteReset: now + 60000,
        hourReset: now + 3600000
      };
      state.typeCounts.set(messageType, typeState);
    }
    typeState.minuteCount++;
    typeState.hourCount++;
  }

  /**
   * Increment global counters
   */
  private incrementGlobalCounters(): void {
    this.globalState.requestsThisMinute++;
    this.globalState.requestsThisHour++;
  }

  /**
   * Record a rate limit violation
   */
  private recordViolation(socket: WebSocket, state: RateLimitState, now: number): void {
    state.violations++;

    // Apply penalty
    state.penaltyUntil = now + this.config.violationPenalty;

    // Disconnect if max violations reached
    if (state.violations >= this.config.maxViolations) {
      this.disconnectForViolation(socket);
    }
  }

  /**
   * Disconnect a socket for rate limit violations
   */
  private disconnectForViolation(socket: WebSocket): void {
    const errorMessage: WebSocketMessage = {
      type: 'connection:error',
      error: 'Rate limit exceeded. Too many violations.',
      timestamp: new Date().toISOString()
    } as any;

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(errorMessage));
      socket.close(1008, 'Rate limit exceeded');
    }

    this.unregister(socket);
  }

  /**
   * Get rate limit status for a connection
   */
  getStatus(socket: WebSocket): {
    limits: {
      perMinute: { used: number; limit: number };
      perHour: { used: number; limit: number };
      burst: { used: number; limit: number };
    };
    violations: number;
    penaltyUntil?: number;
  } | null {
    const state = this.connectionStates.get(socket);
    if (!state) return null;

    return {
      limits: {
        perMinute: {
          used: state.minuteCount,
          limit: this.config.messagesPerMinute
        },
        perHour: {
          used: state.hourCount,
          limit: this.config.messagesPerHour
        },
        burst: {
          used: state.burstCount,
          limit: this.config.burstLimit
        }
      },
      violations: state.violations,
      penaltyUntil: state.penaltyUntil > Date.now() ? state.penaltyUntil : undefined
    };
  }

  /**
   * Clean up expired connection states
   */
  private cleanup(): void {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    for (const [socket, state] of this.connectionStates.entries()) {
      // Remove closed connections
      if (socket.readyState === WebSocket.CLOSED) {
        this.connectionStates.delete(socket);
        continue;
      }

      // Clean up old type counts
      for (const [type, counts] of state.typeCounts.entries()) {
        if (counts.hourReset < oneHourAgo) {
          state.typeCounts.delete(type);
        }
      }
    }
  }

  /**
   * Get global statistics
   */
  getGlobalStats(): {
    connections: number;
    globalRequests: {
      perMinute: number;
      perHour: number;
    };
    violations: number;
  } {
    let totalViolations = 0;
    for (const state of this.connectionStates.values()) {
      totalViolations += state.violations;
    }

    return {
      connections: this.connectionStates.size,
      globalRequests: {
        perMinute: this.globalState.requestsThisMinute,
        perHour: this.globalState.requestsThisHour
      },
      violations: totalViolations
    };
  }
}

// Export singleton instance
export const rateLimiter = new WebSocketRateLimiter();