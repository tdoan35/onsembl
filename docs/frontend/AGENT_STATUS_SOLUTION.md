# Agent Status Staleness - Solution Implementation

## Problem Summary
Agents showing as "offline" in the frontend dashboard even though they're connected to the backend, AND agents showing as "online" when they've actually disconnected.

## Root Causes

1. **Message Delivery Failures**: `AGENT_CONNECTED` messages fail to reach dashboards that connect after agents
2. **No Client-Side Validation**: Frontend blindly trusts initial status without validating freshness
3. **No Fallback Mechanism**: Entirely dependent on WebSocket push updates
4. **No Bidirectional Sync**: Can't recover from incorrect status without page reload

## Solution Implemented

### 1. Client-Side Bidirectional Status Sync

Added automatic status synchronization in `frontend/src/app/(auth)/agents/page.tsx:66-99`:

```typescript
useEffect(() => {
  const HEARTBEAT_TIMEOUT = 90000; // 90 seconds - agent is offline if no ping
  const HEARTBEAT_FRESH = 60000;   // 60 seconds - agent is online if recent ping
  const CHECK_INTERVAL = 10000;    // Check every 10 seconds

  const stalenessCheckInterval = setInterval(() => {
    const now = Date.now();

    agents.forEach(agent => {
      if (!agent.lastPing) return; // Skip agents with no ping data

      const lastPingTime = new Date(agent.lastPing).getTime();
      const timeSinceLastPing = now - lastPingTime;

      // Case 1: Agent showing as online but heartbeat is stale → mark offline
      if (agent.status === 'online' && timeSinceLastPing > HEARTBEAT_TIMEOUT) {
        console.log(`[StalenessDetection] Agent ${agent.name} hasn't pinged in ${timeSinceLastPing}ms, marking as offline`);
        updateAgentStatus(agent.id, 'offline');
      }

      // Case 2: Agent showing as offline but heartbeat is fresh → mark online
      else if (agent.status === 'offline' && timeSinceLastPing < HEARTBEAT_FRESH) {
        console.log(`[StalenessDetection] Agent ${agent.name} has fresh heartbeat (${timeSinceLastPing}ms ago), marking as online`);
        updateAgentStatus(agent.id, 'online');
      }
    });
  }, CHECK_INTERVAL);

  return () => clearInterval(stalenessCheckInterval);
}, [agents, updateAgentStatus]);
```

**How it works:**
- Runs every 10 seconds
- **Bidirectional sync**:
  - ✅ Online agents with stale heartbeat (>90s) → marked offline
  - ✅ Offline agents with fresh heartbeat (<60s) → marked online
- Uses two thresholds to prevent flapping:
  - 90s timeout for marking offline (aligned with backend)
  - 60s freshness for marking online (more aggressive recovery)

**Benefits:**
- ✅ Catches both stale online agents AND fresh offline agents
- ✅ Works even if WebSocket push updates fail completely
- ✅ Self-healing - automatically recovers from sync issues
- ✅ No network calls required - pure client-side
- ✅ Prevents status "getting stuck" in wrong state
- ✅ Handles the case where agents connect before dashboard loads

## Testing

### Test Scenario 1: Agent Connects Before Dashboard
1. Start agent: `cd agent-wrapper && onsembl-agent start`
2. Wait for agent to connect
3. Open dashboard
4. **Expected**:
   - Agent may show as offline initially (if database status is stale)
   - Within 10-20 seconds, staleness detection sees fresh heartbeat and marks online

### Test Scenario 2: Agent Disconnects
1. Have agent connected and dashboard open
2. Kill agent process
3. **Expected**:
   - Backend should send AGENT_DISCONNECT
   - If that fails, staleness detection marks offline within 90-100 seconds

### Test Scenario 3: Stale Status Display (Online but Disconnected)
1. Agent shows as online but is actually disconnected
2. lastPing timestamp is >90s old
3. **Expected**: Within 10-20 seconds, staleness detection marks as offline

### Test Scenario 4: Stale Status Display (Offline but Connected)
1. Agent shows as offline but is actually connected and sending pings
2. lastPing timestamp is <60s old
3. **Expected**: Within 10-20 seconds, staleness detection marks as online

## Console Logs to Watch For

**Agent marked offline due to staleness:**
```
[StalenessDetection] Agent test-command-agent hasn't pinged in 95s, marking as offline
```

**Agent marked online due to fresh heartbeat:**
```
[StalenessDetection] Agent test-command-agent has fresh heartbeat (45s ago), marking as online
```

## Additional Improvements Needed (Future)

### Backend Improvements
1. **Periodic Status Broadcast**: Send AGENT_STATUS every 30s to all subscribed dashboards
   - Location: `backend/src/websocket/agent-handler.ts`
   - Add interval timer to broadcast current status

2. **Database Status Updates**: Ensure database is updated when agents connect/disconnect
   - Location: `backend/src/services/agent.service.ts`
   - Update status in DB on connect/disconnect events

3. **Subscription Improvements**: Ensure dashboard subscriptions are properly set up
   - Location: `backend/src/websocket/dashboard-handler.ts`
   - Verify '*' subscription works correctly

### Frontend Improvements
1. **Status Indicators**: Show "last seen" timestamp in agent cards
2. **Reconnection Alerts**: Notify user when agent reconnects after being offline
3. **Health Indicators**: Visual cue for staleness (yellow = no recent ping)

## Thresholds Explained

| Threshold | Value | Purpose |
|-----------|-------|---------|
| HEARTBEAT_FRESH | 60s | Agent with ping <60s ago is considered online |
| HEARTBEAT_TIMEOUT | 90s | Agent with ping >90s ago is considered offline |
| CHECK_INTERVAL | 10s | How often to evaluate all agent statuses |

**Why different thresholds?**
- Using 60s for "fresh" and 90s for "stale" creates a 30-second buffer zone
- Prevents rapid flapping between online/offline around the boundary
- Agent backend sends pings every 30s, so 60s = max 2 missed pings
- 90s timeout aligns with backend's heartbeat timeout

## Files Modified
- `frontend/src/app/(auth)/agents/page.tsx` - Added bidirectional status sync effect (lines 66-99)

## Related Documentation
- `docs/frontend/AGENT_STATUS_STALENESS_ROOT_CAUSE.md` - Root cause analysis
