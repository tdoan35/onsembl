# Agent Status Staleness - Complete Fix

## Problem Summary
Agents showing incorrect status in the frontend dashboard:
1. **Offline when actually online**: Agents connect before dashboard loads, AGENT_CONNECTED messages fail to deliver
2. **Online when actually offline**: Agents disconnect but database retains stale `last_ping` timestamp

## Root Causes Identified

### Issue 1: Message Delivery Failures
- `AGENT_CONNECTED` messages from backend fail to reach dashboards that connect after agents
- Messages retry 3 times then are dropped
- Frontend has no fallback mechanism to recover from missed messages

### Issue 2: Stale Database Timestamps
- When agents disconnect, backend only updates `status` to 'OFFLINE' and sets `disconnectedAt`
- **Critical Bug**: `last_ping` timestamp is NOT cleared on disconnect
- Dashboard loads agent data from database with stale `last_ping` values
- Frontend staleness detection sees offline agents with "fresh" heartbeats and marks them online

## Complete Solution Implemented

### Backend Fix: Clear Heartbeat on Disconnect

**File**: `backend/src/websocket/agent-handler.ts:878-883`

```typescript
// Update agent status to OFFLINE and clear last_ping to prevent stale status
await this.services.agentService.updateAgent(connection.agentId, {
  status: 'OFFLINE',
  disconnectedAt: new Date(),
  last_ping: null  // Clear heartbeat timestamp on disconnect
});
```

**Why this works:**
- Disconnected agents now have `null` for `last_ping`
- Frontend can reliably distinguish between connected and disconnected agents
- No more false positives from stale heartbeat timestamps

### Frontend Fix: Defensive Staleness Detection

**File**: `frontend/src/app/(auth)/agents/page.tsx:66-114`

```typescript
useEffect(() => {
  const HEARTBEAT_TIMEOUT = 90000; // 90 seconds - agent is offline if no ping
  const HEARTBEAT_FRESH = 60000;   // 60 seconds - agent is online if recent ping
  const CHECK_INTERVAL = 10000;    // Check every 10 seconds
  const CLOCK_SKEW_TOLERANCE = 5000; // 5 seconds tolerance for clock differences

  const stalenessCheckInterval = setInterval(() => {
    const now = Date.now();

    agents.forEach(agent => {
      // Skip agents with no ping data (disconnected agents have null lastPing)
      if (!agent.lastPing) {
        // If agent shows as online but has no lastPing, mark offline
        if (agent.status === 'online') {
          console.log(`[StalenessDetection] Agent ${agent.name || agent.id} shows online but has no lastPing, marking as offline`);
          updateAgentStatus(agent.id, 'offline');
        }
        return;
      }

      const lastPingTime = new Date(agent.lastPing).getTime();
      const timeSinceLastPing = now - lastPingTime;

      // Detect clock skew: lastPing shouldn't be in the future
      if (timeSinceLastPing < -CLOCK_SKEW_TOLERANCE) {
        console.warn(`[StalenessDetection] Agent ${agent.name || agent.id} has lastPing in the future (clock skew detected), skipping`);
        return;
      }

      // Case 1: Agent showing as online but heartbeat is stale → mark offline
      if (agent.status === 'online' && timeSinceLastPing > HEARTBEAT_TIMEOUT) {
        console.log(`[StalenessDetection] Agent ${agent.name || agent.id} hasn't pinged in ${Math.round(timeSinceLastPing / 1000)}s, marking as offline`);
        updateAgentStatus(agent.id, 'offline');
      }

      // Case 2: Agent showing as offline but heartbeat is fresh → mark online
      // Note: With the backend fix, disconnected agents will have null lastPing,
      // so this should only trigger for agents that are actually connected but show as offline
      else if (agent.status === 'offline' && timeSinceLastPing < HEARTBEAT_FRESH && timeSinceLastPing >= 0) {
        console.log(`[StalenessDetection] Agent ${agent.name || agent.id} has fresh heartbeat (${Math.round(timeSinceLastPing / 1000)}s ago), marking as online`);
        updateAgentStatus(agent.id, 'online');
      }
    });
  }, CHECK_INTERVAL);

  return () => clearInterval(stalenessCheckInterval);
}, [agents, updateAgentStatus]);
```

**Improvements:**
1. **Null check with action**: Agents without `lastPing` are properly handled
   - If showing online with no `lastPing` → mark offline
   - If showing offline with no `lastPing` → skip (correct state)
2. **Clock skew protection**: Detects timestamps in the future
3. **Defensive checks**: Ensures `timeSinceLastPing >= 0` before marking online
4. **Better logging**: Clear console messages for debugging

## How the Two Fixes Work Together

1. **On Agent Connect**:
   - Backend updates `last_ping` via PONG handler (every 30s)
   - Database has fresh `last_ping` timestamp
   - Frontend sees fresh heartbeat and confirms online status

2. **On Agent Disconnect**:
   - Backend clears `last_ping` to `null` ✅ NEW
   - Database no longer has stale timestamp
   - Frontend sees `null` lastPing and keeps/marks as offline

3. **On Dashboard Load**:
   - Fetches agents from database
   - **Disconnected agents**: Have `null` lastPing → frontend keeps them offline
   - **Connected agents**: Have fresh lastPing → frontend marks them online within 10-20s

4. **During Operation**:
   - Staleness detection runs every 10 seconds
   - Self-heals any status mismatches
   - Handles both false positives and false negatives

## Testing Scenarios

### Scenario 1: Agent Connects Before Dashboard
**Steps:**
1. Start backend and agent: `cd backend && npm run dev` & `cd agent-wrapper && onsembl-agent start`
2. Wait for agent to connect (check backend logs)
3. Open dashboard at `http://localhost:3000/agents`

**Expected Behavior:**
- Agent may show as offline initially (if database status is stale)
- Within 10-20 seconds, staleness detection sees fresh `lastPing` and marks online
- Console shows: `[StalenessDetection] Agent X has fresh heartbeat (Xs ago), marking as online`

### Scenario 2: Agent Disconnects While Dashboard Open
**Steps:**
1. Have agent connected and dashboard open showing agent as online
2. Kill agent process (Ctrl+C)
3. Wait for disconnect to propagate

**Expected Behavior:**
- Backend sends `AGENT_DISCONNECT` message (immediate if delivered)
- Backend clears `last_ping` to `null` ✅
- Frontend marks offline immediately (if message delivered)
- If message missed, staleness detection marks offline within 90-100 seconds

### Scenario 3: Refresh Dashboard with Disconnected Agents
**Steps:**
1. Have some disconnected agents in database with stale `last_ping` (from before the fix)
2. Refresh dashboard page

**Expected Behavior:**
- ❌ **OLD BUG**: Disconnected agents would incorrectly show as online
- ✅ **NOW FIXED**:
  - Disconnected agents have `null` lastPing (after reconnect cycle with new backend)
  - Frontend sees `null` lastPing and keeps them offline
  - No false positives

### Scenario 4: Multiple Agents Mixed State
**Steps:**
1. Start 3 agents
2. Keep 1 running, disconnect 2
3. Refresh dashboard

**Expected Behavior:**
- Running agent: Shows online (fresh lastPing)
- Disconnected agents: Show offline (null lastPing)
- All statuses correct within 10-20 seconds

## Console Logs to Watch For

**Agent marked offline (null lastPing):**
```
[StalenessDetection] Agent test-agent shows online but has no lastPing, marking as offline
```

**Agent marked offline (stale heartbeat):**
```
[StalenessDetection] Agent test-agent hasn't pinged in 95s, marking as offline
```

**Agent marked online (fresh heartbeat):**
```
[StalenessDetection] Agent test-agent has fresh heartbeat (45s ago), marking as online
```

**Clock skew detected:**
```
[StalenessDetection] Agent test-agent has lastPing in the future (clock skew detected), skipping
```

## Migration Notes

### For Existing Databases
Agents that disconnected before this fix will have stale `last_ping` timestamps in the database. There are two ways to handle this:

**Option 1: Natural Migration (Recommended)**
- When agents reconnect and then disconnect again, `last_ping` will be properly cleared
- Over time, all agents will naturally migrate to the new behavior

**Option 2: Manual Database Cleanup**
```sql
-- Clear last_ping for all offline agents
UPDATE agents
SET last_ping = NULL
WHERE status = 'OFFLINE' OR status = 'offline';
```

## Files Modified

### Backend
- `backend/src/websocket/agent-handler.ts:878-883` - Clear `last_ping` on disconnect

### Frontend
- `frontend/src/app/(auth)/agents/page.tsx:66-114` - Enhanced staleness detection with:
  - Null lastPing handling
  - Clock skew protection
  - Defensive timestamp validation

## Related Documentation
- `docs/frontend/AGENT_STATUS_STALENESS_ROOT_CAUSE.md` - Original root cause analysis
- `docs/frontend/AGENT_STATUS_SOLUTION.md` - Initial bidirectional sync solution (partial fix)
- `docs/frontend/AGENT_STATUS_COMPLETE_FIX.md` - This document (complete fix)

## Summary

The agent status issue required **two fixes**:

1. **Backend**: Clear `last_ping` on disconnect to prevent stale timestamps
2. **Frontend**: Defensive staleness detection with null checks and clock skew protection

Together, these fixes ensure:
- ✅ No false positives (offline agents never show as online)
- ✅ No false negatives (online agents always detected within 10-20s)
- ✅ Self-healing status sync regardless of WebSocket message delivery
- ✅ Robust against clock skew and edge cases
