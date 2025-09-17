# Research: WebSocket Communication Implementation

## WebSocket Reconnection Patterns for Next.js App Router

**Decision**: Exponential backoff with jitter and connection state management
**Rationale**:
- Prevents server overload during network issues
- Provides better UX with immediate retry followed by gradual backoff
- Jitter prevents thundering herd problem when multiple clients reconnect

**Implementation approach**:
- Use custom React hook (useWebSocket) with built-in reconnection logic
- Maintain connection state in Zustand store
- Initial retry: immediate
- Subsequent retries: 1s, 2s, 4s, 8s, 16s, cap at 30s
- Add random jitter of ±20% to prevent synchronized reconnections

**Alternatives considered**:
- Socket.IO: Rejected due to overhead and complexity for simple use case
- Native WebSocket with manual reconnect: Too low-level, requires more boilerplate
- Third-party libraries (reconnecting-websocket): Adds unnecessary dependency

## Fastify WebSocket Broadcasting Best Practices

**Decision**: Room-based broadcasting using Map for connection management
**Rationale**:
- Fastify WebSocket plugin provides low-level control
- Map structure allows O(1) lookups for connections
- Room concept enables targeted broadcasts (all dashboards, specific agent groups)

**Implementation approach**:
```typescript
// Connection pools
const dashboardConnections = new Map<string, WebSocketConnection>()
const agentConnections = new Map<string, WebSocketConnection>()

// Broadcast to all dashboards
function broadcastToDashboards(message: any) {
  dashboardConnections.forEach(conn => {
    if (conn.readyState === WebSocket.OPEN) {
      conn.send(JSON.stringify(message))
    }
  })
}
```

**Alternatives considered**:
- Redis Pub/Sub: Overkill for single-server MVP
- Fastify-socket.io: Too much abstraction, harder to control message format
- Custom event emitter: More complex than simple Map iteration

## Zustand Integration with WebSocket Events

**Decision**: Direct store updates from WebSocket message handlers
**Rationale**:
- Zustand's simple API works well with event-driven updates
- No middleware needed for WebSocket integration
- Maintains single source of truth for UI state

**Implementation approach**:
```typescript
// In WebSocket message handler
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)

  switch(message.type) {
    case 'agent:status':
      useAgentStore.getState().updateAgentStatus(message.agentId, message.status)
      break
    case 'terminal:output':
      useTerminalStore.getState().appendOutput(message.data)
      break
  }
}
```

**Alternatives considered**:
- Redux with middleware: Too complex for simple state updates
- Context API: Doesn't handle frequent updates well
- Valtio/Jotai: No significant advantage over Zustand for this use case

## xterm.js Terminal Output Buffering Strategies

**Decision**: Ring buffer with debounced writes to xterm
**Rationale**:
- Prevents UI freezing during high-throughput output
- Ring buffer ensures memory doesn't grow unbounded
- Debouncing reduces render cycles while maintaining responsiveness

**Implementation approach**:
```typescript
class TerminalBuffer {
  private buffer: string[] = []
  private maxSize = 10000 // lines
  private flushTimer: NodeJS.Timeout | null = null

  append(data: string) {
    this.buffer.push(data)
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift() // Remove oldest
    }
    this.scheduleFlush()
  }

  private scheduleFlush() {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flush()
      this.flushTimer = null
    }, 16) // ~60fps
  }

  private flush() {
    const data = this.buffer.join('')
    this.buffer = []
    xterm.write(data)
  }
}
```

**Alternatives considered**:
- Direct write to xterm: Can freeze UI with rapid output
- Fixed-size circular buffer: Can lose important output
- Infinite scrollback: Memory issues with long-running processes

## Message Protocol Versioning

**Decision**: Version field in every message with backward compatibility
**Rationale**:
- Allows gradual migration of clients
- Server can handle multiple protocol versions simultaneously
- Clear upgrade path for breaking changes

**Implementation approach**:
```typescript
interface WebSocketMessage {
  version: '1.0.0'
  type: string
  timestamp: number
  payload: any
}
```

**Alternatives considered**:
- URL-based versioning (/ws/v1/dashboard): Harder to maintain multiple versions
- Header-based versioning: Not standard for WebSocket
- No versioning: Would cause issues during updates

## Performance Optimizations

**Decision**: Message batching for terminal output, compression for large payloads
**Rationale**:
- Reduces message overhead for character-by-character output
- Compression helps with verbose command outputs
- Maintains <200ms latency requirement

**Implementation approach**:
- Batch terminal output every 50ms
- Use pako for gzip compression when payload >10KB
- Mark compressed messages with flag

**Alternatives considered**:
- No batching: Too many messages for character output
- Server-side buffering only: Increases latency
- WebSocket compression extension: Not universally supported

## Error Handling Strategy

**Decision**: Graceful degradation with user notification
**Rationale**:
- Users should know when real-time features are unavailable
- System should recover automatically when possible
- Fallback to polling if WebSocket fails repeatedly

**Implementation approach**:
- Connection state indicator in UI
- Toast notifications for connection issues
- Exponential backoff for reconnection
- After 5 failed attempts, offer manual reconnect

**Alternatives considered**:
- Silent reconnection: Users unaware of issues
- Immediate error modal: Too disruptive
- No fallback: Poor user experience

## Security Considerations

**Decision**: JWT authentication with periodic rotation
**Rationale**:
- Consistent with existing auth system
- Allows connection auth without cookies
- Token rotation prevents long-lived access

**Implementation approach**:
- Include JWT in connection query params
- Validate on server before upgrade
- Refresh token before expiry via protocol message
- Close connection if refresh fails

**Alternatives considered**:
- Cookie-based auth: CORS complications
- API key: Less secure, no expiry
- No auth: Unacceptable for production