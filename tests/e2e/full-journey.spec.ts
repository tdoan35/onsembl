/**
 * E2E Tests for Full User Journey
 * Tests complete end-to-end workflows from login to command execution
 */

import { test, expect } from '@playwright/test';
import {
  LoginPage,
  DashboardPage,
  AgentsPage,
  PresetsPage,
  Navigation,
  Terminal,
} from './fixtures/page-objects';
import { testUsers, mockAgents, mockPresets, testConfig } from './fixtures/test-helpers';

test.describe('Full User Journey', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let agentsPage: AgentsPage;
  let presetsPage: PresetsPage;
  let navigation: Navigation;
  let terminal: Terminal;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    agentsPage = new AgentsPage(page);
    presetsPage = new PresetsPage(page);
    navigation = new Navigation(page);
    terminal = new Terminal(page);

    // Set up comprehensive mocking for all APIs
    await setupApiMocks(page);
  });

  test.describe('New User Onboarding Journey', () => {
    test('should complete full onboarding from signup to first command', async ({ page }) => {
      // Step 1: Landing page and authentication
      await loginPage.goto();
      await loginPage.waitForPageReady();

      // Should show login form
      await expect(page.getByText('Sign in to your account')).toBeVisible();

      // Request magic link
      await loginPage.sendMagicLink(testUsers.newUser.email);
      await expect(page.getByText('Magic link sent')).toBeVisible();

      // Simulate magic link verification
      await page.goto('/auth/verify?token=new-user-token');
      await page.waitForURL('/dashboard');

      // Step 2: First time dashboard experience
      await dashboardPage.waitForPageReady();

      // Should show welcome tour for new users
      await expect(page.locator('[data-testid="welcome-tour"]')).toBeVisible();
      await expect(page.getByText('Welcome to Onsembl.ai')).toBeVisible();

      // Take the tour
      await page.click('[data-testid="start-tour"]');

      // Tour should highlight key features
      await expect(page.locator('[data-testid="tour-step-1"]')).toBeVisible();
      await expect(page.getByText('This is where you execute commands')).toBeVisible();

      await page.click('[data-testid="tour-next"]');
      await expect(page.getByText('Select an agent to send commands')).toBeVisible();

      await page.click('[data-testid="tour-next"]');
      await expect(page.getByText('Monitor real-time output here')).toBeVisible();

      await page.click('[data-testid="tour-finish"]');

      // Step 3: Explore agents
      await navigation.goToAgents();
      await agentsPage.waitForPageReady();

      // Should show agent overview
      await agentsPage.expectAgentVisible(mockAgents.claude.id);
      await agentsPage.expectAgentVisible(mockAgents.gemini.id);

      // Check agent details
      await agentsPage.clickAgent(mockAgents.claude.id);
      await expect(page.getByText('Agent Details')).toBeVisible();
      await expect(page.getByText('Max Tokens: 100,000')).toBeVisible();

      // Close agent details
      await page.click('[data-testid="close-modal"]');

      // Step 4: Explore presets
      await navigation.goToPresets();
      await presetsPage.waitForPageReady();

      // Should show available presets
      await presetsPage.expectPresetVisible(mockPresets.codeReview.id);
      await presetsPage.expectPresetVisible(mockPresets.investigation.id);

      // Step 5: Execute first command
      await navigation.goToDashboard();
      await dashboardPage.waitForPageReady();

      // Use a preset for first command
      await page.click('[data-testid="preset-selector"]');
      await page.click(`[data-testid="preset-option-${mockPresets.codeReview.id}"]`);

      // Command should be pre-filled
      const commandInput = page.locator('[data-testid="command-input"]');
      await expect(commandInput).toHaveValue(mockPresets.codeReview.command);

      // Select agent and execute
      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.executeCommand();

      // Should show command execution
      await dashboardPage.waitForCommandStatus('QUEUED');

      // Simulate command execution with output
      await simulateCommandExecution(page, 'cmd-first');

      // Should show success
      await dashboardPage.waitForCommandStatus('COMPLETED');
      await terminal.expectOutputContains('Analysis complete');

      // Step 6: Show onboarding completion
      await expect(page.getByText('Congratulations! You\'ve completed your first command')).toBeVisible();
      await expect(page.locator('[data-testid="onboarding-complete"]')).toBeVisible();

      // Should offer next steps
      await expect(page.getByText('What would you like to do next?')).toBeVisible();
      await expect(page.getByText('Create a custom preset')).toBeVisible();
      await expect(page.getByText('Explore more agents')).toBeVisible();
    });

    test('should handle interrupted onboarding gracefully', async ({ page }) => {
      // Start onboarding
      await loginPage.goto();
      await loginPage.sendMagicLink(testUsers.newUser.email);
      await page.goto('/auth/verify?token=new-user-token');
      await page.waitForURL('/dashboard');

      // Start tour
      await page.click('[data-testid="start-tour"]');
      await expect(page.locator('[data-testid="tour-step-1"]')).toBeVisible();

      // Simulate navigation away (interruption)
      await navigation.goToAgents();

      // Should offer to resume tour
      await expect(page.getByText('Resume tour?')).toBeVisible();
      await page.click('[data-testid="resume-tour"]');

      // Should continue from where left off
      await expect(page.locator('[data-testid="tour-step-2"]')).toBeVisible();
    });
  });

  test.describe('Daily Workflow Journey', () => {
    test('should complete typical daily workflow', async ({ page }) => {
      // Authenticate as existing user
      await authenticateUser(page, testUsers.user.email);

      // Step 1: Morning check-in - review agent status
      await navigation.goToAgents();
      await agentsPage.waitForPageReady();

      // Check all agents are healthy
      await agentsPage.expectAgentStatus(mockAgents.claude.id, 'ONLINE');
      await agentsPage.expectAgentStatus(mockAgents.gemini.id, 'ONLINE');

      // Step 2: Execute investigation command
      await navigation.goToDashboard();
      await dashboardPage.waitForPageReady();

      // Use investigation preset
      await page.click('[data-testid="preset-selector"]');
      await page.click(`[data-testid="preset-option-${mockPresets.investigation.id}"]`);

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.executeCommand();

      // Monitor execution
      await dashboardPage.waitForCommandStatus('EXECUTING');
      await simulateCommandExecution(page, 'cmd-investigation');
      await dashboardPage.waitForCommandStatus('COMPLETED');

      // Step 3: Review results and create follow-up
      await terminal.expectOutputContains('Investigation findings');

      // Based on results, execute follow-up command
      await dashboardPage.enterCommand('Based on the investigation, please provide detailed recommendations for fixing the identified issues.');
      await dashboardPage.executeCommand();

      await simulateCommandExecution(page, 'cmd-followup');
      await dashboardPage.waitForCommandStatus('COMPLETED');

      // Step 4: Save useful command as preset
      await page.click('[data-testid="save-as-preset"]');

      await page.fill('[data-testid="preset-name"]', 'Issue Recommendations');
      await page.fill('[data-testid="preset-description"]', 'Generate recommendations based on investigation');
      await page.selectOption('[data-testid="preset-category"]', 'PLAN');
      await page.click('[data-testid="save-preset-button"]');

      await expect(page.getByText('Preset saved successfully')).toBeVisible();

      // Step 5: Execute batch analysis on multiple agents
      const batchCommands = [
        'Analyze security vulnerabilities in the authentication module',
        'Review performance bottlenecks in the API layer',
        'Check code quality metrics for the frontend components',
      ];

      for (let i = 0; i < batchCommands.length; i++) {
        const agentId = i === 0 ? mockAgents.claude.id : mockAgents.gemini.id;

        await dashboardPage.selectAgent(agentId);
        await dashboardPage.enterCommand(batchCommands[i]);
        await dashboardPage.executeCommand();

        // Don't wait for completion, queue the next one
        await page.waitForTimeout(500);
      }

      // Should show queue status
      await expect(page.getByText('3 commands in queue')).toBeVisible();

      // Step 6: Monitor multiple executions
      for (let i = 0; i < batchCommands.length; i++) {
        await simulateCommandExecution(page, `cmd-batch-${i}`);
      }

      // All should complete
      await expect(page.getByText('0 commands in queue')).toBeVisible();

      // Step 7: End of day review
      await navigation.goToPresets();

      // Should see the newly created preset
      await expect(page.getByText('Issue Recommendations')).toBeVisible();

      // View usage analytics
      await page.click('[data-testid="view-analytics"]');
      await expect(page.getByText('Commands executed today: 6')).toBeVisible();
      await expect(page.getByText('Most used preset: Investigation')).toBeVisible();
    });

    test('should handle workflow interruptions and recovery', async ({ page }) => {
      await authenticateUser(page, testUsers.user.email);

      // Start long-running command
      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('Long analysis task that will be interrupted');
      await dashboardPage.executeCommand();

      await dashboardPage.waitForCommandStatus('EXECUTING');

      // Simulate network interruption
      await page.context().setOffline(true);
      await expect(page.getByText('Connection lost')).toBeVisible();

      // Restore connection
      await page.context().setOffline(false);
      await expect(page.getByText('Connection restored')).toBeVisible();

      // Command should resume or recover
      await expect(page.getByText('Command execution resumed')).toBeVisible();

      // Complete the command
      await simulateCommandExecution(page, 'cmd-recovery');
      await dashboardPage.waitForCommandStatus('COMPLETED');

      // Should show recovery statistics
      await expect(page.getByText('Command recovered after interruption')).toBeVisible();
    });
  });

  test.describe('Collaborative Workflow Journey', () => {
    test('should handle multi-user collaboration scenario', async ({ page, browser }) => {
      // Simulate multiple users working on the same project
      const context2 = await browser.newContext();
      const page2 = await context2.newPage();

      // User 1: Start investigation
      await authenticateUser(page, testUsers.user.email);
      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('Investigate database performance issues');
      await dashboardPage.executeCommand();

      // User 2: Monitor progress and add related task
      await authenticateUser(page2, testUsers.admin.email);
      await setupApiMocks(page2);

      const dashboardPage2 = new DashboardPage(page2);
      await dashboardPage2.goto();
      await dashboardPage2.waitForPageReady();

      // Should see User 1's command in progress
      await expect(page2.getByText('Investigation in progress by user@onsembl.ai')).toBeVisible();

      // User 2 adds complementary analysis
      await dashboardPage2.selectAgent(mockAgents.gemini.id);
      await dashboardPage2.enterCommand('Review database schema for optimization opportunities');
      await dashboardPage2.executeCommand();

      // Both commands should be visible in activity feed
      await expect(page.getByText('2 active commands')).toBeVisible();
      await expect(page2.getByText('2 active commands')).toBeVisible();

      // Complete both commands
      await simulateCommandExecution(page, 'cmd-collab-1');
      await simulateCommandExecution(page2, 'cmd-collab-2');

      // Both users should see completion notifications
      await expect(page.getByText('Database investigation completed')).toBeVisible();
      await expect(page2.getByText('Schema analysis completed')).toBeVisible();

      await context2.close();
    });

    test('should handle concurrent agent usage', async ({ page }) => {
      await authenticateUser(page, testUsers.user.email);

      // Queue multiple commands on same agent
      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      const commands = [
        'First analysis task',
        'Second analysis task',
        'Third analysis task',
      ];

      // Queue all commands quickly
      for (const command of commands) {
        await dashboardPage.selectAgent(mockAgents.claude.id);
        await dashboardPage.enterCommand(command);
        await dashboardPage.executeCommand();
        await page.waitForTimeout(200);
      }

      // Should show queue with proper ordering
      await expect(page.getByText('3 commands in queue')).toBeVisible();
      await expect(page.getByText('Position 1: First analysis task')).toBeVisible();
      await expect(page.getByText('Position 2: Second analysis task')).toBeVisible();
      await expect(page.getByText('Position 3: Third analysis task')).toBeVisible();

      // Execute commands in order
      for (let i = 0; i < commands.length; i++) {
        await simulateCommandExecution(page, `cmd-queue-${i}`);
        await page.waitForTimeout(500);
      }

      // Queue should be empty
      await expect(page.getByText('0 commands in queue')).toBeVisible();
    });
  });

  test.describe('Error Recovery Journey', () => {
    test('should recover from agent failures gracefully', async ({ page }) => {
      await authenticateUser(page, testUsers.user.email);

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Start command on agent
      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('Task that will encounter agent failure');
      await dashboardPage.executeCommand();

      await dashboardPage.waitForCommandStatus('EXECUTING');

      // Simulate agent failure
      await page.evaluate((agentId) => {
        const message = {
          type: 'AGENT_STATUS',
          id: 'msg-error',
          timestamp: Date.now(),
          payload: {
            agentId,
            status: 'ERROR',
            activityState: 'ERROR',
            lastError: 'Agent connection lost',
          },
        };

        const event = new MessageEvent('message', {
          data: JSON.stringify(message),
        });

        if ((window as any).mockWebSocket?.onmessage) {
          (window as any).mockWebSocket.onmessage(event);
        }
      }, mockAgents.claude.id);

      // Should show agent error
      await expect(page.getByText('Agent connection lost')).toBeVisible();

      // Should offer recovery options
      await expect(page.locator('[data-testid="retry-command"]')).toBeVisible();
      await expect(page.locator('[data-testid="switch-agent"]')).toBeVisible();

      // Try switching to different agent
      await page.click('[data-testid="switch-agent"]');
      await page.selectOption('[data-testid="alternative-agent"]', mockAgents.gemini.id);
      await page.click('[data-testid="retry-on-agent"]');

      // Command should restart on new agent
      await dashboardPage.waitForCommandStatus('QUEUED');
      await simulateCommandExecution(page, 'cmd-recovery');
      await dashboardPage.waitForCommandStatus('COMPLETED');

      // Should show successful recovery
      await expect(page.getByText('Command completed on alternative agent')).toBeVisible();
    });

    test('should handle system-wide emergency scenarios', async ({ page }) => {
      await authenticateUser(page, testUsers.user.email);

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Start multiple commands
      const agents = [mockAgents.claude.id, mockAgents.gemini.id];
      for (let i = 0; i < 4; i++) {
        await dashboardPage.selectAgent(agents[i % 2]);
        await dashboardPage.enterCommand(`Emergency test command ${i + 1}`);
        await dashboardPage.executeCommand();
        await page.waitForTimeout(200);
      }

      // Should show active commands
      await expect(page.getByText('4 commands in queue')).toBeVisible();

      // Trigger emergency stop
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Should stop all commands
      await expect(page.getByText('Emergency stop activated')).toBeVisible();
      await expect(page.getByText('4 commands stopped')).toBeVisible();

      // Should show system status
      await expect(page.getByText('All agents stopped')).toBeVisible();

      // Restart system
      await page.click('[data-testid="restart-agents-button"]');
      await page.click('[data-testid="confirm-restart"]');

      // Should show restart progress
      await expect(page.getByText('Restarting agents...')).toBeVisible();

      // Simulate agents coming back online
      for (const agent of agents) {
        await page.evaluate((agentId) => {
          const message = {
            type: 'AGENT_STATUS',
            id: `msg-restart-${agentId}`,
            timestamp: Date.now(),
            payload: {
              agentId,
              status: 'ONLINE',
              activityState: 'IDLE',
            },
          };

          const event = new MessageEvent('message', {
            data: JSON.stringify(message),
          });

          if ((window as any).mockWebSocket?.onmessage) {
            (window as any).mockWebSocket.onmessage(event);
          }
        }, agent);
      }

      // Should show system recovery
      await expect(page.getByText('All agents restarted successfully')).toBeVisible();
      await expect(page.getByText('System is ready for new commands')).toBeVisible();
    });
  });

  test.describe('Performance Under Load Journey', () => {
    test('should handle high-volume command execution', async ({ page }) => {
      await authenticateUser(page, testUsers.user.email);

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Execute many commands rapidly
      const commandCount = 20;
      const startTime = Date.now();

      for (let i = 0; i < commandCount; i++) {
        await dashboardPage.selectAgent(mockAgents.claude.id);
        await dashboardPage.enterCommand(`Bulk command ${i + 1}`);
        await dashboardPage.executeCommand();

        // Don't wait for each command, just queue them
        if (i % 5 === 0) {
          await page.waitForTimeout(100); // Brief pause every 5 commands
        }
      }

      const queueTime = Date.now() - startTime;

      // Should queue all commands within reasonable time
      expect(queueTime).toBeLessThan(10000); // 10 seconds max

      // Should show queue status
      await expect(page.getByText(`${commandCount} commands in queue`)).toBeVisible();

      // Process commands in batches
      for (let i = 0; i < commandCount; i += 3) {
        const batchEnd = Math.min(i + 3, commandCount);

        // Simulate batch processing
        for (let j = i; j < batchEnd; j++) {
          await simulateCommandExecution(page, `cmd-bulk-${j}`, 100); // Faster execution
        }

        await page.waitForTimeout(500);
      }

      // All commands should complete
      await expect(page.getByText('0 commands in queue')).toBeVisible();

      const totalTime = Date.now() - startTime;

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(30000); // 30 seconds max

      // Should show performance metrics
      await expect(page.getByText(`Processed ${commandCount} commands`)).toBeVisible();
      await expect(page.getByText(/Average execution time: \d+ms/)).toBeVisible();
    });

    test('should maintain responsiveness during heavy load', async ({ page }) => {
      await authenticateUser(page, testUsers.user.email);

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Start many long-running commands
      for (let i = 0; i < 10; i++) {
        await dashboardPage.selectAgent(mockAgents.claude.id);
        await dashboardPage.enterCommand(`Long task ${i + 1}`);
        await dashboardPage.executeCommand();
      }

      // UI should remain responsive
      const responseStart = Date.now();
      await navigation.goToAgents();
      await agentsPage.waitForPageReady();
      const responseTime = Date.now() - responseStart;

      // Navigation should be fast even under load
      expect(responseTime).toBeLessThan(2000);

      // Should still show correct status
      await agentsPage.expectAgentStatus(mockAgents.claude.id, 'ONLINE');

      // Should be able to trigger emergency stop
      await navigation.goToDashboard();
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Should stop quickly even under load
      await expect(page.getByText('Emergency stop activated')).toBeVisible({ timeout: 5000 });
    });
  });

  // Helper functions
  async function setupApiMocks(page: any) {
    // Mock authentication
    await page.route('**/auth/verify', (route: any) => {
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

    // Mock agents API
    await page.route('**/agents', (route: any) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          agents: [mockAgents.claude, mockAgents.gemini],
          total: 2,
        }),
      });
    });

    // Mock presets API
    await page.route('**/presets', (route: any) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [mockPresets.codeReview, mockPresets.investigation],
            total: 2,
          }),
        });
      } else if (route.request().method() === 'POST') {
        const requestData = route.request().postDataJSON();
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: `preset-${Date.now()}`,
            ...requestData,
            createdAt: Date.now(),
          }),
        });
      }
    });

    // Mock command execution API
    await page.route('**/commands', (route: any) => {
      const commandId = `cmd-${Date.now()}`;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: commandId,
          status: 'QUEUED',
          agentId: mockAgents.claude.id,
        }),
      });
    });

    // Mock WebSocket connection
    await page.addInitScript(() => {
      class MockWebSocket {
        readyState = WebSocket.OPEN;
        onopen: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onclose: ((event: CloseEvent) => void) | null = null;

        constructor(url: string) {
          setTimeout(() => {
            if (this.onopen) {
              this.onopen(new Event('open'));
            }
            (window as any).wsConnected = true;
            (window as any).mockWebSocket = this;
          }, 100);
        }

        send(data: string) {
          (window as any).lastSentMessage = JSON.parse(data);
        }

        close() {
          (window as any).wsConnected = false;
        }
      }

      (window as any).WebSocket = MockWebSocket;
    });
  }

  async function authenticateUser(page: any, email: string) {
    await page.goto('/auth/verify?token=valid-token');
    await page.waitForURL('/dashboard');
  }

  async function simulateCommandExecution(page: any, commandId: string, delay = 500) {
    // Simulate command status progression
    const statuses = ['QUEUED', 'EXECUTING', 'COMPLETED'];

    for (const status of statuses) {
      await page.evaluate((data) => {
        const message = {
          type: 'COMMAND_STATUS',
          id: `msg-${data.commandId}-${data.status}`,
          timestamp: Date.now(),
          payload: {
            commandId: data.commandId,
            status: data.status,
          },
        };

        const event = new MessageEvent('message', {
          data: JSON.stringify(message),
        });

        if ((window as any).mockWebSocket?.onmessage) {
          (window as any).mockWebSocket.onmessage(event);
        }
      }, { commandId, status });

      // Add terminal output for executing status
      if (status === 'EXECUTING') {
        await page.evaluate((data) => {
          const message = {
            type: 'TERMINAL_STREAM',
            id: `terminal-${data.commandId}`,
            timestamp: Date.now(),
            payload: {
              commandId: data.commandId,
              agentId: 'agent-claude-1',
              streamType: 'STDOUT',
              content: 'Analysis complete. Results available.',
              ansiCodes: false,
            },
          };

          const event = new MessageEvent('message', {
            data: JSON.stringify(message),
          });

          if ((window as any).mockWebSocket?.onmessage) {
            (window as any).mockWebSocket.onmessage(event);
          }
        }, { commandId });
      }

      await page.waitForTimeout(delay);
    }
  }
});