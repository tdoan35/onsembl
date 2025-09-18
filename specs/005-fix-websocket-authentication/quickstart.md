# WebSocket Authentication Quickstart

## Overview
This guide demonstrates the WebSocket authentication implementation and verification steps.

## Prerequisites
- Backend server running on port 3000
- Valid JWT tokens (obtained from `/api/auth/login`)
- WebSocket client (wscat, Postman, or custom client)

## Step 1: Start the Backend Server
```bash
cd backend
npm run dev
```

## Step 2: Obtain Authentication Tokens
```bash
# Login to get tokens
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'

# Response:
# {
#   "accessToken": "eyJ...",
#   "refreshToken": "eyJ...",
#   "expiresIn": 3600
# }
```

## Step 3: Test Authenticated WebSocket Connection

### Valid Connection (Should Succeed)
```bash
# Connect with valid token
wscat -c ws://localhost:3000/ws/dashboard \
  -H "Authorization: Bearer eyJ..."

# Send dashboard init
> {"type":"DASHBOARD_INIT","data":{"token":"eyJ..."}}

# Expected response:
< {"type":"AUTH_SUCCESS","data":{"userId":"user123","connectionId":"conn456","expiresAt":"2024-01-01T01:00:00Z"}}

# Send authenticated command
> {"type":"COMMAND_REQUEST","id":"cmd789","data":{"agentId":"agent123","command":"ls -la"}}

# Should process normally
< {"type":"COMMAND_STATUS","data":{"commandId":"cmd789","status":"queued"}}
```

### Invalid Token (Should Fail)
```bash
# Connect with invalid token
wscat -c ws://localhost:3000/ws/dashboard

# Send init without token
> {"type":"DASHBOARD_INIT","data":{}}

# Expected response:
< {"type":"AUTH_ERROR","data":{"code":"INVALID_TOKEN","message":"Token required"}}
# Connection closes with code 1008
```

### Expired Token (Should Fail)
```bash
# Connect with expired token
wscat -c ws://localhost:3000/ws/dashboard

> {"type":"DASHBOARD_INIT","data":{"token":"eyJ...expired..."}}

# Expected response:
< {"type":"AUTH_ERROR","data":{"code":"EXPIRED_TOKEN","message":"Token has expired"}}
# Connection closes with code 4002
```

### Role Mismatch (Should Fail)
```bash
# Try to connect agent token to dashboard endpoint
wscat -c ws://localhost:3000/ws/dashboard

> {"type":"DASHBOARD_INIT","data":{"token":"eyJ...agent_token..."}}

# Expected response:
< {"type":"AUTH_ERROR","data":{"code":"INSUFFICIENT_PERMISSIONS","message":"Token type mismatch"}}
# Connection closes with code 4003
```

## Step 4: Test Rate Limiting

### Exceed Message Rate Limit
```javascript
// Send 101 messages in 1 minute
const ws = new WebSocket('ws://localhost:3000/ws/dashboard');
ws.on('open', () => {
  ws.send(JSON.stringify({type: 'DASHBOARD_INIT', data: {token}}));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'AUTH_SUCCESS') {
    // Send rapid messages
    for (let i = 0; i < 101; i++) {
      ws.send(JSON.stringify({
        type: 'COMMAND_REQUEST',
        id: `cmd${i}`,
        data: {agentId: 'agent123', command: 'echo test'}
      }));
    }
  }
});

// Expected: After 100th message
// < {"type":"RATE_LIMIT_EXCEEDED","data":{"limit":100,"window":60,"retryAfter":60}}
```

### Exceed Connection Limit
```javascript
// Create 11 connections for same user
const connections = [];
for (let i = 0; i < 11; i++) {
  const ws = new WebSocket('ws://localhost:3000/ws/dashboard');
  ws.on('open', () => {
    ws.send(JSON.stringify({type: 'DASHBOARD_INIT', data: {token}}));
  });
  connections.push(ws);
}

// 11th connection should receive:
// < {"type":"AUTH_ERROR","data":{"code":"CONNECTION_LIMIT_EXCEEDED","message":"Maximum 10 connections allowed"}}
// Connection closes with code 4005
```

## Step 5: Test Token Refresh

### In-Band Token Refresh
```javascript
const ws = new WebSocket('ws://localhost:3000/ws/dashboard');
let refreshToken = 'eyJ...refresh...';

ws.on('open', () => {
  ws.send(JSON.stringify({type: 'DASHBOARD_INIT', data: {token}}));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);

  if (msg.type === 'AUTH_SUCCESS') {
    // Set timer to refresh before expiry
    setTimeout(() => {
      ws.send(JSON.stringify({
        type: 'TOKEN_REFRESH',
        data: {refreshToken}
      }));
    }, 3500000); // Refresh 5 minutes before expiry
  }

  if (msg.type === 'TOKEN_REFRESH_SUCCESS') {
    console.log('Token refreshed:', msg.data.accessToken);
    // Update stored tokens
    refreshToken = msg.data.refreshToken || refreshToken;
  }
});

// Connection should continue without interruption
```

## Step 6: Verify Security Audit Logs

```bash
# Check authentication logs
curl http://localhost:3000/api/admin/audit-logs?type=AUTH_FAILURE

# Expected log entries:
# {
#   "eventId": "evt123",
#   "timestamp": "2024-01-01T00:00:00Z",
#   "eventType": "AUTH_FAILURE",
#   "details": {
#     "reason": "Invalid token",
#     "ipAddress": "127.0.0.1"
#   },
#   "severity": "warning"
# }
```

## Step 7: Performance Validation

### Measure Authentication Latency
```javascript
const start = Date.now();
const ws = new WebSocket('ws://localhost:3000/ws/dashboard');

ws.on('open', () => {
  ws.send(JSON.stringify({type: 'DASHBOARD_INIT', data: {token}}));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'AUTH_SUCCESS') {
    const latency = Date.now() - start;
    console.log(`Authentication latency: ${latency}ms`);
    // Should be < 200ms
  }
});
```

### Load Test with Multiple Agents
```bash
# Run load test script
npm run test:load-auth

# Expected output:
# ✓ 10 concurrent connections established
# ✓ 100 messages/second processed per agent
# ✓ Average latency: 85ms (< 200ms requirement)
# ✓ No authentication bypasses detected
# ✓ Rate limits properly enforced
```

## Troubleshooting

### Common Issues

1. **"Invalid token" error**
   - Verify token hasn't expired
   - Check token was issued by correct authority
   - Ensure token type matches endpoint (agent vs dashboard)

2. **"Rate limit exceeded" error**
   - Wait for retry period
   - Reduce message frequency
   - Check for message loops in client code

3. **"Connection limit exceeded" error**
   - Close unused connections
   - Check for connection leaks
   - Verify cleanup on disconnect

4. **Token refresh fails**
   - Ensure refresh token is valid
   - Check refresh token hasn't been revoked
   - Verify refresh happens before access token expires

## Security Checklist

- [ ] All WebSocket connections require authentication
- [ ] Expired tokens are rejected immediately
- [ ] Rate limits prevent message flooding
- [ ] Connection limits prevent resource exhaustion
- [ ] Authentication failures are logged
- [ ] Token refresh works without disconnection
- [ ] Role-based access is enforced
- [ ] Performance meets <200ms requirement

## Next Steps

1. Implement client-side token refresh logic
2. Add reconnection with exponential backoff
3. Monitor authentication metrics
4. Set up alerts for authentication anomalies
5. Review and update rate limit thresholds based on usage