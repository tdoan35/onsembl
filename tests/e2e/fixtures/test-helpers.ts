/**
 * E2E Test Helpers
 * Common utilities and helpers for Playwright tests
 */

import { Page, expect, Locator } from '@playwright/test';

/**
 * Test environment configuration
 */
export const testConfig = {
  baseUrl: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001',
  defaultTimeout: 30000,
  shortTimeout: 5000,
  longTimeout: 60000,
};

/**
 * Test user credentials for different scenarios
 */
export const testUsers = {
  admin: {
    email: 'admin@onsembl.ai',
    role: 'admin',
  },
  user: {
    email: 'user@onsembl.ai',
    role: 'user',
  },
  newUser: {
    email: 'newuser@onsembl.ai',
    role: 'user',
  },
};

/**
 * Mock agent data for testing
 */
export const mockAgents = {
  claude: {
    id: 'agent-claude-1',
    name: 'Claude-1',
    type: 'CLAUDE' as const,
    status: 'ONLINE' as const,
    activityState: 'IDLE' as const,
    hostMachine: 'localhost',
    version: '1.0.0',
    capabilities: {
      maxTokens: 100000,
      supportsInterrupt: true,
      supportsTrace: true,
    },
  },
  gemini: {
    id: 'agent-gemini-1',
    name: 'Gemini-1',
    type: 'GEMINI' as const,
    status: 'ONLINE' as const,
    activityState: 'IDLE' as const,
    hostMachine: 'localhost',
    version: '1.0.0',
    capabilities: {
      maxTokens: 50000,
      supportsInterrupt: false,
      supportsTrace: true,
    },
  },
};

/**
 * Mock command presets for testing
 */
export const mockPresets = {
  codeReview: {
    id: 'preset-code-review',
    name: 'Code Review',
    description: 'Review code changes and provide feedback',
    command: 'Please review the following code changes and provide detailed feedback on code quality, potential issues, and improvements.',
    category: 'REVIEW',
  },
  investigation: {
    id: 'preset-investigate',
    name: 'Investigate Issue',
    description: 'Investigate and analyze system issues',
    command: 'Investigate the following issue and provide a detailed analysis with recommended solutions.',
    category: 'INVESTIGATE',
  },
};

/**
 * Common test helpers
 */
export class TestHelpers {
  constructor(private page: Page) {}

  /**
   * Navigate to a specific route with error handling
   */
  async navigateTo(route: string): Promise<void> {
    const response = await this.page.goto(route);
    if (!response?.ok()) {
      throw new Error(`Failed to navigate to ${route}: ${response?.status()}`);
    }
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for element to be visible and stable
   */
  async waitForElement(selector: string, timeout = testConfig.defaultTimeout): Promise<Locator> {
    const element = this.page.locator(selector);
    await element.waitFor({ state: 'visible', timeout });
    await this.page.waitForTimeout(100); // Stability delay
    return element;
  }

  /**
   * Type text with realistic typing speed
   */
  async typeText(selector: string, text: string, options?: { delay?: number; clear?: boolean }): Promise<void> {
    const element = await this.waitForElement(selector);

    if (options?.clear !== false) {
      await element.clear();
    }

    await element.type(text, { delay: options?.delay || 50 });
  }

  /**
   * Click element with wait
   */
  async clickElement(selector: string, timeout = testConfig.defaultTimeout): Promise<void> {
    const element = await this.waitForElement(selector, timeout);
    await element.click();
  }

  /**
   * Check if text exists on page
   */
  async expectTextVisible(text: string, timeout = testConfig.defaultTimeout): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible({ timeout });
  }

  /**
   * Check if element contains specific text
   */
  async expectElementText(selector: string, text: string, timeout = testConfig.defaultTimeout): Promise<void> {
    const element = this.page.locator(selector);
    await expect(element).toContainText(text, { timeout });
  }

  /**
   * Wait for URL to match pattern
   */
  async waitForUrl(pattern: string | RegExp, timeout = testConfig.defaultTimeout): Promise<void> {
    await this.page.waitForURL(pattern, { timeout });
  }

  /**
   * Take screenshot for debugging
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `test-results/screenshots/${name}-${Date.now()}.png`,
      fullPage: true,
    });
  }

  /**
   * Mock API response
   */
  async mockApiCall(
    endpoint: string | RegExp,
    response: any,
    options?: { status?: number; delay?: number }
  ): Promise<void> {
    await this.page.route(endpoint, async (route) => {
      if (options?.delay) {
        await this.page.waitForTimeout(options.delay);
      }

      await route.fulfill({
        status: options?.status || 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    });
  }

  /**
   * Simulate network conditions
   */
  async setNetworkCondition(condition: 'offline' | 'online' | 'slow'): Promise<void> {
    switch (condition) {
      case 'offline':
        await this.page.context().setOffline(true);
        break;
      case 'online':
        await this.page.context().setOffline(false);
        break;
      case 'slow':
        await this.page.context().setOffline(false);
        // Simulate slow network with route delays
        await this.page.route('**/*', (route) => {
          setTimeout(() => route.continue(), 1000);
        });
        break;
    }
  }

  /**
   * Wait for WebSocket connection
   */
  async waitForWebSocketConnection(timeout = testConfig.defaultTimeout): Promise<void> {
    await this.page.waitForFunction(
      () => {
        return (window as any).wsConnected === true;
      },
      { timeout }
    );
  }

  /**
   * Simulate WebSocket message
   */
  async simulateWebSocketMessage(message: any): Promise<void> {
    await this.page.evaluate((msg) => {
      const event = new MessageEvent('message', {
        data: JSON.stringify(msg),
      });

      if ((window as any).mockWebSocket?.onmessage) {
        (window as any).mockWebSocket.onmessage(event);
      }
    }, message);
  }

  /**
   * Check console errors
   */
  async getConsoleErrors(): Promise<string[]> {
    const errors: string[] = [];

    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    return errors;
  }

  /**
   * Fill form with multiple fields
   */
  async fillForm(fields: Record<string, string>): Promise<void> {
    for (const [selector, value] of Object.entries(fields)) {
      await this.typeText(selector, value);
    }
  }

  /**
   * Select option from dropdown
   */
  async selectOption(selector: string, value: string): Promise<void> {
    const element = await this.waitForElement(selector);
    await element.selectOption(value);
  }

  /**
   * Check if element is enabled/disabled
   */
  async expectElementEnabled(selector: string, enabled = true): Promise<void> {
    const element = this.page.locator(selector);
    if (enabled) {
      await expect(element).toBeEnabled();
    } else {
      await expect(element).toBeDisabled();
    }
  }

  /**
   * Wait for loading state to complete
   */
  async waitForLoadingComplete(): Promise<void> {
    // Wait for any loading spinners to disappear
    await this.page.waitForSelector('[data-testid*="loading"], .loading', {
      state: 'hidden',
      timeout: testConfig.defaultTimeout
    }).catch(() => {
      // Ignore if no loading elements are found
    });

    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Retry an action until it succeeds or times out
   */
  async retryAction<T>(
    action: () => Promise<T>,
    options?: { maxAttempts?: number; delay?: number }
  ): Promise<T> {
    const maxAttempts = options?.maxAttempts || 3;
    const delay = options?.delay || 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await action();
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        await this.page.waitForTimeout(delay);
      }
    }

    throw new Error('Retry action failed');
  }
}

/**
 * Authentication test helpers
 */
export class AuthHelpers extends TestHelpers {
  /**
   * Navigate to login page
   */
  async goToLogin(): Promise<void> {
    await this.navigateTo('/login');
  }

  /**
   * Request magic link
   */
  async requestMagicLink(email: string): Promise<void> {
    await this.goToLogin();
    await this.typeText('[data-testid="email-input"]', email);
    await this.clickElement('[data-testid="send-magic-link-button"]');
    await this.expectTextVisible('Magic link sent');
  }

  /**
   * Simulate magic link click (mock the token verification)
   */
  async simulateMagicLinkClick(email: string): Promise<void> {
    // Mock the auth verification endpoint
    await this.mockApiCall('**/auth/verify', {
      user: { email, id: 'user-123' },
      accessToken: 'mock-jwt-token',
      refreshToken: 'mock-refresh-token',
      expiresIn: 900,
    });

    // Navigate to verify page with mock token
    await this.navigateTo('/auth/verify?token=mock-token');
    await this.waitForUrl('/dashboard');
  }

  /**
   * Complete authentication flow
   */
  async authenticate(email = testUsers.user.email): Promise<void> {
    await this.requestMagicLink(email);
    await this.simulateMagicLinkClick(email);
  }

  /**
   * Check if user is authenticated
   */
  async expectAuthenticated(): Promise<void> {
    await this.waitForUrl('/dashboard');
    await this.expectElementText('[data-testid="user-menu"]', '@');
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    await this.clickElement('[data-testid="user-menu"]');
    await this.clickElement('[data-testid="logout-button"]');
    await this.waitForUrl('/login');
  }

  /**
   * Check if user is logged out
   */
  async expectLoggedOut(): Promise<void> {
    await this.waitForUrl('/login');
    await this.expectTextVisible('Sign in to your account');
  }
}

/**
 * Agent management test helpers
 */
export class AgentHelpers extends TestHelpers {
  /**
   * Mock agent list API
   */
  async mockAgentList(agents = [mockAgents.claude, mockAgents.gemini]): Promise<void> {
    await this.mockApiCall('**/agents', { agents, total: agents.length });
  }

  /**
   * Navigate to agents page
   */
  async goToAgents(): Promise<void> {
    await this.navigateTo('/agents');
  }

  /**
   * Check agent status display
   */
  async expectAgentStatus(agentId: string, status: string): Promise<void> {
    await this.expectElementText(`[data-testid="agent-${agentId}-status"]`, status);
  }

  /**
   * Check agent activity state
   */
  async expectAgentActivity(agentId: string, activity: string): Promise<void> {
    await this.expectElementText(`[data-testid="agent-${agentId}-activity"]`, activity);
  }

  /**
   * Click on specific agent
   */
  async selectAgent(agentId: string): Promise<void> {
    await this.clickElement(`[data-testid="agent-${agentId}"]`);
  }

  /**
   * Mock WebSocket agent status updates
   */
  async mockAgentStatusUpdate(agentId: string, status: any): Promise<void> {
    await this.simulateWebSocketMessage({
      type: 'AGENT_STATUS',
      id: 'msg-123',
      timestamp: Date.now(),
      payload: {
        agentId,
        ...status,
      },
    });
  }
}

/**
 * Command execution test helpers
 */
export class CommandHelpers extends TestHelpers {
  /**
   * Navigate to dashboard
   */
  async goToDashboard(): Promise<void> {
    await this.navigateTo('/dashboard');
  }

  /**
   * Execute command on agent
   */
  async executeCommand(command: string, agentId?: string): Promise<void> {
    if (agentId) {
      await this.selectOption('[data-testid="agent-select"]', agentId);
    }

    await this.typeText('[data-testid="command-input"]', command);
    await this.clickElement('[data-testid="execute-button"]');
  }

  /**
   * Wait for command completion
   */
  async waitForCommandCompletion(timeout = testConfig.longTimeout): Promise<void> {
    await this.expectElementText(
      '[data-testid="command-status"]',
      'COMPLETED',
      timeout
    );
  }

  /**
   * Check terminal output
   */
  async expectTerminalOutput(text: string): Promise<void> {
    await this.expectElementText('[data-testid="terminal-output"]', text);
  }

  /**
   * Simulate terminal output via WebSocket
   */
  async simulateTerminalOutput(commandId: string, output: string): Promise<void> {
    await this.simulateWebSocketMessage({
      type: 'TERMINAL_STREAM',
      id: 'msg-terminal',
      timestamp: Date.now(),
      payload: {
        commandId,
        agentId: mockAgents.claude.id,
        agentName: mockAgents.claude.name,
        agentType: mockAgents.claude.type,
        streamType: 'STDOUT',
        content: output,
        ansiCodes: false,
      },
    });
  }

  /**
   * Trigger emergency stop
   */
  async triggerEmergencyStop(): Promise<void> {
    await this.clickElement('[data-testid="emergency-stop-button"]');
    await this.expectTextVisible('Emergency stop activated');
  }

  /**
   * Mock command execution API
   */
  async mockCommandExecution(commandId = 'cmd-123'): Promise<void> {
    await this.mockApiCall('**/commands', {
      id: commandId,
      status: 'QUEUED',
      agentId: mockAgents.claude.id,
    });
  }
}

/**
 * Preset management test helpers
 */
export class PresetHelpers extends TestHelpers {
  /**
   * Navigate to presets page
   */
  async goToPresets(): Promise<void> {
    await this.navigateTo('/presets');
  }

  /**
   * Mock presets list
   */
  async mockPresetsList(presets = [mockPresets.codeReview, mockPresets.investigation]): Promise<void> {
    await this.mockApiCall('**/presets', { presets, total: presets.length });
  }

  /**
   * Create new preset
   */
  async createPreset(preset: { name: string; description: string; command: string; category?: string }): Promise<void> {
    await this.clickElement('[data-testid="create-preset-button"]');
    await this.fillForm({
      '[data-testid="preset-name"]': preset.name,
      '[data-testid="preset-description"]': preset.description,
      '[data-testid="preset-command"]': preset.command,
    });

    if (preset.category) {
      await this.selectOption('[data-testid="preset-category"]', preset.category);
    }

    await this.clickElement('[data-testid="save-preset-button"]');
  }

  /**
   * Use preset for command
   */
  async usePreset(presetId: string): Promise<void> {
    await this.clickElement(`[data-testid="preset-${presetId}-use"]`);
    await this.expectElementText('[data-testid="command-input"]', '');
  }

  /**
   * Edit preset
   */
  async editPreset(presetId: string, updates: Partial<{ name: string; description: string; command: string }>): Promise<void> {
    await this.clickElement(`[data-testid="preset-${presetId}-edit"]`);

    for (const [field, value] of Object.entries(updates)) {
      await this.typeText(`[data-testid="preset-${field}"]`, value);
    }

    await this.clickElement('[data-testid="save-preset-button"]');
  }

  /**
   * Delete preset
   */
  async deletePreset(presetId: string): Promise<void> {
    await this.clickElement(`[data-testid="preset-${presetId}-delete"]`);
    await this.clickElement('[data-testid="confirm-delete-button"]');
  }
}