/** @type {import('jest').Config} */
module.exports = {
  displayName: 'backend',
  rootDir: '.',

  // TypeScript configuration
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],

  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ESNext',
        target: 'ES2022',
        moduleResolution: 'node',
        allowJs: true,
        resolveJsonModule: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        noEmit: true,
        isolatedModules: true,
      },
    }],
  },

  // Test patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.spec.ts',
  ],

  // Module resolution
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@onsembl/agent-protocol$': '<rootDir>/../packages/agent-protocol/src',
    '^@onsembl/command-queue$': '<rootDir>/../packages/command-queue/src',
    '^@onsembl/trace-collector$': '<rootDir>/../packages/trace-collector/src',
  },

  // Test environment
  testEnvironment: 'node',
  testTimeout: 10000,

  // Coverage
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/types/**/*',
  ],

  coverageDirectory: '<rootDir>/coverage',

  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],

  watchPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],

  // Clear mocks automatically between tests
  clearMocks: true,

  // Globals
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
};