# Command Queue Tests

This directory contains comprehensive unit and integration tests for the `@onsembl/command-queue` package.

## Test Structure

### Unit Tests

- **`priority.test.ts`** - Tests priority queue logic including:
  - Priority assignment and validation (0-100 range)
  - Queue position tracking and updates
  - Priority-based ordering
  - Queue size management and limits
  - Error handling for priority operations

- **`queue-manager.test.ts`** - Tests queue management operations including:
  - Queue initialization and lifecycle
  - Command addition, removal, and retrieval
  - Queue operations (pause, resume, drain, clean)
  - Metrics calculation and reporting
  - Command filtering and pagination
  - Graceful shutdown procedures

- **`interruption.test.ts`** - Tests command interruption logic including:
  - Waiting job interruption (immediate removal)
  - Active job interruption (graceful vs forced)
  - Timeout handling for graceful shutdowns
  - Interruption state validation
  - Multiple concurrent interruptions
  - Error handling during interruption

- **`config.test.ts`** - Tests configuration management including:
  - Default configuration values
  - Environment variable overrides
  - Configuration validation and type checking
  - Singleton behavior
  - Redis connection options

- **`redis-connection.test.ts`** - Tests Redis connection management including:
  - Connection creation and configuration
  - Event handling (connect, ready, error, close)
  - Connection health monitoring
  - Connection duplication
  - Error handling and recovery

- **`processor.test.ts`** - Tests command processing logic including:
  - Command execution with different types
  - Execution constraints (time limits, token budgets)
  - Progress tracking and updates
  - Worker lifecycle management
  - Error handling and recovery
  - Metrics collection

- **`types.test.ts`** - Tests TypeScript type definitions including:
  - Interface completeness and compatibility
  - Optional vs required properties
  - Type safety and validation
  - Cross-interface compatibility

### Integration Tests

- **`integration.test.ts`** - Tests end-to-end workflows including:
  - Complete command processing pipeline
  - Priority-based command ordering
  - Command interruption workflows
  - Queue pause/resume operations
  - Error handling and recovery
  - Performance with multiple concurrent commands
  - System monitoring and health checks
  - Event system integration

### Test Utilities

- **`setup.ts`** - Common test setup and utilities including:
  - Mock factory functions
  - Global test configuration
  - Shared test utilities
  - Mock implementations for external dependencies

## Test Configuration

### Jest Configuration
The tests use Jest with TypeScript support via `ts-jest`. Key configuration:

- **ESM Support**: Uses `ts-jest/presets/default-esm` for ES modules
- **File Pattern**: Tests are located in `tests/**/*.test.ts`
- **Timeout**: 10 seconds for async operations
- **Mocking**: Automatic mocking of external dependencies

### Mocked Dependencies

The tests mock the following external dependencies:

- **BullMQ**: Queue, Worker, QueueEvents, Job classes
- **Redis/ioredis**: Redis connection and operations
- **Configuration**: Config loading and environment variables
- **Logging**: Pino logger instances

### Coverage

Tests aim for comprehensive coverage including:

- **Happy Path**: Normal operation scenarios
- **Error Cases**: Failure handling and recovery
- **Edge Cases**: Boundary conditions and unusual inputs
- **Concurrency**: Multiple operations and race conditions
- **Performance**: Large datasets and stress scenarios

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode
```bash
npm run test:watch
```

### Specific Test File
```bash
npx jest priority.test.ts
```

### With Coverage
```bash
npx jest --coverage
```

## Test Patterns

### Mocking Strategy
- **External Dependencies**: Always mocked to ensure unit test isolation
- **Internal Modules**: Selective mocking to test specific functionality
- **Async Operations**: Proper async/await handling with timeouts

### Test Organization
- **Describe Blocks**: Group related functionality
- **Setup/Teardown**: Consistent beforeEach/afterEach patterns
- **Mock Reset**: Clear mocks between tests for isolation

### Assertions
- **Behavior Verification**: Test expected function calls and side effects
- **State Validation**: Check object states and properties
- **Error Handling**: Verify error conditions and messages

## Best Practices

1. **Test Independence**: Each test should be runnable in isolation
2. **Clear Names**: Test descriptions should clearly indicate what's being tested
3. **Comprehensive Coverage**: Test both success and failure scenarios
4. **Mock Verification**: Verify mocks are called with expected parameters
5. **Async Handling**: Proper async/await usage and timeout handling
6. **Error Testing**: Test error conditions and edge cases
7. **Performance**: Avoid long-running tests; use appropriate timeouts

## Maintenance

When adding new features:

1. Add corresponding unit tests
2. Update integration tests if needed
3. Add new mocks for external dependencies
4. Update this README if test structure changes
5. Ensure all tests pass before merging

When refactoring:

1. Update affected tests
2. Maintain test coverage levels
3. Keep test descriptions current
4. Remove obsolete tests