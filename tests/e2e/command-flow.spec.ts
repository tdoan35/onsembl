import { test, expect } from '@playwright/test';

test.describe('Full Command Execution Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForSelector('[data-testid="dashboard-loaded"]', { timeout: 10000 });
  });

  test('should execute command end-to-end', async ({ page }) => {
    // Wait for WebSocket connection
    await page.waitForSelector('[data-testid="connection-status-connected"]', { timeout: 5000 });

    // Select an agent
    await page.click('[data-testid="agent-card-claude"]');
    await expect(page.locator('[data-testid="agent-selected"]')).toBeVisible();

    // Enter command
    await page.fill('[data-testid="command-input"]', 'echo "Hello from E2E test"');
    
    // Submit command
    await page.click('[data-testid="command-submit"]');

    // Wait for command to be queued
    await expect(page.locator('[data-testid="command-status-queued"]')).toBeVisible({ timeout: 5000 });

    // Wait for command execution
    await expect(page.locator('[data-testid="command-status-running"]')).toBeVisible({ timeout: 5000 });

    // Wait for terminal output
    await expect(page.locator('[data-testid="terminal-output"]')).toContainText('Hello from E2E test', { timeout: 10000 });

    // Verify command completion
    await expect(page.locator('[data-testid="command-status-completed"]')).toBeVisible({ timeout: 5000 });
  });

  test('should handle command interruption', async ({ page }) => {
    // Wait for WebSocket connection
    await page.waitForSelector('[data-testid="connection-status-connected"]', { timeout: 5000 });

    // Select an agent
    await page.click('[data-testid="agent-card-claude"]');

    // Submit long-running command
    await page.fill('[data-testid="command-input"]', 'sleep 30');
    await page.click('[data-testid="command-submit"]');

    // Wait for execution to start
    await expect(page.locator('[data-testid="command-status-running"]')).toBeVisible({ timeout: 5000 });

    // Interrupt command
    await page.click('[data-testid="command-interrupt"]');

    // Verify interruption
    await expect(page.locator('[data-testid="command-status-interrupted"]')).toBeVisible({ timeout: 5000 });
  });

  test('should display command queue', async ({ page }) => {
    // Wait for connection
    await page.waitForSelector('[data-testid="connection-status-connected"]', { timeout: 5000 });

    // Select agent
    await page.click('[data-testid="agent-card-claude"]');

    // Submit multiple commands
    for (let i = 1; i <= 3; i++) {
      await page.fill('[data-testid="command-input"]', `echo "Command ${i}"`);
      await page.click('[data-testid="command-submit"]');
      await page.waitForTimeout(100);
    }

    // Verify queue display
    const queueItems = page.locator('[data-testid^="queue-item-"]');
    await expect(queueItems).toHaveCount(3);

    // Verify queue order
    await expect(queueItems.first()).toContainText('Command 1');
  });

  test('should handle emergency stop', async ({ page }) => {
    // Wait for connection
    await page.waitForSelector('[data-testid="connection-status-connected"]', { timeout: 5000 });

    // Start multiple commands
    await page.click('[data-testid="agent-card-claude"]');
    await page.fill('[data-testid="command-input"]', 'long-running-task');
    await page.click('[data-testid="command-submit"]');

    // Click emergency stop
    await page.click('[data-testid="emergency-stop"]');

    // Confirm in dialog
    await page.click('[data-testid="confirm-emergency-stop"]');

    // Verify all commands stopped
    await expect(page.locator('[data-testid="command-status-running"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="emergency-stop-activated"]')).toBeVisible();
  });
});
