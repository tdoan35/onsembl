# WebSocket API Documentation

## Overview

The Onsembl.ai WebSocket API provides real-time bidirectional communication between the dashboard and the agent control server. It enables live command execution, terminal output streaming, and agent status monitoring.

## Connection

### Endpoint
```
ws://localhost:3001/ws
wss://api.onsembl.ai/ws (production)
```

### Authentication
Include JWT token in connection headers:
```javascript
const ws = new WebSocket('ws://localhost:3001/ws', {
  headers: {
    'Authorization': 'Bearer <JWT_TOKEN>'
  }
});
```

Alternative methods:
- Query parameter: `?token=<JWT_TOKEN>`
- Cookie: `token=<JWT_TOKEN>`

### Connection Lifecycle

1. **Handshake**: Client connects with authentication
2. **Identification**: Client sends `dashboard:connect` or `agent:connect`
3. **Active**: Bidirectional message exchange
4. **Heartbeat**: Periodic ping/pong to maintain connection
5. **Termination**: Graceful disconnect or timeout

## Message Format

All messages follow this structure:
```typescript
{
  type: string;       // Message type (namespace:action)
  timestamp: string;  // ISO 8601 timestamp
  [key: string]: any; // Additional payload fields
}
```

## Message Types

### Dashboard Messages

#### dashboard:connect
Identifies connection as dashboard client.
```json
{
  "type": "dashboard:connect",
  "dashboardId": "dash-123",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**Response**: `agent:list` with current agents

#### dashboard:disconnect
Graceful disconnect notification.
```json
{
  "type": "dashboard:disconnect",
  "dashboardId": "dash-123",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Agent Messages

#### agent:connect
Identifies connection as agent client.
```json
{
  "type": "agent:connect",
  "agentId": "agent-123",
  "agentType": "claude",
  "version": "1.0.0",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### agent:disconnect
Agent disconnection notification.
```json
{
  "type": "agent:disconnect",
  "agentId": "agent-123",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### agent:status
Agent status update broadcast.
```json
{
  "type": "agent:status",
  "agentId": "agent-123",
  "status": "online|busy|error|offline",
  "metrics": {
    "cpuUsage": 45.2,
    "memoryUsage": 67.8,
    "activeCommands": 2
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### agent:list
List of all connected agents.
```json
{
  "type": "agent:list",
  "agents": [
    {
      "agentId": "agent-123",
      "agentType": "claude",
      "status": "online",
      "connectedAt": "2024-01-01T11:00:00Z"
    }
  ],
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Command Messages

#### command:request
Request command execution on agent.
```json
{
  "type": "command:request",
  "agentId": "agent-123",
  "command": "npm test",
  "args": ["--coverage"],
  "priority": "high|normal|low",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**Response**: `command:queued` or `command:error`

#### command:queued
Command added to execution queue.
```json
{
  "type": "command:queued",
  "commandId": "cmd-456",
  "agentId": "agent-123",
  "position": 1,
  "estimatedWait": 5000,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### command:execute
Sent to agent to execute command.
```json
{
  "type": "command:execute",
  "commandId": "cmd-456",
  "command": "npm test",
  "args": ["--coverage"],
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### command:status
Command execution status update.
```json
{
  "type": "command:status",
  "commandId": "cmd-456",
  "agentId": "agent-123",
  "status": "queued|running|completed|failed|interrupted",
  "exitCode": 0,
  "duration": 1234,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### command:interrupt
Request to interrupt running command.
```json
{
  "type": "command:interrupt",
  "commandId": "cmd-456",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### command:complete
Command execution completed.
```json
{
  "type": "command:complete",
  "commandId": "cmd-456",
  "agentId": "agent-123",
  "exitCode": 0,
  "duration": 1234,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Terminal Messages

#### terminal:output
Terminal output stream from agent.
```json
{
  "type": "terminal:output",
  "agentId": "agent-123",
  "commandId": "cmd-456",
  "output": {
    "type": "stdout|stderr|system|command",
    "content": "Test passed\n",
    "timestamp": "2024-01-01T12:00:00Z"
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### terminal:clear
Clear terminal output buffer.
```json
{
  "type": "terminal:clear",
  "agentId": "agent-123",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### System Messages

#### heartbeat:ping
Keep-alive ping message.
```json
{
  "type": "heartbeat:ping",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### heartbeat:pong
Keep-alive pong response.
```json
{
  "type": "heartbeat:pong",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### system:emergency-stop
Emergency stop all operations.
```json
{
  "type": "system:emergency-stop",
  "reason": "User initiated",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Authentication Messages

#### auth:refresh-needed
Token refresh required notification.
```json
{
  "type": "auth:refresh-needed",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### auth:refresh-token
Provide new token for refresh.
```json
{
  "type": "auth:refresh-token",
  "token": "new-jwt-token",
  "refreshToken": "refresh-token",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### auth:refresh-success
Token refresh successful.
```json
{
  "type": "auth:refresh-success",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### auth:refresh-failed
Token refresh failed.
```json
{
  "type": "auth:refresh-failed",
  "error": "Invalid refresh token",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Error Messages

#### connection:error
Connection-level error.
```json
{
  "type": "connection:error",
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT",
  "retryAfter": 60,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### validation:error
Message validation error.
```json
{
  "type": "validation:error",
  "error": "Invalid message format",
  "field": "agentId",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Special Message Types

### Batched Messages
Multiple messages sent as batch for efficiency.
```json
{
  "type": "batch",
  "messages": [
    { "type": "terminal:output", "..." },
    { "type": "terminal:output", "..." }
  ],
  "count": 2,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Compressed Messages
Large payloads compressed for efficiency.
```json
{
  "type": "compressed",
  "algorithm": "gzip",
  "originalType": "terminal:output",
  "originalSize": 10240,
  "compressedSize": 1024,
  "data": "base64-encoded-compressed-data",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Rate Limiting

### Limits
- **Global**: 10,000 messages/minute, 100,000 messages/hour
- **Per Connection**: 100 messages/minute, 1,000 messages/hour
- **Burst**: 10 messages/second

### Message Type Limits
- `command:request`: 10/minute, 100/hour
- `terminal:output`: 1,000/minute, 10,000/hour
- `heartbeat:ping`: 60/minute

### Rate Limit Response
```json
{
  "type": "connection:error",
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT",
  "retryAfter": 60,
  "limits": {
    "perMinute": { "used": 100, "limit": 100 },
    "perHour": { "used": 500, "limit": 1000 }
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Error Codes

| Code | Description | Action |
|------|-------------|--------|
| 1000 | Normal closure | Reconnect if needed |
| 1001 | Going away | Reconnect after delay |
| 1002 | Protocol error | Check message format |
| 1003 | Unsupported data | Check payload type |
| 1007 | Invalid payload | Validate message |
| 1008 | Policy violation | Check authentication |
| 1009 | Message too large | Reduce payload size |
| 1010 | Extension error | Contact support |
| 1011 | Unexpected error | Retry with backoff |

## Connection States

```
┌─────────────┐
│Disconnected │
└──────┬──────┘
       │ connect()
┌──────▼──────┐
│ Connecting  │
└──────┬──────┘
       │ onopen
┌──────▼──────┐     error/close
│  Connected  ├───────────────┐
└──────┬──────┘               │
       │ close()              │
┌──────▼──────┐               │
│Disconnecting│               │
└──────┬──────┘               │
       │                      │
┌──────▼──────────────────────▼┐
│         Reconnecting          │
└───────────────┬───────────────┘
                │ retry
                └──────────┐
                          ▲│
                          └┘
```

## Best Practices

### Client Implementation
1. **Implement exponential backoff** for reconnection
2. **Handle token refresh** without disconnecting
3. **Buffer messages** during reconnection
4. **Validate messages** before sending
5. **Implement heartbeat** to detect stale connections

### Message Handling
1. **Use message queuing** for reliability
2. **Implement idempotency** for critical operations
3. **Add request IDs** for correlation
4. **Handle out-of-order** messages gracefully
5. **Implement timeout** for request-response patterns

### Performance
1. **Batch terminal output** for efficiency
2. **Compress large payloads** (>1KB)
3. **Debounce rapid updates** (50-200ms)
4. **Use binary frames** for file transfers
5. **Implement message priorities**

### Security
1. **Validate all inputs** on both ends
2. **Implement rate limiting** per client
3. **Use TLS (wss://)** in production
4. **Rotate tokens** regularly
5. **Log security events** for audit

## Example Client Implementation

```javascript
class OnsemblWebSocket {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.ws = null;
    this.messageHandlers = new Map();
    this.reconnectAttempts = 0;
  }

  connect() {
    this.ws = new WebSocket(this.url, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });

    this.ws.onopen = () => {
      console.log('Connected');
      this.reconnectAttempts = 0;
      this.identify();
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.reconnect();
    };
  }

  identify() {
    this.send({
      type: 'dashboard:connect',
      dashboardId: 'dashboard-' + Date.now(),
      timestamp: new Date().toISOString()
    });
  }

  send(message) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  handleMessage(message) {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message);
    }
  }

  on(type, handler) {
    this.messageHandlers.set(type, handler);
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.send({
        type: 'heartbeat:ping',
        timestamp: new Date().toISOString()
      });
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  reconnect() {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    setTimeout(() => {
      console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);
      this.connect();
    }, delay);
  }
}

// Usage
const client = new OnsemblWebSocket('ws://localhost:3001/ws', 'jwt-token');

client.on('agent:status', (message) => {
  console.log('Agent status:', message);
});

client.on('terminal:output', (message) => {
  console.log('Terminal:', message.output.content);
});

client.connect();
```

## Testing

### Connection Testing
```bash
# Test connection with wscat
wscat -c ws://localhost:3001/ws -H "Authorization: Bearer <token>"

# Send test message
> {"type":"dashboard:connect","dashboardId":"test","timestamp":"2024-01-01T12:00:00Z"}
```

### Load Testing
```javascript
// Load test with multiple connections
const connections = [];
for (let i = 0; i < 100; i++) {
  const ws = new WebSocket('ws://localhost:3001/ws', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  connections.push(ws);
}
```

## Troubleshooting

### Common Issues

1. **Connection immediately closes**
   - Check authentication token
   - Verify WebSocket endpoint
   - Check CORS settings

2. **Messages not received**
   - Verify message format
   - Check rate limits
   - Confirm subscription

3. **High latency**
   - Enable compression
   - Implement batching
   - Check network conditions

4. **Connection drops**
   - Implement heartbeat
   - Check proxy timeout
   - Verify token expiry

## Version History

- **v1.0.0** - Initial WebSocket implementation
- **v1.1.0** - Added compression support
- **v1.2.0** - Implemented message batching
- **v1.3.0** - Added token refresh mechanism
- **v1.4.0** - Enhanced rate limiting