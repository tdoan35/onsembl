/**
 * Global Jest teardown - runs once after all tests
 */

module.exports = async () => {
  // Clean up any global resources
  // Close database connections, Redis connections, etc.

  // Reset environment variables
  delete process.env.TEST_DATABASE_URL;
  delete process.env.TEST_REDIS_URL;

  console.log('🧹 Global Jest teardown complete');
};