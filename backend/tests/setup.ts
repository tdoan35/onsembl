import dotenv from 'dotenv';
import path from 'path';

// Load environment variables for tests
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

// Set test environment defaults if not provided
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock WebSocket if needed
global.WebSocket = require('ws');

// Cleanup after all tests
afterAll(async () => {
  // Close any open connections
  await new Promise(resolve => setTimeout(resolve, 100));
});