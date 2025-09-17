/**
 * E2E Tests for Authentication Flow
 * Tests magic link authentication, session management, and logout
 */

import { test, expect } from '@playwright/test';
import { LoginPage, DashboardPage, AuthVerifyPage, Navigation } from './fixtures/page-objects';
import { testUsers, testConfig } from './fixtures/test-helpers';

test.describe('Authentication Flow', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let authVerifyPage: AuthVerifyPage;
  let navigation: Navigation;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    authVerifyPage = new AuthVerifyPage(page);
    navigation = new Navigation(page);
  });

  test.describe('Magic Link Authentication', () => {
    test('should display login form on unauthenticated access', async ({ page }) => {
      await loginPage.goto();
      await loginPage.waitForPageReady();

      // Check login form elements are present
      await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="send-magic-link-button"]')).toBeVisible();
      await expect(page.getByText('Sign in to your account')).toBeVisible();
    });

    test('should send magic link successfully', async ({ page }) => {
      // Mock the magic link API
      await page.route('**/auth/magic-link', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Magic link sent successfully' }),
        });
      });

      await loginPage.goto();
      await loginPage.sendMagicLink(testUsers.user.email);

      // Verify success message
      await loginPage.waitForSuccessMessage();
      await expect(page.getByText('Magic link sent')).toBeVisible();
    });

    test('should handle invalid email format', async ({ page }) => {
      await loginPage.goto();

      // Try invalid email formats
      const invalidEmails = ['invalid-email', '@domain.com', 'user@', 'user..test@domain.com'];

      for (const email of invalidEmails) {
        await loginPage.enterEmail(email);
        await loginPage.clickSendMagicLink();

        // Should show validation error
        await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
      }
    });

    test('should handle API errors gracefully', async ({ page }) => {
      // Mock API error
      await page.route('**/auth/magic-link', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      await loginPage.goto();
      await loginPage.sendMagicLink(testUsers.user.email);

      // Should show error message
      await loginPage.waitForErrorMessage();
      const errorText = await loginPage.getErrorMessage();
      expect(errorText).toContain('error');
    });

    test('should handle rate limiting', async ({ page }) => {
      // Mock rate limiting response
      await page.route('**/auth/magic-link', route => {
        route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        });
      });

      await loginPage.goto();
      await loginPage.sendMagicLink(testUsers.user.email);

      // Should show rate limit message
      await loginPage.waitForErrorMessage();
      const errorText = await loginPage.getErrorMessage();
      expect(errorText).toContain('Too many requests');
    });

    test('should disable send button during request', async ({ page }) => {
      // Mock slow API response
      await page.route('**/auth/magic-link', route => {
        setTimeout(() => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Magic link sent successfully' }),
          });
        }, 2000);
      });

      await loginPage.goto();
      await loginPage.enterEmail(testUsers.user.email);
      await loginPage.clickSendMagicLink();

      // Button should be disabled during request
      await expect(page.locator('[data-testid="send-magic-link-button"]')).toBeDisabled();

      // Should show loading state
      expect(await loginPage.isLoading()).toBe(true);

      // Wait for completion
      await loginPage.waitForSuccessMessage();
      await expect(page.locator('[data-testid="send-magic-link-button"]')).toBeEnabled();
    });
  });

  test.describe('Magic Link Verification', () => {
    test('should verify valid magic link token', async ({ page }) => {
      // Mock successful verification
      await page.route('**/auth/verify', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: { email: testUsers.user.email, id: 'user-123' },
            accessToken: 'mock-jwt-token',
            refreshToken: 'mock-refresh-token',
            expiresIn: 900,
          }),
        });
      });

      // Navigate to verify page with token
      await page.goto('/auth/verify?token=valid-token');
      await authVerifyPage.waitForPageReady();

      // Should redirect to dashboard
      await authVerifyPage.waitForVerificationComplete();
      expect(await authVerifyPage.isVerificationSuccessful()).toBe(true);
      await page.waitForURL('/dashboard');
    });

    test('should handle invalid magic link token', async ({ page }) => {
      // Mock invalid token response
      await page.route('**/auth/verify', route => {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid or expired token' }),
        });
      });

      await page.goto('/auth/verify?token=invalid-token');
      await authVerifyPage.waitForPageReady();
      await authVerifyPage.waitForVerificationComplete();

      // Should show error message
      expect(await authVerifyPage.isVerificationSuccessful()).toBe(false);
      const errorText = await authVerifyPage.getVerificationError();
      expect(errorText).toContain('Invalid or expired');
    });

    test('should handle expired magic link token', async ({ page }) => {
      // Mock expired token response
      await page.route('**/auth/verify', route => {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Token has expired' }),
        });
      });

      await page.goto('/auth/verify?token=expired-token');
      await authVerifyPage.waitForPageReady();
      await authVerifyPage.waitForVerificationComplete();

      // Should show expired token message
      const errorText = await authVerifyPage.getVerificationError();
      expect(errorText).toContain('expired');

      // Should provide option to request new magic link
      await expect(page.getByText('Request new magic link')).toBeVisible();
    });

    test('should handle missing token parameter', async ({ page }) => {
      await page.goto('/auth/verify');

      // Should show error about missing token
      await expect(page.getByText('Invalid verification link')).toBeVisible();
    });
  });

  test.describe('Session Management', () => {
    test('should maintain session across page refreshes', async ({ page }) => {
      // Mock authentication
      await page.route('**/auth/verify', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: { email: testUsers.user.email, id: 'user-123' },
            accessToken: 'mock-jwt-token',
            refreshToken: 'mock-refresh-token',
            expiresIn: 900,
          }),
        });
      });

      // Authenticate
      await page.goto('/auth/verify?token=valid-token');
      await page.waitForURL('/dashboard');

      // Refresh page
      await page.reload();

      // Should stay authenticated
      await expect(page).toHaveURL('/dashboard');
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    });

    test('should redirect unauthenticated users to login', async ({ page }) => {
      // Try to access protected route without authentication
      await page.goto('/dashboard');

      // Should redirect to login
      await page.waitForURL('/login');
      await expect(page.getByText('Sign in to your account')).toBeVisible();
    });

    test('should handle token refresh automatically', async ({ page }) => {
      let tokenRefreshCalled = false;

      // Mock initial auth
      await page.route('**/auth/verify', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: { email: testUsers.user.email, id: 'user-123' },
            accessToken: 'mock-jwt-token',
            refreshToken: 'mock-refresh-token',
            expiresIn: 2, // Short expiry for testing
          }),
        });
      });

      // Mock token refresh
      await page.route('**/auth/refresh', route => {
        tokenRefreshCalled = true;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            accessToken: 'new-jwt-token',
            refreshToken: 'new-refresh-token',
            expiresIn: 900,
          }),
        });
      });

      // Authenticate
      await page.goto('/auth/verify?token=valid-token');
      await page.waitForURL('/dashboard');

      // Wait for token to expire and refresh
      await page.waitForTimeout(3000);

      // Make an API call that would trigger token refresh
      await page.route('**/agents', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: [] }),
        });
      });

      await navigation.goToAgents();

      // Token refresh should have been called
      expect(tokenRefreshCalled).toBe(true);
    });

    test('should logout when refresh token is invalid', async ({ page }) => {
      // Mock auth with short-lived token
      await page.route('**/auth/verify', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: { email: testUsers.user.email, id: 'user-123' },
            accessToken: 'mock-jwt-token',
            refreshToken: 'mock-refresh-token',
            expiresIn: 1,
          }),
        });
      });

      // Mock failed token refresh
      await page.route('**/auth/refresh', route => {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid refresh token' }),
        });
      });

      // Authenticate
      await page.goto('/auth/verify?token=valid-token');
      await page.waitForURL('/dashboard');

      // Wait for token to expire
      await page.waitForTimeout(2000);

      // Try to navigate (which would trigger token refresh)
      await navigation.goToAgents();

      // Should be redirected to login due to failed refresh
      await page.waitForURL('/login');
    });
  });

  test.describe('Logout Flow', () => {
    test.beforeEach(async ({ page }) => {
      // Mock authentication for each test
      await page.route('**/auth/verify', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: { email: testUsers.user.email, id: 'user-123' },
            accessToken: 'mock-jwt-token',
            refreshToken: 'mock-refresh-token',
            expiresIn: 900,
          }),
        });
      });

      // Authenticate
      await page.goto('/auth/verify?token=valid-token');
      await page.waitForURL('/dashboard');
    });

    test('should logout successfully', async ({ page }) => {
      // Mock logout API
      await page.route('**/auth/logout', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Logged out successfully' }),
        });
      });

      await dashboardPage.logout();

      // Should redirect to login page
      await page.waitForURL('/login');
      await expect(page.getByText('Sign in to your account')).toBeVisible();
    });

    test('should clear session data on logout', async ({ page }) => {
      await dashboardPage.logout();

      // Try to access protected route
      await page.goto('/dashboard');

      // Should redirect to login (session cleared)
      await page.waitForURL('/login');
    });

    test('should handle logout API errors gracefully', async ({ page }) => {
      // Mock logout API error
      await page.route('**/auth/logout', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Server error' }),
        });
      });

      await dashboardPage.logout();

      // Should still redirect to login even if API fails
      await page.waitForURL('/login');
    });

    test('should logout from all pages', async ({ page }) => {
      const pages = ['/dashboard', '/agents', '/presets'];

      for (const pagePath of pages) {
        await page.goto(pagePath);
        await navigation.logout();
        await page.waitForURL('/login');

        // Re-authenticate for next iteration
        await page.goto('/auth/verify?token=valid-token');
        await page.waitForURL('/dashboard');
      }
    });
  });

  test.describe('Security Features', () => {
    test('should prevent CSRF attacks', async ({ page }) => {
      // Try to submit form without proper CSRF token
      await page.goto('/login');

      // Remove CSRF token if present
      await page.evaluate(() => {
        const csrfInputs = document.querySelectorAll('input[name="_token"], input[name="csrf_token"]');
        csrfInputs.forEach(input => input.remove());
      });

      await loginPage.enterEmail(testUsers.user.email);
      await loginPage.clickSendMagicLink();

      // Should show security error
      await expect(page.getByText('Security validation failed')).toBeVisible();
    });

    test('should enforce rate limiting per IP', async ({ page }) => {
      let requestCount = 0;

      await page.route('**/auth/magic-link', route => {
        requestCount++;
        if (requestCount > 3) {
          route.fulfill({
            status: 429,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Rate limit exceeded' }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Magic link sent' }),
          });
        }
      });

      await loginPage.goto();

      // Send multiple requests quickly
      for (let i = 0; i < 5; i++) {
        await loginPage.enterEmail(`test${i}@example.com`);
        await loginPage.clickSendMagicLink();

        if (i >= 3) {
          // Should be rate limited
          await loginPage.waitForErrorMessage();
          const errorText = await loginPage.getErrorMessage();
          expect(errorText).toContain('Rate limit');
          break;
        }
      }
    });

    test('should validate user agent and origin', async ({ page }) => {
      // Mock server that validates headers
      await page.route('**/auth/magic-link', route => {
        const headers = route.request().headers();

        if (!headers['user-agent'] || !headers['origin']) {
          route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Invalid request headers' }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Magic link sent' }),
          });
        }
      });

      await loginPage.goto();
      await loginPage.sendMagicLink(testUsers.user.email);

      // Should succeed with proper headers
      await loginPage.waitForSuccessMessage();
    });
  });

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      await loginPage.goto();

      // Tab through form elements
      await page.keyboard.press('Tab');
      await expect(page.locator('[data-testid="email-input"]')).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(page.locator('[data-testid="send-magic-link-button"]')).toBeFocused();

      // Submit with Enter
      await loginPage.enterEmail(testUsers.user.email);
      await page.keyboard.press('Enter');

      // Form should submit
      await expect(page.locator('[data-testid="loading-spinner"]')).toBeVisible();
    });

    test('should have proper ARIA labels', async ({ page }) => {
      await loginPage.goto();

      // Check for accessibility attributes
      await expect(page.locator('[data-testid="email-input"]')).toHaveAttribute('aria-label');
      await expect(page.locator('[data-testid="send-magic-link-button"]')).toHaveAttribute('aria-label');

      // Check for proper form labeling
      await expect(page.locator('label[for="email"]')).toBeVisible();
    });

    test('should announce loading states to screen readers', async ({ page }) => {
      await loginPage.goto();

      // Check for aria-live regions
      await expect(page.locator('[aria-live="polite"]')).toBeAttached();

      await loginPage.enterEmail(testUsers.user.email);
      await loginPage.clickSendMagicLink();

      // Loading state should be announced
      await expect(page.locator('[aria-live="polite"]')).toContainText('Sending');
    });
  });
});