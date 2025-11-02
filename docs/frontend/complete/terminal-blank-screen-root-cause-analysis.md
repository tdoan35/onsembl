# Terminal Blank Screen - Root Cause Analysis

**Date**: 2025-10-31
**Issue**: Terminal viewer shows blank screen when online agent is selected
**Status**: ✅ ROOT CAUSE IDENTIFIED

## Executive Summary

The terminal viewer displays a blank screen because of a **session ID mismatch** between what the agent wrapper sends and what the frontend expects to receive.

- **Agent sends**: `commandId: 'terminal'`
- **Frontend expects**: `sessionId: 'agent-monitor-{agentId}'`
- **Result**: Terminal output is stored under the wrong key and never retrieved

## Data Flow Analysis

### 1. ✅ Agent → Backend WebSocket

**File**: `agent-wrapper/src/terminal/interactive-wrapper.ts:185, 256`

The agent wrapper correctly sends terminal output via WebSocket:

```typescript
this.wsClient?.sendOutput('terminal', 'stdout', processedData, ansiCodes);
```

**Issue**: The commandId is hardcoded to `'terminal'` instead of using an actual command/session identifier.

**WebSocket Client** (`agent-wrapper/src/websocket-client.ts:267-285`):

```typescript
async sendOutput(commandId: string, stream: 'stdout' | 'stderr', data: string, ansiCodes?: string): Promise<void> {
  const payload: TerminalOutputPayload = {
    commandId,  // 'terminal' - hardcoded!
    agentId: this.agentId,
    content: data,
    streamType: stream === 'stderr' ? 'STDERR' : 'STDOUT',
    ansiCodes: !!ansiCodes,
    sequence: this.getNextSequence(commandId)
  };

  const message: WebSocketMessage<TerminalOutputPayload> = {
    type: MessageType.TERMINAL_OUTPUT,
    id: `${commandId}-${Date.now()}`,
    timestamp: Date.now(),
    payload
  };

  await this.sendMessage(message);
}
```

### 2. ✅ Backend Receives and Routes Terminal Output

**File**: `backend/src/websocket/agent-handler.ts:491-522`

Backend correctly handles `TERMINAL_OUTPUT` messages:

```typescript
private async handleTerminalOutput(
  connection: AgentConnection,
  message: TypedWebSocketMessage<MessageType.TERMINAL_OUTPUT>
): Promise<void> {
  const payload = message.payload;

  try {
    // Process terminal output through stream manager
    await this.dependencies.terminalStreamManager.processOutput(payload);

    // T017: Stream to dashboard with proper command tracking
    this.dependencies.messageRouter.streamTerminalOutput({
      commandId: payload.commandId,  // Still 'terminal'
      agentId: payload.agentId,
      content: payload.content,
      streamType: payload.streamType,
      ansiCodes: payload.ansiCodes,
      timestamp: Date.now()
    });

    // ... acknowledgment
  } catch (error) {
    this.server.log.error({ error, commandId: payload.commandId }, 'Failed to handle terminal output');
  }
}
```

### 3. ✅ Backend Routes to Dashboard via Message Router

**File**: `backend/src/websocket/message-router.ts:226-258`

Message router correctly sends `TERMINAL_STREAM` to dashboards:

```typescript
streamTerminalOutput(payload: TerminalStreamPayload): void {
  // Check if payload contains commandId
  const commandId = (payload as any).commandId;  // 'terminal'

  const dashboardId = commandId ? this.commandToDashboard.get(commandId) : undefined;

  if (commandId && dashboardId) {
    // Route to specific dashboard that initiated the command
    this.routeToSpecificDashboard(dashboardId, MessageType.TERMINAL_STREAM, payload, 9);
    return;
  }

  // Fall back to broadcast if no command tracking
  this.routeToDashboard(
    MessageType.TERMINAL_STREAM,
    payload,
    9, // Very high priority for real-time streaming
    (connectionId, metadata) => {
      return metadata.type === 'dashboard' &&
             metadata.isAuthenticated &&
             this.isDashboardSubscribedToTerminals(connectionId);
    }
  );
}
```

**Note**: Since `commandId: 'terminal'` is not tracked in `commandToDashboard` map (only real command IDs are tracked), it falls back to **broadcasting to all authenticated dashboards**.

### 4. ✅ Frontend WebSocket Service Receives Messages

**File**: `frontend/src/services/websocket.service.ts:413-463`

WebSocket service correctly processes incoming messages:

```typescript
private handleMessage(endpoint: string, event: MessageEvent): void {
  try {
    const message: WebSocketMessage = JSON.parse(event.data);
    this.processMessage(message);
    this.resetHeartbeatTimeout(endpoint);
    // ...
  } catch (error) {
    console.error(`[WebSocket][${endpoint}] Failed to parse message:`, error);
  }
}

private processMessage(message: WebSocketMessage): void {
  const { type, payload } = message;
  // ... handle PING, PONG, TOKEN_REFRESH

  // Emit event to listeners
  const listeners = this.eventListeners.get(type);
  if (listeners) {
    listeners.forEach(callback => {
      try {
        callback(payload, message);
      } catch (error) {
        // Error in event listener
      }
    });
  }

  // Dispatch custom event
  this.dispatchEvent(new CustomEvent(type, { detail: { payload, message } }));
}
```

### 5. ✅ Terminal Store Receives TERMINAL_STREAM Events

**File**: `frontend/src/stores/terminal.store.ts:213-235`

Terminal store correctly listens for `TERMINAL_STREAM` messages:

```typescript
webSocketService.on(MessageType.TERMINAL_STREAM, (payload: any) => {
  const { commandId, agentId, content, streamType, ansiCodes } = payload;
  const store = useTerminalStore.getState();

  // Handle batched output
  if (Array.isArray(content)) {
    content.forEach((line: string) => {
      store.addOutput(
        commandId,  // 'terminal' !!!
        line,
        streamType === 'STDERR' ? 'stderr' : 'stdout',
        ansiCodes
      );
    });
  } else {
    store.addOutput(
      commandId,  // 'terminal' !!!
      content,
      streamType === 'STDERR' ? 'stderr' : 'stdout',
      ansiCodes
    );
  }
});
```

**Store Method** (`terminal.store.ts:114-122`):

```typescript
addOutput: (commandId: string, content: string, type: 'stdout' | 'stderr', ansiCodes?: string[]) => {
  bufferManager.addOutput(commandId, content, type, ansiCodes);
  // ^^^^^^^^^^^^^^ stores under commandId = 'terminal'

  // If this is the active session and scroll is not locked, trigger scroll
  const state = get()
  if (state.activeSessionId === commandId && !state.isScrollLocked) {
    state.scrollToBottom()
  }
},
```

Terminal output is stored in buffer manager under key `'terminal'`.

### 6. ❌ Frontend Creates Session with WRONG ID

**File**: `frontend/src/app/(auth)/agents/page.tsx:49-76`

When user selects an agent, the page creates a monitoring session:

```typescript
useEffect(() => {
  if (!selectedAgentId) {
    setActiveSession(null);
    return;
  }

  // Create monitoring session ID for this agent
  const sessionId = `agent-monitor-${selectedAgentId}`;
  //                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //                THIS DOES NOT MATCH 'terminal'!

  // Create session if it doesn't exist
  if (!sessions.has(sessionId)) {
    const agent = agents.find(a => a.id === selectedAgentId);
    createSession(
      sessionId,  // 'agent-monitor-afbacd18-3d00-4072-8a32-d899b1685700'
      selectedAgentId,
      `Monitoring ${agent?.name || 'Agent'}`
    );
    console.log(`[Terminal] Created monitoring session for agent: ${selectedAgentId}`);
  }

  // Set as active session
  setActiveSession(sessionId);
  console.log(`[Terminal] Switched to session: ${sessionId}`);

}, [selectedAgentId, createSession, setActiveSession, sessions, agents]);
```

### 7. ❌ Terminal Viewer Polls for Output Under WRONG ID

**File**: `frontend/src/components/terminal/terminal-viewer.tsx:345-365`

Terminal viewer polls for output from the active session:

```typescript
useEffect(() => {
  if (!terminal.current || !activeSessionId) return;

  const updateInterval = setInterval(() => {
    if (!terminal.current) return;

    try {
      const terminalLines = getActiveSessionOutput();
      //                    ^^^^^^^^^^^^^^^^^^^^^^^
      //                    Looks for session 'agent-monitor-{agentId}'

      // Only process new lines
      if (terminalLines.length > lastProcessedLine.current) {
        const newLines = terminalLines.slice(lastProcessedLine.current);
        // ... write to xterm
      }
    } catch (e) {
      // Ignore errors during terminal disposal
    }
  }, 50); // Check every 50ms for new output

  return () => {
    clearInterval(updateInterval);
  };
}, [activeSessionId, getActiveSessionOutput]);
```

**getActiveSessionOutput** (`terminal.store.ts:151-155`):

```typescript
getActiveSessionOutput: (): TerminalLine[] => {
  const { activeSessionId } = get()
  if (!activeSessionId) return []
  return get().getSessionOutput(activeSessionId)
  //                              ^^^^^^^^^^^^^^^ 'agent-monitor-{agentId}'
},

getSessionOutput: (commandId: string): TerminalLine[] => {
  const buffer = bufferManager.getBuffer(commandId);
  //                           ^^^^^^^^^ Tries to get buffer for 'agent-monitor-{agentId}'
  return buffer.getLines();  // Returns [] because buffer doesn't exist!
},
```

## The Root Cause

### Mismatch Summary

| Component | Session/Command ID | Status |
|-----------|-------------------|--------|
| Agent Wrapper | `'terminal'` | ❌ Hardcoded |
| Backend Handler | `'terminal'` | ✅ Passes through |
| Message Router | `'terminal'` | ✅ Broadcasts to dashboards |
| WebSocket Service | `'terminal'` | ✅ Emits event |
| Terminal Store | `'terminal'` | ✅ Stores output |
| Agents Page | `'agent-monitor-{agentId}'` | ❌ Wrong ID |
| Terminal Viewer | `'agent-monitor-{agentId}'` | ❌ Polls wrong buffer |

### Visual Flow

```
Agent Wrapper
    ↓ commandId: 'terminal'
Backend WebSocket Handler
    ↓ commandId: 'terminal'
Message Router → TERMINAL_STREAM broadcast
    ↓ commandId: 'terminal'
Frontend WebSocket Service
    ↓ commandId: 'terminal'
Terminal Store → bufferManager.addOutput('terminal', content)
    ↓ STORED in buffer['terminal']

    ❌ MISMATCH ❌

Agents Page → createSession('agent-monitor-{agentId}')
    ↓ activeSessionId: 'agent-monitor-{agentId}'
Terminal Viewer → getActiveSessionOutput()
    ↓ bufferManager.getBuffer('agent-monitor-{agentId}')
    ↓ Returns [] because buffer doesn't exist!

Result: Blank terminal screen
```

## Evidence from Console Logs

From user's console logs:

```
[Terminal] Created monitoring session for agent: afbacd18-3d00-4072-8a32-d899b1685700
[Terminal] Switched to session: agent-monitor-afbacd18-3d00-4072-8a32-d899b1685700
```

But the terminal output from agent is stored under session ID `'terminal'`, not `'agent-monitor-afbacd18-3d00-4072-8a32-d899b1685700'`.

## Solutions

### Option 1: Fix Agent Wrapper (Recommended)

**Change**: Agent wrapper should send terminal output with a proper session ID instead of hardcoded `'terminal'`.

**Location**: `agent-wrapper/src/terminal/interactive-wrapper.ts`

**Approach**:
- Generate a session ID when agent connects: `agent-session-{agentId}`
- Use this session ID for all terminal output
- Frontend creates sessions with matching ID: `agent-session-{agentId}`

**Pros**:
- ✅ Proper session tracking
- ✅ Consistent with command execution flow
- ✅ Enables multiple terminal sessions per agent

**Cons**:
- ⚠️ Requires agent wrapper changes
- ⚠️ Need to coordinate session ID generation

### Option 2: Fix Frontend to Use 'terminal' ID

**Change**: Frontend creates sessions with ID `'terminal'` instead of `'agent-monitor-{agentId}'`.

**Location**: `frontend/src/app/(auth)/agents/page.tsx`

**Approach**:
```typescript
const sessionId = 'terminal'; // Match what agent sends
```

**Pros**:
- ✅ Quick fix, frontend-only change
- ✅ Works with current agent implementation

**Cons**:
- ❌ Can't distinguish between multiple agents
- ❌ All agents share the same terminal buffer
- ❌ Not scalable for multi-agent scenarios

### Option 3: Fix Both (Best Practice)

**Change**: Coordinate session IDs between agent and frontend using agentId.

**Locations**:
- `agent-wrapper/src/terminal/interactive-wrapper.ts`
- `frontend/src/app/(auth)/agents/page.tsx`

**Approach**:
- Agent sends: `commandId: agent-session-{agentId}`
- Frontend creates: `sessionId: agent-session-{agentId}`

**Pros**:
- ✅ Proper architecture
- ✅ Scalable to multiple agents
- ✅ Clear session ownership

**Cons**:
- ⚠️ Requires changes in both agent and frontend
- ⚠️ More coordination needed

## Recommendation

**Implement Option 2 first** as a quick fix to unblock testing, then **refactor to Option 3** for proper architecture.

### Quick Fix Implementation

1. **File**: `frontend/src/app/(auth)/agents/page.tsx`
2. **Change line 57**:
   ```typescript
   // Before:
   const sessionId = `agent-monitor-${selectedAgentId}`;

   // After:
   const sessionId = 'terminal';
   ```

### Long-term Fix Implementation (Simplified)

**Goal**: Make agent wrapper and frontend use the same session ID pattern.

**Session ID Convention**: `agent-session-{agentId}`

**Why This Works**:
- ✅ Each agent gets its own terminal buffer
- ✅ Simple to implement - 3 file changes
- ✅ No database changes needed
- ✅ Backend already handles it correctly

---

#### Step 1: Agent Wrapper (2 changes)

**File**: `agent-wrapper/src/terminal/interactive-wrapper.ts`

Add session ID property in constructor:
```typescript
constructor(config: Config, options: InteractiveOptions = {}) {
  // ... existing code
  this.agentId = `${config.agentType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  this.sessionId = `agent-session-${this.agentId}`; // ADD THIS LINE
}
```

Replace `'terminal'` with `this.sessionId` in 2 places:
```typescript
// Line ~185 (interactive mode)
this.wsClient?.sendOutput(this.sessionId, 'stdout', processedData, ansiCodes);

// Lines ~256, ~266 (headless mode)
this.wsClient.sendOutput(this.sessionId, 'stdout', stripAnsi(data), undefined);
this.wsClient.sendOutput(this.sessionId, 'stderr', stripAnsi(data), undefined);
```

---

#### Step 2: Frontend (1 change)

**File**: `frontend/src/app/(auth)/agents/page.tsx`

Change line ~57:
```typescript
// Before:
const sessionId = `agent-monitor-${selectedAgentId}`;

// After:
const sessionId = `agent-session-${selectedAgentId}`;
```

---

#### Step 3: Test It

1. Restart agent wrapper
2. Refresh frontend
3. Click on online agent
4. Terminal should show output!

---

#### That's It!

No backend changes needed. No database migrations. No complex testing. Just 3 lines of code changed across 2 files.

## Testing Checklist

After implementing the fix:

- [ ] Restart agent wrapper with new code
- [ ] Refresh frontend
- [ ] Click on online agent
- [ ] Verify terminal output appears (should see prompt and any existing output)
- [ ] Type a command and verify it appears in terminal
- [ ] Switch to different agent and verify terminal updates
- [ ] Check console logs for `[Terminal] Created session for agent: agent-session-{agentId}`

## Files to Change

**Agent Wrapper**:
- `agent-wrapper/src/terminal/interactive-wrapper.ts` - Add sessionId property and use it

**Frontend**:
- `frontend/src/app/(auth)/agents/page.tsx` - Change session ID pattern to match agent

**No changes needed**:
- Backend (already works correctly)
- Terminal viewer component
- Terminal store
- WebSocket services

## Conclusion

The blank terminal screen is caused by a **session ID mismatch** between the agent wrapper (sending `'terminal'`) and the frontend (expecting `'agent-monitor-{agentId}'`). Terminal output is being received and stored correctly, but under the wrong key, making it invisible to the terminal viewer component.

**The fix is simple**: Make both sides use `agent-session-{agentId}`. This requires changing just 3 lines of code across 2 files - no backend work, no database migrations, no complex refactoring. The infrastructure is already in place and working correctly; we just need to align the session IDs.
