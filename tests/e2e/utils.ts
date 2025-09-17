/**
 * E2E test utilities for Playwright
 */

import { Page, Locator, expect } from '@playwright/test';

/**
 * Common page object utilities
 */
export class TestUtils {
  constructor(private page: Page) {}

  /**
   * Wait for a WebSocket connection to be established
   */
  async waitForWebSocket(timeout = 5000): Promise<void> {
    await this.page.waitForFunction(
      () => {
        // Check if WebSocket is connected
        return (window as any).webSocketConnected === true;
      },
      { timeout }
    );
  }

  /**
   * Wait for the page to be fully loaded
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Take a screenshot with a descriptive name
   */
  async takeScreenshot(name: string): Promise<Buffer> {
    return await this.page.screenshot({
      path: `test-results/screenshots/${name}.png`,
      fullPage: true,
    });
  }

  /**
   * Simulate typing with realistic delays
   */
  async typeSlowly(selector: string, text: string, delay = 100): Promise<void> {
    const input = this.page.locator(selector);
    await input.clear();
    await input.type(text, { delay });
  }

  /**
   * Wait for element to be visible and stable
   */
  async waitForStableElement(selector: string): Promise<Locator> {
    const element = this.page.locator(selector);
    await element.waitFor({ state: 'visible' });
    await this.page.waitForTimeout(100); // Small delay for stability
    return element;
  }

  /**
   * Check if element contains text (case-insensitive)
   */
  async expectTextContains(
    selector: string,
    text: string,
    options?: { timeout?: number }
  ): Promise<void> {
    const element = this.page.locator(selector);
    await expect(element).toContainText(text, {
      ignoreCase: true,
      ...options,
    });
  }

  /**
   * Mock API responses
   */
  async mockApiResponse(
    endpoint: string,
    response: any,
    status = 200
  ): Promise<void> {
    await this.page.route(endpoint, route => {
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    });
  }

  /**
   * Simulate network offline/online
   */
  async setNetworkCondition(offline: boolean): Promise<void> {
    await this.page.context().setOffline(offline);
  }

  /**
   * Login helper (to be implemented based on auth system)
   */
  async login(email: string, password: string): Promise<void> {
    await this.page.goto('/login');
    await this.page.fill('[data-testid="email"]', email);
    await this.page.fill('[data-testid="password"]', password);
    await this.page.click('[data-testid="login-button"]');
    await this.page.waitForURL('/dashboard');
  }

  /**
   * Logout helper
   */
  async logout(): Promise<void> {
    await this.page.click('[data-testid="user-menu"]');
    await this.page.click('[data-testid="logout-button"]');
    await this.page.waitForURL('/login');
  }
}

/**
 * Agent-specific test helpers
 */
export class AgentTestUtils extends TestUtils {
  /**
   * Create a new agent
   */
  async createAgent(name: string, type: 'claude' | 'gemini' | 'codex'): Promise<void> {
    await this.page.goto('/agents');
    await this.page.click('[data-testid="create-agent-button"]');
    await this.page.fill('[data-testid="agent-name"]', name);
    await this.page.selectOption('[data-testid="agent-type"]', type);
    await this.page.click('[data-testid="save-agent-button"]');

    // Wait for agent to be created
    await this.expectTextContains('[data-testid="agents-list"]', name);
  }

  /**
   * Execute a command on an agent
   */
  async executeCommand(agentId: string, command: string): Promise<void> {
    await this.page.click(`[data-testid="agent-${agentId}"]`);
    await this.page.fill('[data-testid="command-input"]', command);
    await this.page.click('[data-testid="execute-button"]');
  }

  /**
   * Wait for command completion
   */
  async waitForCommandCompletion(timeout = 30000): Promise<void> {
    await this.page.waitForSelector(
      '[data-testid="command-status"]:has-text("completed")',
      { timeout }
    );
  }

  /**
   * Check agent status
   */
  async expectAgentStatus(
    agentId: string,
    status: 'idle' | 'running' | 'error'
  ): Promise<void> {
    await this.expectTextContains(
      `[data-testid="agent-${agentId}-status"]`,
      status
    );
  }
}

/**
 * Terminal test helpers
 */
export class TerminalTestUtils extends TestUtils {
  /**
   * Wait for terminal to be ready
   */
  async waitForTerminal(): Promise<void> {
    await this.waitForStableElement('[data-testid="terminal"]');
  }

  /**
   * Type in terminal
   */
  async typeInTerminal(text: string): Promise<void> {
    const terminal = await this.waitForStableElement('[data-testid="terminal"]');
    await terminal.click();
    await this.page.keyboard.type(text);
  }

  /**
   * Send Enter key to terminal
   */
  async sendEnter(): Promise<void> {
    await this.page.keyboard.press('Enter');
  }

  /**
   * Clear terminal
   */
  async clearTerminal(): Promise<void> {
    await this.page.keyboard.press('Control+L');
  }

  /**
   * Expect terminal output
   */
  async expectTerminalOutput(text: string): Promise<void> {
    await this.expectTextContains('[data-testid="terminal"]', text);
  }
}

/**
 * WebSocket test helpers
 */
export class WebSocketTestUtils extends TestUtils {
  /**
   * Mock WebSocket connection
   */
  async mockWebSocket(): Promise<void> {
    await this.page.addInitScript(() => {
      class MockWebSocket {
        readyState = WebSocket.OPEN;
        onopen: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onclose: ((event: CloseEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;

        constructor(url: string) {
          setTimeout(() => {
            if (this.onopen) {
              this.onopen(new Event('open'));
            }
            (window as any).webSocketConnected = true;
          }, 100);
        }

        send(data: string) {
          console.log('WebSocket send:', data);
        }

        close() {
          (window as any).webSocketConnected = false;
        }

        addEventListener(type: string, listener: EventListener) {
          if (type === 'open' && !this.onopen) {
            this.onopen = listener as any;
          }
        }

        removeEventListener(type: string, listener: EventListener) {
          // Mock implementation
        }
      }

      (window as any).WebSocket = MockWebSocket;
    });
  }

  /**
   * Simulate WebSocket message
   */
  async simulateWebSocketMessage(data: any): Promise<void> {
    await this.page.evaluate((messageData) => {
      const event = new MessageEvent('message', {
        data: JSON.stringify(messageData),
      });
      if ((window as any).mockWebSocket && (window as any).mockWebSocket.onmessage) {
        (window as any).mockWebSocket.onmessage(event);
      }
    }, data);
  }
}