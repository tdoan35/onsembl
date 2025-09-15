# Technical Research: Onsembl.ai Agent Control Center

**Date**: 2025-01-15
**Branch**: `001-build-onsembl-ai`
**Requirements**: <200ms streaming latency, 10+ concurrent agent connections, Single-tenant MVP architecture, 30-day audit log retention

---

## 1. Fastify WebSocket Plugin for High-Concurrency

### Decision
Use @fastify/websocket with custom connection pooling and heartbeat management for handling 10+ concurrent agent connections.

### Rationale
- **Performance**: Fastify WebSocket plugin is built on the mature `ws` library with proven performance characteristics
- **Resource Management**: Built-in support for connection lifecycle management and resource cleanup
- **Integration**: Seamless integration with Fastify's plugin ecosystem and request/response lifecycle
- **Scalability**: Route-based WebSocket support enables modular architecture for different agent types

### Alternatives Considered
- **Socket.io**: Rejected due to additional overhead and complexity for our simple agent communication needs
- **Raw WebSocket**: Rejected due to lack of built-in connection management and heartbeat handling
- **Supabase Realtime**: Evaluated but rejected for agent connections due to RLS overhead and single-threaded database change processing

### Implementation Notes

**Connection Configuration**:
```javascript
await fastify.register(require('@fastify/websocket'), {
  options: {
    maxPayload: 1024 * 1024, // 1MB max message size
    verifyClient: (info) => validateJWT(info.req.headers.authorization)
  }
})
```

**Heartbeat Strategy**:
- Implement 30-second ping intervals with 10-second timeout
- Track connection health in Redis with TTL-based cleanup
- Graceful disconnection on 3 consecutive failed pings

**Resource Management**:
- Connection pooling with Map-based in-memory tracking
- Automatic cleanup on disconnect events
- Memory monitoring for connections exceeding 10,000 (though not expected in MVP)

**Connection Lifecycle**:
```javascript
fastify.register(async function (fastify) {
  fastify.get('/agent/:agentId', { websocket: true }, (connection, req) => {
    // Synchronously attach event handlers to avoid message drops
    connection.socket.on('message', handleAgentMessage)
    connection.socket.on('close', () => cleanupAgentConnection(req.params.agentId))
    connection.socket.on('error', handleConnectionError)

    // Register agent connection
    registerAgentConnection(req.params.agentId, connection)
  })
})
```

---

## 2. Bull Queue Patterns for Command Interruption/Cancellation

### Decision
Use BullMQ (not Bull) with priority queues and job observables for command cancellation and state management.

### Rationale
- **Modern Architecture**: BullMQ is written in TypeScript with better performance and maintainability
- **Advanced Cancellation**: BullMQ Pro provides job observables enabling streamlined cancellation
- **Priority Support**: Built-in priority queues with O(log(n)) insertion complexity
- **Event System**: Stream-based events (vs Bull's Pub-Sub) provide better reliability
- **Maintenance**: Bull is in maintenance mode; BullMQ receives active development

### Alternatives Considered
- **Bull (original)**: Rejected due to maintenance mode and inferior cancellation capabilities
- **Direct Redis operations**: Rejected due to complexity of implementing queue semantics manually
- **Agenda.js**: Rejected due to MongoDB dependency and less mature cancellation features

### Implementation Notes

**Queue Configuration**:
```javascript
import { Queue, Worker } from 'bullmq'

const commandQueue = new Queue('agent-commands', {
  connection: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    }
  }
})
```

**Priority Queue Implementation**:
```javascript
// Higher priority = lower number (1 = highest)
await commandQueue.add('execute-command', {
  agentId: 'claude-001',
  command: 'investigate bug in auth.js',
  userId: 'user-123'
}, {
  priority: 1, // Emergency/interrupt commands
  jobId: `cmd-${Date.now()}-${agentId}` // Enable cancellation by ID
})
```

**Job Cancellation**:
```javascript
// Cancel specific job
await commandQueue.remove(jobId)

// Cancel all jobs for specific agent
const jobs = await commandQueue.getJobs(['waiting', 'active'])
const agentJobs = jobs.filter(job => job.data.agentId === targetAgentId)
await Promise.all(agentJobs.map(job => job.remove()))
```

**State Management During Cancellation**:
- Maintain job state in Redis with atomic operations
- Use job progress tracking for partial completion states
- Implement cleanup handlers for interrupted operations

---

## 3. Supabase Real-time vs Pure WebSocket for Dashboard Updates

### Decision
Hybrid approach: Pure WebSocket for terminal streaming, Supabase Realtime for dashboard state synchronization.

### Rationale
- **Latency Requirements**: Terminal output requires <200ms latency; pure WebSocket eliminates database bottlenecks
- **State Synchronization**: Dashboard state (agent status, command history) benefits from Supabase's built-in change tracking
- **Complexity Balance**: Hybrid approach optimizes each use case while maintaining reasonable complexity
- **Scalability**: Avoids RLS authorization overhead for high-frequency terminal messages

### Alternatives Considered
- **Pure WebSocket for everything**: Rejected due to increased complexity for state synchronization
- **Supabase Realtime for everything**: Rejected due to RLS overhead and single-threaded database change processing affecting terminal streaming latency
- **Third-party real-time services**: Rejected to minimize external dependencies in MVP

### Implementation Notes

**Terminal Streaming (Pure WebSocket)**:
```javascript
// Direct agent output streaming
connection.socket.send(JSON.stringify({
  type: 'terminal-output',
  agentId: 'claude-001',
  timestamp: Date.now(),
  data: terminalChunk,
  color: '#00ff00'
}))
```

**Dashboard State (Supabase Realtime)**:
```javascript
// Agent status updates
const supabase = createClient(url, key)
const channel = supabase.channel('dashboard-state')

channel.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'agents'
}, (payload) => {
  updateAgentStatus(payload.new)
})

channel.subscribe()
```

**Data Flow Architecture**:
- Terminal output: Agent → Fastify WebSocket → Frontend (bypass database)
- Command history: Agent → Fastify → Supabase → Frontend (via Realtime)
- Agent status: Fastify → Supabase → Frontend (via Realtime)

---

## 4. JWT Token Rotation Strategy for Long-Lived Agent Connections

### Decision
In-band token refresh with dual-token system (access + refresh) maintaining persistent WebSocket connections.

### Rationale
- **Connection Persistence**: Avoids disconnection overhead during token refresh
- **Security**: Short-lived access tokens (15 minutes) with longer refresh tokens (7 days)
- **Stateful Advantage**: WebSocket's stateful nature allows server-side connection validation
- **Performance**: In-band refresh eliminates reconnection latency

### Alternatives Considered
- **Connection recreation on expiry**: Rejected due to disruption to streaming operations
- **Long-lived tokens**: Rejected due to security implications
- **Session-based auth**: Rejected due to WebSocket handshake limitations

### Implementation Notes

**Token Structure**:
```javascript
// Access token (15 minutes)
const accessToken = jwt.sign({
  sub: agentId,
  type: 'access',
  exp: Math.floor(Date.now() / 1000) + (15 * 60)
}, process.env.JWT_SECRET)

// Refresh token (7 days, stored in Redis)
const refreshToken = jwt.sign({
  sub: agentId,
  type: 'refresh',
  exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
}, process.env.JWT_REFRESH_SECRET)
```

**In-Band Refresh Protocol**:
```javascript
// Agent sends refresh request through existing connection
connection.socket.send(JSON.stringify({
  type: 'auth-refresh',
  refreshToken: currentRefreshToken
}))

// Server responds with new tokens
connection.socket.send(JSON.stringify({
  type: 'auth-refreshed',
  accessToken: newAccessToken,
  refreshToken: newRefreshToken
}))
```

**Connection State Management**:
- Store connection metadata in Redis with TTL matching token expiry
- Validate tokens on every incoming message
- Automatic cleanup of expired connections
- Force disconnection for invalid token refresh attempts

**Security Measures**:
- Always use WSS (WebSocket Secure) for encrypted transport
- Origin header validation during handshake
- Rate limiting for token refresh requests
- Audit logging for all authentication events

---

## 5. Fly.io Deployment with Persistent WebSocket Connections

### Decision
Single-region deployment with connection affinity using instance ID injection for MVP, with future multi-region considerations documented.

### Rationale
- **WebSocket Support**: Fly.io provides native WebSocket support without special configuration
- **TLS Handling**: Platform manages TLS termination reducing implementation complexity
- **Instance Routing**: Use fly-replay header for consistent agent-to-instance routing
- **Cost Optimization**: Single region sufficient for MVP scale (10 agents)

### Alternatives Considered
- **Multi-region from start**: Rejected due to MVP scope and connection routing complexity
- **Other platforms (Railway, Render)**: Evaluated but Fly.io chosen for WebSocket-specific features
- **Traditional VPS**: Rejected due to lack of managed services and scaling capabilities

### Implementation Notes

**Instance Affinity Implementation**:
```javascript
// Inject Fly instance ID into served pages
app.get('/', (req, res) => {
  const flyInstanceId = process.env.FLY_ALLOC_ID
  res.send(`
    <script>
      window.FLY_INSTANCE_ID = '${flyInstanceId}'
    </script>
  `)
})

// WebSocket connection with instance targeting
const wsUrl = `wss://app.fly.dev/ws?instance=${window.FLY_INSTANCE_ID}`
```

**Connection Persistence Strategies**:
- Implement connection state persistence in Redis
- Use fly-replay header for routing to specific instances
- Graceful handling of instance shutdown/restart
- Automatic reconnection with exponential backoff

**Deployment Configuration (fly.toml)**:
```toml
[build]
  builder = "paketobuildpacks/builder:base"

[env]
  PORT = "8080"

[experimental]
  auto_rollback = true

[[services]]
  http_checks = []
  internal_port = 8080
  processes = ["app"]
  protocol = "tcp"
  script_checks = []

  [services.concurrency]
    hard_limit = 25
    soft_limit = 20
    type = "connections"

  [[services.ports]]
    force_https = true
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
```

**Cold Start Mitigation**:
- Keep at least one instance always warm
- Implement health check endpoints to prevent hibernation
- Use Fly's machine sleep prevention for critical services

---

## 6. Monaco Editor Integration for Terminal Rendering

### Decision
Use xterm.js for terminal rendering instead of Monaco Editor, with Monaco Editor reserved for code viewing/editing features.

### Rationale
- **Purpose-Built**: xterm.js is specifically designed for terminal emulation with GPU acceleration
- **Performance**: Proven performance for streaming logs and real-time output
- **Features**: Built-in support for ANSI escape codes, colors, and terminal-specific behaviors
- **Maintenance**: Active development focused on terminal use cases

### Alternatives Considered
- **Monaco Editor for terminal**: Rejected due to poor fit for streaming terminal output and lack of terminal-specific features
- **Custom solution**: Rejected due to complexity of terminal emulation
- **Browser native terminal**: Rejected due to limited styling and control options

### Implementation Notes

**xterm.js Configuration for Log Streaming**:
```javascript
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { SearchAddon } from 'xterm-addon-search'

const terminal = new Terminal({
  cursorBlink: false,
  fontSize: 14,
  fontFamily: '"Fira Code", "Courier New", monospace',
  theme: {
    background: '#1e1e1e',
    foreground: '#d4d4d4'
  },
  convertEol: true,
  scrollback: 10000 // For 30-day audit log viewing
})

const fitAddon = new FitAddon()
const searchAddon = new SearchAddon()

terminal.loadAddon(fitAddon)
terminal.loadAddon(searchAddon)
```

**Performance Optimizations**:
- Use write buffering for high-frequency output
- Implement virtual scrolling for large log histories
- Configure appropriate scrollback limits
- Use terminal.writeUtf8() for binary data efficiency

**Agent Output Color Coding**:
```javascript
const agentColors = {
  'claude': '\x1b[32m',    // Green
  'gemini': '\x1b[34m',    // Blue
  'codex': '\x1b[35m'      // Magenta
}

function writeAgentOutput(agentId, message) {
  const color = agentColors[agentId] || '\x1b[37m'
  const reset = '\x1b[0m'
  terminal.write(`${color}[${agentId}]${reset} ${message}\n`)
}
```

**Search and Filtering**:
- Implement agent-specific filtering using xterm.js search addon
- Add timestamp-based navigation
- Provide export functionality for audit logs

**Monaco Editor Integration** (for separate code viewing):
```javascript
// Separate Monaco instance for investigation reports and code viewing
import * as monaco from 'monaco-editor'

const editor = monaco.editor.create(document.getElementById('code-container'), {
  value: investigationReport.content,
  language: 'typescript',
  theme: 'vs-dark',
  readOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false
})
```

---

## Summary

These technical decisions provide a robust foundation for the Onsembl.ai Agent Control Center, optimizing for the specific requirements of <200ms streaming latency, 10+ concurrent agent connections, and production-ready reliability. The hybrid approach balances performance, maintainability, and security while providing clear migration paths for future scaling needs.

Key architectural principles:
- **Separation of Concerns**: Different protocols for different use cases (WebSocket for streaming, Supabase for state)
- **Performance First**: Direct paths for latency-critical operations
- **Security by Design**: JWT rotation and proper authentication patterns
- **Operational Simplicity**: Managed services where appropriate, custom solutions where needed
- **Future-Proof**: Documented scaling patterns and migration paths

Each decision supports the single-tenant MVP architecture while providing clear paths for future multi-tenant and enterprise features.