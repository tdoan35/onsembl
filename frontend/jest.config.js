/** @type {import('jest').Config} */
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
});

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const config = {
  displayName: 'frontend',

  // Use jsdom environment for React components
  testEnvironment: 'jsdom',

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Test files
  testMatch: [
    '<rootDir>/src/**/*.test.{ts,tsx}',
    '<rootDir>/tests/**/*.test.{ts,tsx}',
    '<rootDir>/src/**/__tests__/**/*.{ts,tsx}',
    '<rootDir>/__tests__/**/*.{ts,tsx}',
  ],

  // Module name mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@onsembl/agent-protocol$': '<rootDir>/../packages/agent-protocol/src',
    '^@onsembl/agent-protocol/(.*)$': '<rootDir>/../packages/agent-protocol/src/$1',
  },

  // Coverage
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/__tests__/**/*',
    '!src/**/__mocks__/**/*',
    '!src/**/*.stories.{ts,tsx}',
    '!src/app/globals.css',
    '!src/app/layout.tsx', // Layout files often have minimal logic
  ],

  // Coverage thresholds for frontend
  coverageThreshold: {
    global: {
      branches: 60, // Lower threshold for frontend due to JSX
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },

  // Transform configuration
  transform: {
    // Use SWC to transform TypeScript and JSX
    '^.+\\.(ts|tsx)$': ['@swc/jest', {
      jsc: {
        parser: {
          syntax: 'typescript',
          tsx: true,
        },
        transform: {
          react: {
            runtime: 'automatic',
          },
        },
      },
    }],
  },

  // Test timeout
  testTimeout: 10000,

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/dist/',
  ],

  // Module paths to ignore
  modulePathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/dist/',
  ],

  // Watch mode configuration
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/dist/',
  ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(config);