/**
 * E2E Tests for Command Execution and Terminal Output
 * Tests command sending, execution tracking, and real-time terminal streaming
 */

import { test, expect } from '@playwright/test';
import { DashboardPage, Terminal } from './fixtures/page-objects';
import { testUsers, mockAgents, testConfig } from './fixtures/test-helpers';

test.describe('Command Execution and Terminal Output', () => {
  let dashboardPage: DashboardPage;
  let terminal: Terminal;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    terminal = new Terminal(page);

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

    // Authenticate and go to dashboard
    await page.goto('/auth/verify?token=valid-token');
    await page.waitForURL('/dashboard');
    await dashboardPage.waitForPageReady();
  });

  test.describe('Command Input and Validation', () => {
    test('should accept valid commands', async ({ page }) => {
      const testCommand = 'Please analyze the current codebase structure';

      await dashboardPage.enterCommand(testCommand);

      // Command input should contain the text
      const commandInput = page.locator('[data-testid="command-input"]');
      await expect(commandInput).toHaveValue(testCommand);

      // Execute button should be enabled
      expect(await dashboardPage.isExecuteButtonEnabled()).toBe(true);
    });

    test('should validate empty commands', async ({ page }) => {
      // Try to execute empty command
      await dashboardPage.executeCommand();

      // Should show validation error
      await expect(page.getByText('Command cannot be empty')).toBeVisible();

      // Execute button should be disabled
      expect(await dashboardPage.isExecuteButtonEnabled()).toBe(false);
    });

    test('should handle long commands', async ({ page }) => {
      const longCommand = 'A'.repeat(5000); // Very long command

      await dashboardPage.enterCommand(longCommand);

      // Should show character count
      await expect(page.locator('[data-testid="character-count"]')).toContainText('5000');

      // Should warn about length
      await expect(page.getByText('Command is very long')).toBeVisible();
    });

    test('should support command history', async ({ page }) => {
      const commands = [
        'First command',
        'Second command',
        'Third command',
      ];

      // Execute multiple commands
      for (const command of commands) {
        await dashboardPage.enterCommand(command);
        await dashboardPage.executeCommand();
        await page.waitForTimeout(500); // Brief delay between commands
      }

      // Clear input
      await page.locator('[data-testid="command-input"]').clear();

      // Use up arrow to navigate history
      await page.keyboard.press('ArrowUp');
      await expect(page.locator('[data-testid="command-input"]')).toHaveValue(commands[2]);

      await page.keyboard.press('ArrowUp');
      await expect(page.locator('[data-testid="command-input"]')).toHaveValue(commands[1]);

      await page.keyboard.press('ArrowUp');
      await expect(page.locator('[data-testid="command-input"]')).toHaveValue(commands[0]);

      // Down arrow should move forward
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('[data-testid="command-input"]')).toHaveValue(commands[1]);
    });

    test('should support keyboard shortcuts', async ({ page }) => {
      await dashboardPage.enterCommand('Test command');

      // Ctrl/Cmd + Enter should execute
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.press(`${modifier}+Enter`);

      // Command should be executed
      await expect(page.locator('[data-testid="command-status"]')).toContainText('QUEUED');
    });
  });

  test.describe('Agent Selection', () => {
    test('should require agent selection before execution', async ({ page }) => {
      await dashboardPage.enterCommand('Test command');
      await dashboardPage.executeCommand();

      // Should show agent selection error
      await expect(page.getByText('Please select an agent')).toBeVisible();
    });

    test('should execute command with selected agent', async ({ page }) => {
      // Mock command execution API
      await page.route('**/commands', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'cmd-123',
            status: 'QUEUED',
            agentId: mockAgents.claude.id,
            content: 'Test command',
          }),
        });
      });

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('Test command');
      await dashboardPage.executeCommand();

      // Should show queued status
      await dashboardPage.waitForCommandStatus('QUEUED');
    });

    test('should disable execution for offline agents', async ({ page }) => {
      // Mock offline agent
      await page.route('**/agents', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            agents: [{ ...mockAgents.claude, status: 'OFFLINE' }],
            total: 1,
          }),
        });
      });

      await page.reload();
      await dashboardPage.waitForPageReady();

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('Test command');

      // Execute button should be disabled
      expect(await dashboardPage.isExecuteButtonEnabled()).toBe(false);

      // Should show offline agent warning
      await expect(page.getByText('Selected agent is offline')).toBeVisible();
    });

    test('should show agent capabilities when selected', async ({ page }) => {
      await dashboardPage.selectAgent(mockAgents.claude.id);

      // Should show agent info
      await expect(page.getByText(`Selected: ${mockAgents.claude.name}`)).toBeVisible();
      await expect(page.getByText('Max tokens: 100,000')).toBeVisible();
    });
  });

  test.describe('Command Execution Flow', () => {
    test('should execute command successfully', async ({ page }) => {
      const commandId = 'cmd-123';

      // Mock command API
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

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('Analyze the current project structure');
      await dashboardPage.executeCommand();

      // Should show queued status
      await dashboardPage.waitForCommandStatus('QUEUED');

      // Simulate command acknowledgment
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

      // Status should update to executing
      await dashboardPage.waitForCommandStatus('EXECUTING');

      // Simulate completion
      await page.evaluate((data) => {
        const message = {
          type: 'COMMAND_STATUS',
          id: 'msg-456',
          timestamp: Date.now(),
          payload: {
            commandId: data.commandId,
            status: 'COMPLETED',
          },
        };

        const event = new MessageEvent('message', {
          data: JSON.stringify(message),
        });

        if ((window as any).mockWebSocket?.onmessage) {
          (window as any).mockWebSocket.onmessage(event);
        }
      }, { commandId });

      // Should show completed status
      await dashboardPage.waitForCommandStatus('COMPLETED');
    });

    test('should handle command execution errors', async ({ page }) => {
      // Mock API error
      await page.route('**/commands', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Agent is busy' }),
        });
      });

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('Test command');
      await dashboardPage.executeCommand();

      // Should show error message
      await expect(page.getByText('Failed to execute command')).toBeVisible();
      await expect(page.getByText('Agent is busy')).toBeVisible();
    });

    test('should show command progress', async ({ page }) => {
      const commandId = 'cmd-progress';

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

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('Complex analysis task');
      await dashboardPage.executeCommand();

      // Simulate progress updates
      const progressSteps = [
        { percent: 25, message: 'Analyzing files...' },
        { percent: 50, message: 'Processing data...' },
        { percent: 75, message: 'Generating report...' },
        { percent: 100, message: 'Complete' },
      ];

      for (const step of progressSteps) {
        await page.evaluate((data) => {
          const message = {
            type: 'COMMAND_STATUS',
            id: `msg-${Date.now()}`,
            timestamp: Date.now(),
            payload: {
              commandId: data.commandId,
              status: 'EXECUTING',
              progress: {
                percent: data.percent,
                message: data.message,
              },
            },
          };

          const event = new MessageEvent('message', {
            data: JSON.stringify(message),
          });

          if ((window as any).mockWebSocket?.onmessage) {
            (window as any).mockWebSocket.onmessage(event);
          }
        }, { commandId, ...step });

        // Check progress display
        await expect(page.locator('[data-testid="progress-bar"]')).toHaveAttribute('value', step.percent.toString());
        await expect(page.getByText(step.message)).toBeVisible();

        await page.waitForTimeout(200);
      }
    });

    test('should handle command cancellation', async ({ page }) => {
      const commandId = 'cmd-cancel';

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

      // Mock cancel API
      await page.route(`**/commands/${commandId}/cancel`, route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Command cancelled' }),
        });
      });

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('Long running task');
      await dashboardPage.executeCommand();

      await dashboardPage.waitForCommandStatus('QUEUED');

      // Cancel button should be visible
      await expect(page.locator('[data-testid="cancel-command-button"]')).toBeVisible();

      // Cancel the command
      await page.click('[data-testid="cancel-command-button"]');

      // Should show cancelled status
      await dashboardPage.waitForCommandStatus('CANCELLED');
    });
  });

  test.describe('Terminal Output Streaming', () => {
    test('should display terminal output in real-time', async ({ page }) => {
      const commandId = 'cmd-terminal';

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

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('echo "Hello World"');
      await dashboardPage.executeCommand();

      await terminal.waitForTerminalReady();

      // Simulate terminal output
      const outputs = [
        'Starting command execution...',
        'Connecting to agent...',
        'Hello World',
        'Command completed successfully.',
      ];

      for (const output of outputs) {
        await page.evaluate((data) => {
          const message = {
            type: 'TERMINAL_STREAM',
            id: `terminal-${Date.now()}`,
            timestamp: Date.now(),
            payload: {
              commandId: data.commandId,
              agentId: data.agentId,
              agentName: data.agentName,
              agentType: data.agentType,
              streamType: 'STDOUT',
              content: data.output,
              ansiCodes: false,
            },
          };

          const event = new MessageEvent('message', {
            data: JSON.stringify(message),
          });

          if ((window as any).mockWebSocket?.onmessage) {
            (window as any).mockWebSocket.onmessage(event);
          }
        }, {
          commandId,
          output,
          agentId: mockAgents.claude.id,
          agentName: mockAgents.claude.name,
          agentType: mockAgents.claude.type,
        });

        // Check output appears
        await terminal.expectOutputContains(output);
        await page.waitForTimeout(100);
      }

      // Final terminal should contain all outputs
      const finalOutput = await terminal.getOutput();
      for (const output of outputs) {
        expect(finalOutput).toContain(output);
      }
    });

    test('should handle ANSI color codes', async ({ page }) => {
      const commandId = 'cmd-colors';

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

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('colorful output');
      await dashboardPage.executeCommand();

      await terminal.waitForTerminalReady();

      // Simulate colored output
      await page.evaluate((data) => {
        const message = {
          type: 'TERMINAL_STREAM',
          id: 'terminal-color',
          timestamp: Date.now(),
          payload: {
            commandId: data.commandId,
            agentId: data.agentId,
            streamType: 'STDOUT',
            content: '\x1b[32mSuccess: Operation completed\x1b[0m',
            ansiCodes: true,
          },
        };

        const event = new MessageEvent('message', {
          data: JSON.stringify(message),
        });

        if ((window as any).mockWebSocket?.onmessage) {
          (window as any).mockWebSocket.onmessage(event);
        }
      }, {
        commandId,
        agentId: mockAgents.claude.id,
      });

      // Check that ANSI codes are properly rendered
      const coloredText = page.locator('[data-testid="terminal-output"] .ansi-green');
      await expect(coloredText).toContainText('Success: Operation completed');
    });

    test('should differentiate STDOUT and STDERR', async ({ page }) => {
      const commandId = 'cmd-streams';

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

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('command with error');
      await dashboardPage.executeCommand();

      await terminal.waitForTerminalReady();

      // Simulate both STDOUT and STDERR
      const streams = [
        { type: 'STDOUT', content: 'Normal output message', class: 'stdout' },
        { type: 'STDERR', content: 'Error: Something went wrong', class: 'stderr' },
      ];

      for (const stream of streams) {
        await page.evaluate((data) => {
          const message = {
            type: 'TERMINAL_STREAM',
            id: `terminal-${data.type.toLowerCase()}`,
            timestamp: Date.now(),
            payload: {
              commandId: data.commandId,
              agentId: data.agentId,
              streamType: data.type,
              content: data.content,
              ansiCodes: false,
            },
          };

          const event = new MessageEvent('message', {
            data: JSON.stringify(message),
          });

          if ((window as any).mockWebSocket?.onmessage) {
            (window as any).mockWebSocket.onmessage(event);
          }
        }, {
          commandId,
          agentId: mockAgents.claude.id,
          type: stream.type,
          content: stream.content,
        });

        // Check stream-specific styling
        const streamElement = page.locator(`[data-testid="terminal-output"] .${stream.class}`);
        await expect(streamElement).toContainText(stream.content);
      }
    });

    test('should auto-scroll to latest output', async ({ page }) => {
      const commandId = 'cmd-scroll';

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

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('long output');
      await dashboardPage.executeCommand();

      await terminal.waitForTerminalReady();

      // Generate many lines of output
      for (let i = 0; i < 50; i++) {
        await page.evaluate((data) => {
          const message = {
            type: 'TERMINAL_STREAM',
            id: `terminal-line-${data.i}`,
            timestamp: Date.now(),
            payload: {
              commandId: data.commandId,
              agentId: data.agentId,
              streamType: 'STDOUT',
              content: `Line ${data.i}: This is a long line of output that should cause scrolling`,
              ansiCodes: false,
            },
          };

          const event = new MessageEvent('message', {
            data: JSON.stringify(message),
          });

          if ((window as any).mockWebSocket?.onmessage) {
            (window as any).mockWebSocket.onmessage(event);
          }
        }, {
          commandId,
          agentId: mockAgents.claude.id,
          i,
        });

        if (i % 10 === 0) {
          await page.waitForTimeout(50); // Brief pause
        }
      }

      // Should auto-scroll to bottom
      const terminalElement = page.locator('[data-testid="terminal-output"]');
      const isAtBottom = await terminalElement.evaluate((el) => {
        return el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
      });

      expect(isAtBottom).toBe(true);

      // Latest line should be visible
      await expect(page.getByText('Line 49:')).toBeVisible();
    });

    test('should handle terminal clearing', async ({ page }) => {
      await terminal.waitForTerminalReady();

      // Add some output first
      await page.evaluate(() => {
        const terminalOutput = document.querySelector('[data-testid="terminal-output"]');
        if (terminalOutput) {
          terminalOutput.textContent = 'Some existing output\nMore content\nEven more content';
        }
      });

      // Clear terminal
      await terminal.clearTerminal();

      // Terminal should be empty
      const output = await terminal.getOutput();
      expect(output.trim()).toBe('');
    });

    test('should support terminal fullscreen mode', async ({ page }) => {
      await terminal.waitForTerminalReady();

      // Toggle fullscreen
      await terminal.toggleFullscreen();

      // Should be in fullscreen mode
      expect(await terminal.isFullscreen()).toBe(true);

      // Toggle back
      await terminal.toggleFullscreen();
      expect(await terminal.isFullscreen()).toBe(false);
    });
  });

  test.describe('Command Queue Management', () => {
    test('should queue multiple commands', async ({ page }) => {
      const commands = ['First command', 'Second command', 'Third command'];

      // Mock command API to queue commands
      let commandCount = 0;
      await page.route('**/commands', route => {
        commandCount++;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: `cmd-${commandCount}`,
            status: 'QUEUED',
            position: commandCount,
            agentId: mockAgents.claude.id,
          }),
        });
      });

      await dashboardPage.selectAgent(mockAgents.claude.id);

      // Execute multiple commands quickly
      for (const command of commands) {
        await dashboardPage.enterCommand(command);
        await dashboardPage.executeCommand();
        await page.waitForTimeout(100);
      }

      // Should show queue status
      await expect(page.getByText('3 commands in queue')).toBeVisible();
    });

    test('should show command queue position', async ({ page }) => {
      // Mock command with queue position
      await page.route('**/commands', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'cmd-queued',
            status: 'QUEUED',
            position: 3,
            agentId: mockAgents.claude.id,
          }),
        });
      });

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('Queued command');
      await dashboardPage.executeCommand();

      // Should show position in queue
      await expect(page.getByText('Position 3 in queue')).toBeVisible();
    });

    test('should handle command priority', async ({ page }) => {
      // Mock high-priority command
      await page.route('**/commands', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'cmd-priority',
            status: 'QUEUED',
            priority: 'HIGH',
            agentId: mockAgents.claude.id,
          }),
        });
      });

      // Enable priority mode
      await page.check('[data-testid="high-priority-checkbox"]');

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('High priority command');
      await dashboardPage.executeCommand();

      // Should show priority indicator
      await expect(page.locator('[data-testid="priority-indicator"]')).toBeVisible();
    });
  });

  test.describe('Performance and Reliability', () => {
    test('should handle connection interruptions gracefully', async ({ page }) => {
      const commandId = 'cmd-connection';

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

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('Test command');
      await dashboardPage.executeCommand();

      // Simulate connection loss
      await page.evaluate(() => {
        (window as any).wsConnected = false;
        if ((window as any).mockWebSocket?.onclose) {
          (window as any).mockWebSocket.onclose(new CloseEvent('close'));
        }
      });

      // Should show connection lost message
      await expect(page.getByText('Connection lost')).toBeVisible();
      await expect(page.getByText('Attempting to reconnect')).toBeVisible();

      // Simulate reconnection
      await page.evaluate(() => {
        (window as any).wsConnected = true;
        if ((window as any).mockWebSocket?.onopen) {
          (window as any).mockWebSocket.onopen(new Event('open'));
        }
      });

      // Should show reconnected message
      await expect(page.getByText('Connection restored')).toBeVisible();
    });

    test('should handle large terminal output efficiently', async ({ page }) => {
      const commandId = 'cmd-large-output';

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

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('Generate large output');
      await dashboardPage.executeCommand();

      await terminal.waitForTerminalReady();

      // Simulate very large output (should be chunked/virtualized)
      const largeOutput = 'A'.repeat(100000); // 100KB of data

      await page.evaluate((data) => {
        const message = {
          type: 'TERMINAL_STREAM',
          id: 'terminal-large',
          timestamp: Date.now(),
          payload: {
            commandId: data.commandId,
            agentId: data.agentId,
            streamType: 'STDOUT',
            content: data.output,
            ansiCodes: false,
          },
        };

        const event = new MessageEvent('message', {
          data: JSON.stringify(message),
        });

        if ((window as any).mockWebSocket?.onmessage) {
          (window as any).mockWebSocket.onmessage(event);
        }
      }, {
        commandId,
        agentId: mockAgents.claude.id,
        output: largeOutput,
      });

      // Terminal should remain responsive
      await expect(page.locator('[data-testid="terminal-output"]')).toBeVisible();

      // Should handle scrolling smoothly
      await terminal.scrollToBottom();
    });

    test('should implement output buffering during reconnection', async ({ page }) => {
      const commandId = 'cmd-buffer';

      await dashboardPage.selectAgent(mockAgents.claude.id);
      await dashboardPage.enterCommand('Buffered command');
      await dashboardPage.executeCommand();

      // Simulate connection loss during output
      await page.evaluate(() => {
        (window as any).wsConnected = false;
      });

      // Simulate output while disconnected (should be buffered)
      const bufferedOutputs = ['Output 1', 'Output 2', 'Output 3'];

      for (const output of bufferedOutputs) {
        await page.evaluate((data) => {
          // Store in buffer instead of displaying immediately
          if (!(window as any).outputBuffer) {
            (window as any).outputBuffer = [];
          }
          (window as any).outputBuffer.push(data.output);
        }, { output });
      }

      // Reconnect
      await page.evaluate(() => {
        (window as any).wsConnected = true;

        // Flush buffer
        if ((window as any).outputBuffer) {
          for (const output of (window as any).outputBuffer) {
            const message = {
              type: 'TERMINAL_STREAM',
              id: `buffered-${Date.now()}`,
              timestamp: Date.now(),
              payload: {
                commandId: 'cmd-buffer',
                agentId: 'agent-claude-1',
                streamType: 'STDOUT',
                content: output,
                ansiCodes: false,
              },
            };

            const event = new MessageEvent('message', {
              data: JSON.stringify(message),
            });

            if ((window as any).mockWebSocket?.onmessage) {
              (window as any).mockWebSocket.onmessage(event);
            }
          }
          (window as any).outputBuffer = [];
        }
      });

      // All buffered output should now be visible
      for (const output of bufferedOutputs) {
        await terminal.expectOutputContains(output);
      }
    });
  });
});