import { FastifyRequest, FastifyReply } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';

export interface JWTPayload {
  sub: string;
  email?: string;
  role?: string;
  iat: number;
  exp: number;
  aud?: string;
  iss?: string;
}

export interface AuthContext {
  userId: string;
  email?: string;
  role?: string;
  isAuthenticated: boolean;
}

export class WebSocketAuth {
  private readonly jwtSecret: string;
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;
  private supabase: any;

  constructor(config: {
    jwtSecret?: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  }) {
    this.jwtSecret = config.jwtSecret || process.env['JWT_SECRET'] || 'dev-secret';
    this.supabaseUrl = config.supabaseUrl || process.env['SUPABASE_URL'] || '';
    this.supabaseAnonKey = config.supabaseAnonKey || process.env['SUPABASE_ANON_KEY'] || '';

    if (this.supabaseUrl && this.supabaseAnonKey) {
      this.supabase = createClient(this.supabaseUrl, this.supabaseAnonKey);
    }
  }

  /**
   * Validate JWT token from WebSocket connection
   */
  async validateToken(token: string): Promise<AuthContext | null> {
    try {
      // First try to verify with local JWT secret
      const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;

      // Check token expiration
      if (decoded.exp && decoded.exp < Date.now() / 1000) {
        return null;
      }

      return {
        userId: decoded.sub,
        email: decoded.email,
        role: decoded.role,
        isAuthenticated: true
      };
    } catch (localError) {
      // If local verification fails and Supabase is configured, try Supabase
      if (this.supabase) {
        try {
          const { data: { user }, error } = await this.supabase.auth.getUser(token);

          if (error || !user) {
            return null;
          }

          return {
            userId: user.id,
            email: user.email,
            role: user.role,
            isAuthenticated: true
          };
        } catch (supabaseError) {
          // Supabase authentication error
          return null;
        }
      }

      return null;
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
   * Middleware for WebSocket routes
   */
  async websocketAuth(
    connection: SocketStream,
    request: FastifyRequest
  ): Promise<boolean> {
    const authContext = await this.authenticate(request);

    if (!authContext) {
      connection.socket.close(1008, 'Unauthorized');
      return false;
    }

    // Attach auth context to socket for later use
    (connection.socket as any).authContext = authContext;

    return true;
  }

  /**
   * Verify token refresh request
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

      // For local JWT (you'd typically store refresh tokens in a database)
      const decoded = jwt.verify(refreshToken, this.jwtSecret) as JWTPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate new access token
   */
  generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(
      {
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
      },
      this.jwtSecret
    );
  }

  /**
   * Generate new refresh token
   */
  generateRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(
      {
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
      },
      this.jwtSecret
    );
  }

  /**
   * Check if a message requires authentication
   */
  requiresAuth(message: WebSocketMessage): boolean {
    // Public message types that don't require auth
    const publicTypes = [
      'heartbeat:ping',
      'heartbeat:pong',
      'connection:error'
    ];

    return !publicTypes.includes(message.type);
  }

  /**
   * Check if user has permission for a specific action
   */
  hasPermission(
    authContext: AuthContext,
    action: string,
    resource?: string
  ): boolean {
    // In MVP, all authenticated users have all permissions
    // In production, implement proper RBAC
    if (!authContext.isAuthenticated) {
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
        return false;
    }
  }

  /**
   * Rate limit check (basic implementation)
   */
  private rateLimitMap = new Map<string, { count: number; resetTime: number }>();

  checkRateLimit(userId: string, limit: number = 100, window: number = 60000): boolean {
    const now = Date.now();
    const userLimit = this.rateLimitMap.get(userId);

    if (!userLimit || userLimit.resetTime < now) {
      this.rateLimitMap.set(userId, {
        count: 1,
        resetTime: now + window
      });
      return true;
    }

    if (userLimit.count >= limit) {
      return false;
    }

    userLimit.count++;
    return true;
  }

  /**
   * Clean up expired rate limit entries
   */
  cleanupRateLimits(): void {
    const now = Date.now();
    for (const [userId, limit] of this.rateLimitMap.entries()) {
      if (limit.resetTime < now) {
        this.rateLimitMap.delete(userId);
      }
    }
  }
}

// Export singleton instance
export const wsAuth = new WebSocketAuth({
  jwtSecret: process.env['JWT_SECRET'],
  supabaseUrl: process.env['SUPABASE_URL'],
  supabaseAnonKey: process.env['SUPABASE_ANON_KEY']
});

// Cleanup interval
setInterval(() => {
  wsAuth.cleanupRateLimits();
}, 60000); // Clean up every minute