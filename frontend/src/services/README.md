# Frontend Services

This directory contains the core services for the Onsembl.ai Dashboard frontend application.

## Services Overview

### 1. Authentication Service (`auth.service.ts`)
Handles user authentication using Supabase:
- Magic link authentication
- Email/password authentication
- JWT token management with automatic refresh
- Session persistence and restoration
- User profile management

### 2. API Client Service (`api.service.ts`)
RESTful API client for backend communication:
- All CRUD operations for agents, commands, presets, etc.
- Automatic JWT token management and refresh
- Request/response interceptors
- Retry logic with exponential backoff
- File upload/download support
- Request cancellation

### 3. WebSocket Service (`websocket.service.ts`)
Real-time communication with backend:
- Connects to agent and dashboard WebSocket endpoints
- Handles all WebSocket message types from agent protocol
- Automatic reconnection with exponential backoff
- JWT authentication for WebSocket connections
- Message queuing for offline scenarios
- Heartbeat/ping-pong support

## Usage Examples

### Basic Setup

```typescript
import { authService, apiClient, webSocketService } from '@/services';

// Services are pre-configured and ready to use
// They automatically integrate with each other

// Authentication
await authService.signIn({ email: 'user@example.com', password: 'password' });

// API calls (automatically authenticated)
const agents = await apiClient.getAgents();

// WebSocket (automatically connects with auth token)
await webSocketService.connect('dashboard');
webSocketService.initializeDashboard();
```

### Authentication

```typescript
import { authService } from '@/services';

// Sign in with email/password
try {
  const session = await authService.signIn({
    email: 'user@example.com',
    password: 'password'
  });
  console.log('Signed in:', session.user);
} catch (error) {
  console.error('Sign in failed:', error);
}

// Send magic link
await authService.sendMagicLink({
  email: 'user@example.com',
  redirectTo: 'http://localhost:3000/auth/callback'
});

// Listen for auth events
authService.on('signed_in', (event, session) => {
  console.log('User signed in:', session?.user);
});

authService.on('signed_out', () => {
  console.log('User signed out');
});
```

### API Calls

```typescript
import { apiClient } from '@/services';

// Get all agents
const { data: agents } = await apiClient.getAgents();

// Execute command
const { data: command } = await apiClient.executeCommand({
  agentId: 'claude-1',
  command: 'analyze codebase',
  priority: 5
});

// Get command presets
const { data: presets } = await apiClient.getCommandPresets();

// Upload file
const file = new File(['content'], 'example.txt');
const { data: uploadResult } = await apiClient.uploadFile(file);
```

### WebSocket Communication

```typescript
import { webSocketService, MessageType } from '@/services';

// Connect to dashboard endpoint
await webSocketService.connect('dashboard');

// Initialize dashboard with subscriptions
webSocketService.initializeDashboard({
  agents: ['claude-1', 'gemini-1'],
  traces: true,
  terminals: true
});

// Listen for specific message types
webSocketService.on(MessageType.AGENT_STATUS, (payload, message) => {
  console.log('Agent status update:', payload);
});

webSocketService.on(MessageType.TERMINAL_STREAM, (payload, message) => {
  console.log('Terminal output:', payload.content);
});

// Subscribe to specific updates
webSocketService.subscribe('agent', 'claude-1');
webSocketService.subscribe('terminal', undefined, true); // All terminals

// Check connection status
const isConnected = webSocketService.isConnected('dashboard');
const state = webSocketService.getConnectionState('dashboard');
```

### Integration with React Components

```typescript
import { useEffect, useState } from 'react';
import { authService, webSocketService } from '@/services';

function Dashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Set up auth state listener
    const handleAuthStateChange = (state: AuthState) => {
      setIsAuthenticated(state === 'authenticated');
    };

    authService.addEventListener('auth_state_change', handleAuthStateChange);
    setIsAuthenticated(authService.isAuthenticated());

    // Set up WebSocket connection state listener
    const handleConnectionState = (state: WebSocketConnectionState) => {
      setIsConnected(state === 'connected');
    };

    webSocketService.onConnectionState('dashboard', handleConnectionState);

    // Connect WebSocket if authenticated
    if (authService.isAuthenticated()) {
      webSocketService.connect('dashboard')
        .then(() => webSocketService.initializeDashboard())
        .catch(console.error);
    }

    return () => {
      authService.removeEventListener('auth_state_change', handleAuthStateChange);
      webSocketService.offConnectionState('dashboard', handleConnectionState);
    };
  }, []);

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <div>
      <div>Connection Status: {isConnected ? 'Connected' : 'Disconnected'}</div>
      {/* Dashboard content */}
    </div>
  );
}
```

### Error Handling

```typescript
import { ApiError, authService, apiClient } from '@/services';

try {
  const { data } = await apiClient.getAgents();
  // Handle success
} catch (error) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'auth_refresh_failed':
        // Token refresh failed, redirect to login
        await authService.signOut();
        break;
      case 'network_error':
        // Show network error message
        break;
      default:
        console.error('API Error:', error.message);
    }
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Configuration

Services can be configured using environment variables:

```bash
# Backend URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001

# Supabase configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Environment
NODE_ENV=development
```

See `config.ts` for detailed configuration options.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Auth Service  │    │   API Client     │    │ WebSocket       │
│                 │    │                  │    │ Service         │
│ - Supabase Auth │────│ - REST API calls │────│ - Real-time     │
│ - JWT tokens    │    │ - Auto retry     │    │   communication │
│ - Session mgmt  │    │ - Interceptors   │    │ - Auto reconnect│
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌────────▼────────┐             │
         └──────────────▶│  Zustand Stores │◀────────────┘
                        │                 │
                        │ - Agent Store   │
                        │ - Command Store │
                        │ - UI Store      │
                        └─────────────────┘
```

## Testing

Services include built-in error handling and logging. For testing:

1. Use mock services for unit tests
2. Use real services with test backends for integration tests
3. Monitor console logs for debugging information

## Security Considerations

- JWT tokens are automatically managed and refreshed
- Tokens are stored securely in localStorage (encrypted in production)
- WebSocket connections are authenticated
- API requests include proper authorization headers
- Sensitive operations require valid authentication