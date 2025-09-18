# Data Model: Fix Command Routing

## Overview
Data structures and state management for WebSocket message routing between dashboards and agents.

## Core Entities

### CommandRouting
Tracks the relationship between commands and their originating dashboards for response routing.

**Fields**:
- `commandId: string` - Unique command identifier
- `dashboardConnectionId: string` - Originating dashboard's WebSocket connection ID
- `agentId: string` - Target agent identifier
- `initiatedAt: number` - Timestamp when command was initiated
- `status: 'pending' | 'acknowledged' | 'executing' | 'completed' | 'failed'`
- `ttl: number` - Time-to-live in milliseconds (default: 30000)

**Validation**:
- commandId must be unique
- dashboardConnectionId must reference active connection
- agentId must be valid agent identifier
- ttl must be positive integer

**State Transitions**:
- `pending` → `acknowledged` (agent receives command)
- `acknowledged` → `executing` (agent starts processing)
- `executing` → `completed` or `failed` (command finishes)
- Any state → `failed` (timeout or error)

### DashboardConnectionMetadata
Enhanced metadata for dashboard connections to track command associations.

**Fields**:
- `connectionId: string` - WebSocket connection identifier
- `userId: string` - Authenticated user identifier
- `initiatedCommands: Set<string>` - Command IDs initiated by this dashboard
- `subscribedAgents: Set<string>` - Agent IDs this dashboard is monitoring
- `lastActivity: number` - Last message timestamp

**Validation**:
- connectionId must be unique
- userId must be authenticated
- initiatedCommands cleaned on command completion

### AgentConnectionMetadata
Enhanced metadata for agent connections to track processing commands.

**Fields**:
- `connectionId: string` - WebSocket connection identifier
- `agentId: string` - Unique agent identifier
- `processingCommands: Map<string, string>` - commandId → dashboardConnectionId mapping
- `queuedCommands: string[]` - Command IDs waiting to be processed
- `status: 'online' | 'busy' | 'offline'`
- `lastHeartbeat: number` - Last heartbeat timestamp

**Validation**:
- agentId must be unique across all agents
- processingCommands limited by agent capacity
- status must reflect actual connection state

### MessageQueueItem
Represents a queued message for offline or busy agents.

**Fields**:
- `id: string` - Queue item identifier
- `message: WebSocketMessage` - The actual message to deliver
- `targetAgentId: string` - Target agent for delivery
- `originDashboardId: string` - Dashboard that initiated the message
- `priority: number` - 1-10, higher = more important
- `attempts: number` - Delivery attempt count
- `createdAt: number` - Queue entry timestamp
- `nextRetryAt: number` - Next delivery attempt timestamp

**Validation**:
- priority must be 1-10
- attempts must not exceed maxRetryAttempts (3)
- exponential backoff for nextRetryAt calculation

## Relationships

### Command Flow Relationships
```
Dashboard (1) → initiates → (N) Commands
Command (1) → targets → (1) Agent
Agent (1) → processes → (N) Commands
Command (1) → produces → (N) TerminalOutput
Command (1) → generates → (N) TraceEvents
```

### Connection Relationships
```
Dashboard (1) ←→ (1) WebSocketConnection
Agent (1) ←→ (1) WebSocketConnection
WebSocketConnection (1) → has → (1) ConnectionMetadata
```

### Queue Relationships
```
MessageQueueItem (N) → waits for → (1) Agent
Dashboard (1) → creates → (N) MessageQueueItems
```

## Data Consistency Rules

1. **Command Uniqueness**: Each commandId must be globally unique
2. **Connection Integrity**: All connectionIds must reference active connections
3. **Cleanup on Disconnect**: Remove all command mappings when connection closes
4. **TTL Enforcement**: Expire command mappings after TTL expires
5. **Queue Limits**: Drop oldest low-priority messages when queue full
6. **Heartbeat Timeout**: Mark agent offline if heartbeat missing > 30 seconds

## Performance Considerations

- Command routing map: O(1) lookup by commandId
- Connection metadata: O(1) lookup by connectionId
- Message queue: O(log n) insertion by priority
- Cleanup operations: O(n) on disconnect, run async

## Migration Notes

No database schema changes required - all routing state is in-memory only. The existing database entities (Agent, Command, TerminalOutput) remain unchanged.