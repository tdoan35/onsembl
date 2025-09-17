/**
 * Global teardown for Playwright tests
 * Runs once after all tests
 */

import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting Playwright global teardown...');

  // You can add global cleanup tasks here:
  // - Database cleanup
  // - Service shutdown
  // - Temporary file cleanup

  // Example: Clean up authentication state
  // const fs = require('fs');
  // if (fs.existsSync('auth.json')) {
  //   fs.unlinkSync('auth.json');
  // }

  console.log('✅ Playwright global teardown complete');
}

export default globalTeardown;