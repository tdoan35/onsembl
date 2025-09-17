# WebSocket Feature Testing Guide

This guide will help you comprehensively test the WebSocket implementation with practical scenarios.

## Prerequisites Setup

### 1. Install Dependencies
```bash
# In project root
npm install

# Install development tools
npm install -g wscat
npm install -g @playwright/test
```

### 2. Environment Configuration
```bash
# Create .env files if not exists
cp .env.example .env

# Ensure these are set in .env:
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
JWT_SECRET=your_jwt_secret
REDIS_URL=redis://localhost:6379
```

### 3. Start Required Services
```bash
# Terminal 1: Start Redis (if using local)
redis-server

# Terminal 2: Start Backend
cd backend
npm run dev

# Terminal 3: Start Frontend
cd frontend
npm run dev
```

## Part 1: Basic Connection Testing

### Test 1.1: Direct WebSocket Connection
```bash
# Test raw WebSocket connection
wscat -c ws://localhost:3001/ws/dashboard

# You should see: Connected (press CTRL+C to quit)
# Send a test message:
> {"type":"heartbeat:ping","timestamp":"2024-01-01T00:00:00Z"}

# Expected response:
< {"type":"heartbeat:pong","timestamp":"...","latency":...}
```

### Test 1.2: Authentication Flow
```bash
# Test with JWT token (replace with your token)
wscat -c ws://localhost:3001/ws/dashboard -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Send dashboard connect message:
> {"type":"dashboard:connect","dashboardId":"test-dash-123","timestamp":"2024-01-01T00:00:00Z"}

# Expected: ACK message and agent list
```

### Test 1.3: Browser Console Testing
```javascript
// Open browser console at http://localhost:3000
// Run this to test WebSocket from browser:

const ws = new WebSocket('ws://localhost:3001/ws/dashboard?token=YOUR_TOKEN');

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    type: 'dashboard:connect',
    dashboardId: 'browser-test',
    timestamp: new Date().toISOString()
  }));
};

ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data));
};

ws.onerror = (error) => {
  console.error('Error:', error);
};
```

## Part 2: Feature Testing

### Test 2.1: Real-time Agent Status Updates

**Setup Agent Simulator:**
```bash
# Create test-agent.js
cat > test-agent.js << 'EOF'
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3001/ws/agent', {
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
});

ws.on('open', () => {
  // Send agent connect
  ws.send(JSON.stringify({
    type: 'agent:connect',
    agentId: 'test-agent-001',
    agentType: 'claude',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  }));

  // Send periodic status updates
  setInterval(() => {
    ws.send(JSON.stringify({
      type: 'agent:status',
      agentId: 'test-agent-001',
      status: Math.random() > 0.5 ? 'online' : 'busy',
      metrics: {
        cpuUsage: Math.random() * 100,
        memoryUsage: Math.random() * 100,
        activeCommands: Math.floor(Math.random() * 5)
      },
      timestamp: new Date().toISOString()
    }));
  }, 2000);
});

ws.on('message', (data) => {
  console.log('Agent received:', data.toString());
});
EOF

# Run agent simulator
node test-agent.js
```

**Verify in Dashboard:**
1. Open http://localhost:3000/dashboard
2. You should see the agent appear in the agent list
3. Status should update every 2 seconds
4. CPU and memory metrics should change

### Test 2.2: Command Execution Flow

**Send Command Request:**
```javascript
// In browser console with dashboard open
const sendCommand = (command) => {
  window.ws.send(JSON.stringify({
    type: 'command:request',
    agentId: 'test-agent-001',
    command: command,
    args: ['--verbose'],
    priority: 'normal',
    timestamp: new Date().toISOString()
  }));
};

// Test command
sendCommand('npm test');
```

**Expected Flow:**
1. Dashboard sends `command:request`
2. Backend queues command
3. Backend sends `command:queued` to dashboard
4. Backend sends `command:execute` to agent
5. Agent sends `command:status` updates
6. Agent sends `terminal:output` streams
7. Agent sends `command:complete`

### Test 2.3: Terminal Output Streaming

**Simulate Terminal Output:**
```javascript
// Add to test-agent.js after receiving command:execute
const streamOutput = (commandId) => {
  const outputs = [
    'Starting tests...',
    '  ✓ Test 1 passed',
    '  ✓ Test 2 passed',
    '  ✗ Test 3 failed',
    'Tests complete: 2 passed, 1 failed'
  ];

  outputs.forEach((line, index) => {
    setTimeout(() => {
      ws.send(JSON.stringify({
        type: 'terminal:output',
        agentId: 'test-agent-001',
        commandId: commandId,
        output: {
          type: index === 3 ? 'stderr' : 'stdout',
          content: line + '\n',
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      }));
    }, index * 500);
  });
};
```

**Verify:**
- Terminal component shows output in real-time
- Colors are correct (red for stderr, white for stdout)
- No lag or buffering issues

## Part 3: Reliability Testing

### Test 3.1: Reconnection with Exponential Backoff

**Test Script:**
```bash
# Kill backend while dashboard is connected
# The dashboard should attempt reconnection

# Watch browser console for:
# - "Attempting reconnection in 1000ms"
# - "Attempting reconnection in 2000ms"
# - "Attempting reconnection in 4000ms"

# Restart backend
cd backend && npm run dev

# Dashboard should automatically reconnect
```

### Test 3.2: Message Queuing During Disconnect

```javascript
// In browser console
// 1. Send messages while disconnected
for(let i = 0; i < 5; i++) {
  sendCommand(`test-${i}`);
}

// 2. Messages should be queued (check Network tab)
// 3. When reconnected, queued messages should be sent
```

### Test 3.3: Token Refresh

**Test Expired Token:**
```javascript
// Simulate token expiration
setTimeout(() => {
  // Backend should send auth:refresh-needed
  // Frontend should respond with auth:refresh-token
  // Connection should remain open
}, 30000);
```

## Part 4: Performance Testing

### Test 4.1: High-Volume Terminal Output

```javascript
// Generate massive output
const stressTest = () => {
  for(let i = 0; i < 1000; i++) {
    ws.send(JSON.stringify({
      type: 'terminal:output',
      agentId: 'test-agent-001',
      output: {
        type: 'stdout',
        content: `Line ${i}: ${Array(100).fill('x').join('')}\n`,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    }));
  }
};

// Should see:
// - Output is debounced (not 1000 individual renders)
// - UI remains responsive
// - Memory usage stable
```

### Test 4.2: Multiple Dashboard Connections

```bash
# Open 5+ browser tabs with dashboard
# All should receive updates simultaneously
# Check backend logs for connection count

# In backend logs:
curl http://localhost:3001/metrics | grep websocket_connections
```

### Test 4.3: Rate Limiting

```javascript
// Send rapid messages
for(let i = 0; i < 200; i++) {
  ws.send(JSON.stringify({
    type: 'heartbeat:ping',
    timestamp: new Date().toISOString()
  }));
}

// Should receive rate limit error after ~100 messages/minute
// Expected: {"type":"connection:error","error":"Rate limit exceeded","code":"RATE_LIMIT"}
```

## Part 5: Error Handling Testing

### Test 5.1: Invalid Message Format

```javascript
// Send malformed JSON
ws.send('not valid json');
// Expected: validation:error

// Send wrong message type
ws.send(JSON.stringify({
  type: 'invalid:type',
  timestamp: new Date().toISOString()
}));
// Expected: "Unknown message type"
```

### Test 5.2: Network Interruption

```bash
# Use browser DevTools
# 1. Open Network tab
# 2. Set to "Offline"
# 3. Should see reconnection attempts
# 4. Set back to "Online"
# 5. Should reconnect automatically
```

### Test 5.3: Emergency Stop

```javascript
// Send emergency stop
ws.send(JSON.stringify({
  type: 'system:emergency-stop',
  reason: 'User initiated',
  timestamp: new Date().toISOString()
}));

// All running commands should be interrupted
// All agents should receive stop signal
```

## Part 6: Integration Testing

### Test 6.1: Full E2E Workflow

1. **Start all services**
2. **Open dashboard** at http://localhost:3000
3. **Connect agent** (use test-agent.js)
4. **Execute command** from UI
5. **Watch terminal output** stream
6. **Interrupt command** with Ctrl+C button
7. **Check audit logs** for all events

### Test 6.2: Load Testing

```bash
# Install artillery for load testing
npm install -g artillery

# Create load test file
cat > loadtest.yml << 'EOF'
config:
  target: "ws://localhost:3001"
  phases:
    - duration: 60
      arrivalRate: 10
  ws:
    headers:
      Authorization: "Bearer YOUR_TOKEN"

scenarios:
  - name: "Dashboard Connection Load Test"
    engine: ws
    flow:
      - send: '{"type":"dashboard:connect","dashboardId":"load-test","timestamp":"2024-01-01T00:00:00Z"}'
      - think: 1
      - send: '{"type":"heartbeat:ping","timestamp":"2024-01-01T00:00:00Z"}'
      - think: 30
EOF

# Run load test
artillery run loadtest.yml
```

## Part 7: Browser Testing

### Test 7.1: Cross-Browser Compatibility

Test in multiple browsers:
- Chrome/Edge
- Firefox
- Safari
- Mobile browsers

Check for:
- WebSocket connection works
- UI updates properly
- No console errors
- Performance is acceptable

### Test 7.2: Browser DevTools Testing

```javascript
// In Chrome DevTools Console

// Check WebSocket frames
// Network tab → WS → Click connection → Messages tab

// Monitor memory
performance.memory

// Check for memory leaks
// Take heap snapshot before/after heavy usage

// Profile performance
console.profile('websocket-test');
// ... perform actions ...
console.profileEnd('websocket-test');
```

## Validation Checklist

### Core Functionality
- [ ] WebSocket connects successfully
- [ ] Authentication with JWT works
- [ ] Dashboard receives agent list
- [ ] Agent status updates in real-time
- [ ] Commands execute properly
- [ ] Terminal output streams correctly
- [ ] Heartbeat ping/pong works

### Reliability
- [ ] Reconnection with exponential backoff
- [ ] Message queuing during disconnect
- [ ] Token refresh without disconnection
- [ ] Connection state accurately reflected
- [ ] No message loss during reconnection

### Performance
- [ ] <200ms terminal output latency
- [ ] Handles 100+ messages/second
- [ ] Supports 10+ concurrent connections
- [ ] Message batching works
- [ ] Compression for large payloads
- [ ] Debouncing prevents UI freezing

### Error Handling
- [ ] Invalid messages handled gracefully
- [ ] Rate limiting enforced
- [ ] Network errors recovered from
- [ ] Emergency stop works
- [ ] Timeout handling correct

### Security
- [ ] Unauthorized connections rejected
- [ ] Token validation working
- [ ] Rate limits prevent abuse
- [ ] No sensitive data in logs
- [ ] CORS properly configured

## Debugging Tips

### Enable Debug Logging

```javascript
// Frontend - in browser console
localStorage.setItem('DEBUG', 'websocket:*');

// Backend - in environment
DEBUG=websocket:* npm run dev
```

### Monitor WebSocket Frames

Chrome DevTools:
1. Open Network tab
2. Filter by "WS"
3. Click on WebSocket connection
4. Go to "Messages" tab
5. Green = sent, White = received

### Check Connection State

```javascript
// In browser console
console.log(window.wsService?.getConnectionState());
console.log(window.wsService?.isConnected());
```

### View Metrics

```bash
# Backend metrics endpoint
curl http://localhost:3001/metrics

# Check specific metrics
curl http://localhost:3001/metrics | grep -E "(websocket|message|connection)"
```

## Common Issues and Solutions

### Issue: Connection Immediately Closes
- Check JWT token is valid
- Verify CORS settings
- Check backend logs for auth errors

### Issue: Messages Not Received
- Verify message type is correct
- Check message handler registration
- Look for rate limiting

### Issue: High Memory Usage
- Check terminal buffer size
- Verify message cleanup
- Look for memory leaks in browser

### Issue: Reconnection Loop
- Check token expiration
- Verify backend health
- Review rate limit settings

## Automated Test Execution

Run all automated tests:

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# E2E tests
npm run test:e2e

# Integration tests
npm run test:integration

# Load tests
npm run test:load
```

## Success Criteria

The WebSocket implementation is working correctly when:

1. **Real-time Updates**: Changes appear instantly across all connected clients
2. **Reliability**: System recovers from network interruptions automatically
3. **Performance**: UI remains responsive under load
4. **Security**: Only authenticated connections are allowed
5. **User Experience**: No visible lag or connection issues

## Support

If you encounter issues:
1. Check the logs (both frontend console and backend)
2. Verify all services are running
3. Ensure environment variables are set correctly
4. Check network connectivity
5. Review the WebSocket API documentation in `/docs/websocket-api.md`