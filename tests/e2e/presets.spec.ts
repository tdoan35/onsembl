/**
 * E2E Tests for Command Preset Management
 * Tests preset creation, editing, deletion, and usage in commands
 */

import { test, expect } from '@playwright/test';
import { PresetsPage, DashboardPage } from './fixtures/page-objects';
import { testUsers, mockPresets, testConfig } from './fixtures/test-helpers';

test.describe('Command Preset Management', () => {
  let presetsPage: PresetsPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    presetsPage = new PresetsPage(page);
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

  test.describe('Preset List Display', () => {
    test('should display all available presets', async ({ page }) => {
      // Mock presets API
      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [mockPresets.codeReview, mockPresets.investigation],
            total: 2,
          }),
        });
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Check both presets are displayed
      await presetsPage.expectPresetVisible(mockPresets.codeReview.id);
      await presetsPage.expectPresetVisible(mockPresets.investigation.id);

      // Verify preset information
      expect(await presetsPage.getPresetName(mockPresets.codeReview.id)).toBe(mockPresets.codeReview.name);
      expect(await presetsPage.getPresetDescription(mockPresets.codeReview.id)).toBe(mockPresets.codeReview.description);
    });

    test('should show empty state when no presets exist', async ({ page }) => {
      // Mock empty presets response
      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ presets: [], total: 0 }),
        });
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Should show empty state
      await expect(page.getByText('No presets found')).toBeVisible();
      await expect(page.getByText('Create your first preset to get started')).toBeVisible();
      await expect(page.locator('[data-testid="create-preset-button"]')).toBeVisible();
    });

    test('should handle API errors gracefully', async ({ page }) => {
      // Mock API error
      await page.route('**/presets', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      await presetsPage.goto();

      // Should show error message
      await expect(page.getByText('Failed to load presets')).toBeVisible();
      await expect(page.getByText('Try again')).toBeVisible();

      // Should have retry button
      await expect(page.locator('[data-testid="retry-load-presets"]')).toBeVisible();
    });

    test('should support preset categories', async ({ page }) => {
      const categorizedPresets = [
        { ...mockPresets.codeReview, category: 'REVIEW' },
        { ...mockPresets.investigation, category: 'INVESTIGATE' },
        { id: 'preset-plan', name: 'Project Planning', category: 'PLAN', description: 'Plan project structure' },
      ];

      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: categorizedPresets,
            total: categorizedPresets.length,
          }),
        });
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Should show category badges
      for (const preset of categorizedPresets) {
        const categoryBadge = page.locator(`[data-testid="preset-${preset.id}-category"]`);
        await expect(categoryBadge).toContainText(preset.category);
        await expect(categoryBadge).toHaveClass(new RegExp(preset.category.toLowerCase()));
      }
    });

    test('should filter presets by category', async ({ page }) => {
      const allPresets = [
        { ...mockPresets.codeReview, category: 'REVIEW' },
        { ...mockPresets.investigation, category: 'INVESTIGATE' },
      ];

      await page.route('**/presets', route => {
        const url = new URL(route.request().url());
        const categoryFilter = url.searchParams.get('category');

        let filteredPresets = allPresets;
        if (categoryFilter) {
          filteredPresets = allPresets.filter(p => p.category === categoryFilter);
        }

        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: filteredPresets,
            total: filteredPresets.length,
          }),
        });
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Initially see all presets
      await presetsPage.expectPresetVisible(mockPresets.codeReview.id);
      await presetsPage.expectPresetVisible(mockPresets.investigation.id);

      // Filter by REVIEW category
      await page.selectOption('[data-testid="category-filter"]', 'REVIEW');

      // Should only see review presets
      await presetsPage.expectPresetVisible(mockPresets.codeReview.id);
      await expect(page.locator(`[data-testid="preset-${mockPresets.investigation.id}"]`)).not.toBeVisible();
    });

    test('should search presets by name and description', async ({ page }) => {
      await page.route('**/presets', route => {
        const url = new URL(route.request().url());
        const searchQuery = url.searchParams.get('search');

        let filteredPresets = [mockPresets.codeReview, mockPresets.investigation];
        if (searchQuery) {
          filteredPresets = filteredPresets.filter(p =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description.toLowerCase().includes(searchQuery.toLowerCase())
          );
        }

        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: filteredPresets,
            total: filteredPresets.length,
          }),
        });
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Search for "code"
      await page.fill('[data-testid="preset-search"]', 'code');

      // Should only show code review preset
      await presetsPage.expectPresetVisible(mockPresets.codeReview.id);
      await expect(page.locator(`[data-testid="preset-${mockPresets.investigation.id}"]`)).not.toBeVisible();

      // Clear search
      await page.fill('[data-testid="preset-search"]', '');

      // Should show all presets again
      await presetsPage.expectPresetVisible(mockPresets.codeReview.id);
      await presetsPage.expectPresetVisible(mockPresets.investigation.id);
    });
  });

  test.describe('Preset Creation', () => {
    test('should create new preset successfully', async ({ page }) => {
      const newPreset = {
        name: 'Bug Analysis',
        description: 'Analyze and provide solutions for bugs',
        command: 'Please analyze this bug and provide potential solutions with code examples.',
        category: 'INVESTIGATE',
      };

      // Mock preset creation API
      await page.route('**/presets', route => {
        if (route.request().method() === 'POST') {
          const requestData = route.request().postDataJSON();
          route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'preset-new',
              ...requestData,
              createdAt: Date.now(),
            }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ presets: [], total: 0 }),
          });
        }
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Create new preset
      await presetsPage.createNewPreset(newPreset);

      // Should show success message
      await expect(page.getByText('Preset created successfully')).toBeVisible();

      // Should appear in the list
      await expect(page.getByText(newPreset.name)).toBeVisible();
      await expect(page.getByText(newPreset.description)).toBeVisible();
    });

    test('should validate required fields', async ({ page }) => {
      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Try to create preset without required fields
      await presetsPage.clickCreatePreset();

      // Try to save empty form
      await presetsPage.savePreset();

      // Should show validation errors
      await expect(page.getByText('Name is required')).toBeVisible();
      await expect(page.getByText('Description is required')).toBeVisible();
      await expect(page.getByText('Command is required')).toBeVisible();

      // Modal should still be open
      await expect(page.locator('[data-testid="preset-modal"]')).toBeVisible();
    });

    test('should validate preset name uniqueness', async ({ page }) => {
      // Mock existing presets
      await page.route('**/presets', route => {
        if (route.request().method() === 'GET') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              presets: [mockPresets.codeReview],
              total: 1,
            }),
          });
        } else if (route.request().method() === 'POST') {
          // Mock name conflict
          route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Preset name already exists' }),
          });
        }
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Try to create preset with existing name
      await presetsPage.createNewPreset({
        name: mockPresets.codeReview.name, // Duplicate name
        description: 'Different description',
        command: 'Different command',
        category: 'REVIEW',
      });

      // Should show error message
      await expect(page.getByText('Preset name already exists')).toBeVisible();

      // Modal should still be open for correction
      await expect(page.locator('[data-testid="preset-modal"]')).toBeVisible();
    });

    test('should support command templates and variables', async ({ page }) => {
      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      await presetsPage.clickCreatePreset();

      // Should have template helper
      await expect(page.locator('[data-testid="template-helper"]')).toBeVisible();

      // Should show available variables
      await page.click('[data-testid="show-variables"]');
      await expect(page.getByText('{{file_path}}')).toBeVisible();
      await expect(page.getByText('{{selected_text}}')).toBeVisible();
      await expect(page.getByText('{{project_context}}')).toBeVisible();

      // Should insert variables into command
      await page.click('[data-testid="insert-variable-file_path"]');

      const commandTextarea = page.locator('[data-testid="preset-command"]');
      await expect(commandTextarea).toContainText('{{file_path}}');
    });

    test('should preview command with sample data', async ({ page }) => {
      const sampleCommand = 'Analyze the file {{file_path}} and explain {{selected_text}}';

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      await presetsPage.clickCreatePreset();

      // Fill command with variables
      await page.fill('[data-testid="preset-command"]', sampleCommand);

      // Click preview
      await page.click('[data-testid="preview-command"]');

      // Should show preview with sample data
      await expect(page.locator('[data-testid="command-preview"]')).toBeVisible();
      await expect(page.getByText('Analyze the file src/example.ts and explain function declaration')).toBeVisible();
    });
  });

  test.describe('Preset Editing', () => {
    test('should edit existing preset', async ({ page }) => {
      // Mock preset list and update APIs
      await page.route('**/presets', route => {
        if (route.request().method() === 'GET') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              presets: [mockPresets.codeReview],
              total: 1,
            }),
          });
        }
      });

      await page.route(`**/presets/${mockPresets.codeReview.id}`, route => {
        if (route.request().method() === 'PUT') {
          const requestData = route.request().postDataJSON();
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ...mockPresets.codeReview,
              ...requestData,
              updatedAt: Date.now(),
            }),
          });
        }
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Edit existing preset
      await presetsPage.editPreset(mockPresets.codeReview.id);

      // Should pre-fill form with existing data
      await expect(page.locator('[data-testid="preset-name"]')).toHaveValue(mockPresets.codeReview.name);
      await expect(page.locator('[data-testid="preset-description"]')).toHaveValue(mockPresets.codeReview.description);

      // Update fields
      const updates = {
        name: 'Enhanced Code Review',
        description: 'Enhanced code review with security analysis',
      };

      await page.fill('[data-testid="preset-name"]', updates.name);
      await page.fill('[data-testid="preset-description"]', updates.description);

      await presetsPage.savePreset();

      // Should show success message
      await expect(page.getByText('Preset updated successfully')).toBeVisible();

      // Should show updated information
      await expect(page.getByText(updates.name)).toBeVisible();
      await expect(page.getByText(updates.description)).toBeVisible();
    });

    test('should handle edit conflicts', async ({ page }) => {
      await page.route(`**/presets/${mockPresets.codeReview.id}`, route => {
        if (route.request().method() === 'PUT') {
          // Mock edit conflict
          route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Preset was modified by another user',
              currentVersion: {
                ...mockPresets.codeReview,
                description: 'Modified by someone else',
                updatedAt: Date.now(),
              },
            }),
          });
        }
      });

      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [mockPresets.codeReview],
            total: 1,
          }),
        });
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      await presetsPage.editPreset(mockPresets.codeReview.id);

      // Make changes
      await page.fill('[data-testid="preset-description"]', 'My changes');

      await presetsPage.savePreset();

      // Should show conflict resolution dialog
      await expect(page.locator('[data-testid="conflict-resolution-dialog"]')).toBeVisible();
      await expect(page.getByText('Preset was modified by another user')).toBeVisible();

      // Should show both versions
      await expect(page.getByText('Your changes:')).toBeVisible();
      await expect(page.getByText('My changes')).toBeVisible();
      await expect(page.getByText('Current version:')).toBeVisible();
      await expect(page.getByText('Modified by someone else')).toBeVisible();

      // Should offer resolution options
      await expect(page.locator('[data-testid="keep-my-changes"]')).toBeVisible();
      await expect(page.locator('[data-testid="keep-current-version"]')).toBeVisible();
      await expect(page.locator('[data-testid="merge-changes"]')).toBeVisible();
    });

    test('should maintain version history', async ({ page }) => {
      await page.route(`**/presets/${mockPresets.codeReview.id}/history`, route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            versions: [
              {
                version: 3,
                updatedAt: Date.now() - 3600000,
                updatedBy: 'user-123',
                changes: 'Updated description',
              },
              {
                version: 2,
                updatedAt: Date.now() - 7200000,
                updatedBy: 'user-456',
                changes: 'Added category',
              },
              {
                version: 1,
                updatedAt: Date.now() - 86400000,
                updatedBy: 'user-123',
                changes: 'Initial creation',
              },
            ],
          }),
        });
      });

      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [mockPresets.codeReview],
            total: 1,
          }),
        });
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Click on preset to see details
      await page.click(`[data-testid="preset-${mockPresets.codeReview.id}"]`);

      // View history
      await page.click('[data-testid="view-history"]');

      // Should show version history
      await expect(page.locator('[data-testid="version-history"]')).toBeVisible();
      await expect(page.getByText('Version 3')).toBeVisible();
      await expect(page.getByText('Updated description')).toBeVisible();
      await expect(page.getByText('Version 2')).toBeVisible();
      await expect(page.getByText('Added category')).toBeVisible();
    });
  });

  test.describe('Preset Deletion', () => {
    test('should delete preset with confirmation', async ({ page }) => {
      // Mock preset list and deletion APIs
      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [mockPresets.codeReview, mockPresets.investigation],
            total: 2,
          }),
        });
      });

      await page.route(`**/presets/${mockPresets.codeReview.id}`, route => {
        if (route.request().method() === 'DELETE') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Preset deleted successfully' }),
          });
        }
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Delete preset
      await presetsPage.deletePreset(mockPresets.codeReview.id);

      // Should show success message
      await expect(page.getByText('Preset deleted successfully')).toBeVisible();

      // Preset should be removed from list
      await expect(page.locator(`[data-testid="preset-${mockPresets.codeReview.id}"]`)).not.toBeVisible();
    });

    test('should cancel deletion when user declines', async ({ page }) => {
      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [mockPresets.codeReview],
            total: 1,
          }),
        });
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Start deletion but cancel
      await presetsPage.deletePreset(mockPresets.codeReview.id, false);

      // Preset should still be visible
      await presetsPage.expectPresetVisible(mockPresets.codeReview.id);
    });

    test('should handle deletion errors', async ({ page }) => {
      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [mockPresets.codeReview],
            total: 1,
          }),
        });
      });

      await page.route(`**/presets/${mockPresets.codeReview.id}`, route => {
        if (route.request().method() === 'DELETE') {
          route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Failed to delete preset' }),
          });
        }
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      await presetsPage.deletePreset(mockPresets.codeReview.id);

      // Should show error message
      await expect(page.getByText('Failed to delete preset')).toBeVisible();

      // Preset should still be visible
      await presetsPage.expectPresetVisible(mockPresets.codeReview.id);
    });

    test('should prevent deletion of presets in use', async ({ page }) => {
      await page.route(`**/presets/${mockPresets.codeReview.id}`, route => {
        if (route.request().method() === 'DELETE') {
          route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Cannot delete preset: currently in use',
              usageCount: 3,
              recentUsages: [
                { commandId: 'cmd-1', timestamp: Date.now() - 3600000 },
                { commandId: 'cmd-2', timestamp: Date.now() - 7200000 },
              ],
            }),
          });
        }
      });

      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [mockPresets.codeReview],
            total: 1,
          }),
        });
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      await presetsPage.deletePreset(mockPresets.codeReview.id);

      // Should show usage warning
      await expect(page.getByText('Cannot delete preset: currently in use')).toBeVisible();
      await expect(page.getByText('Used 3 times')).toBeVisible();

      // Should offer force deletion option
      await expect(page.locator('[data-testid="force-delete-button"]')).toBeVisible();
    });
  });

  test.describe('Using Presets in Commands', () => {
    test('should apply preset to command input', async ({ page }) => {
      // Mock presets for dashboard
      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [mockPresets.codeReview, mockPresets.investigation],
            total: 2,
          }),
        });
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Should have preset selector
      await expect(page.locator('[data-testid="preset-selector"]')).toBeVisible();

      // Select a preset
      await page.click('[data-testid="preset-selector"]');
      await page.click(`[data-testid="preset-option-${mockPresets.codeReview.id}"]`);

      // Command input should be filled with preset command
      const commandInput = page.locator('[data-testid="command-input"]');
      await expect(commandInput).toHaveValue(mockPresets.codeReview.command);

      // Should show preset indicator
      await expect(page.getByText(`Using preset: ${mockPresets.codeReview.name}`)).toBeVisible();
    });

    test('should allow modification of preset command', async ({ page }) => {
      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [mockPresets.codeReview],
            total: 1,
          }),
        });
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Apply preset
      await page.click('[data-testid="preset-selector"]');
      await page.click(`[data-testid="preset-option-${mockPresets.codeReview.id}"]`);

      // Modify the command
      const commandInput = page.locator('[data-testid="command-input"]');
      await commandInput.fill(mockPresets.codeReview.command + ' Also check for security issues.');

      // Should show modification indicator
      await expect(page.getByText('Modified from preset')).toBeVisible();

      // Should offer to save as new preset
      await expect(page.locator('[data-testid="save-as-new-preset"]')).toBeVisible();
    });

    test('should support preset variables substitution', async ({ page }) => {
      const presetWithVariables = {
        ...mockPresets.codeReview,
        command: 'Review the file {{file_path}} focusing on {{review_type}} aspects.',
      };

      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [presetWithVariables],
            total: 1,
          }),
        });
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Apply preset with variables
      await page.click('[data-testid="preset-selector"]');
      await page.click(`[data-testid="preset-option-${presetWithVariables.id}"]`);

      // Should show variable substitution dialog
      await expect(page.locator('[data-testid="variable-substitution-dialog"]')).toBeVisible();

      // Fill in variables
      await page.fill('[data-testid="variable-file_path"]', 'src/auth.ts');
      await page.fill('[data-testid="variable-review_type"]', 'security');

      // Apply substitutions
      await page.click('[data-testid="apply-substitutions"]');

      // Command should have variables replaced
      const commandInput = page.locator('[data-testid="command-input"]');
      await expect(commandInput).toHaveValue('Review the file src/auth.ts focusing on security aspects.');
    });

    test('should track preset usage analytics', async ({ page }) => {
      // Mock preset usage tracking
      await page.route('**/presets/*/usage', route => {
        if (route.request().method() === 'POST') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Usage recorded' }),
          });
        }
      });

      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [{
              ...mockPresets.codeReview,
              usageCount: 15,
              lastUsed: Date.now() - 3600000,
            }],
            total: 1,
          }),
        });
      });

      await dashboardPage.goto();
      await dashboardPage.waitForPageReady();

      // Apply preset
      await page.click('[data-testid="preset-selector"]');
      await page.click(`[data-testid="preset-option-${mockPresets.codeReview.id}"]`);

      // Should show usage stats
      await expect(page.getByText('Used 15 times')).toBeVisible();
      await expect(page.getByText('Last used: 1 hour ago')).toBeVisible();

      // Execute command to track usage
      await page.click('[data-testid="execute-button"]');

      // Usage should be recorded (check network request was made)
      // This would increment the usage count
    });
  });

  test.describe('Preset Organization', () => {
    test('should support preset favorites', async ({ page }) => {
      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [
              { ...mockPresets.codeReview, isFavorite: true },
              { ...mockPresets.investigation, isFavorite: false },
            ],
            total: 2,
          }),
        });
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Should show favorite indicator
      const favoriteIcon = page.locator(`[data-testid="preset-${mockPresets.codeReview.id}-favorite"]`);
      await expect(favoriteIcon).toHaveClass(/favorited/);

      // Should be able to toggle favorites
      await page.click(`[data-testid="preset-${mockPresets.investigation.id}-favorite"]`);

      // Should show favorited state
      await expect(page.locator(`[data-testid="preset-${mockPresets.investigation.id}-favorite"]`)).toHaveClass(/favorited/);
    });

    test('should support preset sharing', async ({ page }) => {
      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [mockPresets.codeReview],
            total: 1,
          }),
        });
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Click share button
      await page.click(`[data-testid="preset-${mockPresets.codeReview.id}-share"]`);

      // Should show share dialog
      await expect(page.locator('[data-testid="share-preset-dialog"]')).toBeVisible();

      // Should have sharing options
      await expect(page.locator('[data-testid="copy-preset-link"]')).toBeVisible();
      await expect(page.locator('[data-testid="export-preset"]')).toBeVisible();
      await expect(page.locator('[data-testid="share-with-team"]')).toBeVisible();

      // Copy link
      await page.click('[data-testid="copy-preset-link"]');
      await expect(page.getByText('Link copied to clipboard')).toBeVisible();
    });

    test('should support preset import/export', async ({ page }) => {
      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Should have import/export buttons
      await expect(page.locator('[data-testid="import-presets"]')).toBeVisible();
      await expect(page.locator('[data-testid="export-presets"]')).toBeVisible();

      // Mock file input for import
      await page.setInputFiles('[data-testid="import-file-input"]', {
        name: 'presets.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({
          presets: [
            {
              name: 'Imported Preset',
              description: 'Test imported preset',
              command: 'Test command',
              category: 'CUSTOM',
            },
          ],
        })),
      });

      // Should show import preview
      await expect(page.locator('[data-testid="import-preview"]')).toBeVisible();
      await expect(page.getByText('1 preset will be imported')).toBeVisible();

      // Confirm import
      await page.click('[data-testid="confirm-import"]');
      await expect(page.getByText('Presets imported successfully')).toBeVisible();
    });

    test('should support bulk operations', async ({ page }) => {
      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [mockPresets.codeReview, mockPresets.investigation],
            total: 2,
          }),
        });
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Enable bulk selection mode
      await page.click('[data-testid="bulk-select-mode"]');

      // Select multiple presets
      await page.check(`[data-testid="preset-${mockPresets.codeReview.id}-checkbox"]`);
      await page.check(`[data-testid="preset-${mockPresets.investigation.id}-checkbox"]`);

      // Should show bulk action bar
      await expect(page.locator('[data-testid="bulk-actions"]')).toBeVisible();
      await expect(page.getByText('2 presets selected')).toBeVisible();

      // Should have bulk operations
      await expect(page.locator('[data-testid="bulk-delete"]')).toBeVisible();
      await expect(page.locator('[data-testid="bulk-export"]')).toBeVisible();
      await expect(page.locator('[data-testid="bulk-categorize"]')).toBeVisible();
    });
  });

  test.describe('Performance and Usability', () => {
    test('should load presets efficiently', async ({ page }) => {
      // Mock large number of presets
      const manyPresets = Array.from({ length: 100 }, (_, i) => ({
        id: `preset-${i}`,
        name: `Preset ${i}`,
        description: `Description for preset ${i}`,
        command: `Command ${i}`,
        category: 'CUSTOM',
      }));

      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: manyPresets,
            total: manyPresets.length,
          }),
        });
      });

      const startTime = Date.now();
      await presetsPage.goto();
      await presetsPage.waitForPageReady();
      const loadTime = Date.now() - startTime;

      // Should load within reasonable time
      expect(loadTime).toBeLessThan(3000);

      // Should implement virtualization for performance
      const visiblePresets = await page.locator('[data-testid^="preset-"]').count();
      expect(visiblePresets).toBeLessThan(50); // Should not render all 100 at once
    });

    test('should implement search debouncing', async ({ page }) => {
      let searchRequestCount = 0;

      await page.route('**/presets*', route => {
        searchRequestCount++;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ presets: [], total: 0 }),
        });
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Type quickly in search
      await page.type('[data-testid="preset-search"]', 'code review', { delay: 50 });

      // Wait for debounce
      await page.waitForTimeout(1000);

      // Should have made fewer requests than characters typed
      expect(searchRequestCount).toBeLessThan(10);
    });

    test('should cache preset data', async ({ page }) => {
      let apiCallCount = 0;

      await page.route('**/presets', route => {
        apiCallCount++;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [mockPresets.codeReview],
            total: 1,
          }),
        });
      });

      // First load
      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      expect(apiCallCount).toBe(1);

      // Navigate away and back
      await dashboardPage.goto();
      await presetsPage.goto();

      // Should use cached data (no additional API call)
      expect(apiCallCount).toBe(1);
    });

    test('should support keyboard navigation', async ({ page }) => {
      await page.route('**/presets', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presets: [mockPresets.codeReview, mockPresets.investigation],
            total: 2,
          }),
        });
      });

      await presetsPage.goto();
      await presetsPage.waitForPageReady();

      // Should be able to navigate with arrow keys
      await page.keyboard.press('Tab'); // Focus first preset
      await expect(page.locator(`[data-testid="preset-${mockPresets.codeReview.id}"]`)).toBeFocused();

      await page.keyboard.press('ArrowDown');
      await expect(page.locator(`[data-testid="preset-${mockPresets.investigation.id}"]`)).toBeFocused();

      // Should activate with Enter
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-testid="preset-details"]')).toBeVisible();
    });
  });
});