# Data Model: WebSocket Authentication

## Core Entities

### AuthenticatedConnection
Represents a WebSocket connection with verified authentication state.

**Properties:**
- `connectionId`: string (UUID) - Unique identifier for the connection
- `userId`: string - Authenticated user identifier
- `connectionType`: enum ['agent', 'dashboard'] - Type of connection
- `authContext`: AuthContext - Current authentication state
- `createdAt`: timestamp - Connection establishment time
- `lastActivityAt`: timestamp - Last message received time
- `messageCount`: number - Messages sent in current window (for rate limiting)
- `isAuthenticated`: boolean - Current auth status
- `ipAddress`: string - Client IP for rate limiting

**State Transitions:**
- `pending` → `authenticated` (successful auth)
- `authenticated` → `expired` (token expiry)
- `expired` → `authenticated` (token refresh)
- `any` → `closed` (disconnection)

### AuthContext
Authentication context stored per connection.

**Properties:**
- `token`: string - Current JWT access token
- `refreshToken`: string (optional) - Refresh token for rotation
- `userId`: string - User identifier from token
- `agentId`: string (optional) - Agent identifier if agent connection
- `roles`: string[] - User roles/permissions
- `permissions`: string[] - Specific permissions granted
- `issuedAt`: timestamp - Token issue time
- `expiresAt`: timestamp - Token expiration time
- `lastValidatedAt`: timestamp - Last validation check

**Validation Rules:**
- `expiresAt` must be future timestamp
- `token` must be valid JWT format
- `userId` required for all connections
- `agentId` required for agent connections only

### UserConnectionPool
Tracks all connections for a single user.

**Properties:**
- `userId`: string - User identifier
- `connections`: Map<string, AuthenticatedConnection> - Active connections
- `connectionCount`: number - Current active connections
- `maxConnections`: number - Maximum allowed (default: 10)
- `lastConnectionAt`: timestamp - Most recent connection time
- `totalConnectionsToday`: number - Daily connection count

**Constraints:**
- `connectionCount` ≤ `maxConnections`
- Connections removed on disconnect
- Daily counts reset at midnight UTC

### RateLimitTracker
Monitors and enforces rate limits per user/connection.

**Properties:**
- `identifier`: string - User ID or connection ID
- `windowStart`: timestamp - Current window start time
- `windowSize`: number - Window duration in seconds (default: 60)
- `requestCount`: number - Requests in current window
- `maxRequests`: number - Maximum allowed per window
- `violationCount`: number - Total violations
- `lastViolationAt`: timestamp (optional) - Last limit exceeded
- `blockedUntil`: timestamp (optional) - Temporary block expiry

**Rate Limit Tiers:**
- Normal: 100 messages/minute
- Burst: 20 messages/second
- Violation: Blocked for 5 minutes after 3 violations

### AuthenticationAuditLog
Security audit trail for authentication events.

**Properties:**
- `eventId`: string (UUID) - Unique event identifier
- `timestamp`: timestamp - Event occurrence time
- `userId`: string (optional) - User if known
- `connectionId`: string (optional) - Connection if applicable
- `eventType`: enum - Event category
  - `CONNECTION_ATTEMPT`
  - `AUTH_SUCCESS`
  - `AUTH_FAILURE`
  - `TOKEN_REFRESH`
  - `RATE_LIMIT_EXCEEDED`
  - `PERMISSION_DENIED`
  - `CONNECTION_CLOSED`
- `details`: object - Event-specific data
  - `reason`: string - Failure/success reason
  - `ipAddress`: string - Client IP
  - `userAgent`: string - Client identifier
  - `tokenExpiry`: timestamp (optional)
  - `permissions`: string[] (optional)
- `severity`: enum ['info', 'warning', 'error', 'critical']

**Retention:**
- 30 days for normal events
- 90 days for security violations
- Permanent for critical breaches

## Relationships

### Connection Management
```
User (1) ←→ (N) AuthenticatedConnection
AuthenticatedConnection (1) ←→ (1) AuthContext
AuthenticatedConnection (1) ←→ (1) RateLimitTracker
User (1) ←→ (1) UserConnectionPool
```

### Audit Trail
```
AuthenticatedConnection (1) ←→ (N) AuthenticationAuditLog
User (1) ←→ (N) AuthenticationAuditLog
```

## Validation Rules

### Token Validation
1. JWT signature must be valid
2. Token must not be expired
3. Token issuer must match expected value
4. User ID must exist in token claims
5. Connection type must match token role

### Connection Validation
1. User must not exceed connection limit
2. IP must not be blacklisted
3. Previous violations must not block connection
4. Token must be provided in connection request

### Message Validation
1. Connection must be authenticated
2. Token must not be expired
3. Rate limits must not be exceeded
4. Required permissions must be present

### Refresh Validation
1. Refresh token must be valid
2. Refresh token must match stored token
3. User must still be active
4. Connection must be authenticated

## State Management

### Connection Lifecycle
1. **Connection Request** → Validate token → Create AuthenticatedConnection
2. **Message Received** → Check auth context → Validate expiry → Process
3. **Token Refresh** → Validate refresh token → Update context → Continue
4. **Token Expired** → Mark expired → Await refresh or close
5. **Disconnection** → Clean up connection → Update pool → Log event

### Rate Limit Lifecycle
1. **Message Received** → Check window → Increment counter
2. **Window Expired** → Reset counter → Start new window
3. **Limit Exceeded** → Log violation → Block if repeated
4. **Block Period** → Reject all messages → Auto-unblock after timeout

## Security Constraints

### Authentication
- All connections must authenticate within 5 seconds
- Expired tokens must be rejected immediately
- Failed auth must close with code 1008
- Auth failures must be logged with full context

### Rate Limiting
- Limits apply per user across all connections
- Burst protection prevents rapid-fire attacks
- Violations trigger progressive penalties
- Critical violations trigger immediate disconnect

### Audit Logging
- All auth events must be logged
- Logs must include sufficient context for investigation
- PII must be handled per compliance requirements
- Logs must be tamper-resistant

## Performance Considerations

### Caching
- Token validation results cached for 1 minute
- User connection pools cached in memory
- Rate limit counters use Redis for distribution

### Optimization
- Batch validation for multiple messages
- Lazy loading of full auth context
- Connection pooling for database queries
- Async logging to prevent blocking

## Migration Path

### From Current State
1. Add auth property to WebSocketDependencies
2. Initialize AuthContext on connection
3. Implement per-message validation
4. Add rate limiting incrementally
5. Enable audit logging last

### Rollback Plan
1. Feature flag for auth enforcement
2. Gradual rollout by user percentage
3. Monitoring for performance impact
4. Quick disable if issues detected