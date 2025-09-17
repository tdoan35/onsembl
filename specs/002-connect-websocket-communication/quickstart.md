# Quick Start: WebSocket Communication

This guide demonstrates setting up and testing the WebSocket communication between the dashboard and backend.

## Prerequisites

- Backend server running on port 3001
- Frontend dashboard running on port 3000
- At least one AI agent connected to the backend
- Valid JWT token for authentication

## 1. Start the Services

```bash
# Terminal 1: Start backend server
cd backend
npm run dev

# Terminal 2: Start frontend dashboard
cd frontend
npm run dev

# Terminal 3: Start an agent (example with Claude)
cd agent-wrapper
npm run claude -- --server ws://localhost:3001
```

## 2. Test WebSocket Connection

### Manual Testing with wscat

```bash
# Install wscat if needed
npm install -g wscat

# Connect to WebSocket endpoint with token
wscat -c "ws://localhost:3001/ws/dashboard?token=YOUR_JWT_TOKEN"

# You should see connection acknowledgment:
< {"version":"1.0.0","type":"connection:ack","timestamp":1234567890000,"payload":{"connectionId":"conn-123","serverVersion":"1.0.0"}}

# And agent list:
< {"version":"1.0.0","type":"agent:list","timestamp":1234567890001,"payload":{"agents":[...]}}
```

### Testing from Dashboard

1. Open http://localhost:3000 in your browser
2. Log in with your credentials
3. The dashboard should automatically connect via WebSocket
4. You should see:
   - Green connection indicator
   - List of connected agents
   - Real-time status updates

## 3. Test Agent Status Updates

When an agent connects or disconnects:

```javascript
// Expected broadcast to all dashboards
{
  "type": "agent:status",
  "payload": {
    "agentId": "agent-claude-1",
    "agentType": "claude",
    "status": "online" // or "offline"
  }
}
```

**To test:**
1. Start/stop an agent wrapper
2. Observe immediate update in dashboard
3. Check multiple dashboard tabs update simultaneously

## 4. Test Command Execution

### Send a command from dashboard:

1. Select an online agent from the list
2. Enter a command (e.g., `echo "Hello WebSocket"`)
3. Click Execute or press Enter

### Expected message flow:

```javascript
// 1. Dashboard sends
{
  "type": "command:request",
  "payload": {
    "agentId": "agent-claude-1",
    "command": "echo 'Hello WebSocket'",
    "priority": "normal"
  }
}

// 2. Server responds with queued status
{
  "type": "command:status",
  "payload": {
    "commandId": "cmd-abc123",
    "status": "queued"
  }
}

// 3. When execution starts
{
  "type": "command:status",
  "payload": {
    "commandId": "cmd-abc123",
    "status": "running"
  }
}

// 4. Terminal output streams
{
  "type": "terminal:output",
  "payload": {
    "commandId": "cmd-abc123",
    "data": "Hello WebSocket\n",
    "stream": "stdout",
    "sequence": 1
  }
}

// 5. Completion status
{
  "type": "command:status",
  "payload": {
    "commandId": "cmd-abc123",
    "status": "completed",
    "exitCode": 0
  }
}
```

## 5. Test Terminal Output Streaming

Run a command with continuous output:

```bash
# From dashboard, execute on an agent:
for i in {1..10}; do echo "Line $i"; sleep 1; done
```

**Expected behavior:**
- Output appears line-by-line in terminal view
- No more than 50ms delay between output and display
- Color codes preserved if present
- Multiple dashboards show same output

## 6. Test Multi-Dashboard Synchronization

1. Open dashboard in multiple browser tabs/windows
2. From one tab, execute a command
3. **All tabs should show:**
   - Same command execution status
   - Synchronized terminal output
   - Identical agent status updates

## 7. Test Reconnection

Simulate connection loss:

```bash
# Option 1: Kill backend server temporarily
# Option 2: Disconnect network briefly
# Option 3: Use browser DevTools to go offline
```

**Expected behavior:**
1. Dashboard shows disconnected state
2. Automatic reconnection attempts
3. On reconnection:
   - Connection restored message
   - Current agent list received
   - Can resume sending commands

## 8. Test Command Interruption

Start a long-running command and interrupt it:

```bash
# Execute from dashboard:
sleep 300

# Click "Stop" button or send interrupt
```

**Expected message:**
```javascript
{
  "type": "command:interrupt",
  "payload": {
    "commandId": "cmd-xyz789",
    "reason": "User requested"
  }
}
```

**Result:** Command should stop, status changes to "interrupted"

## 9. Performance Testing

### Test high-throughput output:

```bash
# Execute command that generates lots of output
find / -type f 2>/dev/null | head -1000
```

**Verify:**
- Dashboard remains responsive
- Output buffered appropriately
- No message drops
- Memory usage stable

### Test concurrent connections:

```bash
# Open 10+ dashboard tabs
# Verify all receive updates
# Check server metrics
```

## 10. Error Scenarios

### Test invalid agent ID:

```javascript
// Send command to non-existent agent
{
  "type": "command:request",
  "payload": {
    "agentId": "invalid-agent",
    "command": "ls"
  }
}

// Should receive error
{
  "type": "error",
  "payload": {
    "code": "AGENT_OFFLINE",
    "message": "Agent invalid-agent is not connected"
  }
}
```

### Test malformed messages:

```javascript
// Send invalid message
{ "invalid": "message" }

// Should receive error response
```

## Troubleshooting

### Connection fails
- Check JWT token is valid
- Verify backend is running on port 3001
- Check browser console for errors
- Verify WebSocket upgrade headers

### No agent updates
- Ensure agents are connected to backend
- Check backend logs for broadcast messages
- Verify dashboard subscribed to updates

### Terminal output missing
- Check command actually produces output
- Verify message sequence numbers
- Look for compression flags on large outputs

### Performance issues
- Monitor WebSocket message rate
- Check for message buffering
- Verify batch settings (50ms)
- Review browser memory usage

## Integration Test Script

Run this script to validate full integration:

```javascript
// test-websocket-integration.js
const WebSocket = require('ws')
const assert = require('assert')

async function testWebSocketIntegration() {
  const ws = new WebSocket('ws://localhost:3001/ws/dashboard?token=TEST_TOKEN')

  return new Promise((resolve, reject) => {
    let messageCount = 0

    ws.on('open', () => {
      console.log('✓ Connected to WebSocket')
    })

    ws.on('message', (data) => {
      const msg = JSON.parse(data)
      messageCount++

      if (msg.type === 'connection:ack') {
        console.log('✓ Received connection acknowledgment')
        assert(msg.payload.connectionId, 'Missing connection ID')
      }

      if (msg.type === 'agent:list') {
        console.log(`✓ Received agent list (${msg.payload.agents.length} agents)`)

        // If agents available, test command
        if (msg.payload.agents.length > 0) {
          const agent = msg.payload.agents[0]
          ws.send(JSON.stringify({
            version: '1.0.0',
            type: 'command:request',
            timestamp: Date.now(),
            payload: {
              agentId: agent.agentId,
              command: 'echo "Integration test"',
              priority: 'normal'
            }
          }))
        }
      }

      if (msg.type === 'command:status' && msg.payload.status === 'completed') {
        console.log('✓ Command executed successfully')
        ws.close()
        resolve()
      }
    })

    ws.on('error', reject)

    setTimeout(() => {
      reject(new Error('Test timeout'))
    }, 10000)
  })
}

// Run test
testWebSocketIntegration()
  .then(() => console.log('✅ All tests passed'))
  .catch(err => console.error('❌ Test failed:', err))
```

## Summary

This quickstart covers the essential WebSocket communication features:
- ✅ Connection establishment with authentication
- ✅ Real-time agent status monitoring
- ✅ Command execution and queueing
- ✅ Terminal output streaming
- ✅ Multi-dashboard synchronization
- ✅ Automatic reconnection
- ✅ Error handling

The WebSocket implementation enables real-time, bidirectional communication required for the Onsembl.ai Agent Control Center.