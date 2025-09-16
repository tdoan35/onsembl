/**
 * Global Jest setup - runs once before all tests
 */

module.exports = async () => {
  // Set global test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';

  // Test database settings
  process.env.TEST_DATABASE_URL = 'postgresql://postgres:password@localhost:5432/onsembl_test';
  process.env.TEST_REDIS_URL = 'redis://localhost:6379/1';

  // Disable external services during tests
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

  // JWT settings for tests
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

  // Disable external API calls
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.GOOGLE_AI_API_KEY = 'test-google-key';

  // Disable monitoring
  process.env.ENABLE_REQUEST_LOGGING = 'false';
  process.env.ENABLE_ERROR_TRACKING = 'false';
  process.env.ENABLE_PERFORMANCE_MONITORING = 'false';

  console.log('🧪 Global Jest setup complete');
};