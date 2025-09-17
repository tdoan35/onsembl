# Database WebSocket Events

## Server → Client Events

### database:status
Sent when database connection status changes.

```typescript
{
  type: 'database:status',
  payload: {
    mode: 'supabase' | 'local' | 'mock',
    status: 'connecting' | 'connected' | 'disconnected' | 'error',
    timestamp: string, // ISO 8601
    message?: string // Human-readable status message
  }
}
```

### database:error
Sent when database operation fails.

```typescript
{
  type: 'database:error',
  payload: {
    operation: string, // Operation that failed
    error: string, // Error code
    message: string, // Human-readable error message
    recoverable: boolean, // Whether operation can be retried
    timestamp: string // ISO 8601
  }
}
```

### database:health
Periodic health check results.

```typescript
{
  type: 'database:health',
  payload: {
    healthy: boolean,
    latency: number, // milliseconds
    mode: 'supabase' | 'local' | 'mock',
    timestamp: string // ISO 8601
  }
}
```

## Client → Server Events

### database:health:request
Request immediate health check.

```typescript
{
  type: 'database:health:request'
}
```

### database:reconnect
Request database reconnection attempt.

```typescript
{
  type: 'database:reconnect'
}
```

## Connection State Management

### On WebSocket Connect
1. Server sends immediate `database:status` with current state
2. If database connected, sends `database:health`
3. If database disconnected, sends error details

### During Connection
1. Health checks run every 30 seconds (configurable)
2. Status changes broadcast immediately
3. Operation errors sent with context

### On Database Connection Loss
1. Server sends `database:status` with 'disconnected' or 'error'
2. Server attempts automatic reconnection with backoff
3. Server queues critical operations (audit logs)
4. Server rejects non-critical operations with error

### On Database Reconnection
1. Server sends `database:status` with 'connected'
2. Server flushes queued operations
3. Server sends `database:health` with latest metrics

## Error Recovery

### Transient Errors
- Automatic retry with exponential backoff
- Max 3 retries by default
- Client notified after final failure

### Permanent Errors
- No automatic retry
- Clear error message with resolution steps
- Manual reconnect required via `database:reconnect` event

### Mock Mode
- All operations succeed but don't persist
- Health checks always return healthy
- Warning sent on initial connection