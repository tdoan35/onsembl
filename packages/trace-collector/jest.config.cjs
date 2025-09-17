/** @type {import('jest').Config} */
module.exports = {
  displayName: 'trace-collector',
  testEnvironment: 'node',

  // Use CommonJS mode for simplicity
  preset: 'ts-jest',

  // Test files
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/src/**/__tests__/**/*.ts',
  ],

  // Transform configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: './tsconfig.json',
    }],
  },

  // Module name mapping to handle .js imports in TypeScript
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
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
  setupFilesAfterEnv: ['<rootDir>/../../jest.setup.js'],

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