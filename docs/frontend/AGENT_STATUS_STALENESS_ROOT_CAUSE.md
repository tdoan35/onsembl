# Agent Status Staleness - Root Cause Analysis

## Issue Description
Agents that are actually connected to the backend are showing as "offline" in the frontend dashboard after a while.

## Root Cause

### 1. **Message Delivery Failure**
From backend logs:
```
[CMD-FWD] Message delivery failed after max attempts
messageType: "AGENT_CONNECTED"
targetType: "dashboard"
```

The backend is trying to broadcast `AGENT_CONNECTED` messages to dashboards, but they're failing because:
- No dashboards are connected when agents first connect
- Messages retry 3 times and then are dropped

### 2. **Initial Status from Database**
When a dashboard connects:
- `sendInitialData()` is called (dashboard-handler.ts:694)
- It fetches agents from the database (line 703)
- It checks live connections from connection pool (line 761)
- It compares and sends correct status (line 778)

However, the logic at line 778 has an issue:
```typescript
status: isConnected ? 'connected' : (agent.status || 'disconnected')
```

If `isConnected` is true, it sends 'connected', but the database status might still be stale.

### 3. **Live Connection Check Issue**
The key problem is in dashboard-handler.ts:761-768:
```typescript
const liveAgentConnections = this.dependencies.connectionPool.getConnectionsByType('agent');
const liveAgentIds = new Set<string>();

for (const [_, conn] of liveAgentConnections) {
  if (conn.agentId && conn.isAuthenticated) {
    liveAgentIds.add(conn.agentId);
  }
}
```

This should correctly identify connected agents. BUT the frontend may be displaying stale status because:

### 4. **No Ongoing Status Updates**
Looking at the frontend code:
- `agent-websocket-integration.ts:164` listens for `AGENT_CONNECTED` messages
- `agent-websocket-integration.ts:193` handles `DASHBOARD_CONNECTED` to get initial list
- **BUT** there's no periodic polling or status refresh mechanism

The issue is that the initial `DASHBOARD_CONNECTED` payload shows agents correctly, but:
1. If the WebSocket connection drops temporarily
2. If an agent reconnects while dashboard is viewing
3. If there's any sync issue

The status becomes stale.

### 5. **Subscription and Broadcast Issue**
Looking at message-router.ts:236-248, `broadcastAgentStatus` only sends to dashboards that are:
- Of type 'dashboard'
- Authenticated
- Subscribed to the specific agent

The subscription check (line 669-674) looks for:
```typescript
connection.subscriptions.agents.has('*') || connection.subscriptions.agents.has(agentId)
```

If subscriptions aren't set up correctly, status updates won't reach the dashboard.

## The Actual Problem

After agents connect, when `AGENT_CONNECTED` messages fail to deliver to dashboards (because no dashboards are connected yet), subsequent reconnections or status changes may not update the frontend because:

1. **Database status is not being updated** when agents connect/disconnect in real-time
2. **Frontend relies entirely on WebSocket push** - no fallback polling
3. **No client-side staleness detection** - lastPing timestamps aren't checked

## Solution

### Short-term Fix
1. **Add periodic status polling** in the frontend as a fallback
2. **Add client-side staleness detection** - mark agents offline if lastPing > 90 seconds old
3. **Ensure database updates** when agents connect/disconnect

### Recommended Implementation

1. **Frontend: Add staleness detection** (agents/page.tsx)
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    const now = Date.now();
    agents.forEach(agent => {
      const lastPing = new Date(agent.lastPing).getTime();
      if (now - lastPing > 90000 && agent.status === 'online') {
        // Mark as offline
        updateAgent(agent.id, { status: 'offline' });
      }
    });
  }, 10000); // Check every 10 seconds

  return () => clearInterval(interval);
}, [agents]);
```

2. **Backend: Ensure real-time database updates** when agents connect/disconnect

3. **Backend: Send periodic AGENT_STATUS heartbeats** every 30 seconds to all subscribed dashboards

## Verification

The backend logs show agents ARE connected:
```
Agent connected
  agentId: "5b63a9f3-bf4f-49dd-b39f-4b0646f9da31"
  connectionId: "agent-1762061383764-rjtqksr02"
  agentName: "test-command-agent"
```

But `AGENT_CONNECTED` broadcast fails:
```
[CMD-FWD] Message delivery failed after max attempts
```

This confirms the issue is with message delivery and/or frontend status update handling.

## Files Involved
- `backend/src/websocket/dashboard-handler.ts` (sendInitialData)
- `backend/src/websocket/message-router.ts` (broadcastAgentStatus)
- `frontend/src/stores/agent-websocket-integration.ts` (status handling)
- `frontend/src/app/(auth)/agents/page.tsx` (status display)
- `frontend/src/services/websocket.service.ts` (message handling)
