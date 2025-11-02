# Terminal Output Mirroring Implementation Plan

**Date**: 2025-11-02
**Objective**: Mirror agent CLI terminal output to frontend SimpleTerminal
**Status**: INVESTIGATION COMPLETE - Ready for Implementation

## Executive Summary

The infrastructure for terminal output streaming **already exists** end-to-end. The issue is a **timing problem**: the agent's startup output is sent to the backend before the frontend creates the terminal session, causing early output to be lost.

## Current State Analysis

### What's Working ✅

1. **Agent Output Capture**
   - PTY manager emits 'data' events for all terminal output (`pty-manager.js:73-75`)
   - Interactive wrapper listens and captures all output (`interactive-wrapper.ts:203-228`)
   - Child process stdout/stderr handlers capture headless mode output (`interactive-wrapper.ts:294-314`)

2. **WebSocket Transmission**
   - Agent sends `TERMINAL_OUTPUT` messages to backend
   - Uses `sessionId = agent-session-{agentId}` for general output
   - Uses `currentCommandId` when executing remote commands
   - Logs show successful message transmission:
     ```
     [SEND-SUCCESS] Message sent successfully: type=TERMINAL_OUTPUT
     ```

3. **Backend Routing**
   - Agent handler receives TERMINAL_OUTPUT messages (`agent-handler.ts:652-677`)
   - Message router streams to dashboard (`message-router.ts`)
   - Terminal stream manager processes output

4. **Frontend Reception**
   - Terminal store listens for TERMINAL_OUTPUT messages (`terminal.store.ts:194-229`)
   - Automatically creates session if it doesn't exist
   - Routes output to buffer using `agent-session-{agentId}` session ID
   - SimpleTerminal displays output from active session

### The Problem ❌

**Root Cause**: Timing and Session Lifecycle Issue

When an agent starts:
```
1. [00:00] Agent spawns child process (mock-agent.js)
2. [00:01] Child process outputs startup banner:
           ═══════════════════════════════════════════════════════
             Interactive Mode Enabled
             Type ~~help for commands | Type ~~exit to quit
           ═══════════════════════════════════════════════════════
           Mock agent ready. Type commands or press Ctrl+C to exit.

           C:\Users\Ty\Desktop\onsembl\agent-wrapper>
3. [00:01] Agent wrapper captures output via stdout handler
4. [00:01] Agent sends TERMINAL_OUTPUT to backend ✅
5. [00:01] Backend receives and routes to dashboard ✅
6. [00:01] ❌ Frontend has NO session yet - output is LOST
7. [05:00] User clicks on agent in /agents page
8. [05:01] Frontend creates session: agent-session-{agentId}
9. [05:01] Frontend sets active session
10. [05:01] SimpleTerminal displays "Welcome to Onsembl Agent Terminal"
11. [05:01] ❌ Startup output from step 2 is GONE
```

**Evidence from Logs**:

Agent logs show:
```
{"level":30,"time":1762056596352,"pid":41880,"msg":"Agent wrapper started successfully"}
[SEND-SUCCESS] Message sent successfully: type=TERMINAL_OUTPUT
[SEND-SUCCESS] Message sent successfully: type=TERMINAL_OUTPUT
```

But frontend only shows:
```
Welcome to Onsembl Agent Terminal
Connected to: 5b63a9f3-bf4f-49dd-b39f-4b0646f9da31
Type a command and press Enter...
```

### Additional Issues

1. **Session Creation Timing**
   - Frontend creates session ONLY when user selects agent (`/agents/page.tsx:85-86`)
   - Early output has nowhere to go

2. **No Output Buffering**
   - Backend doesn't buffer agent output while waiting for frontend to connect
   - Terminal stream manager processes output immediately and discards it

3. **Agent ID Mismatch Potential**
   - Agent uses: `mock-mhfjh3z0-vkvw618fo` (CLI ID)
   - Backend resolves to: `5b63a9f3-bf4f-49dd-b39f-4b0646f9da31` (UUID)
   - Frontend expects: UUID from database
   - If session IDs don't align, output won't route correctly

## Complete Message Flow (Current)

```
┌─────────────────────────────────────────────────────────────────┐
│              TERMINAL OUTPUT FLOW (CURRENT STATE)                │
└─────────────────────────────────────────────────────────────────┘

1. Agent CLI Startup
   └─> mock-agent.js starts
   └─> Outputs startup banner to stdout

2. Agent Wrapper - Headless Mode
   └─> child_process.stdout.on('data') captures output ✅
   └─> File: interactive-wrapper.ts:294-303

3. Agent WebSocket Client
   └─> Determines outputId:
       - If currentCommandId exists → use it
       - Else → use sessionId (agent-session-{agentId})
   └─> Sends TERMINAL_OUTPUT message ✅
   └─> File: websocket-client.ts:299

4. Backend Agent Handler
   └─> Receives TERMINAL_OUTPUT ✅
   └─> File: agent-handler.ts:652-677
   └─> Corrects payload with resolved UUID
   └─> Routes to terminal stream manager ✅

5. Backend Message Router
   └─> Streams to dashboard ✅
   └─> File: message-router.ts (streamTerminalOutput)

6. Frontend WebSocket Service
   └─> Receives message via WebSocket ✅
   └─> Emits TERMINAL_OUTPUT event

7. Frontend Terminal Store
   └─> Listens for TERMINAL_OUTPUT ✅
   └─> File: terminal.store.ts:194-229
   └─> Calculates sessionId: commandId || agent-session-{agentId}
   └─> ❌ IF session doesn't exist:
       → Creates it dynamically
       → BUT early output before session creation is LOST
   └─> Adds output to buffer ✅

8. SimpleTerminal Component
   └─> Subscribes to activeSessionId changes
   └─> Calls getActiveSessionOutput() to get lines
   └─> ❌ Only sees output AFTER session was created
   └─> File: terminal-viewer.tsx:120-370
```

## Files Involved

### Agent Wrapper

1. **`agent-wrapper/src/terminal/pty-manager.js`**
   - **Lines 73-75**: Emits 'data' events from PTY
   - **Function**: `spawn()` - Creates PTY process and sets up data handlers

2. **`agent-wrapper/src/terminal/interactive-wrapper.ts`**
   - **Lines 203-228**: PTY output handler (interactive mode)
   - **Lines 294-303**: Child process stdout handler (headless mode)
   - **Lines 306-314**: Child process stderr handler (headless mode)
   - **Line 93**: Sets sessionId: `agent-session-${agentId}`
   - **Line 223**: Determines outputId for WebSocket: `currentCommandId || sessionId`

3. **`agent-wrapper/src/websocket-client.ts`**
   - **Lines 294-303**: Creates and sends TERMINAL_OUTPUT message
   - **Function**: `sendOutput(commandId, stream, data, ansiCodes)`

### Backend

4. **`backend/src/websocket/agent-handler.ts`**
   - **Lines 652-677**: Handles TERMINAL_OUTPUT from agent
   - **Lines 670-674**: Corrects payload with resolved agent UUID
   - **Line 677**: Processes through terminal stream manager
   - **Lines 680-687**: Routes to dashboard via message router

5. **`backend/src/websocket/message-router.ts`**
   - **Function**: `streamTerminalOutput()` - Streams output to connected dashboards
   - **Issue**: No buffering for early output

### Frontend

6. **`frontend/src/stores/terminal.store.ts`**
   - **Lines 194-229**: TERMINAL_OUTPUT event handler
   - **Line 200**: Calculates sessionId: `commandId || agent-session-{agentId}`
   - **Lines 214-220**: Creates session dynamically if it doesn't exist
   - **Lines 223-228**: Adds output to buffer

7. **`frontend/src/components/terminal/terminal-viewer.tsx`**
   - **Lines 120-370**: SimpleTerminal component
   - **Line 133**: Gets terminal store actions
   - **Line 137**: Gets output: `getActiveSessionOutput()`
   - **Lines 259-267**: Shows welcome message when no output

8. **`frontend/src/app/(auth)/agents/page.tsx`**
   - **Lines 68-100**: Session management when agent is selected
   - **Line 82**: Creates sessionId: `agent-session-{agent.id}`
   - **Lines 85-91**: Creates session if it doesn't exist
   - **Line 95**: Sets active session

## Root Causes Summary

| Issue | Impact | Location |
|-------|--------|----------|
| **Session created too late** | Early output lost | `frontend/src/app/(auth)/agents/page.tsx:85` |
| **No output buffering** | Can't retrieve pre-session output | Backend terminal stream manager |
| **Agent ID resolution** | Potential session ID mismatch | `backend/src/websocket/agent-handler.ts:660` |

## Implementation Plan

### Solution Strategy

We have **three options** to fix this:

#### Option 1: Eager Session Creation (Recommended) ⭐

**Approach**: Create terminal sessions immediately when agents connect, before user selects them.

**Changes Required**:

1. **Frontend: Agent WebSocket Integration** (`frontend/src/stores/agent-websocket-integration.ts`)
   - Listen for AGENT_CONNECTED events
   - Auto-create terminal session for each connected agent
   - Set session ID to match agent's session ID convention

2. **Frontend: Terminal Store** (No changes needed ✅)
   - Already handles dynamic session creation
   - Already buffers output in TerminalBufferManager

**Pros**:
- ✅ Simplest implementation
- ✅ No backend changes
- ✅ No data loss
- ✅ Leverages existing infrastructure

**Cons**:
- ❌ Creates sessions for agents user may never view
- ❌ Memory usage for inactive agent buffers

**Implementation Steps**:

```typescript
// File: frontend/src/stores/agent-websocket-integration.ts

// Listen for agent connected events
webSocketService.on(MessageType.AGENT_CONNECTED, (payload) => {
  const { agentId } = payload;

  // Create terminal session immediately
  const sessionId = `agent-session-${agentId}`;
  const store = useTerminalStore.getState();

  if (!store.sessions.has(sessionId)) {
    store.createSession(sessionId, agentId, `Agent ${agentId} started`);
    console.log(`[Terminal] Created session for connected agent: ${agentId}`);
  }
});
```

---

#### Option 2: Backend Output Buffering

**Approach**: Buffer terminal output on the backend until frontend subscribes.

**Changes Required**:

1. **Backend: Terminal Stream Manager**
   - Add output buffer per agent
   - Buffer output when no dashboard is subscribed
   - Flush buffer when dashboard connects

2. **Backend: Message Router**
   - Track dashboard subscriptions per agent
   - Deliver buffered output on subscription

3. **Frontend: WebSocket Service**
   - Send "subscribe to agent output" message when session created
   - Request buffered output on subscription

**Pros**:
- ✅ No data loss
- ✅ Minimal frontend changes
- ✅ Centralizes buffer management

**Cons**:
- ❌ Complex backend implementation
- ❌ Memory management for buffers
- ❌ Need to implement buffer expiry/limits
- ❌ Requires protocol changes

**Implementation Steps**:

Too complex for current scope - recommend Option 1 instead.

---

#### Option 3: Database Persistence

**Approach**: Store all agent output in database, retrieve on session creation.

**Changes Required**:

1. **Backend: Terminal Output Model**
   - Modify to index by agentId + timestamp
   - Add efficient retrieval queries

2. **Backend: Agent Handler**
   - Store ALL terminal output to database

3. **Frontend: Terminal Store**
   - On session creation, fetch historical output from API
   - Populate buffer with historical data

**Pros**:
- ✅ Permanent history
- ✅ Survives refreshes
- ✅ Audit trail

**Cons**:
- ❌ Database load
- ❌ Latency for retrieval
- ❌ Storage costs
- ❌ Complex queries
- ❌ Out of scope for MVP

---

## Recommended Solution: Option 1 (Eager Session Creation)

### Implementation Details

**Step 1**: Add agent connection event listener

**File**: `frontend/src/stores/agent-websocket-integration.ts`

```typescript
// Add to existing WebSocket event listeners (after line 80)

// Auto-create terminal sessions for connected agents
webSocketService.on(MessageType.AGENT_CONNECTED, (payload: any) => {
  const { agentId, agentName, metadata } = payload;

  // Create terminal session immediately
  const sessionId = `agent-session-${agentId}`;
  const terminalStore = useTerminalStore.getState();

  // Only create if it doesn't exist
  if (!terminalStore.sessions.has(sessionId)) {
    terminalStore.createSession(
      sessionId,
      agentId,
      `Agent ${agentName || agentId} connected`
    );

    console.log('[AgentWebSocket] Created terminal session for agent:', {
      agentId,
      agentName,
      sessionId
    });
  }
});

// Clean up terminal sessions when agent disconnects
webSocketService.on(MessageType.AGENT_DISCONNECTED, (payload: any) => {
  const { agentId } = payload;

  // Keep session for history - don't delete
  // Just log for visibility
  console.log('[AgentWebSocket] Agent disconnected (session preserved):', agentId);
});
```

**Step 2**: Ensure agent messages include AGENT_CONNECTED

**File**: `packages/agent-protocol/src/types.ts`

Verify `MessageType` enum includes:
```typescript
export enum MessageType {
  // ... existing types
  AGENT_CONNECTED = 'AGENT_CONNECTED',
  AGENT_DISCONNECTED = 'AGENT_DISCONNECTED',
  // ...
}
```

**Step 3**: Backend sends AGENT_CONNECTED event

**File**: `backend/src/websocket/agent-handler.ts`

Check if backend already broadcasts AGENT_CONNECTED when agent authenticates. If not, add:

```typescript
// After successful authentication (around line 420-430)
// Broadcast to all connected dashboards
this.dependencies.messageRouter.broadcastToDashboards({
  type: MessageType.AGENT_CONNECTED,
  payload: {
    agentId: resolvedAgentId,
    agentName: payload.agentName,
    agentType: payload.agentType,
    metadata: payload.metadata,
    timestamp: Date.now()
  }
});
```

**Step 4**: Update /agents page to NOT create session on selection

**File**: `frontend/src/app/(auth)/agents/page.tsx`

```typescript
// Update the useEffect at lines 67-100
useEffect(() => {
  if (!selectedAgentId) {
    setActiveSession(null);
    return;
  }

  // Find the selected agent
  const agent = agents.find(a => a.id === selectedAgentId);
  if (!agent) {
    console.warn('[Terminal] Selected agent not found:', selectedAgentId);
    return;
  }

  // Session ID matching agent wrapper convention
  const sessionId = `agent-session-${agent.id}`;

  // Session should already exist (created on AGENT_CONNECTED)
  // If it doesn't, create it now as fallback
  if (!sessions.has(sessionId)) {
    console.warn('[Terminal] Session not found, creating fallback:', sessionId);
    createSession(
      sessionId,
      agent.id,
      `Monitoring ${agent.name || agent.id}`
    );
  }

  // Set as active session
  setActiveSession(sessionId);
  console.log(`[Terminal] Switched to session: ${sessionId}`);

}, [selectedAgentId, setActiveSession, sessions, agents, createSession]);
```

### Testing Plan

**Test Case 1: Fresh Agent Start**

1. Start backend and frontend
2. Start agent: `onsembl-agent start`
3. **Expected**:
   - Frontend creates terminal session immediately
   - Session ID: `agent-session-{agentId}`
4. Navigate to `/agents`
5. **Expected**:
   - See agent in list
6. Click on agent card
7. **Expected**:
   - Terminal shows agent startup banner:
     ```
     ═══════════════════════════════════════════════════════
       Interactive Mode Enabled
       Type ~~help for commands | Type ~~exit to quit
     ═══════════════════════════════════════════════════════
     Mock agent ready. Type commands or press Ctrl+C to exit.

     C:\Users\Ty\Desktop\onsembl\agent-wrapper>
     ```

**Test Case 2: Command Execution**

1. With agent selected in terminal
2. Type command: `echo hello`
3. Press Enter
4. **Expected**:
   - Frontend shows:
     ```
     $ echo hello
     hello

     C:\Users\Ty\Desktop\onsembl\agent-wrapper>
     ```

**Test Case 3: Multiple Agents**

1. Start agent 1: `onsembl-agent start`
2. Start agent 2: `onsembl-agent start --name agent-2`
3. **Expected**:
   - 2 sessions created: `agent-session-{id1}`, `agent-session-{id2}`
4. Select agent 1
5. **Expected**: See agent 1's output
6. Select agent 2
7. **Expected**: See agent 2's output
8. Switch back to agent 1
9. **Expected**: See agent 1's previous output (preserved)

**Test Case 4: Late Frontend Connection**

1. Start backend and agents
2. Wait 30 seconds
3. Start frontend
4. Navigate to `/agents`
5. **Expected**:
   - ❌ Output from before frontend started will be LOST
   - ✅ Output from after frontend connects will be captured
   - **Note**: This is expected behavior for Option 1

### Potential Enhancements

**Enhancement 1: Persist Output to Database**

For production, consider implementing Option 3 in addition to Option 1:
- Option 1 provides real-time streaming
- Option 3 provides persistent history
- Frontend fetches historical output on session creation

**Enhancement 2: Buffer Size Limits**

Add configuration to terminal buffer:
```typescript
const bufferManager = new TerminalBufferManager({
  maxLines: 10000,
  maxBufferSize: 1024 * 1024, // 1MB per session
  maxSessions: 50, // Limit total sessions
  sessionTTL: 3600000, // 1 hour
});
```

**Enhancement 3: Session Cleanup**

Add periodic cleanup of inactive sessions:
```typescript
// Clean up sessions older than 1 hour with no activity
setInterval(() => {
  const store = useTerminalStore.getState();
  const now = Date.now();
  store.sessions.forEach((session, sessionId) => {
    if (now - session.startTime > 3600000 && !session.isActive) {
      store.clearSession(sessionId);
    }
  });
}, 600000); // Every 10 minutes
```

## Alternative Considerations

### Why Not Use WebSocket Subscription Model?

**Idea**: Frontend sends "subscribe to agent X" message, backend starts streaming output.

**Issues**:
- ❌ Requires new WebSocket message type
- ❌ Backend needs subscription tracking
- ❌ Still loses output before subscription
- ❌ More complex than Option 1

### Why Not Replay from Database?

**Idea**: Store all output, replay on session creation.

**Issues**:
- ✅ Would work perfectly
- ❌ Out of scope for current MVP
- ❌ Database performance impact
- ❌ Can be added later as enhancement

## Dependencies

### External Dependencies

None - uses existing infrastructure.

### Internal Dependencies

1. **WebSocket Protocol**
   - MessageType.AGENT_CONNECTED event
   - MessageType.TERMINAL_OUTPUT event

2. **Terminal Buffer Manager**
   - Already implemented
   - Already handles session creation
   - Already buffers output

3. **Agent WebSocket Integration Store**
   - Already handles agent state
   - Needs new AGENT_CONNECTED listener

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Memory leak from too many sessions | Low | Medium | Add session cleanup + TTL |
| Session ID mismatch | Low | High | Unit tests for ID generation |
| Missing AGENT_CONNECTED events | Medium | High | Backend testing + fallback creation |
| Large output buffers | Medium | Medium | Buffer size limits + truncation |

## Success Criteria

1. ✅ Agent startup output appears in frontend terminal
2. ✅ Command execution output streams in real-time
3. ✅ Output preserved when switching between agents
4. ✅ No output loss after session creation
5. ✅ Session ID matches across agent/backend/frontend
6. ✅ < 200ms latency for output streaming
7. ✅ Memory usage stable (no leaks)

## Rollback Plan

If implementation fails:
1. Revert changes to `agent-websocket-integration.ts`
2. Keep existing lazy session creation in `/agents/page.tsx`
3. Document as known limitation: "Startup output not visible"

## Future Work

1. **Database Persistence** (Option 3)
   - Store all output for audit trail
   - Retrieve historical output on demand

2. **Output Filtering**
   - Filter by log level
   - Search across all agent output
   - Export to file

3. **Real-time Metrics**
   - Output rate (lines/sec)
   - Buffer size tracking
   - Session statistics

## Conclusion

**Recommendation**: Implement **Option 1 (Eager Session Creation)**

- ✅ Simplest solution
- ✅ No backend changes
- ✅ Leverages existing infrastructure
- ✅ Can be enhanced with database persistence later

**Estimated Effort**:
- Implementation: 2-3 hours
- Testing: 1 hour
- Documentation: 30 minutes
- **Total**: ~4 hours

**Next Steps**:
1. Get approval for Option 1
2. Implement changes to `agent-websocket-integration.ts`
3. Test with multiple agents
4. Document behavior and limitations
