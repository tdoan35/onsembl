# Onsembl.ai Frontend

Next.js-based dashboard for managing AI coding agents with real-time WebSocket communication.

## Features

- 🚀 Real-time agent monitoring
- 📡 WebSocket-based communication
- 💻 Terminal output streaming
- 📊 Command execution tracking
- 🔄 Auto-reconnection with exponential backoff
- 🔐 JWT-based authentication
- 📈 Performance metrics visualization

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript 5.x
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: Zustand
- **WebSocket**: Native WebSocket API with custom service layer
- **Terminal**: xterm.js
- **Database**: Supabase (Auth + Realtime)

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- Supabase account (for auth)

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Run development server
npm run dev
```

### Environment Variables

```bash
# WebSocket Configuration
NEXT_PUBLIC_WS_URL=ws://localhost:3001
NEXT_PUBLIC_AUTH_TOKEN=dev-token

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## WebSocket Integration

### Architecture

The frontend uses a layered WebSocket architecture:

```
┌──────────────────────────────────────┐
│         React Components              │
│  (Dashboard, Terminal, AgentList)     │
└────────────┬─────────────────────────┘
             │
┌────────────▼─────────────────────────┐
│          useWebSocket Hook           │
│     (Connection management)          │
└────────────┬─────────────────────────┘
             │
┌────────────▼─────────────────────────┐
│         Zustand Stores               │
│  (Agent, Command, Terminal, WS)      │
└────────────┬─────────────────────────┘
             │
┌────────────▼─────────────────────────┐
│      WebSocket Service Layer         │
│  (Connection, Reconnection, Queue)   │
└────────────┬─────────────────────────┘
             │
┌────────────▼─────────────────────────┐
│    Message Handler Registry          │
│     (Type-based routing)             │
└────────────┬─────────────────────────┘
             │
┌────────────▼─────────────────────────┐
│     Native WebSocket API             │
└──────────────────────────────────────┘
```

### Usage

#### Basic Connection

```typescript
import { useWebSocket } from '@/hooks/useWebSocket';

function Dashboard() {
  const {
    isConnected,
    connectionState,
    error,
    requestCommand,
    interruptCommand
  } = useWebSocket({
    autoConnect: true,
    onConnect: () => console.log('Connected'),
    onDisconnect: () => console.log('Disconnected'),
    onError: (error) => console.error('Error:', error)
  });

  // Send command
  const handleCommand = () => {
    requestCommand('agent-123', 'npm test', ['--coverage']);
  };

  return (
    <div>
      {isConnected ? 'Connected' : 'Disconnected'}
      <button onClick={handleCommand}>Run Test</button>
    </div>
  );
}
```

#### Custom Message Handling

```typescript
import { useWebSocket } from '@/hooks/useWebSocket';
import { useEffect } from 'react';

function CustomComponent() {
  const { service } = useWebSocket();

  useEffect(() => {
    if (!service) return;

    // Register custom handler
    const handler = (message) => {
      if (message.type === 'custom:event') {
        console.log('Custom event:', message);
      }
    };

    service.on('message', handler);

    return () => {
      service.off('message', handler);
    };
  }, [service]);
}
```

### WebSocket Services

#### ReconnectionManager

Handles automatic reconnection with exponential backoff:

```typescript
import { ReconnectionManager } from '@/services/reconnection';

const reconnection = new ReconnectionManager(connectFunction, {
  maxRetries: 5,
  initialDelay: 1000,
  maxDelay: 30000,
  factor: 2,
  jitter: true
});

reconnection.start();
```

#### MessageRetryService

Ensures message delivery with retry logic:

```typescript
import { messageRetry } from '@/services/message-retry';

messageRetry.setSendCallback(async (message) => {
  await ws.send(message);
});

// Send with automatic retry
await messageRetry.sendWithRetry({
  type: 'command:request',
  command: 'npm test',
  timestamp: new Date().toISOString()
});
```

#### TerminalBuffer

Efficient terminal output management:

```typescript
import { TerminalBuffer } from '@/services/terminal-buffer';

const buffer = new TerminalBuffer({
  maxSize: 1000,
  maxAge: 3600000
});

buffer.add({
  type: 'stdout',
  content: 'Test output',
  timestamp: new Date().toISOString()
});

// Get recent outputs
const recent = buffer.getRecent(60000); // Last minute
```

#### ErrorRecoveryService

Intelligent error recovery strategies:

```typescript
import { errorRecovery } from '@/services/error-recovery';

errorRecovery.setReconnectCallback(async () => {
  await ws.connect();
});

// Handle connection error
const recovered = await errorRecovery.handleError(error);
```

### Message Types

All WebSocket messages follow the standard protocol:

```typescript
interface WebSocketMessage {
  type: string;       // Message type (namespace:action)
  timestamp: string;  // ISO 8601 timestamp
  [key: string]: any; // Additional payload
}
```

Common message types:
- `dashboard:connect` - Dashboard identification
- `agent:status` - Agent status updates
- `command:request` - Command execution request
- `terminal:output` - Terminal output stream
- `heartbeat:ping/pong` - Keep-alive

### State Management

#### Agent Store

```typescript
import { useAgentStore } from '@/stores/agent.store';

const {
  agents,
  selectedAgentId,
  selectAgent,
  updateAgent,
  getOnlineAgents
} = useAgentStore();
```

#### Command Store

```typescript
import { useCommandStore } from '@/stores/command.store';

const {
  commands,
  addCommand,
  updateCommandStatus,
  getRunningCommands
} = useCommandStore();
```

#### Terminal Store

```typescript
import { useTerminalStore } from '@/stores/terminal.store';

const {
  outputs,
  addOutput,
  clearTerminal,
  getAgentOutputs
} = useTerminalStore();
```

#### WebSocket Store

```typescript
import { useWebSocketStore } from '@/stores/websocket.store';

const {
  isConnected,
  connectionState,
  error,
  connect,
  disconnect,
  sendMessage
} = useWebSocketStore();
```

## Components

### Connection Status Indicator

```tsx
import { ConnectionStatus } from '@/components/connection-status';

<ConnectionStatus
  showDetails={true}
  onReconnect={() => console.log('Reconnecting')}
/>
```

### Agent List

```tsx
import { AgentList } from '@/components/agent-list';

<AgentList
  onAgentSelect={(agentId) => console.log('Selected:', agentId)}
  showOffline={true}
  viewMode="cards"
/>
```

### Terminal

```tsx
import { Terminal } from '@/components/terminal';

<Terminal
  agentId="agent-123"
  height={400}
  onCommand={(cmd) => console.log('Command:', cmd)}
  enableInput={true}
/>
```

## Performance Optimizations

### Terminal Output Debouncing

Reduces render frequency for high-volume output:

```typescript
import { terminalDebouncer } from '@/services/terminal-debounce';

terminalDebouncer.setOutputCallback((agentId, outputs) => {
  // Batch update UI
  store.addBatchOutputs(agentId, outputs);
});

// Add output (will be debounced)
terminalDebouncer.addOutput(agentId, output);
```

### Message Queuing

Prevents message loss during reconnection:

```typescript
const queue: WebSocketMessage[] = [];

ws.on('close', () => {
  // Queue messages during disconnect
  queueMessages = true;
});

ws.on('open', () => {
  // Replay queued messages
  queue.forEach(msg => ws.send(msg));
  queue.length = 0;
  queueMessages = false;
});
```

### Polling Fallback

Fallback to HTTP polling when WebSocket fails:

```typescript
import { pollingFallback } from '@/services/polling-fallback';

pollingFallback.start();
pollingFallback.sendMessage(message);
```

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Integration Tests

```bash
# WebSocket integration tests
npm run test:integration

# E2E tests with Playwright
npm run test:e2e
```

### Test WebSocket Connection

```typescript
// Test connection
describe('WebSocket', () => {
  it('should connect successfully', async () => {
    const ws = new WebSocketService('ws://localhost:3001');
    await ws.connect();
    expect(ws.isConnected()).toBe(true);
  });

  it('should handle reconnection', async () => {
    const ws = new WebSocketService('ws://localhost:3001');
    await ws.connect();
    ws.disconnect();
    await ws.connect();
    expect(ws.isConnected()).toBe(true);
  });
});
```

## Troubleshooting

### Connection Issues

1. **WebSocket won't connect**
   - Check backend is running on port 3001
   - Verify NEXT_PUBLIC_WS_URL is correct
   - Check authentication token

2. **Messages not received**
   - Verify message handlers are registered
   - Check browser console for errors
   - Ensure message format is correct

3. **High memory usage**
   - Reduce terminal buffer size
   - Enable output debouncing
   - Clear old terminal outputs

4. **Reconnection loop**
   - Check token expiration
   - Verify backend health
   - Review rate limit settings

### Debug Mode

Enable debug logging:

```typescript
// In development
localStorage.setItem('DEBUG', 'websocket:*');

// Component-level debugging
const { service } = useWebSocket();
service?.enableDebug();
```

### Network Inspector

Monitor WebSocket frames in Chrome DevTools:
1. Open DevTools (F12)
2. Go to Network tab
3. Filter by "WS"
4. Click on WebSocket connection
5. View "Messages" tab for frames

## Deployment

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

### Environment Configuration

Production environment variables:

```bash
# Production WebSocket
NEXT_PUBLIC_WS_URL=wss://api.onsembl.ai

# Production Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-production-key
```

### Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT