# Agent Routing Debug Findings

**Date**: 2025-11-02
**Time**: 03:19:26 UTC
**Status**: 🔴 COMMAND NOT REACHING AGENT

## Test Command Details

- **Command**: `echo "Testing UUID routing"`
- **Command ID**: `cmd-1762053566876-hj0zhu6`
- **Agent ID (Frontend)**: `5b63a9f3-bf4f-49dd-b39f-4b0646f9da31`
- **Time**: 03:19:26 UTC

## Debug Logging Results

### ✅ Agent Registration (03:18:11 UTC)

```
resolvedDatabaseUUID: "5b63a9f3-bf4f-49dd-b39f-4b0646f9da31"
connectionAgentId: "5b63a9f3-bf4f-49dd-b39f-4b0646f9da31"
```

**Result**: ✅ UUIDs MATCH - Agent correctly registered with UUID `5b63a9f3-bf4f-49dd-b39f-4b0646f9da31`

### ✅ Frontend Successfully Sent Command

Frontend console logs show:
```
[WebSocketStore] Sending COMMAND_REQUEST with payload: {
  "agentId": "5b63a9f3-bf4f-49dd-b39f-4b0646f9da31",
  "commandId": "cmd-1762053566876-hj0zhu6",
  "command": "echo \"Testing UUID routing\"",
  ...
}
[WebSocketStore] COMMAND_REQUEST sent successfully via WebSocket
```

**Result**: ✅ Frontend successfully sent command with correct UUID

### ❌ Backend Did NOT Process Command

Searching backend logs for `cmd-1762053566876-hj0zhu6` or any command routing after 03:19:00 shows:
- **NO "COMMAND REQUEST START" log**
- **NO "CMD-FWD ROUTE TO AGENT" log**
- **NO connection pool lookup logs**

**Result**: ❌ Backend never attempted to route the command

### ❌ Agent Never Received Command

Agent logs show only:
```
[SEND-SUCCESS] Message sent successfully: type=PONG
[Heartbeat] Sent native WebSocket ping
[SEND-SUCCESS] Message sent successfully: type=PONG
[Heartbeat] Sent native WebSocket ping
```

**Result**: ❌ Agent only received PONG requests, NO COMMAND_REQUEST

## Root Cause Analysis

The command forwarding is failing at the **backend routing stage**.

### Hypothesis 1: Dashboard Handler Not Receiving Message

The backend is receiving the WebSocket message from the frontend, but the dashboard handler's `handleCommandRequest()` method is NOT being called.

**Possible causes**:
1. Message type filter rejecting the message (but we already fixed `isDashboardMessage()`)
2. Dashboard handler message routing not working
3. WebSocket message handler not routing to correct handler method

### Hypothesis 2: Backend Message Flow Broken

Looking at the flow:
```
Frontend sends COMMAND_REQUEST
    ↓
Backend WebSocket receives message
    ↓
??? (Something fails here)
    ↓
Dashboard handler never called
    ↓
Command never routed to agent
```

## Investigation Next Steps

1. **Add logging at WebSocket message receive**:
   - Log when backend WebSocket receives ANY message from dashboard
   - Log the message type and payload
   - See if COMMAND_REQUEST is even reaching the backend

2. **Check dashboard-handler message routing**:
   - Verify the handler is registered for COMMAND_REQUEST type
   - Check if there's a routing table/switch statement
   - Confirm the message handler is being invoked

3. **Check WebSocket setup**:
   - Verify dashboard handler is properly attached to WebSocket
   - Check if there's a message router between WebSocket and handler
   - Look for any middleware that might be dropping messages

## Files to Investigate

1. `backend/src/websocket/setup.ts` - WebSocket handler setup
2. `backend/src/websocket/dashboard-handler.ts` - Message routing logic
3. `backend/src/websocket/message-router.ts` - Router setup

## Conclusion

The bug is **NOT** a UUID mismatch. The UUIDs are correct. The bug is that commands from the dashboard are **silently failing** to reach the dashboard handler in the backend, even though:

- ✅ Frontend successfully sends the message
- ✅ Agent is connected with correct UUID
- ✅ `isDashboardMessage()` type filter is fixed
- ❌ Backend dashboard handler is never invoked
- ❌ Command never reaches agent

**The command is being lost somewhere in the backend WebSocket message routing layer.**
