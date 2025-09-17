/**
 * Global Jest setup file
 * This file runs before each test file
 */

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock console methods during tests to reduce noise
const originalConsole = console;
global.console = {
  ...originalConsole,
  // Keep error and warn for debugging
  error: originalConsole.error,
  warn: originalConsole.warn,
  // Silence info, log, debug during tests
  info: jest.fn(),
  log: jest.fn(),
  debug: jest.fn(),
};

// Global test utilities
global.TestUtils = {
  // Async helper for testing promises
  wait: (ms = 0) => new Promise(resolve => setTimeout(resolve, ms)),

  // Generate test IDs
  generateId: () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,

  // Create mock functions with common patterns
  createMockFn: (returnValue) => jest.fn().mockResolvedValue(returnValue),

  // Test data factories
  createMockAgent: (overrides = {}) => ({
    id: global.TestUtils.generateId(),
    name: 'test-agent',
    type: 'claude',
    status: 'idle',
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  createMockCommand: (overrides = {}) => ({
    id: global.TestUtils.generateId(),
    agentId: 'test-agent-id',
    command: 'test command',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  }),
};

// Global test timeouts
jest.setTimeout(10000);

// Mock external dependencies that shouldn't run during tests
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    ping: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  })),
}));

// Mock BullMQ
jest.mock('bullmq', () => ({
  Queue: jest.fn(() => ({
    add: jest.fn(),
    process: jest.fn(),
    close: jest.fn(),
    getWaiting: jest.fn(() => []),
    getActive: jest.fn(() => []),
    getCompleted: jest.fn(() => []),
    getFailed: jest.fn(() => []),
  })),
  Worker: jest.fn(() => ({
    close: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  })),
}));

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({ data: [], error: null })),
      insert: jest.fn(() => ({ data: [], error: null })),
      update: jest.fn(() => ({ data: [], error: null })),
      delete: jest.fn(() => ({ data: [], error: null })),
      eq: jest.fn(function() { return this; }),
      neq: jest.fn(function() { return this; }),
      gt: jest.fn(function() { return this; }),
      lt: jest.fn(function() { return this; }),
      order: jest.fn(function() { return this; }),
      limit: jest.fn(function() { return this; }),
    })),
    channel: jest.fn(() => ({
      on: jest.fn(function() { return this; }),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    })),
    auth: {
      getUser: jest.fn(),
      signOut: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
  })),
}));

// Clean up after each test
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();

  // Reset modules to ensure clean state
  jest.resetModules();
});