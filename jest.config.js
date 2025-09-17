/** @type {import('jest').Config} */
module.exports = {
  // Global Jest configuration for the monorepo
  projects: [
    '<rootDir>/backend/jest.config.js',
    '<rootDir>/agent-wrapper/jest.config.js',
    '<rootDir>/packages/agent-protocol/jest.config.js',
    '<rootDir>/packages/command-queue/jest.config.js',
    '<rootDir>/packages/trace-collector/jest.config.js',
  ],

  // Global test configuration
  testTimeout: 10000,
  verbose: true,
  maxWorkers: '50%',

  // Coverage collection
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    '!src/types/**/*',
    '!src/**/__tests__/**/*',
    '!src/**/__mocks__/**/*',
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // Coverage reporters
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html',
    'clover',
  ],

  // Coverage output directory
  coverageDirectory: '<rootDir>/coverage',

  // Global setup and teardown
  globalSetup: '<rootDir>/jest.global-setup.js',
  globalTeardown: '<rootDir>/jest.global-teardown.js',

  // Test environment
  testEnvironment: 'node',

  // Module paths
  modulePathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/build/',
    '<rootDir>/.next/',
    '<rootDir>/coverage/',
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/.next/',
    '/coverage/',
  ],

  // Watch mode configuration
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/.next/',
    '/coverage/',
  ],

  // Transform configuration
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],

  // Module name mapping for monorepo packages
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@onsembl/agent-protocol$': '<rootDir>/packages/agent-protocol/src',
    '^@onsembl/agent-protocol/(.*)$': '<rootDir>/packages/agent-protocol/src/$1',
    '^@onsembl/command-queue$': '<rootDir>/packages/command-queue/src',
    '^@onsembl/command-queue/(.*)$': '<rootDir>/packages/command-queue/src/$1',
    '^@onsembl/trace-collector$': '<rootDir>/packages/trace-collector/src',
    '^@onsembl/trace-collector/(.*)$': '<rootDir>/packages/trace-collector/src/$1',
  },

  // Global setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};