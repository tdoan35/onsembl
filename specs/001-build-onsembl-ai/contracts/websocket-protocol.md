# WebSocket Protocol Specification

**Version**: 0.1.0
**Date**: 2025-01-15

## Overview
This document defines the WebSocket protocol for real-time communication between the Onsembl.ai Control Center and connected agents.

## Connection Endpoints

### Agent WebSocket
**URL**: `wss://api.onsembl.ai/v1/ws/agent/{agentId}`
**Authentication**: JWT token in `Authorization` header or `token` query parameter

### Dashboard WebSocket
**URL**: `wss://api.onsembl.ai/v1/ws/dashboard`
**Authentication**: JWT token from authenticated session

## Message Format

All messages follow a consistent JSON structure:

```typescript
interface WebSocketMessage {
  type: MessageType;
  id: string;           // UUID for message tracking
  timestamp: number;    // Unix timestamp in milliseconds
  payload: any;         // Message-specific payload
}
```

## Message Types

### Agent → Server Messages

#### 1. Agent Connect
```typescript
{
  type: "AGENT_CONNECT",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    agentId: "uuid",
    agentType: "CLAUDE" | "GEMINI" | "CODEX",
    version: "1.0.0",
    hostMachine: "hostname",
    capabilities: {
      maxTokens: 100000,
      supportsInterrupt: true,
      supportsTrace: true
    }
  }
}
```

#### 2. Agent Heartbeat
```typescript
{
  type: "AGENT_HEARTBEAT",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    agentId: "uuid",
    healthMetrics: {
      cpuUsage: 45.2,
      memoryUsage: 512,
      uptime: 3600,
      commandsProcessed: 10,
      averageResponseTime: 250
    }
  }
}
```

#### 3. Command Acknowledgment
```typescript
{
  type: "COMMAND_ACK",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    commandId: "uuid",
    agentId: "uuid",
    status: "RECEIVED" | "QUEUED" | "EXECUTING"
  }
}
```

#### 4. Terminal Output
```typescript
{
  type: "TERMINAL_OUTPUT",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    commandId: "uuid",
    agentId: "uuid",
    streamType: "STDOUT" | "STDERR",
    content: "Output text...",
    ansiCodes: true,
    sequence: 1
  }
}
```

#### 5. Trace Event
```typescript
{
  type: "TRACE_EVENT",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    commandId: "uuid",
    agentId: "uuid",
    traceId: "uuid",
    parentId: "uuid" | null,
    type: "LLM_PROMPT" | "TOOL_CALL" | "RESPONSE",
    name: "GPT-4 Call",
    content: {
      // Type-specific content
    },
    startedAt: 1234567890,
    completedAt: 1234567891,
    durationMs: 1000,
    tokensUsed: 150
  }
}
```

#### 6. Command Complete
```typescript
{
  type: "COMMAND_COMPLETE",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    commandId: "uuid",
    agentId: "uuid",
    status: "COMPLETED" | "FAILED" | "CANCELLED",
    error: "Error message if failed",
    executionTime: 5000,
    tokensUsed: 1500
  }
}
```

#### 7. Investigation Report
```typescript
{
  type: "INVESTIGATION_REPORT",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    commandId: "uuid",
    agentId: "uuid",
    reportId: "uuid",
    status: "DRAFT" | "IN_PROGRESS" | "COMPLETE",
    title: "Investigation Title",
    summary: "Executive summary...",
    content: {
      sections: [...],
      findings: [...],
      recommendations: [...]
    }
  }
}
```

#### 8. Agent Error
```typescript
{
  type: "AGENT_ERROR",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    agentId: "uuid",
    errorType: "CONNECTION" | "EXECUTION" | "RESOURCE" | "UNKNOWN",
    message: "Error description",
    recoverable: true,
    details: {}
  }
}
```

### Server → Agent Messages

#### 1. Command Request
```typescript
{
  type: "COMMAND_REQUEST",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    commandId: "uuid",
    content: "Command text",
    type: "NATURAL" | "INVESTIGATE" | "REVIEW" | "PLAN" | "SYNTHESIZE",
    priority: 50,
    executionConstraints: {
      timeLimitMs: 60000,
      tokenBudget: 10000
    }
  }
}
```

#### 2. Command Cancel
```typescript
{
  type: "COMMAND_CANCEL",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    commandId: "uuid",
    reason: "User requested cancellation"
  }
}
```

#### 3. Agent Control
```typescript
{
  type: "AGENT_CONTROL",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    action: "STOP" | "RESTART" | "PAUSE" | "RESUME",
    reason: "Emergency stop triggered"
  }
}
```

#### 4. Token Refresh
```typescript
{
  type: "TOKEN_REFRESH",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    accessToken: "new-jwt-token",
    expiresIn: 900
  }
}
```

#### 5. Server Heartbeat
```typescript
{
  type: "SERVER_HEARTBEAT",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    serverTime: 1234567890,
    nextPingExpected: 30000
  }
}
```

### Server → Dashboard Messages

#### 1. Agent Status Update
```typescript
{
  type: "AGENT_STATUS",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    agentId: "uuid",
    status: "ONLINE" | "OFFLINE" | "CONNECTING" | "ERROR",
    activityState: "IDLE" | "PROCESSING" | "QUEUED",
    healthMetrics: {...}
  }
}
```

#### 2. Command Status Update
```typescript
{
  type: "COMMAND_STATUS",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    commandId: "uuid",
    status: "PENDING" | "QUEUED" | "EXECUTING" | "COMPLETED" | "FAILED" | "CANCELLED",
    progress: {
      percent: 45,
      message: "Processing step 3 of 7"
    }
  }
}
```

#### 3. Terminal Stream
```typescript
{
  type: "TERMINAL_STREAM",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    commandId: "uuid",
    agentId: "uuid",
    agentName: "Claude-1",
    agentType: "CLAUDE",
    streamType: "STDOUT" | "STDERR",
    content: "Output text...",
    ansiCodes: true
  }
}
```

#### 4. Trace Update
```typescript
{
  type: "TRACE_UPDATE",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    commandId: "uuid",
    agentId: "uuid",
    traces: [
      // Array of trace entries with hierarchy
    ]
  }
}
```

## Connection Lifecycle

### Agent Connection Flow
1. Agent connects with JWT token
2. Server validates token and agent ID
3. Agent sends AGENT_CONNECT message
4. Server responds with SERVER_HEARTBEAT
5. Agent sends AGENT_HEARTBEAT every 30 seconds
6. Server monitors heartbeat, marks offline after 3 missed pings

### Dashboard Connection Flow
1. Dashboard connects with session JWT
2. Server validates user session
3. Server sends initial AGENT_STATUS for all agents
4. Server streams real-time updates for all events
5. Dashboard can subscribe/unsubscribe to specific agents

### Reconnection Strategy

#### Agent Reconnection
```
Initial retry: 1 second
Max retry delay: 30 seconds
Backoff factor: 2
Max retries for config errors: 5
Max retries for network errors: Infinite
```

#### Dashboard Reconnection
```
Initial retry: 500ms
Max retry delay: 5 seconds
Backoff factor: 1.5
Auto-reconnect: Always
```

## Error Handling

### Error Message Format
```typescript
{
  type: "ERROR",
  id: "uuid",
  timestamp: 1234567890,
  payload: {
    code: "ERROR_CODE",
    message: "Human-readable error message",
    details: {},
    recoverable: true
  }
}
```

### Error Codes
- `AUTH_FAILED`: Authentication/authorization failure
- `INVALID_MESSAGE`: Message validation failed
- `RATE_LIMIT`: Rate limit exceeded
- `RESOURCE_EXHAUSTED`: Resource limits reached
- `CONNECTION_ERROR`: Connection-related error
- `INTERNAL_ERROR`: Server internal error

## Rate Limiting

### Agent Connections
- Max messages per second: 100
- Max payload size: 1MB
- Max concurrent commands: 5

### Dashboard Connections
- Max messages per second: 50
- Max subscriptions: 20 agents
- Max payload size: 512KB

## Security Considerations

1. **TLS Required**: All WebSocket connections must use WSS
2. **Token Rotation**: Access tokens refresh every 15 minutes
3. **Origin Validation**: Server validates origin header
4. **Input Sanitization**: All message payloads are validated
5. **Rate Limiting**: Per-connection rate limits enforced
6. **Audit Logging**: All WebSocket events are logged

## Performance Requirements

1. **Latency**: <200ms for terminal output streaming
2. **Throughput**: Support 10+ concurrent agent connections
3. **Message Order**: Maintain sequence for terminal output
4. **Buffering**: Buffer up to 1000 messages during reconnection
5. **Compression**: Use per-message deflate for large payloads