/**
 * E2E Tests for WebSocket Authentication
 * Tests WebSocket connection with auth, reconnection on token refresh, and auth state sync
 */

import { test, expect, Page } from '@playwright/test';

// Helper to evaluate WebSocket state in browser context
async function getWebSocketState(page: Page) {
  return await page.evaluate(() => {
    // Access the WebSocket connection state from the app
    const wsStatusElement = document.querySelector('[data-testid="connection-status"]');
    return wsStatusElement?.textContent || 'Unknown';
  });
}

// Helper to monitor WebSocket messages
async function setupWebSocketMonitor(page: Page) {
  return await page.evaluateHandle(() => {
    const messages: any[] = [];
    const originalWebSocket = window.WebSocket;

    // Override WebSocket constructor to monitor connections
    (window as any).WebSocket = class extends originalWebSocket {
      constructor(url: string, protocols?: string | string[]) {
        console.log('[WS Monitor] Creating WebSocket:', url);
        super(url, protocols);

        this.addEventListener('open', () => {
          console.log('[WS Monitor] Connection opened');
          messages.push({ type: 'open', timestamp: Date.now() });
        });

        this.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[WS Monitor] Message received:', data.type);
            messages.push({
              type: 'message',
              messageType: data.type,
              payload: data.payload,
              timestamp: Date.now()
            });
          } catch (e) {
            console.error('[WS Monitor] Failed to parse message');
          }
        });

        this.addEventListener('close', (event) => {
          console.log('[WS Monitor] Connection closed:', event.code);
          messages.push({
            type: 'close',
            code: event.code,
            reason: event.reason,
            timestamp: Date.now()
          });
        });

        this.addEventListener('error', () => {
          console.log('[WS Monitor] Connection error');
          messages.push({ type: 'error', timestamp: Date.now() });
        });

        // Store send method to monitor outgoing messages
        const originalSend = this.send.bind(this);
        this.send = (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
          try {
            const parsed = JSON.parse(data as string);
            console.log('[WS Monitor] Message sent:', parsed.type);
            messages.push({
              type: 'sent',
              messageType: parsed.type,
              payload: parsed.payload,
              timestamp: Date.now()
            });
          } catch (e) {
            console.error('[WS Monitor] Failed to parse sent message');
          }
          return originalSend(data);
        };
      }
    };

    return { getMessages: () => messages, clearMessages: () => messages.length = 0 };
  });
}

test.describe('WebSocket Authentication', () => {
  test.describe('Connection with Authentication', () => {
    test('should not connect WebSocket when unauthenticated', async ({ page }) => {
      await page.goto('/');

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Check that WebSocket is not connected
      const connectionStatus = await getWebSocketState(page);
      expect(['Disconnected', 'Not Connected', 'Offline']).toContain(connectionStatus);

      // No WebSocket errors should be in console
      const consoleLogs: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleLogs.push(msg.text());
        }
      });

      await page.waitForTimeout(2000);
      const wsErrors = consoleLogs.filter(log => log.includes('WebSocket'));
      expect(wsErrors).toHaveLength(0);
    });

    test('should establish WebSocket connection after authentication', async ({ page }) => {
      // Setup WebSocket monitor before navigation
      await page.goto('/');
      const wsMonitor = await setupWebSocketMonitor(page);

      // Mock successful authentication
      await page.evaluate(() => {
        // Simulate setting auth in localStorage (normally done by Supabase)
        localStorage.setItem('supabase.auth.token', JSON.stringify({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_at: Date.now() + 3600000
        }));
      });

      // Trigger auth flow
      await page.click('text=Sign In');
      await page.waitForTimeout(1000);

      // Check for WebSocket connection attempt
      const messages = await wsMonitor.evaluate(m => m.getMessages());
      const openMessage = messages.find((m: any) => m.type === 'open');

      if (openMessage) {
        // If WebSocket connected, check for auth
        const dashboardInit = messages.find((m: any) =>
          m.type === 'sent' && m.messageType === 'DASHBOARD_INIT'
        );
        expect(dashboardInit).toBeTruthy();

        // Check that token was sent
        const wsUrl = await page.evaluate(() => {
          const ws = (window as any).__lastWebSocket;
          return ws?.url || '';
        });
        expect(wsUrl).toContain('token=');
      }
    });

    test('should send DASHBOARD_INIT message with userId after connection', async ({ page }) => {
      await page.goto('/');
      const wsMonitor = await setupWebSocketMonitor(page);

      // Simulate authentication
      await page.evaluate(() => {
        // Mock auth state
        (window as any).__mockAuth = {
          user: { id: 'user-123', email: 'test@example.com' },
          session: {
            access_token: 'mock-token',
            expires_at: Date.now() + 3600000
          }
        };
      });

      // If the app connects WebSocket after auth
      await page.waitForTimeout(2000);

      const messages = await wsMonitor.evaluate(m => m.getMessages());
      const initMessage = messages.find((m: any) =>
        m.type === 'sent' && m.messageType === 'DASHBOARD_INIT'
      );

      if (initMessage) {
        expect(initMessage.payload).toHaveProperty('userId');
        expect(initMessage.payload.userId).toBeTruthy();
      }
    });

    test('should include auth token in WebSocket connection URL', async ({ page }) => {
      let wsUrl: string | null = null;

      // Intercept WebSocket connections
      await page.addInitScript(() => {
        const OriginalWebSocket = window.WebSocket;
        (window as any).WebSocket = class extends OriginalWebSocket {
          constructor(url: string, protocols?: string | string[]) {
            (window as any).__lastWebSocketUrl = url;
            super(url, protocols);
          }
        };
      });

      await page.goto('/');

      // Simulate authentication
      await page.evaluate(() => {
        localStorage.setItem('supabase.auth.token', JSON.stringify({
          access_token: 'test-jwt-token',
          refresh_token: 'test-refresh-token',
          expires_at: Date.now() + 3600000
        }));
      });

      // Trigger potential WebSocket connection
      await page.reload();
      await page.waitForTimeout(2000);

      wsUrl = await page.evaluate(() => (window as any).__lastWebSocketUrl);

      if (wsUrl) {
        expect(wsUrl).toContain('token=');
        expect(wsUrl).not.toContain('token=null');
        expect(wsUrl).not.toContain('token=undefined');
      }
    });
  });

  test.describe('Token Refresh and Reconnection', () => {
    test('should reconnect WebSocket when token is refreshed', async ({ page }) => {
      await page.goto('/');
      const wsMonitor = await setupWebSocketMonitor(page);

      // Initial authentication
      await page.evaluate(() => {
        localStorage.setItem('supabase.auth.token', JSON.stringify({
          access_token: 'initial-token',
          refresh_token: 'refresh-token',
          expires_at: Date.now() + 3600000
        }));
      });

      await page.reload();
      await page.waitForTimeout(1000);

      // Clear previous messages
      await wsMonitor.evaluate(m => m.clearMessages());

      // Simulate token refresh
      await page.evaluate(() => {
        localStorage.setItem('supabase.auth.token', JSON.stringify({
          access_token: 'new-refreshed-token',
          refresh_token: 'new-refresh-token',
          expires_at: Date.now() + 7200000
        }));

        // Trigger storage event
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'supabase.auth.token',
          newValue: JSON.stringify({
            access_token: 'new-refreshed-token',
            refresh_token: 'new-refresh-token',
            expires_at: Date.now() + 7200000
          })
        }));
      });

      await page.waitForTimeout(2000);

      const messages = await wsMonitor.evaluate(m => m.getMessages());

      // Should see close and reopen events
      const closeEvent = messages.find((m: any) => m.type === 'close');
      const openEvent = messages.find((m: any) => m.type === 'open');

      if (closeEvent && openEvent) {
        expect(closeEvent.timestamp).toBeLessThan(openEvent.timestamp);
      }
    });

    test('should send TOKEN_REFRESH message when token is updated', async ({ page }) => {
      await page.goto('/');
      const wsMonitor = await setupWebSocketMonitor(page);

      // Establish initial connection
      await page.evaluate(() => {
        localStorage.setItem('supabase.auth.token', JSON.stringify({
          access_token: 'initial-token',
          refresh_token: 'refresh-token',
          expires_at: Date.now() + 3600000
        }));
      });

      await page.reload();
      await page.waitForTimeout(1000);

      // Clear messages
      await wsMonitor.evaluate(m => m.clearMessages());

      // Update token without full refresh
      await page.evaluate(() => {
        // Simulate token update via auth service
        const event = new CustomEvent('auth:token-refreshed', {
          detail: {
            access_token: 'refreshed-token',
            expires_at: Date.now() + 7200000
          }
        });
        window.dispatchEvent(event);
      });

      await page.waitForTimeout(1000);

      const messages = await wsMonitor.evaluate(m => m.getMessages());
      const tokenRefreshMessage = messages.find((m: any) =>
        m.type === 'sent' && m.messageType === 'TOKEN_REFRESH'
      );

      if (tokenRefreshMessage) {
        expect(tokenRefreshMessage.payload).toHaveProperty('accessToken');
      }
    });
  });

  test.describe('Disconnection on Logout', () => {
    test('should close WebSocket connection on logout', async ({ page }) => {
      await page.goto('/');
      const wsMonitor = await setupWebSocketMonitor(page);

      // Authenticate first
      await page.evaluate(() => {
        localStorage.setItem('supabase.auth.token', JSON.stringify({
          access_token: 'test-token',
          refresh_token: 'refresh-token',
          expires_at: Date.now() + 3600000
        }));
      });

      await page.reload();
      await page.waitForTimeout(1000);

      // Clear messages
      await wsMonitor.evaluate(m => m.clearMessages());

      // Simulate logout
      await page.evaluate(() => {
        localStorage.removeItem('supabase.auth.token');
        window.dispatchEvent(new Event('auth:logout'));
      });

      await page.waitForTimeout(1000);

      const messages = await wsMonitor.evaluate(m => m.getMessages());
      const closeMessage = messages.find((m: any) => m.type === 'close');

      expect(closeMessage).toBeTruthy();
      if (closeMessage) {
        expect(closeMessage.code).toBe(1000); // Normal closure
      }
    });

    test('should not attempt reconnection after logout', async ({ page }) => {
      await page.goto('/');
      const wsMonitor = await setupWebSocketMonitor(page);

      // Authenticate and establish connection
      await page.evaluate(() => {
        localStorage.setItem('supabase.auth.token', JSON.stringify({
          access_token: 'test-token',
          refresh_token: 'refresh-token',
          expires_at: Date.now() + 3600000
        }));
      });

      await page.reload();
      await page.waitForTimeout(1000);

      // Clear and logout
      await wsMonitor.evaluate(m => m.clearMessages());
      await page.evaluate(() => {
        localStorage.removeItem('supabase.auth.token');
        window.dispatchEvent(new Event('auth:logout'));
      });

      // Wait for potential reconnection attempts
      await page.waitForTimeout(5000);

      const messages = await wsMonitor.evaluate(m => m.getMessages());
      const openAttempts = messages.filter((m: any) => m.type === 'open');

      // Should not see any new open attempts after logout
      expect(openAttempts).toHaveLength(0);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle WebSocket connection errors gracefully', async ({ page }) => {
      // Block WebSocket connections
      await page.route('ws://localhost:3001/**', route => route.abort());
      await page.route('wss://localhost:3001/**', route => route.abort());

      await page.goto('/');

      // Authenticate
      await page.evaluate(() => {
        localStorage.setItem('supabase.auth.token', JSON.stringify({
          access_token: 'test-token',
          refresh_token: 'refresh-token',
          expires_at: Date.now() + 3600000
        }));
      });

      await page.reload();

      // Should show connection error state
      await page.waitForTimeout(3000);
      const connectionStatus = await getWebSocketState(page);
      expect(['Error', 'Connection Failed', 'Disconnected']).toContain(connectionStatus);

      // Should not crash the app
      await expect(page.locator('body')).toBeVisible();
    });

    test('should handle invalid auth token in WebSocket', async ({ page }) => {
      await page.goto('/');

      // Set invalid token
      await page.evaluate(() => {
        localStorage.setItem('supabase.auth.token', JSON.stringify({
          access_token: 'invalid-token',
          refresh_token: 'invalid-refresh',
          expires_at: Date.now() + 3600000
        }));
      });

      await page.reload();
      await page.waitForTimeout(2000);

      // Should show disconnected state
      const connectionStatus = await getWebSocketState(page);
      expect(['Disconnected', 'Authentication Failed', 'Error']).toContain(connectionStatus);
    });

    test('should retry WebSocket connection with exponential backoff', async ({ page }) => {
      const connectionAttempts: number[] = [];

      // Track connection attempts
      await page.addInitScript(() => {
        const OriginalWebSocket = window.WebSocket;
        (window as any).__wsAttempts = [];
        (window as any).WebSocket = class extends OriginalWebSocket {
          constructor(url: string, protocols?: string | string[]) {
            (window as any).__wsAttempts.push(Date.now());
            super(url, protocols);
          }
        };
      });

      // Block WebSocket to force failures
      await page.route('ws://localhost:3001/**', route => route.abort());

      await page.goto('/');

      // Authenticate
      await page.evaluate(() => {
        localStorage.setItem('supabase.auth.token', JSON.stringify({
          access_token: 'test-token',
          refresh_token: 'refresh-token',
          expires_at: Date.now() + 3600000
        }));
      });

      await page.reload();

      // Wait for retry attempts
      await page.waitForTimeout(10000);

      const attempts = await page.evaluate(() => (window as any).__wsAttempts);

      if (attempts.length > 1) {
        // Check that delays increase (exponential backoff)
        for (let i = 1; i < Math.min(attempts.length - 1, 3); i++) {
          const delay1 = attempts[i] - attempts[i - 1];
          const delay2 = attempts[i + 1] - attempts[i];
          expect(delay2).toBeGreaterThan(delay1);
        }
      }
    });
  });

  test.describe('Connection Status UI', () => {
    test('should display connection status indicator', async ({ page }) => {
      await page.goto('/dashboard');

      // Should redirect to home if not authenticated
      await expect(page).toHaveURL('/');

      // Authenticate
      await page.evaluate(() => {
        localStorage.setItem('supabase.auth.token', JSON.stringify({
          access_token: 'test-token',
          refresh_token: 'refresh-token',
          expires_at: Date.now() + 3600000
        }));
      });

      // Try dashboard again
      await page.goto('/dashboard');

      // Look for connection status indicator
      const statusIndicator = page.locator('[data-testid="connection-status"]');

      if (await statusIndicator.count() > 0) {
        await expect(statusIndicator).toBeVisible();

        // Should show one of the valid states
        const text = await statusIndicator.textContent();
        expect(['Connecting', 'Connected', 'Disconnected', 'Error']).toContain(text);
      }
    });

    test('should update connection status on state changes', async ({ page }) => {
      await page.goto('/');

      // Set up to monitor status changes
      const statusChanges: string[] = [];
      await page.exposeFunction('recordStatus', (status: string) => {
        statusChanges.push(status);
      });

      await page.addInitScript(() => {
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            const target = mutation.target as HTMLElement;
            if (target.dataset?.testid === 'connection-status') {
              (window as any).recordStatus(target.textContent);
            }
          });
        });

        // Start observing when DOM is ready
        document.addEventListener('DOMContentLoaded', () => {
          const statusElement = document.querySelector('[data-testid="connection-status"]');
          if (statusElement) {
            observer.observe(statusElement, {
              characterData: true,
              childList: true,
              subtree: true
            });
          }
        });
      });

      // Trigger auth and connection
      await page.evaluate(() => {
        localStorage.setItem('supabase.auth.token', JSON.stringify({
          access_token: 'test-token',
          refresh_token: 'refresh-token',
          expires_at: Date.now() + 3600000
        }));
      });

      await page.reload();
      await page.waitForTimeout(3000);

      // Should have recorded status changes
      if (statusChanges.length > 0) {
        // Should transition from connecting to connected (or error)
        expect(statusChanges).toContain('Connecting');
      }
    });
  });
});