/**
 * E2E Tests for Emergency Stop Functionality
 * Tests emergency stop triggers, agent halting, and system recovery
 */

import { test, expect } from '@playwright/test';
import { DashboardPage, AgentsPage } from './fixtures/page-objects';
import { testUsers, mockAgents, testConfig } from './fixtures/test-helpers';

test.describe('Emergency Stop Functionality', () => {
  let dashboardPage: DashboardPage;
  let agentsPage: AgentsPage;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    agentsPage = new AgentsPage(page);

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

    // Mock agents API
    await page.route('**/agents', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          agents: [mockAgents.claude, mockAgents.gemini],
          total: 2,
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
          console.log('WebSocket send:', data);
          (window as any).lastSentMessage = JSON.parse(data);
        }

        close() {
          (window as any).wsConnected = false;
        }
      }

      (window as any).WebSocket = MockWebSocket;
    });

    // Authenticate
    await page.goto('/auth/verify?token=valid-token');
    await page.waitForURL('/dashboard');
  });

  test.describe('Emergency Stop Button', () => {
    test('should display emergency stop button prominently', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Emergency stop button should be visible and prominent
      const emergencyButton = page.locator('[data-testid="emergency-stop-button"]');
      await expect(emergencyButton).toBeVisible();
      await expect(emergencyButton).toHaveClass(/emergency/);
      await expect(emergencyButton).toHaveClass(/stop/);

      // Should have appropriate styling (red, prominent)
      const styles = await emergencyButton.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          backgroundColor: computed.backgroundColor,
          color: computed.color,
          fontSize: computed.fontSize,
        };
      });

      // Should be red/prominent
      expect(styles.backgroundColor).toMatch(/rgb\(239,\s*68,\s*68\)/); // Tailwind red-500
    });

    test('should be accessible via keyboard', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Should be focusable with Tab
      await page.keyboard.press('Tab');
      // May need multiple tabs depending on page layout
      for (let i = 0; i < 10; i++) {
        const focused = await page.evaluate(() => {
          return document.activeElement?.getAttribute('data-testid');
        });
        if (focused === 'emergency-stop-button') {
          break;
        }
        await page.keyboard.press('Tab');
      }

      // Should be focused
      await expect(page.locator('[data-testid="emergency-stop-button"]')).toBeFocused();

      // Should be activatable with Space or Enter
      await page.keyboard.press('Space');

      // Emergency stop should be triggered
      await expect(page.getByText('Emergency stop activated')).toBeVisible();
    });

    test('should have confirmation dialog for safety', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Click emergency stop
      await page.click('[data-testid="emergency-stop-button"]');

      // Should show confirmation dialog
      await expect(page.locator('[data-testid="emergency-stop-confirmation"]')).toBeVisible();
      await expect(page.getByText('Are you sure you want to stop all agents?')).toBeVisible();
      await expect(page.getByText('This will cancel all running commands')).toBeVisible();

      // Should have confirm and cancel buttons
      await expect(page.locator('[data-testid="confirm-emergency-stop"]')).toBeVisible();
      await expect(page.locator('[data-testid="cancel-emergency-stop"]')).toBeVisible();
    });

    test('should cancel emergency stop when user declines', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      await page.click('[data-testid="emergency-stop-button"]');
      await expect(page.locator('[data-testid="emergency-stop-confirmation"]')).toBeVisible();

      // Cancel the emergency stop
      await page.click('[data-testid="cancel-emergency-stop"]');

      // Dialog should close
      await expect(page.locator('[data-testid="emergency-stop-confirmation"]')).not.toBeVisible();

      // No emergency stop should be triggered
      await expect(page.getByText('Emergency stop activated')).not.toBeVisible();
    });
  });

  test.describe('Emergency Stop Execution', () => {
    test('should stop all running commands immediately', async ({ page }) => {
      // Mock running command
      const commandId = 'cmd-running';
      await page.route('**/commands', route => {
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

      // Mock emergency stop API
      await page.route('**/emergency-stop', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Emergency stop activated',
            stoppedCommands: [commandId],
            affectedAgents: [mockAgents.claude.id, mockAgents.gemini.id],
          }),
        });
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Start a command
      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('Long running task');
      await dashboardPage.executeCommand();

      // Simulate command starting
      await page.evaluate((data) => {
        const message = {
          type: 'COMMAND_STATUS',
          id: 'msg-123',
          timestamp: Date.now(),
          payload: {
            commandId: data.commandId,
            status: 'EXECUTING',
          },
        };

        const event = new MessageEvent('message', {
          data: JSON.stringify(message),
        });

        if ((window as any).mockWebSocket?.onmessage) {
          (window as any).mockWebSocket.onmessage(event);
        }
      }, { commandId });

      await dashboardPage.waitForCommandStatus('EXECUTING');

      // Trigger emergency stop
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Should show emergency stop activation
      await expect(page.getByText('Emergency stop activated')).toBeVisible();

      // Should stop the running command
      await dashboardPage.waitForCommandStatus('STOPPED');

      // Should show stop reason
      await expect(page.getByText('Stopped by emergency stop')).toBeVisible();
    });

    test('should send stop signals to all agents', async ({ page }) => {
      // Mock emergency stop API
      await page.route('**/emergency-stop', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Emergency stop activated',
            stoppedCommands: [],
            affectedAgents: [mockAgents.claude.id, mockAgents.gemini.id],
          }),
        });
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Trigger emergency stop
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Should send WebSocket messages to stop agents
      const sentMessage = await page.evaluate(() => (window as any).lastSentMessage);
      expect(sentMessage.type).toBe('AGENT_CONTROL');
      expect(sentMessage.payload.action).toBe('STOP');
      expect(sentMessage.payload.reason).toContain('Emergency stop');

      // Should show affected agents
      await expect(page.getByText('2 agents stopped')).toBeVisible();
    });

    test('should clear command queue', async ({ page }) => {
      // Mock multiple queued commands
      const commands = ['cmd-1', 'cmd-2', 'cmd-3'];
      await page.route('**/commands', route => {
        const requestBody = route.request().postDataJSON();
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

      // Mock emergency stop with queue clearing
      await page.route('**/emergency-stop', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Emergency stop activated',
            stoppedCommands: commands,
            clearedQueueItems: 3,
            affectedAgents: [mockAgents.claude.id],
          }),
        });
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Queue multiple commands
      await dashboardPage.selectAgent(mockAgents.claude.id);
      for (let i = 0; i < 3; i++) {
        await dashboardPage.enterCommand(`Command ${i + 1}`);
        await dashboardPage.executeCommand();
        await page.waitForTimeout(100);
      }

      // Should show queue
      await expect(page.getByText('3 commands in queue')).toBeVisible();

      // Trigger emergency stop
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Queue should be cleared
      await expect(page.getByText('Queue cleared: 3 commands')).toBeVisible();
      await expect(page.getByText('0 commands in queue')).toBeVisible();
    });

    test('should handle partial failures gracefully', async ({ page }) => {
      // Mock emergency stop with some failures
      await page.route('**/emergency-stop', route => {
        route.fulfill({
          status: 207, // Multi-status
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Emergency stop partially completed',
            stoppedCommands: ['cmd-1'],
            failedCommands: ['cmd-2'],
            affectedAgents: [mockAgents.claude.id],
            errors: [
              {
                agentId: mockAgents.gemini.id,
                error: 'Agent not responding',
              },
            ],
          }),
        });
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Trigger emergency stop
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Should show partial success
      await expect(page.getByText('Emergency stop partially completed')).toBeVisible();
      await expect(page.getByText('Some agents may not have responded')).toBeVisible();

      // Should show error details
      await expect(page.getByText('Agent not responding')).toBeVisible();

      // Should offer retry option
      await expect(page.locator('[data-testid="retry-emergency-stop"]')).toBeVisible();
    });
  });

  test.describe('Agent Response to Emergency Stop', () => {
    test('should show agents stopping status', async ({ page }) => {
      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Initially show agents as online
      await agentsPage.expectAgentStatus(mockAgents.claude.id, 'ONLINE');
      await agentsPage.expectAgentActivity(mockAgents.claude.id, 'IDLE');

      // Trigger emergency stop from dashboard
      await dashboardPage.goto();
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Go back to agents page
      await agentsPage.goto();

      // Simulate agent status updates via WebSocket
      await page.evaluate((agentId) => {
        const message = {
          type: 'AGENT_STATUS',
          id: 'msg-stopping',
          timestamp: Date.now(),
          payload: {
            agentId,
            status: 'STOPPING',
            activityState: 'STOPPING',
          },
        };

        const event = new MessageEvent('message', {
          data: JSON.stringify(message),
        });

        if ((window as any).mockWebSocket?.onmessage) {
          (window as any).mockWebSocket.onmessage(event);
        }
      }, mockAgents.claude.id);

      // Should show stopping status
      await agentsPage.expectAgentStatus(mockAgents.claude.id, 'STOPPING');
      await agentsPage.expectAgentActivity(mockAgents.claude.id, 'STOPPING');

      // Should show stopping indicator
      const stoppingElement = page.locator(`[data-testid="agent-${mockAgents.claude.id}-status"]`);
      await expect(stoppingElement).toHaveClass(/stopping/);
    });

    test('should show agents as stopped after emergency stop', async ({ page }) => {
      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Simulate emergency stop completion
      await page.evaluate((agentId) => {
        const message = {
          type: 'AGENT_STATUS',
          id: 'msg-stopped',
          timestamp: Date.now(),
          payload: {
            agentId,
            status: 'STOPPED',
            activityState: 'STOPPED',
            lastStopReason: 'Emergency stop',
          },
        };

        const event = new MessageEvent('message', {
          data: JSON.stringify(message),
        });

        if ((window as any).mockWebSocket?.onmessage) {
          (window as any).mockWebSocket.onmessage(event);
        }
      }, mockAgents.claude.id);

      // Should show stopped status
      await agentsPage.expectAgentStatus(mockAgents.claude.id, 'STOPPED');

      // Should show stop reason on hover/click
      await page.hover(`[data-testid="agent-${mockAgents.claude.id}-status"]`);
      await expect(page.getByText('Emergency stop')).toBeVisible();
    });

    test('should handle unresponsive agents', async ({ page }) => {
      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Trigger emergency stop
      await dashboardPage.goto();
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Go back to agents
      await agentsPage.goto();

      // Simulate timeout waiting for agent response
      await page.waitForTimeout(2000);

      // Simulate agent becoming unresponsive
      await page.evaluate((agentId) => {
        const message = {
          type: 'AGENT_STATUS',
          id: 'msg-unresponsive',
          timestamp: Date.now(),
          payload: {
            agentId,
            status: 'ERROR',
            activityState: 'UNRESPONSIVE',
            lastError: 'Did not respond to emergency stop',
          },
        };

        const event = new MessageEvent('message', {
          data: JSON.stringify(message),
        });

        if ((window as any).mockWebSocket?.onmessage) {
          (window as any).mockWebSocket.onmessage(event);
        }
      }, mockAgents.gemini.id);

      // Should show error status
      await agentsPage.expectAgentStatus(mockAgents.gemini.id, 'ERROR');
      await agentsPage.expectAgentActivity(mockAgents.gemini.id, 'UNRESPONSIVE');

      // Should show warning about unresponsive agent
      await expect(page.getByText('Agent did not respond to stop signal')).toBeVisible();
    });
  });

  test.describe('System Recovery', () => {
    test('should provide restart option after emergency stop', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Trigger emergency stop
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      await expect(page.getByText('Emergency stop activated')).toBeVisible();

      // Should show restart option
      await expect(page.locator('[data-testid="restart-agents-button"]')).toBeVisible();
      await expect(page.getByText('Restart All Agents')).toBeVisible();
    });

    test('should restart agents after emergency stop', async ({ page }) => {
      // Mock restart API
      await page.route('**/agents/restart', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Restart initiated',
            affectedAgents: [mockAgents.claude.id, mockAgents.gemini.id],
          }),
        });
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Emergency stop first
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Restart agents
      await page.click('[data-testid="restart-agents-button"]');
      await page.click('[data-testid="confirm-restart"]');

      // Should show restart message
      await expect(page.getByText('Restarting agents...')).toBeVisible();

      // Simulate agents coming back online
      await page.evaluate((agentId) => {
        const message = {
          type: 'AGENT_STATUS',
          id: 'msg-restarting',
          timestamp: Date.now(),
          payload: {
            agentId,
            status: 'CONNECTING',
            activityState: 'STARTING',
          },
        };

        const event = new MessageEvent('message', {
          data: JSON.stringify(message),
        });

        if ((window as any).mockWebSocket?.onmessage) {
          (window as any).mockWebSocket.onmessage(event);
        }
      }, mockAgents.claude.id);

      // Should show connecting status
      await expect(page.getByText('Agents are restarting')).toBeVisible();

      // Simulate restart completion
      await page.evaluate((agentId) => {
        const message = {
          type: 'AGENT_STATUS',
          id: 'msg-online',
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
      }, mockAgents.claude.id);

      // Should show success message
      await expect(page.getByText('Agents restarted successfully')).toBeVisible();
    });

    test('should allow selective agent restart', async ({ page }) => {
      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Should have restart button for each stopped agent
      await page.evaluate((agentId) => {
        const message = {
          type: 'AGENT_STATUS',
          id: 'msg-stopped',
          timestamp: Date.now(),
          payload: {
            agentId,
            status: 'STOPPED',
            activityState: 'STOPPED',
          },
        };

        const event = new MessageEvent('message', {
          data: JSON.stringify(message),
        });

        if ((window as any).mockWebSocket?.onmessage) {
          (window as any).mockWebSocket.onmessage(event);
        }
      }, mockAgents.claude.id);

      // Should show individual restart button
      await expect(page.locator(`[data-testid="restart-agent-${mockAgents.claude.id}"]`)).toBeVisible();

      // Mock individual restart
      await page.route(`**/agents/${mockAgents.claude.id}/restart`, route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Agent restart initiated' }),
        });
      });

      // Restart individual agent
      await page.click(`[data-testid="restart-agent-${mockAgents.claude.id}"]`);

      // Should show restarting status for that agent only
      await expect(page.getByText(`Restarting ${mockAgents.claude.name}`)).toBeVisible();
    });

    test('should preserve logs through emergency stop', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Execute a command first
      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('Test command before stop');
      await dashboardPage.executeCommand();

      // Add some terminal output
      await page.evaluate(() => {
        const message = {
          type: 'TERMINAL_STREAM',
          id: 'terminal-before-stop',
          timestamp: Date.now(),
          payload: {
            commandId: 'cmd-123',
            agentId: 'agent-claude-1',
            streamType: 'STDOUT',
            content: 'Output before emergency stop',
            ansiCodes: false,
          },
        };

        const event = new MessageEvent('message', {
          data: JSON.stringify(message),
        });

        if ((window as any).mockWebSocket?.onmessage) {
          (window as any).mockWebSocket.onmessage(event);
        }
      });

      // Verify output is there
      await expect(page.getByText('Output before emergency stop')).toBeVisible();

      // Trigger emergency stop
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Terminal output should still be visible
      await expect(page.getByText('Output before emergency stop')).toBeVisible();

      // Should show emergency stop message in terminal
      await expect(page.getByText('--- EMERGENCY STOP ACTIVATED ---')).toBeVisible();
    });
  });

  test.describe('Audit and Logging', () => {
    test('should log emergency stop events', async ({ page }) => {
      // Mock audit log API
      await page.route('**/audit-logs', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            logs: [
              {
                id: 'log-123',
                timestamp: Date.now(),
                userId: 'user-123',
                action: 'EMERGENCY_STOP',
                details: {
                  affectedAgents: [mockAgents.claude.id, mockAgents.gemini.id],
                  stoppedCommands: ['cmd-1', 'cmd-2'],
                  reason: 'User initiated emergency stop',
                },
              },
            ],
            total: 1,
          }),
        });
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Trigger emergency stop
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Navigate to audit logs
      await page.goto('/audit-logs');

      // Should show emergency stop event
      await expect(page.getByText('EMERGENCY_STOP')).toBeVisible();
      await expect(page.getByText('User initiated emergency stop')).toBeVisible();
    });

    test('should record timing information', async ({ page }) => {
      const startTime = Date.now();

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Trigger emergency stop
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Should show timing information
      await expect(page.getByText(/Emergency stop completed in \d+ms/)).toBeVisible();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds max
    });

    test('should generate incident report', async ({ page }) => {
      // Mock incident report API
      await page.route('**/incident-reports', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            reportId: 'incident-123',
            message: 'Incident report generated',
          }),
        });
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Trigger emergency stop
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Should offer to generate incident report
      await expect(page.getByText('Generate incident report?')).toBeVisible();
      await page.click('[data-testid="generate-incident-report"]');

      // Should show report generation
      await expect(page.getByText('Generating incident report...')).toBeVisible();
      await expect(page.getByText('Report ID: incident-123')).toBeVisible();
    });
  });

  test.describe('Error Scenarios', () => {
    test('should handle emergency stop API failures', async ({ page }) => {
      // Mock API failure
      await page.route('**/emergency-stop', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Emergency stop service unavailable' }),
        });
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Trigger emergency stop
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Should show error message
      await expect(page.getByText('Emergency stop failed')).toBeVisible();
      await expect(page.getByText('Emergency stop service unavailable')).toBeVisible();

      // Should offer retry option
      await expect(page.locator('[data-testid="retry-emergency-stop"]')).toBeVisible();
    });

    test('should handle network disconnection during emergency stop', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Simulate network disconnection
      await page.context().setOffline(true);

      // Try to trigger emergency stop
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Should show network error
      await expect(page.getByText('Network error')).toBeVisible();
      await expect(page.getByText('Cannot reach emergency stop service')).toBeVisible();

      // Should store emergency stop request for when connection is restored
      await expect(page.getByText('Emergency stop will be retried when connection is restored')).toBeVisible();

      // Restore connection
      await page.context().setOffline(false);

      // Should automatically retry
      await expect(page.getByText('Connection restored, retrying emergency stop...')).toBeVisible();
    });

    test('should handle timeout during emergency stop', async ({ page }) => {
      // Mock slow API response
      await page.route('**/emergency-stop', route => {
        // Don't respond to simulate timeout
        // route.abort('timedout');
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Trigger emergency stop
      await page.click('[data-testid="emergency-stop-button"]');
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Should show timeout message after delay
      await expect(page.getByText('Emergency stop timeout')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Some agents may still be running')).toBeVisible();

      // Should offer force stop option
      await expect(page.locator('[data-testid="force-stop-button"]')).toBeVisible();
    });
  });

  test.describe('Accessibility and Usability', () => {
    test('should be operable with keyboard only', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Navigate to emergency stop with keyboard
      let foundEmergencyButton = false;
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => {
          return document.activeElement?.getAttribute('data-testid');
        });
        if (focused === 'emergency-stop-button') {
          foundEmergencyButton = true;
          break;
        }
      }

      expect(foundEmergencyButton).toBe(true);

      // Activate with keyboard
      await page.keyboard.press('Space');

      // Dialog should open
      await expect(page.locator('[data-testid="emergency-stop-confirmation"]')).toBeVisible();

      // Navigate in dialog with keyboard
      await page.keyboard.press('Tab');
      await expect(page.locator('[data-testid="confirm-emergency-stop"]')).toBeFocused();

      // Activate confirmation
      await page.keyboard.press('Enter');

      // Emergency stop should be triggered
      await expect(page.getByText('Emergency stop activated')).toBeVisible();
    });

    test('should have proper ARIA labels and announcements', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      const emergencyButton = page.locator('[data-testid="emergency-stop-button"]');

      // Should have proper ARIA attributes
      await expect(emergencyButton).toHaveAttribute('aria-label', /emergency stop/i);
      await expect(emergencyButton).toHaveAttribute('role', 'button');

      // Should announce state changes
      await emergencyButton.click();
      await page.click('[data-testid="confirm-emergency-stop"]');

      // Should have live region for announcements
      await expect(page.locator('[aria-live="assertive"]')).toContainText('Emergency stop activated');
    });

    test('should work with screen readers', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Emergency button should have descriptive text
      const emergencyButton = page.locator('[data-testid="emergency-stop-button"]');
      const ariaLabel = await emergencyButton.getAttribute('aria-label');
      expect(ariaLabel).toContain('Stop all agents immediately');

      // Confirmation dialog should have proper structure
      await emergencyButton.click();

      const dialog = page.locator('[data-testid="emergency-stop-confirmation"]');
      await expect(dialog).toHaveAttribute('role', 'dialog');
      await expect(dialog).toHaveAttribute('aria-labelledby');
      await expect(dialog).toHaveAttribute('aria-describedby');
    });
  });
});