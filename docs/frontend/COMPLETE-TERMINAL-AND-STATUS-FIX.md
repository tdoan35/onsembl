# Complete Terminal Output and Agent Status Fix

## Overview
This document summarizes the complete resolution of two related issues with agent terminal output mirroring and status reporting in the Onsembl.ai dashboard.

## Status: ✅ BOTH ISSUES RESOLVED

---

## Issue 1: Terminal Output Not Reaching Frontend

### Problem
Agent CLI output (dotenv messages, ASCII banner, prompts) was not appearing in the frontend terminal viewer, even though agents were connected and sending output.

### Root Causes

#### Cause 1: Agent ID Mismatch (Agent Wrapper)
**Location:** `agent-wrapper/src/websocket-client.ts:434-445`

- Agent connected with CLI-generated ID: `mock-mhfjh3z0-vkvw618fo`
- Backend resolved to database UUID: `de576ef9-b21b-4831-9570-c4fddeaec0b0`
- Backend sent resolved UUID in ACK message
- Agent ignored the ACK and continued using CLI ID
- Backend normalization failed: `payload.commandId !== resolvedAgentId`

**Fix Applied:**
Modified ACK handler to update agent ID with backend's resolved UUID:

```typescript
case MessageType.ACK:
  // Server acknowledged a prior message
  // If this is an AGENT_CONNECT ACK, update our agentId with the resolved UUID
  const ackPayload = message.payload as any;
  if (ackPayload?.agentId && ackPayload.agentId !== this.agentId) {
    this.logger.info({
      originalId: this.agentId,
      resolvedId: ackPayload.agentId
    }, '[Connection] Server resolved agent ID - updating to use database UUID');
    this.agentId = ackPayload.agentId;
  }
  break;
```

#### Cause 2: Dashboard Subscription Mismatch (Frontend)
**Location:** `frontend/src/services/websocket-store-bridge.ts:304-305`

- Frontend was sending incorrect subscription format:
  ```typescript
  {
    terminal: { all: true },  // WRONG: singular, object value
    traces: { all: true }
  }
  ```
- Backend expected:
  ```typescript
  {
    terminals: true,  // CORRECT: plural, boolean value
    traces: true
  }
  ```

**Fix Applied:**
Changed subscription format to match backend expectations:

```typescript
webSocketService.initializeDashboard({
  agents: { all: true },
  commands: { all: true },
  terminals: true,  // Fixed: plural, boolean
  traces: true      // Fixed: boolean
});
```

### Verification
After fixes, terminal output successfully flows:
- Backend logs show: `[CMD-FWD] Received terminal output from agent`
- Frontend console shows: `[TerminalStore] TERMINAL_STREAM received:`
- Frontend console shows: `[DEBUG] Flushed 44 terminal lines`

---

## Issue 2: Agent Status Reporting Shows "Offline" Despite Active Connection

### Problem
Agents showed as "offline" in the frontend even when they were actively connected and sending terminal output via WebSocket.

### Root Cause
**Locations:**
- `backend/src/websocket/dashboard-handler.ts:760-785` (sendInitialData method)
- `backend/src/websocket/dashboard-handler.ts:847-871` (sendSubscriptionData method)

When sending AGENT_STATUS messages to dashboards, the code read status directly from the database:
- Database `agent.status` is only updated when agents explicitly update their status
- WebSocket connections don't automatically update the database status
- Agents connecting via WebSocket remain marked as "disconnected" in the database
- Dashboard receives stale status from database
- Frontend hides terminal output because agent appears offline

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

### Fix Applied

Both locations now check the connection pool for live WebSocket connections before reporting status.

#### Fix 1: sendInitialData Method (lines 760-785)

**Before:**
```typescript
agents.forEach(agent => {
  if (connection.subscriptions.agents.has(agent.id) || connection.subscriptions.agents.has('*')) {
    this.sendMessage(connection.socket, MessageType.AGENT_STATUS, {
      agentId: agent.id,
      status: agent.status,  // <-- Reading stale database value!
      activityState: agent.activityState || 'IDLE',
      healthMetrics: agent.healthMetrics,
      currentCommand: agent.currentCommand,
      queuedCommands: agent.queuedCommands || 0
    });
  }
});
```

**After:**
```typescript
// Get live agent connections from connection pool to determine actual connection status
const liveAgentConnections = this.dependencies.connectionPool.getConnectionsByType('agent');
const liveAgentIds = new Set<string>();

for (const [_, conn] of liveAgentConnections) {
  if (conn.agentId && conn.isAuthenticated) {
    liveAgentIds.add(conn.agentId);
  }
}

agents.forEach(agent => {
  if (connection.subscriptions.agents.has(agent.id) || connection.subscriptions.agents.has('*')) {
    // Check if agent has an active WebSocket connection
    const isConnected = liveAgentIds.has(agent.id);

    this.sendMessage(connection.socket, MessageType.AGENT_STATUS, {
      agentId: agent.id,
      status: isConnected ? 'connected' : (agent.status || 'disconnected'),  // <-- Using live status!
      activityState: agent.activityState || 'IDLE',
      healthMetrics: agent.healthMetrics,
      currentCommand: agent.currentCommand,
      queuedCommands: agent.queuedCommands || 0
    });
  }
});
```

#### Fix 2: sendSubscriptionData Method (lines 847-871)

**Before:**
```typescript
case 'agent':
  if (id) {
    const agent = await this.services.agentService.getAgent(id);
    if (agent) {
      this.sendMessage(connection.socket, MessageType.AGENT_STATUS, {
        agentId: agent.id,
        status: agent.status,  // <-- Reading stale database value!
        activityState: agent.activityState || 'IDLE',
        healthMetrics: agent.healthMetrics,
        currentCommand: agent.currentCommand,
        queuedCommands: agent.queuedCommands || 0
      });
    }
  }
  break;
```

**After:**
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
        status: isConnected ? 'connected' : (agent.status || 'disconnected'),  // <-- Using live status!
        activityState: agent.activityState || 'IDLE',
        healthMetrics: agent.healthMetrics,
        currentCommand: agent.currentCommand,
        queuedCommands: agent.queuedCommands || 0
      });
    }
  }
  break;
```

---

## Complete Message Flow (After All Fixes)

1. **Agent starts** with CLI ID: `mock-mhhcvdx2-uig6j2pcb`
2. **Agent connects** to backend WebSocket
3. **Backend resolves** CLI ID to database UUID: `de576ef9-b21b-4831-9570-c4fddeaec0b0`
4. **Backend sends ACK** with resolved UUID
5. **Agent receives ACK** and updates `this.agentId` to UUID ✅
6. **Agent sends TERMINAL_OUTPUT** with UUID as `commandId`
7. **Backend normalizes** to `agent-session-de576ef9-b21b-4831-9570-c4fddeaec0b0` ✅
8. **Backend checks** dashboard subscription: `terminals === true` ✅
9. **Backend routes** TERMINAL_STREAM to dashboard
10. **Backend checks** connection pool for agent status ✅
11. **Backend sends** AGENT_STATUS with `status: 'connected'` ✅
12. **Frontend receives** TERMINAL_STREAM messages ✅
13. **Frontend receives** AGENT_STATUS with `mappedStatus: 'online'` ✅
14. **Frontend stores** output in terminal session
15. **UI displays** terminal output to user (no "offline" warning) ✅

---

## Files Modified

### Terminal Output Mirroring
1. `agent-wrapper/src/websocket-client.ts` (lines 434-445) - Fixed in previous session
2. `frontend/src/services/websocket-store-bridge.ts` (lines 304-305) - Fixed subscription format

### Agent Status Reporting
1. `backend/src/websocket/dashboard-handler.ts` (lines 760-785) - Fixed sendInitialData method
2. `backend/src/websocket/dashboard-handler.ts` (lines 847-871) - Fixed sendSubscriptionData method

---

## Benefits

### Terminal Output
1. **Complete Output Mirroring**: All agent CLI output (dotenv messages, ASCII banners, prompts) appears in frontend
2. **Correct ID Resolution**: Agent and backend agree on UUID for all communication
3. **Proper Routing**: TERMINAL_STREAM messages correctly routed to subscribed dashboards

### Agent Status
1. **Accurate Status**: Frontend shows correct real-time connection state
2. **Terminal Output Visible**: When agent is connected, terminal viewer shows output instead of "offline" warning
3. **Better UX**: Users can see when agents are truly online vs disconnected
4. **Reliability**: Status reflects actual WebSocket connection state, not stale database data

---

## Testing

After both fixes:
1. Start an agent
2. Open frontend /agents page
3. Agent should show as "online" or "connected" ✅
4. Click agent to view terminal
5. Terminal output should be visible (including dotenv messages, ASCII banner, prompts) ✅
6. No "Agent Offline" warning should appear ✅
7. Disconnect agent
8. Agent status should change to "offline" ✅

---

## Related Documentation

- `docs/frontend/TERMINAL_OUTPUT_FIXES_COMPLETE.md` - Terminal output mirroring fixes
- `docs/frontend/AGENT_STATUS_REPORTING_ISSUE.md` - Agent status reporting fix
- `backend/src/websocket/connection-pool.ts` - Tracks live WebSocket connections
- `backend/src/websocket/dashboard-handler.ts` - Sends AGENT_STATUS messages
- `frontend/src/services/websocket-store-bridge.ts` - Receives and processes messages

---

## Date Completed
2025-11-02
