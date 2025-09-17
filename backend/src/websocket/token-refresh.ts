import { WebSocket } from 'ws';
import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';
import { wsAuth, AuthContext } from './auth.js';

export interface TokenRefreshConfig {
  refreshInterval?: number; // How often to check for token expiration (ms)
  refreshThreshold?: number; // Refresh when token expires in X seconds
  maxRefreshAttempts?: number; // Maximum refresh attempts before disconnect
}

export class TokenRefreshManager {
  private connections = new Map<WebSocket, {
    authContext: AuthContext;
    refreshTimer?: NodeJS.Timeout;
    refreshAttempts: number;
    lastRefresh: number;
  }>();

  private config: Required<TokenRefreshConfig>;

  constructor(config: TokenRefreshConfig = {}) {
    this.config = {
      refreshInterval: config.refreshInterval || 5 * 60 * 1000, // 5 minutes
      refreshThreshold: config.refreshThreshold || 5 * 60, // 5 minutes before expiry
      maxRefreshAttempts: config.maxRefreshAttempts || 3
    };
  }

  /**
   * Register a WebSocket connection for token refresh monitoring
   */
  register(socket: WebSocket, authContext: AuthContext): void {
    const connectionInfo = {
      authContext,
      refreshAttempts: 0,
      lastRefresh: Date.now()
    };

    this.connections.set(socket, connectionInfo);

    // Start refresh timer
    this.startRefreshTimer(socket);

    // Clean up on disconnect
    socket.on('close', () => {
      this.unregister(socket);
    });
  }

  /**
   * Unregister a WebSocket connection
   */
  unregister(socket: WebSocket): void {
    const conn = this.connections.get(socket);
    if (conn?.refreshTimer) {
      clearInterval(conn.refreshTimer);
    }
    this.connections.delete(socket);
  }

  /**
   * Start token refresh timer for a connection
   */
  private startRefreshTimer(socket: WebSocket): void {
    const conn = this.connections.get(socket);
    if (!conn) return;

    conn.refreshTimer = setInterval(async () => {
      await this.checkAndRefreshToken(socket);
    }, this.config.refreshInterval);
  }

  /**
   * Check if token needs refresh and refresh if necessary
   */
  private async checkAndRefreshToken(socket: WebSocket): Promise<boolean> {
    const conn = this.connections.get(socket);
    if (!conn) return false;

    try {
      // Send token refresh request to client
      const refreshRequest: WebSocketMessage = {
        type: 'auth:refresh-needed',
        timestamp: new Date().toISOString()
      };

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(refreshRequest));

        // Wait for client to respond with new token
        const refreshed = await this.waitForTokenRefresh(socket);

        if (refreshed) {
          conn.refreshAttempts = 0;
          conn.lastRefresh = Date.now();
          return true;
        }
      }

      // Increment attempts
      conn.refreshAttempts++;

      // Disconnect if max attempts reached
      if (conn.refreshAttempts >= this.config.maxRefreshAttempts) {
        this.disconnectExpiredToken(socket);
        return false;
      }

      return false;
    } catch (error) {
      // Token refresh error occurred
      return false;
    }
  }

  /**
   * Wait for client to send refreshed token
   */
  private waitForTokenRefresh(socket: WebSocket): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        socket.off('message', messageHandler);
        resolve(false);
      }, 30000); // 30 second timeout

      const messageHandler = async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage;

          if (message.type === 'auth:refresh-token') {
            const newToken = (message as any).token;
            const refreshToken = (message as any).refreshToken;

            if (newToken) {
              // Validate new token
              const authContext = await wsAuth.validateToken(newToken);

              if (authContext) {
                // Update connection auth context
                const conn = this.connections.get(socket);
                if (conn) {
                  conn.authContext = authContext;
                  (socket as any).authContext = authContext;
                }

                // Send confirmation
                const confirmMessage: WebSocketMessage = {
                  type: 'auth:refresh-success',
                  timestamp: new Date().toISOString()
                };
                socket.send(JSON.stringify(confirmMessage));

                clearTimeout(timeout);
                socket.off('message', messageHandler);
                resolve(true);
                return;
              }
            } else if (refreshToken) {
              // Handle refresh token flow
              const payload = await wsAuth.verifyRefreshToken(refreshToken);

              if (payload) {
                // Generate new access token
                const newAccessToken = wsAuth.generateAccessToken({
                  sub: payload.sub,
                  email: payload.email,
                  role: payload.role
                });

                // Send new token to client
                const tokenMessage: WebSocketMessage = {
                  type: 'auth:new-token',
                  token: newAccessToken,
                  timestamp: new Date().toISOString()
                } as any;

                socket.send(JSON.stringify(tokenMessage));

                // Update auth context
                const authContext = await wsAuth.validateToken(newAccessToken);
                if (authContext) {
                  const conn = this.connections.get(socket);
                  if (conn) {
                    conn.authContext = authContext;
                    (socket as any).authContext = authContext;
                  }
                }

                clearTimeout(timeout);
                socket.off('message', messageHandler);
                resolve(true);
                return;
              }
            }

            // Token refresh failed
            const failMessage: WebSocketMessage = {
              type: 'auth:refresh-failed',
              error: 'Invalid token provided',
              timestamp: new Date().toISOString()
            } as any;
            socket.send(JSON.stringify(failMessage));

            clearTimeout(timeout);
            socket.off('message', messageHandler);
            resolve(false);
          }
        } catch (error) {
          // Ignore non-JSON messages
        }
      };

      socket.on('message', messageHandler);
    });
  }

  /**
   * Disconnect socket with expired token
   */
  private disconnectExpiredToken(socket: WebSocket): void {
    const errorMessage: WebSocketMessage = {
      type: 'auth:token-expired',
      error: 'Authentication token expired and refresh failed',
      timestamp: new Date().toISOString()
    } as any;

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(errorMessage));
      socket.close(1008, 'Token expired');
    }

    this.unregister(socket);
  }

  /**
   * Handle in-band token refresh (during active connection)
   */
  async handleInBandRefresh(
    socket: WebSocket,
    message: WebSocketMessage
  ): Promise<void> {
    if (message.type !== 'auth:refresh-token') {
      return;
    }

    const conn = this.connections.get(socket);
    if (!conn) return;

    const refreshToken = (message as any).refreshToken;
    const newToken = (message as any).token;

    try {
      let authContext: AuthContext | null = null;

      if (newToken) {
        // Validate provided token
        authContext = await wsAuth.validateToken(newToken);
      } else if (refreshToken) {
        // Generate new token from refresh token
        const payload = await wsAuth.verifyRefreshToken(refreshToken);
        if (payload) {
          const accessToken = wsAuth.generateAccessToken({
            sub: payload.sub,
            email: payload.email,
            role: payload.role
          });

          authContext = await wsAuth.validateToken(accessToken);

          // Send new token to client
          const tokenMessage: WebSocketMessage = {
            type: 'auth:new-token',
            token: accessToken,
            timestamp: new Date().toISOString()
          } as any;
          socket.send(JSON.stringify(tokenMessage));
        }
      }

      if (authContext) {
        // Update connection auth context
        conn.authContext = authContext;
        (socket as any).authContext = authContext;
        conn.refreshAttempts = 0;
        conn.lastRefresh = Date.now();

        // Send success confirmation
        const successMessage: WebSocketMessage = {
          type: 'auth:refresh-success',
          timestamp: new Date().toISOString()
        };
        socket.send(JSON.stringify(successMessage));
      } else {
        // Send failure message
        const failMessage: WebSocketMessage = {
          type: 'auth:refresh-failed',
          error: 'Invalid refresh token',
          timestamp: new Date().toISOString()
        } as any;
        socket.send(JSON.stringify(failMessage));

        // Increment failure count
        conn.refreshAttempts++;
        if (conn.refreshAttempts >= this.config.maxRefreshAttempts) {
          this.disconnectExpiredToken(socket);
        }
      }
    } catch (error) {
      // In-band token refresh error occurred

      const errorMessage: WebSocketMessage = {
        type: 'auth:refresh-failed',
        error: 'Token refresh failed',
        timestamp: new Date().toISOString()
      } as any;
      socket.send(JSON.stringify(errorMessage));
    }
  }

  /**
   * Get connection auth status
   */
  getAuthStatus(socket: WebSocket): AuthContext | null {
    const conn = this.connections.get(socket);
    return conn?.authContext || null;
  }

  /**
   * Force refresh for a specific connection
   */
  async forceRefresh(socket: WebSocket): Promise<boolean> {
    return this.checkAndRefreshToken(socket);
  }

  /**
   * Get statistics for monitoring
   */
  getStats(): {
    totalConnections: number;
    pendingRefreshes: number;
    failedRefreshes: number;
  } {
    let pendingRefreshes = 0;
    let failedRefreshes = 0;

    for (const conn of this.connections.values()) {
      if (conn.refreshAttempts > 0 && conn.refreshAttempts < this.config.maxRefreshAttempts) {
        pendingRefreshes++;
      } else if (conn.refreshAttempts >= this.config.maxRefreshAttempts) {
        failedRefreshes++;
      }
    }

    return {
      totalConnections: this.connections.size,
      pendingRefreshes,
      failedRefreshes
    };
  }

  /**
   * Clean up all connections
   */
  cleanup(): void {
    for (const [socket, conn] of this.connections.entries()) {
      if (conn.refreshTimer) {
        clearInterval(conn.refreshTimer);
      }
    }
    this.connections.clear();
  }
}

// Export singleton instance
export const tokenRefreshManager = new TokenRefreshManager();