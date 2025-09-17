/**
 * E2E Tests for Agent Connection and Status Display
 * Tests agent connectivity, status monitoring, and real-time updates
 */

import { test, expect } from '@playwright/test';
import { AgentsPage, DashboardPage } from './fixtures/page-objects';
import { testUsers, mockAgents, testConfig } from './fixtures/test-helpers';

test.describe('Agent Connection and Status Display', () => {
  let agentsPage: AgentsPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    agentsPage = new AgentsPage(page);
    dashboardPage = new DashboardPage(page);

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

    // Authenticate
    await page.goto('/auth/verify?token=valid-token');
    await page.waitForURL('/dashboard');
  });

  test.describe('Agent List Display', () => {
    test('should display all connected agents', async ({ page }) => {
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

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Check both agents are displayed
      await agentsPage.expectAgentVisible(mockAgents.claude.id);
      await agentsPage.expectAgentVisible(mockAgents.gemini.id);

      // Verify agent names
      expect(await agentsPage.getAgentName(mockAgents.claude.id)).toBe(mockAgents.claude.name);
      expect(await agentsPage.getAgentName(mockAgents.gemini.id)).toBe(mockAgents.gemini.name);
    });

    test('should show empty state when no agents are connected', async ({ page }) => {
      // Mock empty agents response
      await page.route('**/agents', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: [], total: 0 }),
        });
      });

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Should show empty state
      await expect(page.getByText('No agents connected')).toBeVisible();
      await expect(page.getByText('Connect an agent to get started')).toBeVisible();
    });

    test('should handle API errors gracefully', async ({ page }) => {
      // Mock API error
      await page.route('**/agents', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      await agentsPage.goto();

      // Should show error message
      await expect(page.getByText('Failed to load agents')).toBeVisible();
      await expect(page.getByText('Try again')).toBeVisible();
    });

    test('should refresh agents list', async ({ page }) => {
      let requestCount = 0;

      await page.route('**/agents', route => {
        requestCount++;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            agents: requestCount === 1 ? [] : [mockAgents.claude],
            total: requestCount === 1 ? 0 : 1,
          }),
        });
      });

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Initially no agents
      await expect(page.getByText('No agents connected')).toBeVisible();

      // Refresh
      await agentsPage.refreshAgents();

      // Should now show agent
      await agentsPage.expectAgentVisible(mockAgents.claude.id);
      expect(requestCount).toBe(2);
    });
  });

  test.describe('Agent Status Indicators', () => {
    test('should display correct status for online agents', async ({ page }) => {
      await page.route('**/agents', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            agents: [{
              ...mockAgents.claude,
              status: 'ONLINE',
              activityState: 'IDLE',
            }],
            total: 1,
          }),
        });
      });

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      await agentsPage.expectAgentStatus(mockAgents.claude.id, 'ONLINE');
      await agentsPage.expectAgentActivity(mockAgents.claude.id, 'IDLE');

      // Check status indicator styling
      const statusElement = page.locator(`[data-testid="agent-${mockAgents.claude.id}-status"]`);
      await expect(statusElement).toHaveClass(/online/);
    });

    test('should display correct status for offline agents', async ({ page }) => {
      await page.route('**/agents', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            agents: [{
              ...mockAgents.claude,
              status: 'OFFLINE',
              activityState: 'IDLE',
            }],
            total: 1,
          }),
        });
      });

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      await agentsPage.expectAgentStatus(mockAgents.claude.id, 'OFFLINE');

      // Check status indicator styling
      const statusElement = page.locator(`[data-testid="agent-${mockAgents.claude.id}-status"]`);
      await expect(statusElement).toHaveClass(/offline/);
    });

    test('should display correct status for processing agents', async ({ page }) => {
      await page.route('**/agents', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            agents: [{
              ...mockAgents.claude,
              status: 'ONLINE',
              activityState: 'PROCESSING',
            }],
            total: 1,
          }),
        });
      });

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      await agentsPage.expectAgentActivity(mockAgents.claude.id, 'PROCESSING');

      // Check processing indicator (spinner, etc.)
      const activityElement = page.locator(`[data-testid="agent-${mockAgents.claude.id}-activity"]`);
      await expect(activityElement).toHaveClass(/processing/);
    });

    test('should display error status for agents with errors', async ({ page }) => {
      await page.route('**/agents', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            agents: [{
              ...mockAgents.claude,
              status: 'ERROR',
              activityState: 'IDLE',
              lastError: 'Connection timeout',
            }],
            total: 1,
          }),
        });
      });

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      await agentsPage.expectAgentStatus(mockAgents.claude.id, 'ERROR');

      // Should show error details on hover or click
      await page.hover(`[data-testid="agent-${mockAgents.claude.id}-status"]`);
      await expect(page.getByText('Connection timeout')).toBeVisible();
    });
  });

  test.describe('Real-time Status Updates', () => {
    test('should update agent status via WebSocket', async ({ page }) => {
      // Mock initial agent state
      await page.route('**/agents', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            agents: [{
              ...mockAgents.claude,
              status: 'OFFLINE',
              activityState: 'IDLE',
            }],
            total: 1,
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
          }

          close() {
            (window as any).wsConnected = false;
          }
        }

        (window as any).WebSocket = MockWebSocket;
      });

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Initially offline
      await agentsPage.expectAgentStatus(mockAgents.claude.id, 'OFFLINE');

      // Simulate WebSocket status update
      await page.evaluate((agentId) => {
        const message = {
          type: 'AGENT_STATUS',
          id: 'msg-123',
          timestamp: Date.now(),
          payload: {
            agentId,
            status: 'ONLINE',
            activityState: 'IDLE',
            healthMetrics: {
              cpuUsage: 25.5,
              memoryUsage: 256,
              uptime: 1800,
            },
          },
        };

        const event = new MessageEvent('message', {
          data: JSON.stringify(message),
        });

        if ((window as any).mockWebSocket?.onmessage) {
          (window as any).mockWebSocket.onmessage(event);
        }
      }, mockAgents.claude.id);

      // Status should update
      await agentsPage.expectAgentStatus(mockAgents.claude.id, 'ONLINE');
    });

    test('should update activity state in real-time', async ({ page }) => {
      await page.route('**/agents', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            agents: [mockAgents.claude],
            total: 1,
          }),
        });
      });

      await page.addInitScript(() => {
        class MockWebSocket {
          readyState = WebSocket.OPEN;
          onopen: ((event: Event) => void) | null = null;
          onmessage: ((event: MessageEvent) => void) | null = null;

          constructor() {
            setTimeout(() => {
              if (this.onopen) this.onopen(new Event('open'));
              (window as any).wsConnected = true;
              (window as any).mockWebSocket = this;
            }, 100);
          }

          send() {}
          close() {}
        }

        (window as any).WebSocket = MockWebSocket;
      });

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Initially idle
      await agentsPage.expectAgentActivity(mockAgents.claude.id, 'IDLE');

      // Simulate activity change to processing
      await page.evaluate((agentId) => {
        const message = {
          type: 'AGENT_STATUS',
          id: 'msg-456',
          timestamp: Date.now(),
          payload: {
            agentId,
            status: 'ONLINE',
            activityState: 'PROCESSING',
          },
        };

        const event = new MessageEvent('message', {
          data: JSON.stringify(message),
        });

        if ((window as any).mockWebSocket?.onmessage) {
          (window as any).mockWebSocket.onmessage(event);
        }
      }, mockAgents.claude.id);

      // Activity should update
      await agentsPage.expectAgentActivity(mockAgents.claude.id, 'PROCESSING');
    });

    test('should handle WebSocket connection errors', async ({ page }) => {
      // Mock failing WebSocket
      await page.addInitScript(() => {
        class MockWebSocket {
          readyState = WebSocket.CLOSED;
          onopen: ((event: Event) => void) | null = null;
          onerror: ((event: Event) => void) | null = null;

          constructor() {
            setTimeout(() => {
              if (this.onerror) {
                this.onerror(new Event('error'));
              }
              (window as any).wsConnected = false;
            }, 100);
          }

          send() {}
          close() {}
        }

        (window as any).WebSocket = MockWebSocket;
      });

      await agentsPage.goto();

      // Should show connection error
      await expect(page.getByText('Connection lost')).toBeVisible();
      await expect(page.getByText('Attempting to reconnect')).toBeVisible();
    });

    test('should show health metrics for connected agents', async ({ page }) => {
      await page.route('**/agents', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            agents: [{
              ...mockAgents.claude,
              healthMetrics: {
                cpuUsage: 45.2,
                memoryUsage: 512,
                uptime: 3600,
                commandsProcessed: 15,
                averageResponseTime: 250,
              },
            }],
            total: 1,
          }),
        });
      });

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Click on agent to see details
      await agentsPage.clickAgent(mockAgents.claude.id);

      // Should show health metrics
      await expect(page.getByText('CPU: 45.2%')).toBeVisible();
      await expect(page.getByText('Memory: 512 MB')).toBeVisible();
      await expect(page.getByText('Uptime: 1h')).toBeVisible();
      await expect(page.getByText('Commands: 15')).toBeVisible();
      await expect(page.getByText('Avg Response: 250ms')).toBeVisible();
    });
  });

  test.describe('Agent Selection and Interaction', () => {
    test('should allow selecting agents for command execution', async ({ page }) => {
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

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Agent selector should be available
      const agentSelect = page.locator('[data-testid="agent-select"]');
      await expect(agentSelect).toBeVisible();

      // Should show available agents
      await agentSelect.click();
      await expect(page.getByText(mockAgents.claude.name)).toBeVisible();
      await expect(page.getByText(mockAgents.gemini.name)).toBeVisible();

      // Select an agent
      await page.getByText(mockAgents.claude.name).click();

      // Should update selection
      await expect(agentSelect).toContainText(mockAgents.claude.name);
    });

    test('should disable unavailable agents in selection', async ({ page }) => {
      await page.route('**/agents', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            agents: [
              mockAgents.claude,
              { ...mockAgents.gemini, status: 'OFFLINE' },
            ],
            total: 2,
          }),
        });
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      const agentSelect = page.locator('[data-testid="agent-select"]');
      await agentSelect.click();

      // Online agent should be enabled
      const claudeOption = page.getByText(mockAgents.claude.name);
      await expect(claudeOption).toBeEnabled();

      // Offline agent should be disabled
      const geminiOption = page.getByText(mockAgents.gemini.name);
      await expect(geminiOption).toBeDisabled();
    });

    test('should show agent capabilities', async ({ page }) => {
      await page.route('**/agents', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            agents: [mockAgents.claude],
            total: 1,
          }),
        });
      });

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Click on agent for details
      await agentsPage.clickAgent(mockAgents.claude.id);

      // Should show capabilities
      await expect(page.getByText('Max Tokens: 100,000')).toBeVisible();
      await expect(page.getByText('Supports Interrupt: Yes')).toBeVisible();
      await expect(page.getByText('Supports Trace: Yes')).toBeVisible();
    });

    test('should handle agent details modal', async ({ page }) => {
      await page.route('**/agents', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            agents: [mockAgents.claude],
            total: 1,
          }),
        });
      });

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Click on agent
      await agentsPage.clickAgent(mockAgents.claude.id);

      // Modal should open
      await expect(page.locator('[data-testid="agent-details-modal"]')).toBeVisible();
      await expect(page.getByText(mockAgents.claude.name)).toBeVisible();

      // Close modal
      await page.click('[data-testid="close-modal"]');
      await expect(page.locator('[data-testid="agent-details-modal"]')).not.toBeVisible();
    });
  });

  test.describe('Agent Type Support', () => {
    test('should display different agent types correctly', async ({ page }) => {
      const allAgentTypes = [
        { ...mockAgents.claude, type: 'CLAUDE' },
        { ...mockAgents.gemini, type: 'GEMINI' },
        { id: 'agent-codex-1', name: 'Codex-1', type: 'CODEX', status: 'ONLINE', activityState: 'IDLE' },
      ];

      await page.route('**/agents', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            agents: allAgentTypes,
            total: allAgentTypes.length,
          }),
        });
      });

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Check each agent type is displayed correctly
      for (const agent of allAgentTypes) {
        await agentsPage.expectAgentVisible(agent.id);

        const typeElement = page.locator(`[data-testid="agent-${agent.id}-type"]`);
        await expect(typeElement).toContainText(agent.type);
        await expect(typeElement).toHaveClass(new RegExp(agent.type.toLowerCase()));
      }
    });

    test('should filter agents by type', async ({ page }) => {
      await page.route('**/agents', route => {
        const url = new URL(route.request().url());
        const typeFilter = url.searchParams.get('type');

        let agents = [mockAgents.claude, mockAgents.gemini];
        if (typeFilter) {
          agents = agents.filter(agent => agent.type === typeFilter);
        }

        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents, total: agents.length }),
        });
      });

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Initially see all agents
      await agentsPage.expectAgentVisible(mockAgents.claude.id);
      await agentsPage.expectAgentVisible(mockAgents.gemini.id);

      // Filter by CLAUDE type
      await page.selectOption('[data-testid="agent-type-filter"]', 'CLAUDE');

      // Should only see Claude agents
      await agentsPage.expectAgentVisible(mockAgents.claude.id);
      await expect(page.locator(`[data-testid="agent-${mockAgents.gemini.id}"]`)).not.toBeVisible();
    });
  });

  test.describe('Performance and Loading States', () => {
    test('should show loading state while fetching agents', async ({ page }) => {
      // Mock slow API response
      await page.route('**/agents', route => {
        setTimeout(() => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ agents: [mockAgents.claude], total: 1 }),
          });
        }, 2000);
      });

      await agentsPage.goto();

      // Should show loading state
      await expect(page.getByText('Loading agents...')).toBeVisible();
      await expect(page.locator('[data-testid="agents-loading-spinner"]')).toBeVisible();

      // Wait for completion
      await agentsPage.waitForPageReady();
      await expect(page.getByText('Loading agents...')).not.toBeVisible();
    });

    test('should handle large numbers of agents efficiently', async ({ page }) => {
      // Generate many mock agents
      const manyAgents = Array.from({ length: 50 }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent-${i}`,
        type: 'CLAUDE',
        status: 'ONLINE',
        activityState: 'IDLE',
      }));

      await page.route('**/agents', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ agents: manyAgents, total: manyAgents.length }),
        });
      });

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Should render without performance issues
      const agentCards = page.locator('[data-testid^="agent-"]');
      expect(await agentCards.count()).toBe(50);

      // Test scrolling performance
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      // Should remain responsive
      await expect(page.locator('[data-testid="agent-49"]')).toBeVisible();
    });

    test('should implement pagination for many agents', async ({ page }) => {
      const totalAgents = 100;
      const pageSize = 20;

      await page.route('**/agents*', route => {
        const url = new URL(route.request().url());
        const page_num = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || pageSize.toString());

        const start = (page_num - 1) * limit;
        const end = Math.min(start + limit, totalAgents);

        const agents = Array.from({ length: end - start }, (_, i) => ({
          id: `agent-${start + i}`,
          name: `Agent-${start + i}`,
          type: 'CLAUDE',
          status: 'ONLINE',
          activityState: 'IDLE',
        }));

        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            agents,
            total: totalAgents,
            page: page_num,
            totalPages: Math.ceil(totalAgents / limit),
          }),
        });
      });

      await agentsPage.goto();
      await agentsPage.waitForPageReady();

      // Should show pagination
      await expect(page.locator('[data-testid="pagination"]')).toBeVisible();
      await expect(page.getByText('Page 1 of 5')).toBeVisible();

      // Should show correct number of agents per page
      const agentCards = page.locator('[data-testid^="agent-"]');
      expect(await agentCards.count()).toBe(pageSize);

      // Test pagination navigation
      await page.click('[data-testid="next-page"]');
      await expect(page.getByText('Page 2 of 5')).toBeVisible();
    });
  });
});