# Terminal Stream Handler Fix

## Problem
Frontend was not receiving terminal output even though:
- Backend was successfully receiving `TERMINAL_OUTPUT` from agents
- Backend was successfully sending `TERMINAL_STREAM` to dashboards
- Backend logs showed hundreds of `[CMD-FWD] Streamed terminal output to dashboard` messages
- Dashboard subscription was correct (`terminals: true`)

## Root Cause
**Missing WebSocket Message Handler in Frontend**

**File:** `frontend/src/services/websocket-store-bridge.ts`

The frontend had a handler for `MessageType.TERMINAL_OUTPUT` (which agents send to the backend), but was **missing a handler** for `MessageType.TERMINAL_STREAM` (which the backend sends to dashboards).

### Message Flow
```
Agent → TERMINAL_OUTPUT → Backend → TERMINAL_STREAM → Dashboard (Frontend)
                                                         ↑
                                                  NO HANDLER!
```

### Evidence
**Backend Protocol** (`packages/agent-protocol/src/types.ts`):
- Line 22: `TERMINAL_OUTPUT` - Agent to Backend
- Line 39: `TERMINAL_STREAM` - Backend to Dashboard

**Frontend Code** (`frontend/src/services/websocket-store-bridge.ts`):
- Line 231: Handler for `TERMINAL_OUTPUT` ✅
- Line 257: Handler for `TERMINAL_STREAM` ❌ **MISSING**

## Solution

### 1. Add Import for TerminalStreamPayload

**File:** `frontend/src/services/websocket-store-bridge.ts` (lines 11-26)

```typescript
import {
  MessageType,
  AgentStatusPayload,
  AgentConnectedPayload,
  CommandStatusPayload,
  CommandProgressPayload,
  TerminalOutputPayload,
  TerminalStreamPayload,  // <-- ADDED
  ErrorPayload,
  AgentMetricsPayload,
  CommandRequestPayload,
  CommandCancelPayload,
  EmergencyStopPayload,
  CommandResultPayload,
  CommandQueueUpdatePayload
} from '@onsembl/agent-protocol';
```

### 2. Add Handler for TERMINAL_STREAM Messages

**File:** `frontend/src/services/websocket-store-bridge.ts` (lines 256-282)

```typescript
// Terminal stream updates (from backend to dashboard)
webSocketService.on(MessageType.TERMINAL_STREAM, (payload: TerminalStreamPayload) => {
  console.log('[TerminalStore] TERMINAL_STREAM received:', payload);

  const terminalStore = useTerminalStore.getState();

  // Add output to terminal
  terminalStore.addOutput({
    id: Date.now().toString(),
    commandId: payload.commandId,
    agentId: payload.agentId,
    content: payload.content,
    type: payload.streamType || 'stdout',
    timestamp: payload.timestamp || Date.now()
  });

  // Also append to command output
  if (payload.commandId) {
    const commandStore = useCommandStore.getState();
    const command = commandStore.getCommandById(payload.commandId);
    if (command) {
      commandStore.updateCommand(payload.commandId, {
        output: (command.output || '') + payload.content
      });
    }
  }
});
```

## Expected Results

After this fix:
1. **Console Logs**: `[TerminalStore] TERMINAL_STREAM received:` messages will appear
2. **Terminal Store**: Output will be added to the terminal store
3. **UI Display**: Terminal viewer will show agent CLI output (dotenv messages, ASCII banners, prompts)
4. **Command Output**: Output will also be appended to command records

## Testing

1. Start a fresh agent after the frontend reloads
2. Open browser console
3. Navigate to `/agents` page
4. Should see `[TerminalStore] TERMINAL_STREAM received:` logs
5. Click on agent to view terminal
6. Terminal should display agent CLI output

## Related Fixes

This fix completes the terminal output mirroring feature along with:
1. Agent ID resolution fix (`agent-wrapper/src/websocket-client.ts`)
2. Dashboard subscription format fix (`frontend/src/services/websocket-store-bridge.ts:304-305`)
3. Agent status reporting fix (`backend/src/websocket/dashboard-handler.ts`)
4. MockAgent output generation (`agent-wrapper/src/agents/mock.ts`)
5. Authentication type default fix (`agent-wrapper/src/config.ts` and `agent-wrapper/src/cli.ts`)

## Date Completed
2025-11-02
