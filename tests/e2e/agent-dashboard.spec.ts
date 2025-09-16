import { test, expect } from '@playwright/test';

test.describe('Agent Dashboard E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard
    await page.goto('http://localhost:3000');

    // Wait for app to load
    await page.waitForSelector('[data-testid="dashboard"]', { timeout: 10000 });
  });

  test('should display agent dashboard', async ({ page }) => {
    // Check main elements are present
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-list"]')).toBeVisible();
    await expect(page.locator('[data-testid="command-input"]')).toBeVisible();
  });

  test('should show agent status cards', async ({ page }) => {
    // Wait for agents to load
    await page.waitForSelector('[data-testid="agent-card"]', { timeout: 5000 });

    // Check agent cards are displayed
    const agentCards = page.locator('[data-testid="agent-card"]');
    await expect(agentCards).toHaveCount(await agentCards.count());

    // Check first agent card has required elements
    const firstCard = agentCards.first();
    await expect(firstCard.locator('[data-testid="agent-name"]')).toBeVisible();
    await expect(firstCard.locator('[data-testid="agent-status"]')).toBeVisible();
    await expect(firstCard.locator('[data-testid="agent-type"]')).toBeVisible();
  });

  test('should execute command on agent', async ({ page }) => {
    // Select an agent
    const agentCard = page.locator('[data-testid="agent-card"]').first();
    await agentCard.click();

    // Enter command
    const commandInput = page.locator('[data-testid="command-input"]');
    await commandInput.fill('echo "Hello from E2E test"');

    // Click execute button
    const executeButton = page.locator('[data-testid="execute-button"]');
    await executeButton.click();

    // Wait for terminal output
    await page.waitForSelector('[data-testid="terminal-output"]', { timeout: 10000 });

    // Check output appears
    const terminalOutput = page.locator('[data-testid="terminal-output"]');
    await expect(terminalOutput).toContainText('Hello from E2E test');
  });

  test('should show real-time terminal output', async ({ page }) => {
    // Select agent and execute command
    await page.locator('[data-testid="agent-card"]').first().click();
    await page.locator('[data-testid="command-input"]').fill('npm test');
    await page.locator('[data-testid="execute-button"]').click();

    // Wait for terminal to appear
    const terminal = page.locator('[data-testid="terminal-viewer"]');
    await expect(terminal).toBeVisible();

    // Check for streaming output
    await expect(terminal).toContainText('Running');

    // Wait for completion
    await expect(terminal).toContainText('completed', { timeout: 30000 });
  });

  test('should handle emergency stop', async ({ page }) => {
    // Start a long-running command
    await page.locator('[data-testid="agent-card"]').first().click();
    await page.locator('[data-testid="command-input"]').fill('sleep 30');
    await page.locator('[data-testid="execute-button"]').click();

    // Wait for command to start
    await page.waitForSelector('[data-testid="command-status-executing"]', { timeout: 5000 });

    // Click emergency stop
    const emergencyStop = page.locator('[data-testid="emergency-stop-button"]');
    await emergencyStop.click();

    // Confirm in dialog
    const confirmButton = page.locator('[data-testid="confirm-stop"]');
    await confirmButton.click();

    // Check command was stopped
    await expect(page.locator('[data-testid="command-status-cancelled"]')).toBeVisible();
  });

  test('should create and use command preset', async ({ page }) => {
    // Open preset manager
    const presetButton = page.locator('[data-testid="preset-manager-button"]');
    await presetButton.click();

    // Create new preset
    await page.locator('[data-testid="new-preset-button"]').click();

    // Fill preset form
    await page.locator('[data-testid="preset-name"]').fill('Test Preset');
    await page.locator('[data-testid="preset-command"]').fill('npm run test:unit');
    await page.locator('[data-testid="preset-description"]').fill('Run unit tests');

    // Save preset
    await page.locator('[data-testid="save-preset"]').click();

    // Close preset manager
    await page.locator('[data-testid="close-preset-manager"]').click();

    // Use preset
    await page.locator('[data-testid="preset-dropdown"]').click();
    await page.locator('[data-testid="preset-Test Preset"]').click();

    // Check command input is filled
    const commandInput = page.locator('[data-testid="command-input"]');
    await expect(commandInput).toHaveValue('npm run test:unit');
  });

  test('should display trace tree for LLM commands', async ({ page }) => {
    // Execute an LLM command
    await page.locator('[data-testid="agent-card"]').first().click();
    await page.locator('[data-testid="command-input"]').fill('analyze code complexity');
    await page.locator('[data-testid="execute-button"]').click();

    // Wait for trace viewer to appear
    await page.waitForSelector('[data-testid="trace-viewer"]', { timeout: 15000 });

    // Check trace tree structure
    const traceTree = page.locator('[data-testid="trace-tree"]');
    await expect(traceTree).toBeVisible();

    // Verify tree nodes
    await expect(traceTree.locator('[data-testid="trace-node-request"]')).toBeVisible();
    await expect(traceTree.locator('[data-testid="trace-node-thought"]')).toBeVisible();
    await expect(traceTree.locator('[data-testid="trace-node-response"]')).toBeVisible();

    // Expand a node
    await traceTree.locator('[data-testid="trace-node-request"]').click();
    await expect(traceTree.locator('[data-testid="trace-details"]')).toBeVisible();
  });
});