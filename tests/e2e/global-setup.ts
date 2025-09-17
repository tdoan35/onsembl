/**
 * Global setup for Playwright tests
 * Runs once before all tests
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🎭 Starting Playwright global setup...');

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'warn';

  // You can add global setup tasks here:
  // - Database seeding
  // - Authentication state setup
  // - Service initialization

  // Example: Create a global authentication state
  // const browser = await chromium.launch();
  // const page = await browser.newPage();
  // await page.goto('http://localhost:3000/login');
  // await page.fill('[data-testid="email"]', 'test@example.com');
  // await page.fill('[data-testid="password"]', 'testpassword');
  // await page.click('[data-testid="login-button"]');
  // await page.context().storageState({ path: 'auth.json' });
  // await browser.close();

  console.log('✅ Playwright global setup complete');
}

export default globalSetup;