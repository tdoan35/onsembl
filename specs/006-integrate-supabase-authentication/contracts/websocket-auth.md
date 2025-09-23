# WebSocket Authentication Protocol

## Overview
This document defines the authentication protocol for WebSocket connections in the Onsembl.ai Agent Control Center.

## Connection Flow

### 1. Initial Connection
Client establishes WebSocket connection with JWT token in headers:

```javascript
const ws = new WebSocket('ws://localhost:3010/ws', {
  headers: {
    'Authorization': `Bearer ${supabaseSession.access_token}`
  }
});
```

### 2. Server Validation
Server validates JWT token on connection:

```typescript
fastify.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, async (connection, req) => {
    // Extract token from headers
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      connection.socket.close(1008, 'Missing authentication token');
      return;
    }

    // Validate token with Supabase
    const { data: user, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      connection.socket.close(1008, 'Invalid authentication token');
      return;
    }

    // Store user context with connection
    connection.user = user;

    // Send authentication success
    connection.socket.send(JSON.stringify({
      type: 'AUTH_SUCCESS',
      payload: {
        user_id: user.id,
        email: user.email
      }
    }));
  });
});
```

## Message Protocol

### Authentication Messages

#### AUTH_SUCCESS
Sent by server after successful authentication:
```json
{
  "type": "AUTH_SUCCESS",
  "payload": {
    "user_id": "uuid",
    "email": "user@example.com"
  },
  "timestamp": "2025-01-01T00:00:00Z"
}
```

#### AUTH_ERROR
Sent by server on authentication failure:
```json
{
  "type": "AUTH_ERROR",
  "payload": {
    "error": "INVALID_TOKEN",
    "message": "Authentication token is invalid or expired"
  },
  "timestamp": "2025-01-01T00:00:00Z"
}
```

#### AUTH_REFRESH
Sent by client to refresh authentication:
```json
{
  "type": "AUTH_REFRESH",
  "payload": {
    "token": "new_jwt_token"
  },
  "timestamp": "2025-01-01T00:00:00Z"
}
```

#### SESSION_EXPIRED
Sent by server when session expires:
```json
{
  "type": "SESSION_EXPIRED",
  "payload": {
    "message": "Your session has expired. Please reconnect."
  },
  "timestamp": "2025-01-01T00:00:00Z"
}
```

### User-Scoped Messages
All messages after authentication are scoped to the authenticated user:

#### AGENT_STATUS (Modified)
```json
{
  "type": "AGENT_STATUS",
  "payload": {
    "agent_id": "uuid",
    "user_id": "uuid", // Must match authenticated user
    "status": "online",
    "metrics": {}
  }
}
```

#### COMMAND_REQUEST (Modified)
```json
{
  "type": "COMMAND_REQUEST",
  "payload": {
    "command_id": "uuid",
    "agent_id": "uuid",
    "user_id": "uuid", // Must match authenticated user
    "type": "execute",
    "data": {}
  }
}
```

## Connection Management

### Connection States
```
CONNECTING → AUTHENTICATING → AUTHENTICATED → ACTIVE
                    ↓              ↓            ↓
                 AUTH_FAILED   EXPIRED     DISCONNECTED
```

### Reconnection Strategy
1. Client detects disconnection
2. Client refreshes Supabase session if needed
3. Client attempts reconnection with new token
4. Server validates new token
5. Connection resumes with user context

### Example Client Implementation
```typescript
class AuthenticatedWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  async connect() {
    const session = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    this.ws = new WebSocket('ws://localhost:3010/ws', {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    this.ws.onopen = () => {
      console.log('WebSocket connected, awaiting authentication...');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'AUTH_SUCCESS':
          console.log('Authenticated successfully');
          this.onAuthenticated(message.payload);
          break;

        case 'AUTH_ERROR':
          console.error('Authentication failed:', message.payload);
          this.handleAuthError();
          break;

        case 'SESSION_EXPIRED':
          console.log('Session expired, refreshing...');
          this.refreshAndReconnect();
          break;

        default:
          this.handleMessage(message);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = (event) => {
      if (event.code === 1008) {
        console.error('Connection closed: Authentication failed');
        this.handleAuthError();
      } else {
        console.log('Connection closed, attempting reconnect...');
        this.reconnect();
      }
    };
  }

  private async refreshAndReconnect() {
    const { data: { session }, error } = await supabase.auth.refreshSession();
    if (error || !session) {
      console.error('Failed to refresh session');
      this.handleAuthError();
      return;
    }

    this.reconnect();
  }

  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.handleAuthError();
      return;
    }

    this.reconnectAttempts++;

    setTimeout(() => {
      console.log(`Reconnection attempt ${this.reconnectAttempts}`);
      this.connect();
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  private onAuthenticated(user: any) {
    // Handle successful authentication
  }

  private handleAuthError() {
    // Redirect to login or show error
    window.location.href = '/login';
  }

  private handleMessage(message: any) {
    // Handle authenticated messages
  }

  send(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  }

  close() {
    this.ws?.close(1000, 'Client closing connection');
    this.ws = null;
  }
}
```

## Security Considerations

### Token Validation
- Validate JWT signature with Supabase secret
- Check token expiration
- Verify user exists and is active
- Extract user_id for message filtering

### Message Filtering
- Only send messages relevant to authenticated user
- Filter agent status by user ownership
- Filter commands by user ownership
- Prevent cross-user data leakage

### Connection Limits
- Limit connections per user (e.g., max 5 simultaneous)
- Implement rate limiting per connection
- Monitor for suspicious activity

### Audit Logging
Log all authentication events:
- Successful connections with user_id
- Failed authentication attempts
- Session expirations
- Abnormal disconnections

## Error Codes

### WebSocket Close Codes
- `1000`: Normal closure
- `1008`: Policy violation (authentication failed)
- `1011`: Server error
- `1012`: Server restarting
- `1013`: Try again later (rate limited)

### Application Error Codes
- `AUTH_REQUIRED`: No token provided
- `INVALID_TOKEN`: Token validation failed
- `EXPIRED_TOKEN`: Token has expired
- `USER_NOT_FOUND`: User doesn't exist
- `PERMISSION_DENIED`: User lacks permission
- `RATE_LIMITED`: Too many requests

## Testing Scenarios

### Authentication Tests
1. Connect with valid token → Success
2. Connect with invalid token → Rejected
3. Connect with expired token → Rejected
4. Connect without token → Rejected
5. Token expires during connection → Notified and disconnected

### Message Filtering Tests
1. User A receives only User A's agent updates
2. User B cannot receive User A's commands
3. User cannot execute commands on other user's agents

### Reconnection Tests
1. Network disruption → Auto-reconnect
2. Server restart → Client reconnects
3. Token refresh → Reconnect with new token
4. Max attempts exceeded → Stop reconnecting

## Implementation Checklist

- [ ] Add JWT validation to WebSocket handler
- [ ] Store user context with connections
- [ ] Implement message filtering by user_id
- [ ] Add connection tracking Map
- [ ] Implement session expiry detection
- [ ] Add reconnection logic to client
- [ ] Create authentication event logging
- [ ] Add rate limiting middleware
- [ ] Implement connection limits per user
- [ ] Add monitoring and metrics