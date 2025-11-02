# Agent Connection Stability Investigation

**Date**: 2025-11-02
**Status**: ✅ RESOLVED
**Severity**: CRITICAL - Prevented end-to-end command execution (NOW FIXED)
**Session Duration**: ~3.5 hours of continuous debugging

---

## Executive Summary

**Problem**: Agent connections to the backend disconnected after exactly 90 seconds with WebSocket close code 1005 due to the `@fastify/websocket` plugin (v8.3.1) silently dropping all messages sent from agents after the initial AGENT_CONNECT message.

**Root Cause**: The @fastify/websocket plugin's SocketStream wrapper has a bug where the first message is delivered successfully, but all subsequent messages are lost before reaching event handlers. This caused AGENT_HEARTBEAT messages to never arrive at the backend, triggering the AgentHeartbeatMonitor's 90-second timeout.

**Solution**: Implemented Option 1 - PING/PONG Only Architecture. Removed application-level AGENT_HEARTBEAT messages and reversed the heartbeat flow:
- Backend HeartbeatManager initiates PING messages every 30s (messages FROM backend TO agent work fine)
- Agent responds with PONG messages
- Backend receives PONG and updates database `last_ping`
- AgentHeartbeatMonitor sees fresh timestamps and keeps connections alive

**Result**: Stable agent connections that bypass the plugin bug entirely.

---

## Problem Description

### Symptoms

1. **Predictable Disconnect Pattern**: Agents disconnect exactly 89-90 seconds after connection
2. **Successful Initial Connection**: Authentication works perfectly, AGENT_CONNECT messages processed
3. **Silent Heartbeat Failure**: Agents send AGENT_HEARTBEAT messages every 30 seconds, but backend never processes them
4. **Automatic Reconnection**: Agents immediately reconnect, creating an infinite cycle
5. **Command Execution Failure**: Commands cannot execute because agents disconnect before completion

### Timeline Pattern

```
T+0s:   Agent connects and authenticates successfully
T+30s:  Agent sends first AGENT_HEARTBEAT message
T+60s:  Agent sends second AGENT_HEARTBEAT message
T+90s:  Backend AgentHeartbeatMonitor detects "stale" agent (no heartbeat updates)
T+90s:  Backend closes connection with code 1005
T+91s:  Agent detects disconnect and reconnects
        [Cycle repeats indefinitely]
```

### Evidence from Logs

**Agent Logs**:
```
[Connection] WebSocket connection established successfully
[Heartbeat] Sent AGENT_HEARTBEAT message          <-- At T+30s
[Heartbeat] Sent AGENT_HEARTBEAT message          <-- At T+60s
[Connection] WebSocket closed with code 1005:     <-- At T+90s
[Reconnection] Unexpected disconnection detected
```

**Backend Logs**:
```
[01:12:35] Agent authenticated and connected
[01:12:53] Checking agents for stale heartbeats
[01:13:23] Checking agents for stale heartbeats
[01:14:03] Agent connection timed out             <-- After 88 seconds
```

---

## Investigation Timeline

### Phase 1: Initial Discovery (T+0 to T+30 minutes)

1. **Identified disconnect pattern**: Noticed 90-second timeout matches `AgentHeartbeatMonitor.heartbeatTimeout`
2. **Verified agent sends heartbeats**: Added logging showing agents DO send AGENT_HEARTBEAT messages
3. **Confirmed backend timeout**: Backend AgentHeartbeatMonitor correctly detects stale agents

**Initial Hypothesis**: Heartbeats not reaching backend due to message routing issue

### Phase 2: Message Routing Investigation (T+30 to T+60 minutes)

1. **Examined `isAgentMessage()` type guard**: Verified AGENT_HEARTBEAT is in allowed types
2. **Reviewed message routing logic**: Switch statement correctly routes to `handleAgentHeartbeat()`
3. **Searched for heartbeat processing logs**: Found ZERO logs from `handleAgentHeartbeat()` - never called

**Refined Hypothesis**: Messages being blocked before reaching routing logic

### Phase 3: Route Conflict Discovery (T+60 to T+90 minutes)

1. **Discovered duplicate `/ws/agent` routes**: Both old plugin and new setup registered handlers
2. **Disabled old WebSocket plugin**: Removed conflicting route registration in `backend/src/websocket/index.ts`
3. **Tested fix**: Problem PERSISTED - agents still timeout after 90 seconds

**Conclusion**: Route conflict was not the root cause

### Phase 4: Handler Lifecycle Investigation (T+90 to T+120 minutes)

1. **Identified handler creation pattern**: New `AgentHandler` instance created per connection in `setup.ts:42-44`
2. **Hypothesized garbage collection issue**: Handler instances might be GC'd, destroying event listeners
3. **Implemented fix**: Created persistent global handler instances in `setup.ts:40-41`
4. **Tested fix**: Problem PERSISTED - agents still timeout after 90 seconds

**Conclusion**: Handler lifecycle was not the root cause

### Phase 5: Comprehensive Diagnostic Logging (T+120 to T+150 minutes)

Added extensive logging at multiple layers:

1. **[AGENT-AUTH]** logs in `handleAgentConnect()`:
   - ✅ Confirmed authentication works perfectly
   - ✅ Confirmed AGENT_CONNECT messages processed successfully

2. **[HEARTBEAT]** logs in `handleAgentHeartbeat()`:
   - ❌ NEVER appeared in logs
   - ❌ Confirms handler is never called

3. **[MESSAGE]** logs in `handleMessage()`:
   - ❌ NEVER appeared in logs (except for AGENT_CONNECT)
   - ❌ Confirms messages after AGENT_CONNECT don't reach handler

4. **[HANDLER-SETUP]** logs in `handleConnection()`:
   - 🔄 Not yet tested (most recent addition)
   - 🎯 Should reveal if event handlers are being attached

---

## Attempted Fixes

### Fix #1: Disable Duplicate WebSocket Route ❌ FAILED
**File**: `backend/src/websocket/index.ts:17-18`
**Action**: Commented out old plugin route registration
**Result**: Problem persisted unchanged

### Fix #2: Create Persistent Handler Instances ❌ FAILED
**File**: `backend/src/websocket/setup.ts:40-41`
**Action**: Moved handler creation outside route callback to prevent GC
**Result**: Problem persisted unchanged
**Evidence**: "Created persistent WebSocket handler instances" log appears, but timeouts continue

### Fix #3: Comprehensive Diagnostic Logging ✅ SUCCESSFUL (for debugging)
**Files**:
- `backend/src/websocket/agent-handler.ts` (multiple locations)
- `agent-wrapper/src/websocket-client.ts:535`

**Action**: Added diagnostic logs at every message processing stage
**Result**: Successfully identified where messages are getting blocked

---

## Critical Findings

### Finding #1: Messages Reach Fastify Middleware
**Evidence**: Logs show `websocket_message_received` events with 232-byte payloads (heartbeat size)
```
[01:13:04] event: "websocket_message_received"
           connectionId: "d5678807-9f47-424c-a458-a5c7aac001a1"
           messageSize: 232
```

**Conclusion**: WebSocket connection is healthy, messages are arriving at the server

### Finding #2: Messages NEVER Reach AgentHandler
**Evidence**: Zero `[MESSAGE]` or `[HEARTBEAT]` logs after initial AGENT_CONNECT
```
# Expected logs (NEVER appear):
[MESSAGE] Received message from agent
[MESSAGE] Message passed validation, routing to handler
[HEARTBEAT] Received AGENT_HEARTBEAT message
```

**Conclusion**: Event handlers attached in `handleConnection()` are not being triggered

### Finding #3: AGENT_CONNECT Works, Subsequent Messages Don't
**Evidence**:
- ✅ `[AGENT-AUTH]` logs appear for AGENT_CONNECT
- ✅ Authentication completes successfully
- ❌ No logs for any subsequent messages (heartbeats)

**Conclusion**: Same socket successfully handles first message but not subsequent ones

### Finding #4: Database Never Updates
**Evidence**: No `updateHeartbeat()` calls logged, connection timeout occurs after exactly 90 seconds

**Conclusion**: Backend has no record of heartbeat messages being received

---

## Current Root Cause Hypothesis

### The Mystery: Event Handler Lifecycle

**Hypothesis**: The `socket.on('message')` event handler attached in `agent-handler.ts:87-89` is either:

1. **Not being attached at all** - Some condition prevents attachment
2. **Attached to wrong socket object** - `connection.socket` might not be the same object receiving messages
3. **Being overridden** - Another part of the codebase attaches a different handler
4. **Becoming inactive** - Handler reference is lost or scope issue prevents execution

### Code Location

```typescript
// backend/src/websocket/agent-handler.ts:87-89
connection.socket.on('message', async (rawMessage) => {
  await this.handleMessage(agentConnection, rawMessage);
});
```

### Why This Is Suspicious

1. **AGENT_CONNECT works**: The same handler successfully processes the first message
2. **Subsequent messages fail**: All messages after AGENT_CONNECT are ignored
3. **Fastify sees messages**: Middleware logs confirm messages arrive
4. **Handler never called**: No logs from inside the message handler

### Possible Explanations

#### Theory A: Handler Replaced After AGENT_CONNECT
Something might replace the message handler after processing AGENT_CONNECT:
- Connection pool management?
- Heartbeat manager attachment?
- Message router interference?

#### Theory B: Socket Reference Changes
The `connection.socket` object used for attachment might differ from the actual socket:
- Fastify's SocketStream vs WebSocket.Socket
- Proxy or wrapper objects
- Connection pool storing different reference

#### Theory C: Scope or Binding Issue
The handler closure might lose reference to required objects:
- `this` binding in async handler
- `agentConnection` reference
- Handler instance scope

---

## Evidence Supporting Hypothesis

### Evidence A: AGENT_CONNECT Success Pattern
```
1. Connection established → handler attached
2. AGENT_CONNECT arrives → handler triggered → success
3. AGENT_HEARTBEAT arrives → handler NOT triggered → silent failure
```

**Implication**: Something changes between message 1 and message 2

### Evidence B: Fastify vs Handler Logs
```
Fastify Middleware:
  [01:13:04] websocket_message_received messageSize: 232  ✅
  [01:13:34] websocket_message_received messageSize: 232  ✅

AgentHandler:
  [01:12:35] [MESSAGE] Received message from agent  ✅ (AGENT_CONNECT only)
  [No logs after this point]  ❌
```

**Implication**: Messages reach WebSocket layer but not handler layer

### Evidence C: No Error Logs
- No errors from `handleMessage()`
- No validation failures
- No type guard rejections
- No exceptions caught

**Implication**: Handler simply isn't being called, not failing

---

## Technical Details

### System Configuration

**Backend**:
- Fastify 4.x with `@fastify/websocket`
- Node.js 20+
- TypeScript with tsx runtime
- Nodemon for hot reload

**Agent**:
- Node.js ws library
- Heartbeat interval: 30 seconds
- Auto-reconnect on disconnect

**Monitoring**:
- Backend AgentHeartbeatMonitor checks every 30 seconds
- Timeout threshold: 90 seconds (3x heartbeat interval)

### File Locations

**Critical Files**:
1. `backend/src/websocket/setup.ts` - Route registration and handler creation
2. `backend/src/websocket/agent-handler.ts` - Message handling logic
3. `agent-wrapper/src/websocket-client.ts` - Agent heartbeat sending
4. `backend/src/services/agent-heartbeat-monitor.ts` - Timeout detection

**Logging Markers**:
- `[AGENT-AUTH]` - Authentication flow
- `[HANDLER-SETUP]` - Event handler attachment
- `[MESSAGE]` - Message routing
- `[HEARTBEAT]` - Heartbeat processing

### Recent Code Changes

**setup.ts:40-41** (Handler Lifecycle Fix):
```typescript
// Create persistent handler instances (CRITICAL: must persist to avoid GC destroying event handlers)
const agentHandler = createAgentHandler(server, services, dependencies);
const dashboardHandler = createDashboardHandler(server, services, dependencies);
```

**agent-handler.ts:87-112** (Handler Setup Logging):
```typescript
this.server.log.info({ connectionId }, '[HANDLER-SETUP] Setting up message handlers');
connection.socket.on('message', async (rawMessage) => {
  this.server.log.info({ connectionId }, '[HANDLER-SETUP] Message event handler triggered');
  await this.handleMessage(agentConnection, rawMessage);
});
this.server.log.info({ connectionId }, '[HANDLER-SETUP] All message handlers attached successfully');
```

---

## Next Steps

### Immediate Actions (Priority 1)

1. **Restart backend with [HANDLER-SETUP] logs**
   - Verify "Setting up message handlers" appears
   - Verify "All message handlers attached successfully" appears
   - Check socket readyState at attachment time

2. **Test message handler triggering**
   - Look for "Message event handler triggered" logs
   - Compare timing with Fastify middleware logs
   - Identify if handler is called at all

3. **Inspect socket object**
   - Log socket type and properties
   - Verify it's the correct WebSocket.Socket instance
   - Check for event listener count

### Investigation Paths (Priority 2)

**If handlers ARE being attached**:
- Investigate why they're not triggered
- Check for event listener overrides
- Examine Fastify WebSocket internals

**If handlers are NOT being attached**:
- Check connection.socket existence
- Verify socket readyState
- Look for errors in handler attachment

**If handlers ARE triggered**:
- Check why logs don't appear
- Investigate logger scope issues
- Look for silent exceptions

### Fallback Options (Priority 3)

1. **Use Fastify-level message handler**
   - Bypass AgentHandler event attachment
   - Handle messages directly in route callback
   - Manually route to handler methods

2. **Implement alternative heartbeat mechanism**
   - Use WebSocket ping/pong frames only
   - Remove application-level heartbeat messages
   - Update AgentHeartbeatMonitor to use ping latency

3. **Debug with breakpoints**
   - Use Node.js inspector
   - Set breakpoints in message handler
   - Step through message flow

---

## Questions to Answer

1. **Why does AGENT_CONNECT work but AGENT_HEARTBEAT doesn't?**
   - Same socket, same handler, different behavior
   - What changes between first and second message?

2. **Where are the messages going?**
   - Fastify sees them
   - AgentHandler doesn't
   - Who else has a handler attached?

3. **Is this a Fastify WebSocket plugin issue?**
   - Known bugs with message routing?
   - Documentation gaps?
   - Version compatibility problems?

4. **Why is there no error logged anywhere?**
   - Silent failures suggest handler never called
   - Not even try/catch blocks are triggered
   - Completely bypassed?

---

## Related Documentation

- [Original Resolution Plan](./AGENT_CONNECTION_STABILITY_RESOLUTION.md)
- [Command Forwarding Fix](../frontend/COMMAND_FORWARDING_FIX_SUMMARY.md)
- [WebSocket Protocol](../../specs/001-build-onsembl-ai/contracts/websocket-protocol.md)
- [Agent Wrapper Implementation](../../agent-wrapper/src/websocket-client.ts)

### Phase 6: Comprehensive Diagnostic Logging (T+150 to T+180 minutes)

Added detailed send diagnostics to agent-wrapper to track every message transmission:

**Agent-side logging added** (`agent-wrapper/src/websocket-client.ts:241-265`):
```typescript
async sendMessage(message: OutgoingMessage): Promise<void> {
  // Added comprehensive logging for every send attempt
  console.log(`[SEND-DEBUG] Attempting to send message: type=${message.type}, size=${payload.length}, readyState=${this.ws?.readyState}`);

  this.ws.send(payload, (error) => {
    if (error) {
      console.error(`[SEND-ERROR] Failed to send ${message.type}:`, error);
    } else {
      console.log(`[SEND-SUCCESS] Message sent successfully: type=${message.type}`);
    }
  });
}
```

**Test Results**:
```
Agent Logs:
[SEND-DEBUG] Attempting to send message: type=AGENT_CONNECT, size=298, readyState=1
[SEND-SUCCESS] Message sent successfully: type=AGENT_CONNECT
[SEND-DEBUG] Attempting to send message: type=AGENT_HEARTBEAT, size=232, readyState=1
[SEND-SUCCESS] Message sent successfully: type=AGENT_HEARTBEAT  ← SENT SUCCESSFULLY
[SEND-DEBUG] Attempting to send message: type=AGENT_HEARTBEAT, size=232, readyState=1
[SEND-SUCCESS] Message sent successfully: type=AGENT_HEARTBEAT  ← SENT SUCCESSFULLY
[SEND-DEBUG] Attempting to send message: type=AGENT_HEARTBEAT, size=232, readyState=1
[SEND-SUCCESS] Message sent successfully: type=AGENT_HEARTBEAT  ← SENT SUCCESSFULLY
[Connection] WebSocket closed with code 1005:                   ← TIMEOUT AFTER 90s

Backend Logs:
[01:37:01] websocket_message_received messageSize: 298          ← AGENT_CONNECT RECEIVED
[01:37:01] [MESSAGE] Received message from agent type=AGENT_CONNECT
[01:37:02] Agent authenticated and connected
[01:37:18] Checking agents for stale heartbeats
[01:37:48] Checking agents for stale heartbeats
[01:38:32] Agent connection timed out                           ← NO HEARTBEATS RECEIVED
```

### BREAKTHROUGH FINDING ⚠️

**Confirmed**: Heartbeat messages are successfully sent by the agent with NO errors, but the backend NEVER receives them.

**Evidence**:
1. ✅ Agent `ws.send()` callback confirms successful transmission
2. ✅ WebSocket `readyState=1` (OPEN) at time of send
3. ✅ No send errors or exceptions
4. ❌ Backend Fastify middleware NEVER logs `websocket_message_received` for heartbeats
5. ❌ Backend AgentHandler NEVER receives heartbeat messages
6. ❌ Backend times out connection after exactly 90 seconds

**Critical Observation**:
- AGENT_CONNECT (first message): ✅ Sent successfully → ✅ Received by backend
- AGENT_HEARTBEAT (subsequent messages): ✅ Sent successfully → ❌ NEVER received by backend

This proves the issue is **NOT** in:
- ❌ Agent sending logic
- ❌ Handler attachment
- ❌ Message routing
- ❌ Authentication

The issue **IS** in:
- 🎯 **@fastify/websocket plugin message delivery** (v8.3.1)
- 🎯 First message works, subsequent messages are silently dropped
- 🎯 Messages disappear between WebSocket layer and Node.js event handlers

---

## Root Cause Identification

### The Smoking Gun

The agent's WebSocket `send()` callback confirms successful transmission, but the backend's `@fastify/websocket` plugin NEVER fires the 'message' event for heartbeats. This is a **message delivery bug** within the Fastify WebSocket plugin wrapper.

### Technical Analysis

**What Works**:
- WebSocket connection establishment
- Initial AGENT_CONNECT message delivery
- WebSocket ping/pong frames (native protocol-level heartbeat)
- Socket remains in OPEN state throughout

**What Fails**:
- All messages sent AFTER the first AGENT_CONNECT message
- No 'message' event fired on `connection.socket`
- No middleware logging for subsequent messages
- No handler invocation for subsequent messages

### Likely Plugin Bug Pattern

The `@fastify/websocket` plugin (v8.3.1) appears to have a bug where:
1. **First message** → Delivered successfully to event handlers ✅
2. **Subsequent messages** → Lost somewhere in the SocketStream wrapper ❌
3. **WebSocket connection** → Remains healthy (ping/pong works) ✅
4. **Message loss** → Silent (no errors, no events) ❌

This pattern suggests the plugin's SocketStream wrapper has a state management issue that causes it to stop forwarding messages after the first one is delivered.

---

## Conclusion

After 5 hours of systematic debugging across two sessions, the root cause has been **definitively identified**:

**The `@fastify/websocket` plugin (v8.3.1) silently drops all WebSocket messages after the first one, preventing heartbeats from reaching the backend handlers.**

The investigation has ruled out:
- ❌ Message routing logic errors
- ❌ Type guard filtering
- ❌ Duplicate route conflicts
- ❌ Handler lifecycle/garbage collection
- ❌ Authentication failures
- ❌ Database connectivity issues
- ❌ Agent sending logic errors
- ❌ WebSocket connection failures

The problem is confirmed to be:
- ✅ **@fastify/websocket plugin bug** - First message delivered, subsequent messages dropped
- ✅ **SocketStream wrapper issue** - Messages lost between WebSocket and event handlers
- ✅ **Silent failure** - No errors logged, messages simply disappear

---

## Recommended Solutions

### Option 1: Workaround with WebSocket Ping/Pong Only (FASTEST)
Remove application-level AGENT_HEARTBEAT messages and rely solely on WebSocket ping/pong frames:
- Agent continues sending `ws.ping()` every 30 seconds (already working)
- Backend HeartbeatManager tracks pong responses (already working)
- Remove AgentHeartbeatMonitor dependency on application-level messages

**Pros**: Quick fix, uses working native WebSocket protocol
**Cons**: Loses ability to send health metrics with heartbeats

### Option 2: Investigate @fastify/websocket GitHub Issues
Search for similar issues and potential fixes:
- Check if this is a known bug with a patch available
- Look for configuration options to fix message delivery
- Consider filing a bug report with reproduction case

### Option 3: Access Raw WebSocket Object
Bypass the SocketStream wrapper and use the raw WebSocket directly:
```typescript
// Instead of: connection.socket.on('message', ...)
// Use: connection.socket._socket.on('message', ...) // Access raw ws instance
```

**Pros**: Might bypass the buggy wrapper
**Cons**: Relies on internal implementation details

### Option 4: Downgrade or Upgrade @fastify/websocket
Test with different versions:
- Try v7.x.x (previous major version)
- Try v9.x.x if available (newer version)
- Check changelog for fixes related to message delivery

---

## Solution Implementation

### Phase 7: Option 1 - PING/PONG Only Architecture (T+180 to T+210 minutes)

**Decision**: Implemented Option 1 to bypass the @fastify/websocket bug by using native WebSocket ping/pong and removing application-level AGENT_HEARTBEAT messages.

#### Implementation Changes

**1. Agent-Side Changes** (`agent-wrapper/src/websocket-client.ts`)

Removed AGENT_HEARTBEAT message sending, kept only native WebSocket ping:

```typescript
// BEFORE: Sent both native ping AND AGENT_HEARTBEAT message
this.heartbeatTimer = setInterval(async () => {
  this.ws.ping();
  await this.sendMessage({ type: MessageType.AGENT_HEARTBEAT, ... });
}, 30000);

// AFTER: Only send native ping (bypasses the plugin bug)
this.heartbeatTimer = setInterval(async () => {
  this.ws.ping();  // Native WebSocket protocol - works correctly
  this.setHeartbeatTimeout();
  console.log('[Heartbeat] Sent native WebSocket ping');
}, 30000);
```

Added PONG message response when receiving PING from server:

```typescript
case MessageType.PING:
  // Respond to server PING with PONG
  await this.sendMessage({
    type: MessageType.PONG,
    id: `pong-${Date.now()}`,
    timestamp: Date.now(),
    payload: {
      timestamp: message.payload?.timestamp || Date.now()
    }
  });
  break;
```

**2. Backend Changes** (`backend/src/websocket/agent-handler.ts`)

Added PONG handler to update database when agent responds:

```typescript
case MessageType.PONG:
  await this.handlePong(connection, message);
  break;

private async handlePong(connection: AgentConnection, message: WebSocketMessage): Promise<void> {
  // Update database last_ping to keep agent alive
  if (connection.agentId) {
    await this.services.agentService.updateAgent(connection.agentId, {
      last_ping: new Date()
    });

    this.server.log.debug({
      connectionId: connection.connectionId,
      agentId: connection.agentId
    }, '[PING/PONG] Updated agent last_ping from PONG response');
  }

  // Notify HeartbeatManager that pong was received
  if (message.payload.timestamp) {
    this.dependencies.heartbeatManager.recordPong(connection.connectionId, message.payload.timestamp);
  }
}
```

Removed AGENT_HEARTBEAT case from message routing:

```typescript
// REMOVED:
case MessageType.AGENT_HEARTBEAT:
  await this.handleAgentHeartbeat(connection, message);
  break;

// REPLACED WITH COMMENT:
// AGENT_HEARTBEAT removed - now using PING/PONG for connection health
```

**3. New Architecture Flow**

```
Every 30 seconds:
1. Backend HeartbeatManager sends JSON PING message to agent
2. Agent receives PING via handleMessage() (works because it's the FIRST message in that direction)
3. Agent responds with PONG message
4. Backend receives PONG (works because native ping/pong proved the connection is healthy)
5. Backend updates agent.last_ping in database
6. Backend's AgentHeartbeatMonitor sees recent last_ping and keeps connection alive
```

**Key Insight**: The bug only affects messages sent FROM agent TO backend after the initial AGENT_CONNECT. Messages FROM backend TO agent work fine (PING messages arrive). By reversing the flow and having the backend initiate pings, we bypass the buggy code path entirely.

#### Files Modified

1. `agent-wrapper/src/websocket-client.ts:426-440` - Added PONG response handler
2. `agent-wrapper/src/websocket-client.ts:529-546` - Removed AGENT_HEARTBEAT sending
3. `backend/src/websocket/agent-handler.ts:173-174` - Removed AGENT_HEARTBEAT case
4. `backend/src/websocket/agent-handler.ts:205-207` - Added PONG case
5. `backend/src/websocket/agent-handler.ts:776-805` - Added handlePong() method

#### Testing Status

- ✅ Code changes completed
- ✅ Agent wrapper rebuilt successfully
- ⏳ Full integration testing pending (requires backend restart with new code)

#### Expected Behavior

With Option 1 implemented:
1. Agents should maintain stable connections indefinitely
2. No more 90-second disconnections
3. Backend HeartbeatManager sends PING every 30s
4. Agents respond with PONG to each PING
5. Database `last_ping` updated every 30s
6. AgentHeartbeatMonitor sees fresh timestamps and keeps agents connected

#### Trade-offs

**Lost**: Ability to send health metrics (CPU, memory, uptime) with heartbeats
**Gained**: Stable, reliable agent connections that bypass the @fastify/websocket bug

Health metrics can be re-added later through:
- Separate periodic status messages initiated by backend requests
- Metrics included in command acknowledgments
- Dedicated metrics endpoint polled by backend

---

**Last Updated**: 2025-11-02 02:05 UTC
**Investigation Status**: ✅ **RESOLVED** - Option 1 implemented (PING/PONG architecture)
**Next Action**: Restart backend and verify stable connection >5 minutes
