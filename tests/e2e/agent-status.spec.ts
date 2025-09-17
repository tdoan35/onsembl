import { test, expect } from '@playwright/test';

test.describe('Agent Connection/Disconnection Updates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForSelector('[data-testid="dashboard-loaded"]', { timeout: 10000 });
  });

  test('should show real-time agent connection', async ({ page, context }) => {
    // Wait for initial WebSocket connection
    await page.waitForSelector('[data-testid="connection-status-connected"]', { timeout: 5000 });

    // Verify no agents initially
    await expect(page.locator('[data-testid="no-agents-message"]')).toBeVisible();

    // Simulate agent connection (in real test, this would be done via agent CLI)
    // For E2E testing, we'll open a second page that simulates an agent
    const agentPage = await context.newPage();
    await agentPage.goto('http://localhost:3000/agent-simulator?id=test-agent-1&type=claude');

    // Wait for agent to appear in dashboard
    await expect(page.locator('[data-testid="agent-card-test-agent-1"]')).toBeVisible({ timeout: 5000 });
    
    // Verify agent status is online
    await expect(page.locator('[data-testid="agent-status-online-test-agent-1"]')).toBeVisible();

    // Close agent page to simulate disconnection
    await agentPage.close();

    // Verify agent status changes to offline
    await expect(page.locator('[data-testid="agent-status-offline-test-agent-1"]')).toBeVisible({ timeout: 5000 });
  });

  test('should update agent list across multiple dashboards', async ({ browser }) => {
    // Open two dashboard instances
    const context1 = await browser.newContext();
    const dashboard1 = await context1.newPage();
    await dashboard1.goto('http://localhost:3000/dashboard');
    await dashboard1.waitForSelector('[data-testid="connection-status-connected"]', { timeout: 5000 });

    const context2 = await browser.newContext();
    const dashboard2 = await context2.newPage();
    await dashboard2.goto('http://localhost:3000/dashboard');
    await dashboard2.waitForSelector('[data-testid="connection-status-connected"]', { timeout: 5000 });

    // Connect an agent
    const agentContext = await browser.newContext();
    const agentPage = await agentContext.newPage();
    await agentPage.goto('http://localhost:3000/agent-simulator?id=shared-agent&type=gemini');

    // Verify agent appears on both dashboards
    await expect(dashboard1.locator('[data-testid="agent-card-shared-agent"]')).toBeVisible({ timeout: 5000 });
    await expect(dashboard2.locator('[data-testid="agent-card-shared-agent"]')).toBeVisible({ timeout: 5000 });

    // Disconnect agent
    await agentPage.close();

    // Verify agent goes offline on both dashboards
    await expect(dashboard1.locator('[data-testid="agent-status-offline-shared-agent"]')).toBeVisible({ timeout: 5000 });
    await expect(dashboard2.locator('[data-testid="agent-status-offline-shared-agent"]')).toBeVisible({ timeout: 5000 });

    await context1.close();
    await context2.close();
  });

  test('should handle agent reconnection', async ({ page, context }) => {
    // Connect to dashboard
    await page.waitForSelector('[data-testid="connection-status-connected"]', { timeout: 5000 });

    // Connect agent
    let agentPage = await context.newPage();
    await agentPage.goto('http://localhost:3000/agent-simulator?id=reconnect-agent&type=claude');
    await expect(page.locator('[data-testid="agent-card-reconnect-agent"]')).toBeVisible({ timeout: 5000 });

    // Disconnect agent
    await agentPage.close();
    await expect(page.locator('[data-testid="agent-status-offline-reconnect-agent"]')).toBeVisible({ timeout: 5000 });

    // Reconnect agent with same ID
    agentPage = await context.newPage();
    await agentPage.goto('http://localhost:3000/agent-simulator?id=reconnect-agent&type=claude');

    // Verify agent is back online
    await expect(page.locator('[data-testid="agent-status-online-reconnect-agent"]')).toBeVisible({ timeout: 5000 });

    await agentPage.close();
  });

  test('should display agent metrics in real-time', async ({ page, context }) => {
    // Connect to dashboard
    await page.waitForSelector('[data-testid="connection-status-connected"]', { timeout: 5000 });

    // Connect agent with metrics
    const agentPage = await context.newPage();
    await agentPage.goto('http://localhost:3000/agent-simulator?id=metrics-agent&type=claude&metrics=true');

    // Wait for agent to appear
    await expect(page.locator('[data-testid="agent-card-metrics-agent"]')).toBeVisible({ timeout: 5000 });

    // Check initial metrics
    await expect(page.locator('[data-testid="agent-cpu-metrics-agent"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-memory-metrics-agent"]')).toBeVisible();

    // Simulate high CPU usage on agent
    await agentPage.evaluate(() => {
      window.postMessage({ type: 'UPDATE_METRICS', cpu: 85, memory: 45 }, '*');
    });

    // Verify metrics update on dashboard
    await expect(page.locator('[data-testid="agent-cpu-metrics-agent"]')).toContainText('85%', { timeout: 5000 });

    // Verify health status changes based on metrics
    await expect(page.locator('[data-testid="agent-health-warning-metrics-agent"]')).toBeVisible();

    await agentPage.close();
  });

  test('should handle WebSocket reconnection', async ({ page }) => {
    // Initial connection
    await page.waitForSelector('[data-testid="connection-status-connected"]', { timeout: 5000 });

    // Simulate connection loss (in real test, this would be network interruption)
    await page.evaluate(() => {
      // Force close WebSocket connection
      const ws = (window as any).__websocket;
      if (ws) ws.close();
    });

    // Verify disconnection status
    await expect(page.locator('[data-testid="connection-status-disconnected"]')).toBeVisible({ timeout: 5000 });

    // Wait for automatic reconnection
    await expect(page.locator('[data-testid="connection-status-connecting"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="connection-status-connected"]')).toBeVisible({ timeout: 30000 });

    // Verify functionality restored after reconnection
    await page.click('[data-testid="agent-refresh"]');
    await expect(page.locator('[data-testid="agent-list-refreshed"]')).toBeVisible();
  });
});
