# Terminal Output Mirroring - Test Results

**Date**: 2025-11-02
**Test URL**: http://localhost:3000/agents
**Browser**: Playwright (Chromium)
**Tester**: Automated Test via Playwright MCP

---

## Test Objective

Verify that terminal output from agents is properly mirrored to the dashboard's terminal viewer component when selecting an ONLINE agent.

**Expected Result**: Terminal should display actual agent CLI output (dotenv message, ASCII banner, prompts) instead of the fallback "Welcome to Onsembl Agent Terminal" message.

---

## ❌ TEST FAILED - Terminal Output NOT Mirroring

---

## Test Results Summary

| Component | Status | Notes |
|-----------|--------|-------|
| WebSocket Connection | ✅ Pass | Dashboard connected successfully |
| Agent List Display | ✅ Pass | 2 agents shown (1 online, 1 offline) |
| Agent Selection | ✅ Pass | Can click and select agents |
| Terminal Viewer UI | ✅ Pass | Renders with toolbar and input |
| Terminal Content | ❌ **FAIL** | Shows fallback message, not actual CLI output |
| TERMINAL_OUTPUT Events | ❌ **FAIL** | No messages received by frontend |
| Session Creation | ⚠️ Warning | Created as fallback, not from agent data |

---

## What Was Observed

### 1. Agent List - ✅ Working

- Dashboard successfully connected to WebSocket at `ws://localhost:8080/ws/dashboard`
- Received agent list with 2 agents:
  - **test-command-agent** (UUID: `5b63a9f3-bf4f-49dd-b39f-4b0646f9da31`) - **ONLINE**
  - **test-mock-agent** (UUID: `f5735aa9-8a7c-437e-b94a-30da6dc1d0ad`) - **OFFLINE**
- Agent status updates working correctly via AGENT_STATUS messages

### 2. Terminal Viewer UI - ✅ Rendering

- Terminal viewer component rendered when clicking on `test-command-agent`
- UI elements present:
  - Header showing agent ID: `5b63a9f3-bf4f-49dd-b39f-4b0646f9da31`
  - Toolbar with 6 action buttons
  - "Switch to xterm.js (Debug)" button
  - Command input field
  - Status bar showing "0 lines | 0 commands in history"
  - Session ID displayed: `agent-session-5b63a9f3-bf4f-49dd-b39f-4b0646f9da31`

### 3. Terminal Content - ❌ NOT Working

**Actual Output Shown**:
```
Welcome to Onsembl Agent Terminal
Connected to: 5b63a9f3-bf4f-49dd-b39f-4b0646f9da31
Type a command and press Enter...
```

**Expected Output**:
```
[dotenv@17.2.3] injecting env (4) from .env
═══════════════════════════════════════════════════════
  Interactive Mode Enabled
  Type ~~help for commands | Type ~~exit to quit
═══════════════════════════════════════════════════════
Mock agent ready. Type commands or press Ctrl+C to exit.

C:\Users\Ty\Desktop\onsembl\agent-wrapper>
```

**Conclusion**: Terminal is showing the default fallback message instead of actual CLI output from the agent.

---

## Browser Console Analysis

### Key Warning Messages

```
[WARNING] [Terminal] Session not found, creating fallback: agent-session-5b63a9f3-bf4f-49dd-b39f-4b0646f9da31
```

This warning indicates:
- When agent was selected, no pre-existing session was found
- Frontend created a new empty session with fallback content
- No historical terminal output was available for this agent

### Missing Log Messages (Critical)

**Expected but NOT seen**:
```
[TerminalStore] TERMINAL_OUTPUT received: {...}
[TerminalStore] TERMINAL_STREAM received: {...}
```

**Significance**: The frontend terminal store is NOT receiving any terminal output messages from the backend. This is the root cause of the failure.

### Present Log Messages

✅ **Working Components**:
```
[LOG] [WebSocketStore] ⚡ Dashboard state updated to: connected
[LOG] [WebSocketService] Sending DASHBOARD_INIT
[LOG] [AgentWebSocketIntegration] Dashboard connected, received agents: [Object, Object]
[LOG] [WebSocketStoreBridge] 📡 AGENT_STATUS received: {agentId: 5b63a9f3-bf4f-49dd-b39f-4b0646f9da31, mappedStatus: online}
[LOG] [Terminal] Switched to session: agent-session-5b63a9f3-bf4f-49dd-b39f-4b0646f9da31
```

⚠️ **Warning Messages**:
```
[LOG] [TerminalViewer] Polling not started: {hasTerminal: false, activeSessionId: agent-session-5b63a9f3-bf4f-49dd-b39f-4b0646f9da31, isInitialized: false}
[LOG] [HealthMonitor] Status changed: healthy -> degraded
```

---

## Screenshot Evidence

![Terminal Viewer Test Result](C:\Users\Ty\Desktop\onsembl\.playwright-mcp\terminal-viewer-test.png)

**Screenshot Shows**:
- Left panel: Agent list with "test-command-agent" selected (green "online" badge)
- Right panel: Terminal viewer displaying fallback welcome message
- Session info: `agent-session-5b63a9f3-bf4f-49dd-b39f-4b0646f9da31`
- Buffer: 0 lines
- No actual CLI output visible

---

## Root Cause Analysis

### Primary Issue: No TERMINAL_OUTPUT Messages Received

The dashboard frontend is NOT receiving any `TERMINAL_OUTPUT` or `TERMINAL_STREAM` WebSocket messages from the backend.

**Evidence**:
1. No console logs from `terminal.store.ts` lines 202 or 239
2. Session created as fallback instead of populated from agent data
3. Buffer shows 0 lines

**Possible Root Causes**:

#### Cause A: Agent Not Sending Output
The connected agent (`test-command-agent`) might not be sending initial CLI output as TERMINAL_OUTPUT messages.

**Analysis**:
- Based on `backend/scripts/test/test-agent.js` review (lines 130-147)
- Test script only sends TERMINAL_OUTPUT in response to COMMAND_REQUEST
- Does NOT send startup banner or monitoring output automatically
- This is likely the primary cause

#### Cause B: Backend Not Forwarding
Backend receives TERMINAL_OUTPUT but doesn't forward it as TERMINAL_STREAM to dashboards.

**Counter-Evidence**:
- Code review of `backend/src/websocket/agent-handler.ts` (lines 667-730) shows:
  - ✅ Receives TERMINAL_OUTPUT messages
  - ✅ Normalizes commandId: `agentId` → `agent-session-{agentId}`
  - ✅ Calls `messageRouter.streamTerminalOutput()`
  - ✅ Should broadcast as TERMINAL_STREAM
- Logic appears correct, but needs runtime verification

#### Cause C: Session ID Mismatch
Agent sends with different commandId than dashboard expects.

**Counter-Evidence**:
- Backend normalizes monitoring output: `commandId === agentId` → `agent-session-{agentId}`
- Frontend creates session with same format: `agent-session-{agentId}`
- IDs should match if backend normalization works

### Secondary Issue: Session Created as Fallback

**Warning**: `[Terminal] Session not found, creating fallback`

**Analysis**:
- Triggered in `frontend/src/app/(auth)/agents/page.tsx` line 111
- Occurs when selecting agent that has no existing terminal session
- Creates empty session with default welcome message
- Indicates no prior TERMINAL_OUTPUT was received for this agent

---

## Backend Code Analysis

### agent-handler.ts - TERMINAL_OUTPUT Handler

**File**: `C:\Users\Ty\Desktop\onsembl\backend\src\websocket\agent-handler.ts`
**Lines**: 667-730

**Function**: `handleTerminalOutput()`

**Logic Flow**:
1. ✅ Extract payload from TERMINAL_OUTPUT message
2. ✅ Get resolved agentId from connection
3. ✅ Normalize commandId for monitoring output:
   ```typescript
   const normalizedCommandId = payload.commandId === resolvedAgentId
     ? `agent-session-${resolvedAgentId}`
     : payload.commandId;
   ```
4. ✅ Log debug info (lines 684-691):
   ```
   [CMD-FWD] Received terminal output from agent
     originalCommandId: ...
     normalizedCommandId: agent-session-...
     isMonitoringOutput: true
   ```
5. ✅ Process output through terminal stream manager (line 701)
6. ✅ Route to dashboard via message router (lines 704-711)
7. ✅ Log success (lines 713-717):
   ```
   [CMD-FWD] Streamed terminal output to dashboard
   ```
8. ✅ Send ACK back to agent (lines 720-725)

**Expected Backend Logs** (if agent were sending output):
```
[CMD-FWD] Received terminal output from agent {
  originalCommandId: '5b63a9f3-bf4f-49dd-b39f-4b0646f9da31',
  normalizedCommandId: 'agent-session-5b63a9f3-bf4f-49dd-b39f-4b0646f9da31',
  isMonitoringOutput: true,
  agentId: '5b63a9f3-bf4f-49dd-b39f-4b0646f9da31',
  contentLength: 87,
  streamType: 'stdout'
}

[CMD-FWD] Streamed terminal output to dashboard {
  commandId: 'agent-session-5b63a9f3-bf4f-49dd-b39f-4b0646f9da31',
  agentId: '5b63a9f3-bf4f-49dd-b39f-4b0646f9da31'
}
```

**Conclusion**: Backend handler logic appears correct. Issue likely upstream (agent not sending).

---

## Agent Investigation

### Test Agent Script Analysis

**File**: `C:\Users\Ty\Desktop\onsembl\backend\scripts\test\test-agent.js`
**Lines**: 130-150

**TERMINAL_OUTPUT Sending Logic**:
```javascript
// Only sends output in response to COMMAND_REQUEST
function handleCommandRequest(message) {
  // ...
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'TERMINAL_OUTPUT',
      payload: {
        commandId,        // From command request
        agentId,
        content: output + '\n',
        streamType: 'stdout'
      }
    }));
  }, 200);
}
```

**Key Finding**:
- ❌ Test agent does NOT send TERMINAL_OUTPUT on connection
- ❌ Only sends output when receiving COMMAND_REQUEST
- ❌ No startup banner, no monitoring output

### Real Agent Wrapper Behavior

**File**: `C:\Users\Ty\Desktop\onsembl\agent-wrapper\src\terminal\interactive-wrapper.ts`
**Lines**: 547-556

**Startup Banner**:
```typescript
private displayInteractiveHelp(): void {
  process.stdout.write('\n');
  process.stdout.write('═══════════════════════════════════════════════════════\n');
  process.stdout.write('  Interactive Mode Enabled\n');
  process.stdout.write('  Type ~~help for commands | Type ~~exit to quit\n');
  process.stdout.write('═══════════════════════════════════════════════════════\n');
  process.stdout.write('\n');
}
```

**Stream Capture** (should be in `websocket-client.ts`):
- Real agent wrapper captures `process.stdout.write()` calls
- Sends as TERMINAL_OUTPUT with `commandId = agentId` for monitoring
- Should provide startup banner automatically

**Conclusion**:
- Real agent wrapper SHOULD send startup output
- Test script does NOT
- Need to verify which type of agent is actually running

---

## Next Steps for Investigation

### 1. Determine Which Agent is Running

**Action**: Check which agent process is connected as `test-command-agent`

**Options**:
- Is it the test script (`backend/scripts/test/test-agent.js`)?
- Is it a real agent wrapper instance?
- Check backend logs for agent connection info

### 2. Verify Backend is Receiving TERMINAL_OUTPUT

**Action**: Check backend console/logs for `[CMD-FWD]` messages

**Expected** (if agent sends output):
```
[CMD-FWD] Received terminal output from agent
[CMD-FWD] Streamed terminal output to dashboard
```

**If missing**: Agent is not sending TERMINAL_OUTPUT (confirms Cause A)

### 3. Check Message Router Broadcast

**Action**: Verify backend is broadcasting TERMINAL_STREAM to dashboards

**File**: `backend/src/websocket/message-router.ts` lines 309-315

**Expected Logs**:
```
[MessageRouter] Routing TERMINAL_STREAM to dashboard
```

### 4. Add Verbose Logging

**Action**: Enable debug logging in:
- Backend: `agent-handler.ts` TERMINAL_OUTPUT handler
- Backend: `message-router.ts` streamTerminalOutput method
- Frontend: `terminal.store.ts` event listeners
- Agent: websocket-client.ts output sending

### 5. Test with Real Agent Wrapper

**Action**: Start actual agent wrapper instead of test script

**Command**:
```bash
cd agent-wrapper
npm run start:mock
```

**Expected**: Should send startup banner as TERMINAL_OUTPUT

---

## Recommendations

### Immediate Fixes

#### Option A: Use Real Agent Wrapper ⭐ Recommended

**Action**: Replace test script with real agent wrapper for testing

**Benefits**:
- Real agent captures and sends stdout/stderr
- Provides startup banner automatically
- More realistic test scenario

**Steps**:
1. Stop `test-command-agent` if running
2. Start agent wrapper: `cd agent-wrapper && npm run start:mock`
3. Refresh dashboard and test again

#### Option B: Enhance Test Agent Script

**Action**: Modify `backend/scripts/test/test-agent.js` to send startup output

**Implementation**:
```javascript
ws.on('open', () => {
  // ... existing code ...

  // Send startup banner as TERMINAL_OUTPUT
  const banner = [
    '[dotenv@17.2.3] injecting env (4) from .env\n',
    '═══════════════════════════════════════════════════════\n',
    '  Interactive Mode Enabled\n',
    '  Type ~~help for commands | Type ~~exit to quit\n',
    '═══════════════════════════════════════════════════════\n',
    'Mock agent ready. Type commands or press Ctrl+C to exit.\n',
    '\n',
    'C:\\Users\\Ty\\Desktop\\onsembl\\agent-wrapper> '
  ];

  banner.forEach((line, i) => {
    setTimeout(() => {
      ws.send(JSON.stringify({
        id: uuidv4(),
        type: 'TERMINAL_OUTPUT',
        timestamp: Date.now(),
        payload: {
          commandId: agentId,  // Use agentId for monitoring output
          agentId: agentId,
          content: line,
          streamType: 'stdout',
          timestamp: Date.now()
        }
      }));
    }, 100 * i);
  });
});
```

**Benefits**:
- Quick fix for test script
- Simulates real agent behavior
- Useful for automated testing

#### Option C: Implement Backend Historical Output Storage

**Action**: Store terminal output in database/Redis for retrieval

**Benefits**:
- Dashboard can fetch missed output on late connection
- Survives frontend restarts
- More robust system

**Drawbacks**:
- More complex implementation
- Requires database schema changes
- Out of scope for current test

### Long-term Improvements

1. **Session Persistence**
   - Store terminal sessions in Redis with TTL
   - Fetch on dashboard connection
   - Handle reconnection gracefully

2. **Buffer Management**
   - Implement max buffer size (e.g., 1000 lines per session)
   - Trim old lines automatically
   - Add "load more" functionality

3. **Historical Replay**
   - Store output in database with timestamps
   - Allow playback of previous sessions
   - Useful for debugging and auditing

4. **Better Error Handling**
   - Show specific error if agent not sending output
   - Provide troubleshooting tips in UI
   - Log detailed diagnostics

5. **Comprehensive Logging**
   - Add trace-level logging for terminal flow
   - Track message journey from agent → backend → dashboard
   - Include timing information for performance monitoring

---

## Conclusion

### Test Result: ❌ **FAILED**

The terminal output mirroring feature **did not work** in this test. The root cause is that the connected agent (`test-command-agent`) is not sending initial startup/banner output as TERMINAL_OUTPUT messages to the backend.

### Root Cause

**Primary**: Agent not sending TERMINAL_OUTPUT messages
- Test agent script only sends output in response to commands
- Does not send monitoring/startup output automatically
- Backend never receives messages to forward

**Secondary**: Session created as fallback
- No historical output available when agent is selected
- Frontend creates empty session with default welcome message

### Verification Needed

1. ✅ Frontend WebSocket connection - **Working**
2. ✅ Agent status updates - **Working**
3. ✅ Terminal UI rendering - **Working**
4. ❌ Agent sending TERMINAL_OUTPUT - **NOT VERIFIED** (likely failing)
5. ❓ Backend forwarding to dashboard - **NEEDS RUNTIME VERIFICATION**
6. ❌ Frontend receiving TERMINAL_STREAM - **NOT WORKING** (no messages seen)

### Recommended Next Action

**Immediate**: Run test with real agent wrapper instead of test script
```bash
cd agent-wrapper
npm run start:mock
```

Then retest terminal output mirroring to verify if real agent solves the issue.

---

## Original Testing Guide Below

---

# Terminal Output Mirroring - Testing Guide

## Test Setup

1. **Start Backend**
   ```bash
   cd backend
   npm run dev
   ```

2. **Start Frontend**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Open Browser Console** (F12) to monitor logs

## Test Case 1: Fresh Agent Start

**Objective**: Verify startup output is captured and displayed

**Steps**:
1. Start an agent:
   ```bash
   onsembl-agent start
   ```

2. **Expected Backend Logs**:
   ```
   Agent authenticated and connected
   [MessageRouter] Routing message to dashboard: AGENT_CONNECTED
   ```

3. **Expected Frontend Console Logs**:
   ```
   [AgentWebSocket] Created terminal session for agent: {agentId}
   ```

4. Open browser → Navigate to `/agents` page

5. Click on the connected agent card

6. **Expected Terminal Output**:
   ```
   ═══════════════════════════════════════════════════════
     Interactive Mode Enabled
     Type ~~help for commands | Type ~~exit to quit
   ═══════════════════════════════════════════════════════
   Mock agent ready. Type commands or press Ctrl+C to exit.

   C:\Users\Ty\Desktop\onsembl\agent-wrapper>
   ```

**Success Criteria**:
- ✅ Startup banner is visible
- ✅ Command prompt is visible
- ✅ No "Welcome to Onsembl Agent Terminal" placeholder

## Test Case 2: Command Execution

**Objective**: Verify command output streams correctly

**Steps**:
1. With agent selected in terminal
2. Type command: `echo hello world`
3. Press Enter

**Expected Terminal Output**:
```
$ echo hello world
hello world

C:\Users\Ty\Desktop\onsembl\agent-wrapper>
```

**Success Criteria**:
- ✅ Command input is echoed
- ✅ Command output appears immediately
- ✅ New prompt appears after output

## Test Case 3: Multiple Agents

**Objective**: Verify each agent has its own session

**Steps**:
1. Start first agent:
   ```bash
   onsembl-agent start --name agent-1
   ```

2. Start second agent:
   ```bash
   onsembl-agent start --name agent-2
   ```

3. **Expected Frontend Logs**:
   ```
   [AgentWebSocket] Created terminal session for agent: {id1}
   [AgentWebSocket] Created terminal session for agent: {id2}
   ```

4. Select agent-1 → Verify output shows
5. Select agent-2 → Verify output shows
6. Switch back to agent-1 → Verify previous output is preserved

**Success Criteria**:
- ✅ Two separate sessions created
- ✅ Each session shows correct agent output
- ✅ Output is preserved when switching between agents

## Test Case 4: Late Frontend Connection

**Objective**: Understand limitation of Option 1

**Steps**:
1. Start backend and agent
2. Wait 30 seconds (agent produces some output)
3. Start frontend
4. Navigate to `/agents` and select the agent

**Expected Behavior**:
- ❌ Output from before frontend started is LOST
- ✅ Output from after frontend connects is captured

**This is expected behavior** - Option 1 only captures output after the frontend connects.

## Test Case 5: Session Persistence

**Objective**: Verify sessions are preserved across agent selection

**Steps**:
1. Select agent → Type command: `echo test1`
2. Deselect agent (click it again)
3. Select a different agent
4. Select original agent again

**Expected**:
- ✅ Previous output (`test1`) is still visible
- ✅ No new welcome message

**Success Criteria**:
- ✅ Session history is preserved
- ✅ No data loss when switching agents

## Debugging Tips

### No Output Showing

1. **Check Frontend Console**:
   ```
   [AgentWebSocket] Created terminal session for agent: ...
   ```
   → If missing: AGENT_CONNECTED event not received

2. **Check Backend Logs**:
   ```
   Routing message to dashboard: AGENT_CONNECTED
   ```
   → If missing: Backend not broadcasting event

3. **Check Session ID Format**:
   - Frontend creates: `agent-session-{agentId}`
   - Agent sends with: same agentId
   - Verify IDs match in logs

### Session Created But Output Not Showing

1. **Check Terminal Store**:
   ```javascript
   // In browser console
   useTerminalStore.getState().sessions
   ```

2. **Check Active Session**:
   ```javascript
   useTerminalStore.getState().activeSessionId
   ```

3. **Check Output Buffer**:
   ```javascript
   useTerminalStore.getState().getActiveSessionOutput()
   ```

### Agent ID Mismatch

If you see warnings about mismatched agent IDs:
1. Backend resolves CLI ID to database UUID
2. AGENT_CONNECTED should contain the UUID
3. Frontend should create session with UUID
4. Check backend logs for ID resolution

## Known Limitations

1. **Pre-Frontend Output Lost**: Output sent before frontend connects is not captured
   - Future enhancement: Implement database persistence (Option 3)

2. **Memory Usage**: Sessions accumulate in browser memory
   - Future enhancement: Implement session cleanup with TTL

3. **No Historical Replay**: Can't retrieve output from previous sessions after page refresh
   - Future enhancement: Store output in database

## Success Indicators

When everything is working correctly, you should see:

**Backend Console**:
```
Agent authenticated and connected
[MessageRouter] Routing AGENT_CONNECTED to dashboard
```

**Frontend Console**:
```
[AgentWebSocket] Created terminal session for agent: {agentId}
[Terminal] Switched to session: agent-session-{agentId}
```

**Frontend Terminal**:
- Full agent startup banner
- All command output in real-time
- No placeholder messages
- Clean command prompt

## Next Steps After Testing

If tests pass:
1. ✅ Mark ONS-6 as complete
2. 📝 Document as MVP feature
3. 🔄 Plan Option 3 (database persistence) for future sprint

If tests fail:
1. 🔍 Check logs for error messages
2. 🐛 Enable verbose logging in agent-wrapper
3. 📊 Compare expected vs actual session IDs
4. 🔄 Verify WebSocket connection state
