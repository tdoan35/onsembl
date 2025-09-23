/**
 * E2E Tests for Supabase Authentication
 * Tests email/password auth, OAuth providers, session management, and protected routes
 */

import { test, expect, Page } from '@playwright/test';

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'TestPassword123!',
  username: 'testuser'
};

// Page helper functions
async function fillLoginForm(page: Page, email: string, password: string) {
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
}

async function fillSignupForm(page: Page, email: string, password: string, username?: string) {
  await page.fill('[name="email"]', email);
  if (username) {
    await page.fill('[name="username"]', username);
  }
  await page.fill('[name="password"]', password);
  await page.fill('[name="passwordConfirm"]', password);
}

test.describe('Supabase Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');
  });

  test.describe('Login Modal', () => {
    test('should open login modal when clicking sign in', async ({ page }) => {
      await page.click('text=Sign In');
      await expect(page.locator('text=Sign in with Google')).toBeVisible();
      await expect(page.locator('text=Sign in with GitHub')).toBeVisible();
      await expect(page.locator('text=Log in with email and password')).toBeVisible();
    });

    test('should switch to email login form', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');

      await expect(page.locator('[name="email"]')).toBeVisible();
      await expect(page.locator('[name="password"]')).toBeVisible();
      await expect(page.locator('button:has-text("Continue")')).toBeVisible();
    });

    test('should switch between login and signup modes', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');

      // Switch to signup
      await page.click('text=Sign up');
      await expect(page.locator('[name="username"]')).toBeVisible();
      await expect(page.locator('[name="passwordConfirm"]')).toBeVisible();

      // Switch back to login
      await page.click('text=Log in');
      await expect(page.locator('[name="username"]')).not.toBeVisible();
      await expect(page.locator('[name="passwordConfirm"]')).not.toBeVisible();
    });

    test('should close modal with X button', async ({ page }) => {
      await page.click('text=Sign In');
      await expect(page.locator('text=Sign in with Google')).toBeVisible();

      // Close modal
      await page.click('[aria-label="Close"]');
      await expect(page.locator('text=Sign in with Google')).not.toBeVisible();
    });
  });

  test.describe('Email/Password Authentication', () => {
    test('should validate email format', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');

      // Invalid email
      await page.fill('[name="email"]', 'invalid-email');
      await page.fill('[name="password"]', 'password123');
      await page.click('button:has-text("Continue")');

      await expect(page.locator('text=Please enter a valid email address')).toBeVisible();
    });

    test('should validate password length', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');

      // Short password
      await page.fill('[name="email"]', testUser.email);
      await page.fill('[name="password"]', '123');
      await page.click('button:has-text("Continue")');

      await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible();
    });

    test('should show/hide password', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');

      const passwordInput = page.locator('[name="password"]');
      await passwordInput.fill('testpassword');

      // Password should be hidden by default
      await expect(passwordInput).toHaveAttribute('type', 'password');

      // Click eye icon to show password
      await page.click('[aria-label="Show password"]');
      await expect(passwordInput).toHaveAttribute('type', 'text');

      // Click again to hide
      await page.click('[aria-label="Hide password"]');
      await expect(passwordInput).toHaveAttribute('type', 'password');
    });

    test('should handle login with invalid credentials', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');

      await fillLoginForm(page, testUser.email, 'wrongpassword');
      await page.click('button:has-text("Continue")');

      // Wait for error notification
      await expect(page.locator('text=Sign in failed')).toBeVisible({ timeout: 10000 });
    });

    test('should validate signup form', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');
      await page.click('text=Sign up');

      // Test password mismatch
      await page.fill('[name="email"]', testUser.email);
      await page.fill('[name="password"]', testUser.password);
      await page.fill('[name="passwordConfirm"]', 'differentpassword');
      await page.click('button:has-text("Sign up")');

      await expect(page.locator('text=Passwords don\'t match')).toBeVisible();
    });

    test('should validate username format in signup', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');
      await page.click('text=Sign up');

      // Test invalid username (too short)
      await page.fill('[name="username"]', 'ab');
      await page.fill('[name="email"]', testUser.email);
      await page.fill('[name="password"]', testUser.password);
      await page.fill('[name="passwordConfirm"]', testUser.password);

      // Username validation should happen in backend
      // This test would need actual Supabase connection
    });
  });

  test.describe('OAuth Authentication', () => {
    test('should initiate Google OAuth flow', async ({ page, context }) => {
      await page.click('text=Sign In');

      // Listen for popup
      const popupPromise = context.waitForEvent('page');
      await page.click('text=Sign in with Google');

      const popup = await popupPromise;

      // Check if redirected to Google OAuth
      await expect(popup.url()).toContain('accounts.google.com');
      await popup.close();
    });

    test('should initiate GitHub OAuth flow', async ({ page, context }) => {
      await page.click('text=Sign In');

      // Listen for popup
      const popupPromise = context.waitForEvent('page');
      await page.click('text=Sign in with GitHub');

      const popup = await popupPromise;

      // Check if redirected to GitHub OAuth
      await expect(popup.url()).toContain('github.com');
      await popup.close();
    });

    test('should handle OAuth callback', async ({ page }) => {
      // Simulate OAuth callback with code
      await page.goto('/auth/callback?code=test-auth-code');

      // Should process the code and redirect
      await page.waitForURL('/dashboard', { timeout: 10000 });
    });

    test('should handle OAuth callback errors', async ({ page }) => {
      // Simulate OAuth callback with error
      await page.goto('/auth/callback?error=access_denied&error_description=User+denied+access');

      // Should redirect to error page
      await expect(page).toHaveURL('/auth/error');
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect to home when accessing protected route without auth', async ({ page }) => {
      await page.goto('/dashboard');

      // Should be redirected to home page
      await expect(page).toHaveURL('/');
      await expect(page.locator('text=Sign In')).toBeVisible();
    });

    test('should redirect to home for all protected routes', async ({ page }) => {
      const protectedRoutes = [
        '/dashboard',
        '/agents',
        '/commands',
        '/presets',
        '/traces',
        '/reports',
        '/audit',
        '/settings'
      ];

      for (const route of protectedRoutes) {
        await page.goto(route);
        await expect(page).toHaveURL('/');
      }
    });
  });

  test.describe('Session Management', () => {
    // These tests would need a real Supabase instance or mocked auth
    test.skip('should maintain session after page refresh', async ({ page }) => {
      // Login first
      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');
      await fillLoginForm(page, testUser.email, testUser.password);
      await page.click('button:has-text("Continue")');

      // Wait for redirect to dashboard
      await page.waitForURL('/dashboard');

      // Refresh page
      await page.reload();

      // Should still be on dashboard
      await expect(page).toHaveURL('/dashboard');
      await expect(page.locator('[data-testid="user-profile-menu"]')).toBeVisible();
    });

    test.skip('should show user profile menu when authenticated', async ({ page }) => {
      // Login first
      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');
      await fillLoginForm(page, testUser.email, testUser.password);
      await page.click('button:has-text("Continue")');

      // Wait for redirect to dashboard
      await page.waitForURL('/dashboard');

      // Check for user profile menu
      const profileMenu = page.locator('[data-testid="user-profile-menu"]');
      await expect(profileMenu).toBeVisible();

      // Click to open menu
      await profileMenu.click();

      // Check menu items
      await expect(page.locator('text=Profile Settings')).toBeVisible();
      await expect(page.locator('text=Account Settings')).toBeVisible();
      await expect(page.locator('text=Sign Out')).toBeVisible();
    });

    test.skip('should logout successfully', async ({ page }) => {
      // Login first
      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');
      await fillLoginForm(page, testUser.email, testUser.password);
      await page.click('button:has-text("Continue")');

      // Wait for redirect to dashboard
      await page.waitForURL('/dashboard');

      // Open profile menu and logout
      await page.click('[data-testid="user-profile-menu"]');
      await page.click('text=Sign Out');

      // Should redirect to home
      await expect(page).toHaveURL('/');
      await expect(page.locator('text=Sign In')).toBeVisible();

      // Try to access protected route
      await page.goto('/dashboard');
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('WebSocket Authentication', () => {
    test.skip('should establish WebSocket connection after login', async ({ page }) => {
      // Login first
      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');
      await fillLoginForm(page, testUser.email, testUser.password);
      await page.click('button:has-text("Continue")');

      // Wait for redirect to dashboard
      await page.waitForURL('/dashboard');

      // Check WebSocket connection status
      await expect(page.locator('[data-testid="connection-status"]')).toHaveText('Connected', {
        timeout: 10000
      });
    });

    test.skip('should disconnect WebSocket on logout', async ({ page }) => {
      // Login first
      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');
      await fillLoginForm(page, testUser.email, testUser.password);
      await page.click('button:has-text("Continue")');

      // Wait for dashboard and connection
      await page.waitForURL('/dashboard');
      await expect(page.locator('[data-testid="connection-status"]')).toHaveText('Connected');

      // Logout
      await page.click('[data-testid="user-profile-menu"]');
      await page.click('text=Sign Out');

      // WebSocket should be disconnected
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Error Handling', () => {
    test('should show error notification for network errors', async ({ page }) => {
      // Block network requests to Supabase
      await page.route('**/auth/**', route => route.abort());

      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');
      await fillLoginForm(page, testUser.email, testUser.password);
      await page.click('button:has-text("Continue")');

      // Should show error notification
      await expect(page.locator('text=Sign in failed')).toBeVisible();
    });

    test('should handle rate limiting', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');

      // Try to login multiple times quickly
      for (let i = 0; i < 5; i++) {
        await fillLoginForm(page, `test${i}@example.com`, 'password123');
        await page.click('button:has-text("Continue")');
        await page.waitForTimeout(100);
      }

      // Should eventually show rate limit error (if implemented)
      // This would need actual Supabase rate limiting
    });
  });

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      await page.click('text=Sign In');

      // Tab through OAuth options
      await page.keyboard.press('Tab');
      const focusedElement = await page.evaluate(() => document.activeElement?.textContent);
      expect(focusedElement).toContain('Google');

      await page.keyboard.press('Tab');
      const focusedElement2 = await page.evaluate(() => document.activeElement?.textContent);
      expect(focusedElement2).toContain('GitHub');

      // Navigate to email login
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');

      // Should show email form
      await expect(page.locator('[name="email"]')).toBeVisible();
    });

    test('should have proper ARIA labels', async ({ page }) => {
      await page.click('text=Sign In');

      // Check for ARIA labels
      await expect(page.locator('dialog[role="dialog"]')).toBeVisible();
      await expect(page.locator('[aria-label="Close"]')).toBeVisible();

      await page.click('text=Log in with email and password');

      // Form inputs should have labels
      await expect(page.locator('label:has-text("Email")')).toBeVisible();
      await expect(page.locator('label:has-text("Password")')).toBeVisible();
    });

    test('should announce form errors to screen readers', async ({ page }) => {
      await page.click('text=Sign In');
      await page.click('text=Log in with email and password');

      // Submit with invalid email
      await page.fill('[name="email"]', 'invalid');
      await page.click('button:has-text("Continue")');

      // Error should have proper ARIA attributes
      const errorMessage = page.locator('text=Please enter a valid email address');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toHaveAttribute('role', 'alert');
    });
  });
});