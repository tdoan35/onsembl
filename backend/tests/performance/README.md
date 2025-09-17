# Performance Tests

This directory contains performance tests for the Onsembl.ai backend WebSocket server.

## Test Files

### `latency.test.ts`
Tests WebSocket message latency to ensure <200ms requirement is met:

- **Message Round-trip Latency**: Tests basic ping/pong and terminal output streaming
- **Payload Size Impact**: Tests latency with different payload sizes (100 bytes to 1MB)
- **Network Condition Simulation**: Tests burst messages and connection recovery

**Requirements Validated**:
- P95 latency <200ms for terminal streaming
- P99 latency <300ms under normal conditions
- Average latency <100ms for basic messages
- Handles payload sizes up to 1MB with reasonable latency

### `concurrency.test.ts`
Tests concurrent agent connections and message throughput:

- **Concurrent Connections**: Tests 10, 20, and 50 simultaneous agent connections
- **Message Throughput**: Tests 100 messages/second per agent requirement
- **Memory Usage**: Monitors memory consumption under load
- **Queue Performance**: Tests command queuing with multiple agents
- **Connection Pool**: Tests rapid connection cycling

**Requirements Validated**:
- Support 10+ concurrent agent connections
- Handle 100 messages/second per agent
- Maintain >90% success rate for 20 concurrent connections
- Maintain >80% success rate for 50 concurrent connections (stress test)
- Memory usage remains reasonable under load

## Running Performance Tests

### Prerequisites
1. Ensure backend dependencies are installed:
   ```bash
   cd backend
   npm install
   ```

2. Set up environment variables (if required for Supabase/Redis):
   ```bash
   cp .env.example .env
   # Edit .env with your test configuration
   ```

### Running All Performance Tests
```bash
# From backend directory
npm test -- --testPathPattern="performance"
```

### Running Specific Test Suites
```bash
# Latency tests only
npm test -- tests/performance/latency.test.ts

# Concurrency tests only
npm test -- tests/performance/concurrency.test.ts
```

### Running with Verbose Output
```bash
npm test -- --testPathPattern="performance" --verbose
```

### Performance Test Configuration

The tests are configured with:
- **Jest Timeout**: 60 seconds for long-running concurrency tests
- **Connection Timeout**: 5 seconds for individual connections
- **Test Timeout**: Various based on test complexity

## Expected Results

### Latency Benchmarks
- **P50 Latency**: <50ms for basic messages
- **P95 Latency**: <200ms for terminal output
- **P99 Latency**: <300ms under normal load
- **Average Latency**: <100ms

### Concurrency Benchmarks
- **10 Concurrent Agents**: 100% success rate, <1s average connection time
- **20 Concurrent Agents**: >90% success rate
- **50 Concurrent Agents**: >80% success rate (stress test)
- **Throughput**: >400 messages/second total across agents
- **Memory**: <100MB increase under load

## Interpreting Results

### Success Criteria
✅ **PASS**: All latency requirements met, high concurrency success rates
⚠️ **WARNING**: Some degradation under extreme load (acceptable)
❌ **FAIL**: Core requirements not met, investigation needed

### Common Issues
1. **High Latency**: Check system load, network conditions
2. **Connection Failures**: May indicate resource limits or rate limiting
3. **Memory Leaks**: Monitor for connections not being properly cleaned up

## Test Environment

These tests create:
- Real WebSocket connections to a test Fastify server
- Mock message handlers for performance measurement
- Memory usage monitoring
- Latency measurement utilities

The tests are designed to be:
- **Isolated**: Each test cleans up its own connections
- **Repeatable**: Results should be consistent across runs
- **Realistic**: Uses actual WebSocket protocol and message types

## Troubleshooting

### Tests Timing Out
- Increase Jest timeout in individual test files
- Check system resources (CPU, memory)
- Verify network connectivity

### Memory Issues
- Monitor system memory availability
- Check for connection leaks in test cleanup
- Reduce concurrent connection counts if needed

### Connection Failures
- Verify port availability
- Check system file descriptor limits
- Review connection pool settings

## Continuous Integration

These performance tests can be integrated into CI/CD pipelines:

```bash
# Run with CI-specific timeout and configuration
npm test -- --testPathPattern="performance" --ci --maxWorkers=1
```

For CI environments, consider:
- Running with reduced concurrency limits
- Setting appropriate timeouts for the environment
- Monitoring resource usage during tests