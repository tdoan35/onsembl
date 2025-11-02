# Agent Status Reporting Issue - RESOLVED

## Problem
Agents show as "offline" in the frontend even when they are actively connected and sending terminal output via WebSocket.

**STATUS**: ✅ FIXED

## Root Cause
**File:** `backend/src/websocket/dashboard-handler.ts:760-772`

When sending AGENT_STATUS messages to dashboards, the code reads status directly from the **database**:

```typescript
agents.forEach(agent => {
  if (connection.subscriptions.agents.has(agent.id) || connection.subscriptions.agents.has('*')) {
    this.sendMessage(connection.socket, MessageType.AGENT_STATUS, {
      agentId: agent.id,
      status: agent.status,  // <-- Reading stale data from database!
      activityState: agent.activityState || 'IDLE',
      healthMetrics: agent.healthMetrics,
      currentCommand: agent.currentCommand,
      queuedCommands: agent.queuedCommands || 0
    });
  }
});
```

### Why This Fails
1. Database `agent.status` is only updated when agents explicitly update their status
2. WebSocket connections don't automatically update the database status
3. Agents that connect via WebSocket remain marked as "disconnected" or "offline" in the database
4. Dashboard receives stale status from database, showing agent as offline
5. Frontend hides terminal output because agent appears offline

### Evidence
**Browser Console:**
```
[WebSocketStoreBridge] 📡 AGENT_STATUS received: {
  agentId: de576ef9-b21b-4831-9570-c4fddeaec0b0,
  backendStatus: disconnected,  // <-- From database
  mappedStatus: offline
}
```

**Yet terminal output IS being received:**
```
[TerminalStore] TERMINAL_STREAM received: {...}
[DEBUG] Flushed 44 terminal lines
```

This proves the agent IS connected via WebSocket, but the status reporting doesn't reflect this.

## Solution

Use the **ConnectionPool** to determine live connection status instead of relying solely on database values.

### Implementation

**File:** `backend/src/websocket/dashboard-handler.ts`

**Modify `sendInitialData` method** (around line 760):

```typescript
// Get live agent connections from connection pool
const liveAgentConnections = this.dependencies.connectionPool.getConnectionsByType('agent');
const liveAgentIds = new Set<string>();

for (const [connectionId, conn] of liveAgentConnections) {
  if (conn.agentId && conn.isAuthenticated) {
    liveAgentIds.add(conn.agentId);
  }
}

// Step 4: Send agent statuses with live connection data
agents.forEach(agent => {
  if (connection.subscriptions.agents.has(agent.id) || connection.subscriptions.agents.has('*')) {
    // Check if agent has an active WebSocket connection
    const isConnected = liveAgentIds.has(agent.id);

    this.sendMessage(connection.socket, MessageType.AGENT_STATUS, {
      agentId: agent.id,
      status: isConnected ? 'connected' : (agent.status || 'disconnected'),  // Use live status!
      activityState: agent.activityState || 'IDLE',
      healthMetrics: agent.healthMetrics,
      currentCommand: agent.currentCommand,
      queuedCommands: agent.queuedCommands || 0
    });
  }
});
```

### Same Fix Applied To
**File:** `backend/src/websocket/dashboard-handler.ts:847-871` ✅

The `sendSubscriptionData` method had the same problem and has been fixed:

```typescript
case 'agent':
  if (id) {
    const agent = await this.services.agentService.getAgent(id);
    if (agent) {
      // Check if agent has an active WebSocket connection
      const liveAgents = this.dependencies.connectionPool.getConnectionsByType('agent');
      let isConnected = false;
      for (const [_, conn] of liveAgents) {
        if (conn.agentId === id && conn.isAuthenticated) {
          isConnected = true;
          break;
        }
      }

      this.sendMessage(connection.socket, MessageType.AGENT_STATUS, {
        agentId: agent.id,
        status: isConnected ? 'connected' : (agent.status || 'disconnected'),
        activityState: agent.activityState || 'IDLE',
        healthMetrics: agent.healthMetrics,
        currentCommand: agent.currentCommand,
        queuedCommands: agent.queuedCommands || 0
      });
    }
  }
  break;
```

## Benefits

1. **Accurate Status**: Frontend shows correct real-time connection state
2. **Terminal Output Visible**: When agent is connected, terminal viewer shows output instead of "offline" warning
3. **Better UX**: Users can see when agents are truly online vs disconnected
4. **Reliability**: Status reflects actual WebSocket connection state, not stale database data

## Testing

After fix:
1. Start an agent
2. Open frontend /agents page
3. Agent should show as "online" or "connected"
4. Click agent to view terminal
5. Terminal output should be visible (not hidden by offline warning)
6. Disconnect agent
7. Agent status should change to "offline"

## Related Files

- `backend/src/websocket/connection-pool.ts` - Tracks live WebSocket connections
- `backend/src/websocket/dashboard-handler.ts` - Sends AGENT_STATUS messages (FIXED ✅)
- `frontend/src/services/websocket-store-bridge.ts` - Receives and processes AGENT_STATUS messages

## Implementation Complete

Both locations in `dashboard-handler.ts` have been fixed:
1. `sendInitialData` method (lines 760-785) - Checks connection pool when sending initial agent statuses
2. `sendSubscriptionData` method (lines 847-871) - Checks connection pool when sending subscription updates

The backend will now report accurate agent status based on live WebSocket connections rather than stale database values.
