/** @type {import('jest').Config} */
module.exports = {
  displayName: 'agent-wrapper',
  testEnvironment: 'node',

  // TypeScript support
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],

  // Test files
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/src/**/__tests__/**/*.ts',
  ],

  // Transform configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: './tsconfig.json',
    }],
  },

  // Module name mapping
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@onsembl/agent-protocol$': '<rootDir>/../packages/agent-protocol/src',
    '^@onsembl/agent-protocol/(.*)$': '<rootDir>/../packages/agent-protocol/src/$1',
    '^@onsembl/command-queue$': '<rootDir>/../packages/command-queue/src',
    '^@onsembl/command-queue/(.*)$': '<rootDir>/../packages/command-queue/src/$1',
  },

  // Coverage
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**/*',
    '!src/**/__mocks__/**/*',
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/../jest.setup.js'],

  // Test timeout
  testTimeout: 10000,

  // Root directory
  rootDir: '.',

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],

  // Module paths
  modulePathIgnorePatterns: [
    '<rootDir>/dist/',
  ],
};