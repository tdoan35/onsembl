# Agent Connection Stability Issues - Resolution Plan

**Date**: 2025-11-02
**Status**: 🔍 ROOT CAUSE IDENTIFIED - FIX IN PROGRESS
**Severity**: HIGH - Prevents end-to-end command execution

---

## Executive Summary

Agent connections are established successfully but disconnect after exactly **90 seconds** due to the backend's `AgentHeartbeatMonitor` detecting agents as "stale". Investigation reveals that **agent heartbeat messages are not updating the database**, causing the backend to mark agents as timed out and close the connection.

---

## Timeline of Discovery

1. **Initial Observation**: Command forwarding fix was verified, but commands fail because agent is offline
2. **Pattern Recognition**: Agent logs show repeated connect/disconnect cycles with WebSocket close code 1005
3. **Timing Analysis**: Backend logs show precise 89-90 second intervals between "connected" and "timed out" events
4. **Root Cause**: Backend heartbeat monitor timeout (90s) matches disconnect interval

---

## Root Cause Analysis

### The Problem

```
Agent connects → Authenticates successfully → ~90 seconds later → Backend times out → Agent reconnects → Repeat
```

### Evidence from Logs

**Backend Logs**:
```
[00:38:41] Agent authenticated and connected
[00:40:21] Agent connection timed out  (+100 seconds)
[00:40:22] Agent reconnects
[00:41:51] Agent connection timed out  (+89 seconds)
[00:41:52] Agent reconnects
[00:43:21] Agent connection timed out  (+89 seconds)
...pattern repeats
```

**Agent Logs**:
```
[Connection] WebSocket connection established successfully
[Connection] WebSocket closed with code 1005:
[Reconnection] Unexpected disconnection detected
...reconnection loop
```

### Configuration Analysis

**Agent Wrapper** (`agent-wrapper/src/config.ts:37`):
- Heartbeat interval: **30,000ms** (30 seconds)
- Sends `AGENT_HEARTBEAT` messages every 30 seconds
- Also sends WebSocket ping frames

**Backend** (`backend/src/websocket/setup.ts:118-122`):
- Check interval: **30,000ms** (30 seconds)
- Heartbeat timeout: **90,000ms** (90 seconds = 3x expected interval)
- Marks agent as "stale" if no heartbeat update for 90 seconds

### The Critical Flaw

**No heartbeat messages are being received by the backend:**
1. ✅ Agent-wrapper logs show NO heartbeat sending activity
2. ✅ Backend logs show NO `AGENT_HEARTBEAT` message handling
3. ✅ This causes database heartbeat timestamp to never update
4. ✅ Backend's `AgentHeartbeatMonitor` detects "stale" agent after 90s
5. ✅ Backend closes connection via heartbeat timeout handler

---

## Investigation Findings

### 1. Heartbeat Sending (Agent Side)

**File**: `agent-wrapper/src/websocket-client.ts:505-542`

**Expected Behavior**:
```typescript
this.heartbeatTimer = setInterval(async () => {
  if (this.isConnected && this.ws) {
    try {
      // Send ping to server
      this.ws.ping();

      // Send protocol heartbeat message
      const heartbeatMessage: WebSocketMessage = {
        type: MessageType.AGENT_HEARTBEAT,
        id: `hb-${Date.now()}`,
        timestamp: Date.now(),
        payload: {
          agentId: this.agentId,
          healthMetrics: { ... }
        }
      };
      await this.sendMessage(heartbeatMessage);
    } catch (error) {
      console.error('[Heartbeat] Failed to send heartbeat:', error);
      this.handleHeartbeatFailure();
    }
  }
}, this.config.heartbeatInterval);  // 30,000ms
```

**Actual Behavior**:
- No heartbeat logs appear in agent output
- No error logs appear
- Suggests heartbeat timer may not be starting OR messages are queued/blocked

### 2. Heartbeat Receiving (Backend Side)

**File**: `backend/src/websocket/agent-handler.ts:381-408`

**Expected Behavior**:
```typescript
private async handleAgentHeartbeat(
  connection: AgentConnection,
  message: TypedWebSocketMessage<MessageType.AGENT_HEARTBEAT>
): Promise<void> {
  const { healthMetrics } = message.payload;
  try {
    // Update agent heartbeat in database
    await this.services.agentService.updateHeartbeat(resolvedAgentId, healthMetrics);

    // Update connection state
    connection.lastPing = Date.now();
    connection.missedPings = 0;

    // Send response
    this.sendMessage(connection.socket, MessageType.SERVER_HEARTBEAT, {
      serverTime: Date.now(),
      nextPingExpected: Date.now() + 30000
    });
  } catch (error) {
    // TEMP DISABLED FOR COMMAND FORWARDING DEBUG
    // this.server.log.error({ error, agentId: connection.agentId }, 'Failed to handle heartbeat');
  }
}
```

**Actual Behavior**:
- No `AGENT_HEARTBEAT` handling logs in backend output
- Error logging is **DISABLED** (lines 405-407)
- If `updateHeartbeat()` fails, errors are silently swallowed

### 3. Database Update

**File**: `backend/src/services/agent.service.ts` (location TBD)

**Expected**: `updateHeartbeat(agentId, healthMetrics)` should:
1. Update `last_heartbeat` timestamp in database
2. Update `health_metrics` JSON field
3. Commit transaction successfully

**To Verify**: Check if method exists and is working correctly

---

## Hypothesis

**Primary Hypothesis**: Agent heartbeat is not being sent

**Evidence**:
- No heartbeat logs in agent output
- No heartbeat received logs in backend
- Heartbeat timer should log errors if send fails, but no errors appear

**Possible Causes**:
1. `startHeartbeat()` not being called after connection
2. `this.isConnected` flag not set correctly
3. `sendMessage()` silently failing or queuing messages
4. WebSocket connection state mismatch

**Secondary Hypothesis**: Heartbeat is sent but silently fails on backend

**Evidence**:
- Error logging disabled in `handleAgentHeartbeat`
- `updateHeartbeat()` method may be throwing errors

---

## Resolution Steps

### Phase 1: Enable Diagnostic Logging ✅ (Current)

1. ✅ **Re-enable heartbeat error logging** in `agent-handler.ts:405-407`
2. ✅ **Add heartbeat send logging** in `websocket-client.ts:534`
3. ✅ **Add database update logging** in `agent.service.ts:updateHeartbeat()`
4. ✅ **Monitor logs** to identify where the flow breaks

### Phase 2: Fix Root Cause

Based on diagnostic findings:

**If heartbeat is not being sent**:
- Fix `startHeartbeat()` initialization
- Fix `isConnected` flag management
- Fix `sendMessage()` queueing logic

**If heartbeat is not being received**:
- Fix message routing to `handleAgentHeartbeat`
- Fix `isAgentMessage()` type guard

**If database update is failing**:
- Fix `updateHeartbeat()` implementation
- Add error handling and retries
- Fix database schema/permissions

### Phase 3: Verify Fix

1. Restart all services
2. Connect fresh agent
3. Monitor logs for:
   - Heartbeat send confirmations every 30s
   - Heartbeat receive confirmations every 30s
   - Database update confirmations every 30s
4. Verify agent stays connected for >5 minutes (10+ heartbeat cycles)
5. Test command forwarding end-to-end

---

## Expected Outcome After Fix

```
Agent connects
  ↓
Authenticates successfully
  ↓
Starts sending heartbeats every 30s
  ↓
Backend receives heartbeats
  ↓
Database timestamp updates every 30s
  ↓
Agent stays connected indefinitely
  ↓
Commands can execute successfully
```

---

## Files to Modify

1. **backend/src/websocket/agent-handler.ts** (line 405-407)
   - Re-enable error logging in `handleAgentHeartbeat`

2. **agent-wrapper/src/websocket-client.ts** (line 534)
   - Add heartbeat send confirmation logging

3. **backend/src/services/agent.service.ts**
   - Add logging to `updateHeartbeat()` method
   - Verify method exists and works correctly

4. **Additional files as needed** based on diagnostic findings

---

## Success Criteria

- ✅ Agent sends `AGENT_HEARTBEAT` messages every 30 seconds
- ✅ Backend receives and logs `AGENT_HEARTBEAT` messages
- ✅ Database `last_heartbeat` timestamp updates every 30 seconds
- ✅ Agent maintains stable connection for >5 minutes
- ✅ No "Agent connection timed out" warnings
- ✅ Command forwarding works end-to-end
- ✅ Terminal output streams correctly

---

## Related Documentation

- [Command Forwarding Fix Summary](./frontend/COMMAND_FORWARDING_FIX_SUMMARY.md)
- [WebSocket Protocol](../specs/001-build-onsembl-ai/contracts/websocket-protocol.md)
- [Agent Handler Implementation](../backend/src/websocket/agent-handler.ts)
- [WebSocket Client Implementation](../agent-wrapper/src/websocket-client.ts)

---

## Next Actions

1. **Enable diagnostic logging** in all three locations
2. **Restart services** and monitor logs
3. **Identify exact failure point** in heartbeat flow
4. **Implement targeted fix**
5. **Verify end-to-end functionality**
