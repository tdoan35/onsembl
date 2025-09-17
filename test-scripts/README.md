# WebSocket Test Scripts

This directory contains test scripts for validating the WebSocket implementation.

## Quick Start

```bash
# Install dependencies
npm install

# Run quick test (fastest)
npm run test:quick

# Run all tests
npm run test:all
```

## Available Scripts

### 1. Quick Test (`quick-test.js`)
Fast validation of core WebSocket functionality.

```bash
node quick-test.js
```

Tests:
- Basic connection
- Heartbeat ping/pong
- Dashboard connection
- Multiple connections
- Error handling
- Rate limiting

### 2. Test Agent (`test-agent.js`)
Simulates an AI agent connecting to the server.

```bash
node test-agent.js [agentId] [agentType]

# Example
node test-agent.js my-agent-001 claude
```

Features:
- Agent registration
- Command execution simulation
- Terminal output streaming
- Status updates
- Interactive CLI

Commands:
- `status` - Send status update
- `error` - Simulate error
- `output` - Send test output
- `complete` - Complete all commands
- `quit` - Disconnect

### 3. Test Dashboard (`test-dashboard.js`)
Simulates a dashboard client connecting to the server.

```bash
node test-dashboard.js [dashboardId]

# Example
node test-dashboard.js my-dashboard-001
```

Features:
- Dashboard connection
- Agent monitoring
- Command sending
- Terminal output reception
- Interactive CLI

Commands:
- `agents` - List connected agents
- `command <agent> <cmd>` - Send command
- `interrupt <cmdId>` - Interrupt command
- `subscribe <type>` - Subscribe to updates
- `emergency` - Send emergency stop
- `status` - Show current state
- `quit` - Disconnect

### 4. Stress Test (`stress-test.js`)
Tests system under high load conditions.

```bash
node stress-test.js [connections] [messagesPerSecond]

# Example: 10 connections, 50 messages/sec
node stress-test.js 10 50
```

Metrics:
- Connection success rate
- Message throughput
- Latency (min/max/avg/P50/P95/P99)
- Error rate

### 5. Full Test Suite (`run-tests.sh`)
Comprehensive test runner that validates all aspects.

```bash
bash run-tests.sh
# or
npm run test:all
```

Tests:
1. Prerequisites check
2. Basic connectivity
3. Unit tests
4. Integration tests
5. Performance test
6. End-to-end test

## Environment Variables

```bash
# WebSocket server URL
WS_URL=ws://localhost:3001

# Authentication token
AUTH_TOKEN=your-jwt-token

# User ID for dashboard
USER_ID=test-user-123

# Backend URL for health checks
BACKEND_URL=http://localhost:3001

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

## Testing Scenarios

### Scenario 1: Basic Validation
```bash
# Quick test to ensure everything works
node quick-test.js
```

### Scenario 2: Agent-Dashboard Communication
```bash
# Terminal 1: Start agent
node test-agent.js agent-001

# Terminal 2: Start dashboard and send command
node test-dashboard.js
> command agent-001 "npm test"
```

### Scenario 3: Load Testing
```bash
# Test with 20 connections, 100 msg/sec
node stress-test.js 20 100
```

### Scenario 4: Reconnection Testing
```bash
# Start dashboard
node test-dashboard.js

# Stop backend (Ctrl+C)
# Dashboard should attempt reconnection

# Restart backend
# Dashboard should reconnect automatically
```

## Troubleshooting

### Backend not running
```
Error: Backend is not running!
```
**Solution**: Start the backend first
```bash
cd ../backend
npm run dev
```

### Connection refused
```
Error: connect ECONNREFUSED
```
**Solution**: Check if services are running on correct ports

### Authentication failed
```
Error: Unauthorized
```
**Solution**: Set valid AUTH_TOKEN environment variable

### Rate limit exceeded
```
Error: Rate limit exceeded
```
**Solution**: This is expected behavior; reduce message frequency

## Success Indicators

✅ All quick tests pass
✅ Agent and dashboard connect successfully
✅ Messages are exchanged in real-time
✅ Commands execute and show output
✅ System handles 10+ concurrent connections
✅ Latency stays under 200ms
✅ Reconnection works automatically

## Next Steps

After validating with these test scripts:
1. Test with real agent wrappers
2. Test in production environment
3. Monitor performance metrics
4. Set up continuous testing