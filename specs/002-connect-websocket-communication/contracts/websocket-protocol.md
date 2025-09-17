# WebSocket Protocol Specification

## Overview
This document defines the WebSocket protocol for real-time communication between the Onsembl.ai dashboard and backend server.

## Connection Establishment

### Endpoint
```
ws://localhost:3001/ws/dashboard
wss://api.onsembl.ai/ws/dashboard (production)
```

### Authentication
Include JWT token in connection URL:
```
ws://localhost:3001/ws/dashboard?token=<JWT_TOKEN>
```

### Handshake Flow
1. Client initiates WebSocket connection with token
2. Server validates JWT token
3. Server upgrades HTTP connection to WebSocket
4. Server sends `connection:ack` message
5. Server sends current `agent:list`
6. Client is now connected and subscribed to updates

## Message Format

All messages follow this structure:
```typescript
{
  "version": "1.0.0",
  "type": "<message-type>",
  "timestamp": 1234567890000,
  "payload": { ... }
}
```

## Message Types

### Client → Server

| Type | Purpose | Required Fields |
|------|---------|----------------|
| `dashboard:connect` | Initial connection | token, clientInfo |
| `command:request` | Execute command on agent | agentId, command, priority |
| `command:interrupt` | Stop running command | commandId |
| `heartbeat` | Keep connection alive | sequence |

### Server → Client

| Type | Purpose | Trigger |
|------|---------|---------|
| `connection:ack` | Confirm connection | On successful connect |
| `agent:list` | All connected agents | On connect, changes |
| `agent:status` | Agent status change | Agent connects/disconnects |
| `terminal:output` | Command output stream | During command execution |
| `command:status` | Command state change | Status transitions |
| `command:queue` | Queue updates | Queue changes |
| `error` | Error notification | On errors |

## Connection Lifecycle

### Connection States
```
CONNECTING → CONNECTED → DISCONNECTED
         ↓           ↑
      RECONNECTING ←─┘
```

### Reconnection Strategy
- Immediate retry on disconnect
- Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
- Add ±20% jitter to prevent thundering herd
- After 5 failures, show manual reconnect option

### Heartbeat/Keep-Alive
- Client sends heartbeat every 30 seconds
- Server responds with heartbeat echo
- Connection considered dead after 60 seconds without heartbeat

## Command Execution Flow

1. **Client sends `command:request`**
   ```json
   {
     "type": "command:request",
     "payload": {
       "agentId": "agent-123",
       "command": "npm test",
       "priority": "normal"
     }
   }
   ```

2. **Server responds with `command:status` (queued)**
   ```json
   {
     "type": "command:status",
     "payload": {
       "commandId": "cmd-456",
       "status": "queued"
     }
   }
   ```

3. **When execution starts, `command:status` (running)**

4. **During execution, stream `terminal:output`**
   ```json
   {
     "type": "terminal:output",
     "payload": {
       "commandId": "cmd-456",
       "data": "Running tests...\n",
       "stream": "stdout",
       "sequence": 1
     }
   }
   ```

5. **On completion, `command:status` (completed/failed)**

## Broadcasting Rules

### Agent Status Changes
- Broadcast to ALL connected dashboards
- Include full agent information
- Send within 100ms of status change

### Terminal Output
- Stream to ALL connected dashboards
- Batch output every 50ms to reduce messages
- Compress if payload >10KB

### Command Queue Updates
- Send to dashboards when queue changes
- Include position for each queued command

## Error Handling

### Error Codes
| Code | Description | Recoverable |
|------|-------------|-------------|
| `AUTH_FAILED` | Invalid or expired token | No |
| `AGENT_OFFLINE` | Target agent not connected | Yes |
| `COMMAND_TIMEOUT` | Command exceeded timeout | Yes |
| `QUEUE_FULL` | Command queue at capacity | Yes |
| `INVALID_MESSAGE` | Malformed message | Yes |
| `RATE_LIMIT` | Too many requests | Yes |

### Error Response Format
```json
{
  "type": "error",
  "payload": {
    "code": "AGENT_OFFLINE",
    "message": "Agent agent-123 is not connected",
    "recoverable": true
  }
}
```

## Performance Considerations

### Message Size Limits
- Maximum message size: 1MB
- Terminal output chunked at 10KB
- Compression for payloads >10KB

### Rate Limiting
- Max 100 messages/second per connection
- Command requests: max 10/minute
- Heartbeat: exactly 1 per 30 seconds

### Buffering
- Terminal output buffered for 50ms before sending
- Maximum buffer size: 100KB
- Overflow strategy: drop oldest chunks

## Security

### Authentication
- JWT token required for connection
- Token validated on each reconnection
- Token refresh handled via protocol message

### Authorization
- Single-tenant MVP: all authenticated users see all agents
- Future: role-based agent access control

### Input Validation
- All messages validated against schema
- Command input sanitized before execution
- Size limits enforced on all fields

## Version Compatibility

### Version Negotiation
- Client sends version in every message
- Server supports version 1.0.0
- Future versions will be backward compatible

### Upgrade Path
- New fields added as optional
- Deprecated fields marked but maintained
- Major version change requires new endpoint

## Example Session

```
→ Client connects with JWT token
← connection:ack { connectionId: "conn-123" }
← agent:list { agents: [...] }
→ command:request { agentId: "agent-1", command: "ls -la" }
← command:status { commandId: "cmd-1", status: "queued" }
← command:status { commandId: "cmd-1", status: "running" }
← terminal:output { commandId: "cmd-1", data: "total 24\n" }
← terminal:output { commandId: "cmd-1", data: "drwxr-xr-x  5 user staff   160 Jan  1 12:00 .\n" }
← command:status { commandId: "cmd-1", status: "completed", exitCode: 0 }
→ heartbeat { sequence: 1 }
← heartbeat { sequence: 1 }
```