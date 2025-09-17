/**
 * Page Object Models for E2E Tests
 * Encapsulates page interactions and selectors
 */

import { Page, Locator } from '@playwright/test';
import { TestHelpers } from './test-helpers';

/**
 * Base page object with common functionality
 */
export abstract class BasePage extends TestHelpers {
  protected abstract readonly url: string;

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to this page
   */
  async goto(): Promise<void> {
    await this.navigateTo(this.url);
  }

  /**
   * Check if we're on the correct page
   */
  async isOnPage(): Promise<boolean> {
    try {
      await this.waitForUrl(this.url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for page to be ready
   */
  abstract waitForPageReady(): Promise<void>;
}

/**
 * Login page object
 */
export class LoginPage extends BasePage {
  protected readonly url = '/login';

  // Selectors
  private readonly emailInput = '[data-testid="email-input"]';
  private readonly sendMagicLinkButton = '[data-testid="send-magic-link-button"]';
  private readonly loadingSpinner = '[data-testid="loading-spinner"]';
  private readonly successMessage = '[data-testid="success-message"]';
  private readonly errorMessage = '[data-testid="error-message"]';

  async waitForPageReady(): Promise<void> {
    await this.waitForElement(this.emailInput);
  }

  async enterEmail(email: string): Promise<void> {
    await this.typeText(this.emailInput, email);
  }

  async clickSendMagicLink(): Promise<void> {
    await this.clickElement(this.sendMagicLinkButton);
  }

  async waitForSuccessMessage(): Promise<void> {
    await this.waitForElement(this.successMessage);
  }

  async waitForErrorMessage(): Promise<void> {
    await this.waitForElement(this.errorMessage);
  }

  async getErrorMessage(): Promise<string> {
    const element = await this.waitForElement(this.errorMessage);
    return await element.textContent() || '';
  }

  async isLoading(): Promise<boolean> {
    return await this.page.locator(this.loadingSpinner).isVisible();
  }

  /**
   * Complete magic link flow
   */
  async sendMagicLink(email: string): Promise<void> {
    await this.enterEmail(email);
    await this.clickSendMagicLink();
    await this.waitForSuccessMessage();
  }
}

/**
 * Dashboard page object
 */
export class DashboardPage extends BasePage {
  protected readonly url = '/dashboard';

  // Selectors
  private readonly agentSelect = '[data-testid="agent-select"]';
  private readonly commandInput = '[data-testid="command-input"]';
  private readonly executeButton = '[data-testid="execute-button"]';
  private readonly emergencyStopButton = '[data-testid="emergency-stop-button"]';
  private readonly commandStatus = '[data-testid="command-status"]';
  private readonly terminalOutput = '[data-testid="terminal-output"]';
  private readonly connectionStatus = '[data-testid="connection-status"]';
  private readonly userMenu = '[data-testid="user-menu"]';
  private readonly logoutButton = '[data-testid="logout-button"]';

  async waitForPageReady(): Promise<void> {
    await this.waitForElement(this.commandInput);
    await this.waitForElement(this.agentSelect);
  }

  async selectAgent(agentId: string): Promise<void> {
    await this.selectOption(this.agentSelect, agentId);
  }

  async enterCommand(command: string): Promise<void> {
    await this.typeText(this.commandInput, command);
  }

  async executeCommand(): Promise<void> {
    await this.clickElement(this.executeButton);
  }

  async triggerEmergencyStop(): Promise<void> {
    await this.clickElement(this.emergencyStopButton);
  }

  async waitForCommandStatus(status: string, timeout?: number): Promise<void> {
    await this.expectElementText(this.commandStatus, status, timeout);
  }

  async getTerminalOutput(): Promise<string> {
    const element = await this.waitForElement(this.terminalOutput);
    return await element.textContent() || '';
  }

  async expectTerminalContains(text: string): Promise<void> {
    await this.expectElementText(this.terminalOutput, text);
  }

  async isExecuteButtonEnabled(): Promise<boolean> {
    return await this.page.locator(this.executeButton).isEnabled();
  }

  async isEmergencyStopButtonVisible(): Promise<boolean> {
    return await this.page.locator(this.emergencyStopButton).isVisible();
  }

  async getConnectionStatus(): Promise<string> {
    const element = await this.waitForElement(this.connectionStatus);
    return await element.textContent() || '';
  }

  async openUserMenu(): Promise<void> {
    await this.clickElement(this.userMenu);
  }

  async logout(): Promise<void> {
    await this.openUserMenu();
    await this.clickElement(this.logoutButton);
  }

  /**
   * Execute a complete command flow
   */
  async executeFullCommand(agentId: string, command: string): Promise<void> {
    await this.selectAgent(agentId);
    await this.enterCommand(command);
    await this.executeCommand();
  }
}

/**
 * Agents page object
 */
export class AgentsPage extends BasePage {
  protected readonly url = '/agents';

  // Selectors
  private readonly agentsList = '[data-testid="agents-list"]';
  private readonly createAgentButton = '[data-testid="create-agent-button"]';
  private readonly agentCard = (id: string) => `[data-testid="agent-${id}"]`;
  private readonly agentStatus = (id: string) => `[data-testid="agent-${id}-status"]`;
  private readonly agentActivity = (id: string) => `[data-testid="agent-${id}-activity"]`;
  private readonly agentName = (id: string) => `[data-testid="agent-${id}-name"]`;
  private readonly refreshButton = '[data-testid="refresh-agents-button"]';

  async waitForPageReady(): Promise<void> {
    await this.waitForElement(this.agentsList);
  }

  async getAgentStatus(agentId: string): Promise<string> {
    const element = await this.waitForElement(this.agentStatus(agentId));
    return await element.textContent() || '';
  }

  async getAgentActivity(agentId: string): Promise<string> {
    const element = await this.waitForElement(this.agentActivity(agentId));
    return await element.textContent() || '';
  }

  async getAgentName(agentId: string): Promise<string> {
    const element = await this.waitForElement(this.agentName(agentId));
    return await element.textContent() || '';
  }

  async clickAgent(agentId: string): Promise<void> {
    await this.clickElement(this.agentCard(agentId));
  }

  async refreshAgents(): Promise<void> {
    await this.clickElement(this.refreshButton);
  }

  async expectAgentVisible(agentId: string): Promise<void> {
    await this.waitForElement(this.agentCard(agentId));
  }

  async expectAgentStatus(agentId: string, status: string): Promise<void> {
    await this.expectElementText(this.agentStatus(agentId), status);
  }

  async expectAgentActivity(agentId: string, activity: string): Promise<void> {
    await this.expectElementText(this.agentActivity(agentId), activity);
  }

  async getAllVisibleAgents(): Promise<string[]> {
    const cards = await this.page.locator(this.agentCard('*')).all();
    const ids: string[] = [];

    for (const card of cards) {
      const testId = await card.getAttribute('data-testid');
      if (testId) {
        const id = testId.replace('agent-', '');
        ids.push(id);
      }
    }

    return ids;
  }
}

/**
 * Presets page object
 */
export class PresetsPage extends BasePage {
  protected readonly url = '/presets';

  // Selectors
  private readonly presetsList = '[data-testid="presets-list"]';
  private readonly createPresetButton = '[data-testid="create-preset-button"]';
  private readonly presetCard = (id: string) => `[data-testid="preset-${id}"]`;
  private readonly presetName = (id: string) => `[data-testid="preset-${id}-name"]`;
  private readonly presetDescription = (id: string) => `[data-testid="preset-${id}-description"]`;
  private readonly presetUseButton = (id: string) => `[data-testid="preset-${id}-use"]`;
  private readonly presetEditButton = (id: string) => `[data-testid="preset-${id}-edit"]`;
  private readonly presetDeleteButton = (id: string) => `[data-testid="preset-${id}-delete"]`;

  // Modal selectors
  private readonly modal = '[data-testid="preset-modal"]';
  private readonly modalNameInput = '[data-testid="preset-name"]';
  private readonly modalDescriptionInput = '[data-testid="preset-description"]';
  private readonly modalCommandInput = '[data-testid="preset-command"]';
  private readonly modalCategorySelect = '[data-testid="preset-category"]';
  private readonly modalSaveButton = '[data-testid="save-preset-button"]';
  private readonly modalCancelButton = '[data-testid="cancel-preset-button"]';

  // Delete confirmation
  private readonly deleteModal = '[data-testid="delete-confirmation-modal"]';
  private readonly confirmDeleteButton = '[data-testid="confirm-delete-button"]';
  private readonly cancelDeleteButton = '[data-testid="cancel-delete-button"]';

  async waitForPageReady(): Promise<void> {
    await this.waitForElement(this.presetsList);
  }

  async clickCreatePreset(): Promise<void> {
    await this.clickElement(this.createPresetButton);
    await this.waitForElement(this.modal);
  }

  async fillPresetForm(preset: {
    name: string;
    description: string;
    command: string;
    category?: string;
  }): Promise<void> {
    await this.typeText(this.modalNameInput, preset.name);
    await this.typeText(this.modalDescriptionInput, preset.description);
    await this.typeText(this.modalCommandInput, preset.command);

    if (preset.category) {
      await this.selectOption(this.modalCategorySelect, preset.category);
    }
  }

  async savePreset(): Promise<void> {
    await this.clickElement(this.modalSaveButton);
    await this.page.waitForSelector(this.modal, { state: 'hidden' });
  }

  async cancelPreset(): Promise<void> {
    await this.clickElement(this.modalCancelButton);
    await this.page.waitForSelector(this.modal, { state: 'hidden' });
  }

  async createNewPreset(preset: {
    name: string;
    description: string;
    command: string;
    category?: string;
  }): Promise<void> {
    await this.clickCreatePreset();
    await this.fillPresetForm(preset);
    await this.savePreset();
  }

  async usePreset(presetId: string): Promise<void> {
    await this.clickElement(this.presetUseButton(presetId));
  }

  async editPreset(presetId: string): Promise<void> {
    await this.clickElement(this.presetEditButton(presetId));
    await this.waitForElement(this.modal);
  }

  async deletePreset(presetId: string, confirm = true): Promise<void> {
    await this.clickElement(this.presetDeleteButton(presetId));
    await this.waitForElement(this.deleteModal);

    if (confirm) {
      await this.clickElement(this.confirmDeleteButton);
    } else {
      await this.clickElement(this.cancelDeleteButton);
    }

    await this.page.waitForSelector(this.deleteModal, { state: 'hidden' });
  }

  async expectPresetVisible(presetId: string): Promise<void> {
    await this.waitForElement(this.presetCard(presetId));
  }

  async getPresetName(presetId: string): Promise<string> {
    const element = await this.waitForElement(this.presetName(presetId));
    return await element.textContent() || '';
  }

  async getPresetDescription(presetId: string): Promise<string> {
    const element = await this.waitForElement(this.presetDescription(presetId));
    return await element.textContent() || '';
  }

  async getAllVisiblePresets(): Promise<string[]> {
    const cards = await this.page.locator(this.presetCard('*')).all();
    const ids: string[] = [];

    for (const card of cards) {
      const testId = await card.getAttribute('data-testid');
      if (testId) {
        const id = testId.replace('preset-', '');
        ids.push(id);
      }
    }

    return ids;
  }
}

/**
 * Auth verification page object (for magic link handling)
 */
export class AuthVerifyPage extends BasePage {
  protected readonly url = '/auth/verify';

  // Selectors
  private readonly loadingMessage = '[data-testid="verifying-message"]';
  private readonly successMessage = '[data-testid="verification-success"]';
  private readonly errorMessage = '[data-testid="verification-error"]';

  async waitForPageReady(): Promise<void> {
    await this.waitForElement(this.loadingMessage);
  }

  async waitForVerificationComplete(): Promise<void> {
    try {
      await this.waitForElement(this.successMessage, 10000);
    } catch {
      await this.waitForElement(this.errorMessage, 1000);
    }
  }

  async isVerificationSuccessful(): Promise<boolean> {
    return await this.page.locator(this.successMessage).isVisible();
  }

  async getVerificationError(): Promise<string> {
    const element = await this.waitForElement(this.errorMessage);
    return await element.textContent() || '';
  }
}

/**
 * Navigation component object (shared across pages)
 */
export class Navigation extends TestHelpers {
  // Selectors
  private readonly navBar = '[data-testid="main-navigation"]';
  private readonly dashboardLink = '[data-testid="nav-dashboard"]';
  private readonly agentsLink = '[data-testid="nav-agents"]';
  private readonly presetsLink = '[data-testid="nav-presets"]';
  private readonly userMenu = '[data-testid="user-menu"]';
  private readonly logoutButton = '[data-testid="logout-button"]';

  async waitForNavReady(): Promise<void> {
    await this.waitForElement(this.navBar);
  }

  async goToDashboard(): Promise<void> {
    await this.clickElement(this.dashboardLink);
    await this.waitForUrl('/dashboard');
  }

  async goToAgents(): Promise<void> {
    await this.clickElement(this.agentsLink);
    await this.waitForUrl('/agents');
  }

  async goToPresets(): Promise<void> {
    await this.clickElement(this.presetsLink);
    await this.waitForUrl('/presets');
  }

  async logout(): Promise<void> {
    await this.clickElement(this.userMenu);
    await this.clickElement(this.logoutButton);
    await this.waitForUrl('/login');
  }

  async isUserMenuVisible(): Promise<boolean> {
    return await this.page.locator(this.userMenu).isVisible();
  }
}

/**
 * Terminal component object
 */
export class Terminal extends TestHelpers {
  // Selectors
  private readonly terminal = '[data-testid="terminal"]';
  private readonly terminalOutput = '[data-testid="terminal-output"]';
  private readonly clearButton = '[data-testid="terminal-clear"]';
  private readonly fullscreenButton = '[data-testid="terminal-fullscreen"]';

  async waitForTerminalReady(): Promise<void> {
    await this.waitForElement(this.terminal);
  }

  async getOutput(): Promise<string> {
    const element = await this.waitForElement(this.terminalOutput);
    return await element.textContent() || '';
  }

  async expectOutputContains(text: string): Promise<void> {
    await this.expectElementText(this.terminalOutput, text);
  }

  async clearTerminal(): Promise<void> {
    await this.clickElement(this.clearButton);
  }

  async toggleFullscreen(): Promise<void> {
    await this.clickElement(this.fullscreenButton);
  }

  async isFullscreen(): Promise<boolean> {
    return await this.page.locator(`${this.terminal}.fullscreen`).isVisible();
  }

  async scrollToBottom(): Promise<void> {
    await this.page.locator(this.terminalOutput).evaluate(element => {
      element.scrollTop = element.scrollHeight;
    });
  }

  async waitForNewOutput(timeout = 5000): Promise<void> {
    // Wait for terminal output to change
    await this.page.waitForFunction(
      () => {
        const terminal = document.querySelector('[data-testid="terminal-output"]');
        return terminal && terminal.textContent && terminal.textContent.length > 0;
      },
      { timeout }
    );
  }
}