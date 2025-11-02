# Terminal Output Mirroring - Solution

## Root Cause Confirmed

The terminal output mirroring issue is caused by an **Agent ID mismatch** between what the agent sends and what the backend expects.

### The Problem Flow

1. **Agent connects** with CLI-generated ID: `mock-mhfjh3z0-vkvw618fo`
2. **Backend resolves** this to database UUID: `5b63a9f3-bf4f-49dd-b39f-4b0646f9da31`
3. **Backend stores** UUID in `connection.agentId`
4. **Backend sends ACK** with resolved UUID: `{ agentId: "5b63a9f3-bf4f-49dd-b39f-4b0646f9da31" }`
5. **Agent receives ACK** but **IGNORES the resolved UUID** (agent-wrapper/src/websocket-client.ts:434-436)
6. **Agent continues using** CLI ID in TERMINAL_OUTPUT: `commandId: "mock-mhfjh3z0-vkvw618fo"`
7. **Backend normalization fails** because `payload.commandId !== connection.agentId`
   - `"mock-mhfjh3z0-vkvw618fo" !== "5b63a9f3-bf4f-49dd-b39f-4b0646f9da31"`
8. **No normalization** happens - output stays as `"mock-mhfjh3z0-vkvw618fo"` instead of `"agent-session-5b63a9f3-bf4f-49dd-b39f-4b0646f9da31"`
9. **Frontend listens** for `"agent-session-5b63a9f3-bf4f-49dd-b39f-4b0646f9da31"` but never receives messages
10. **User sees blank terminal**

### Code Evidence

**Backend sends resolved UUID** (backend/src/websocket/agent-handler.ts:426-432):
```typescript
this.sendMessage(connection.socket, MessageType.ACK, {
  messageId: message.id,
  success: true,
  connectionId: connection.connectionId,
  agentId: resolvedAgentId!,  // <-- Resolved database UUID
  authenticated: true
});
```

**Agent ignores ACK payload** (agent-wrapper/src/websocket-client.ts:434-436):
```typescript
case MessageType.ACK:
  // Server acknowledged a prior message; no action needed yet.
  break;  // <-- DOES NOTHING WITH THE RESOLVED UUID!
```

**Agent uses wrong ID in TERMINAL_OUTPUT** (agent-wrapper/src/websocket-client.ts:289-294):
```typescript
async sendOutput(commandId: string | undefined, stream: 'stdout' | 'stderr', data: string, ansiCodes?: string): Promise<void> {
  const effectiveCommandId = commandId || this.agentId;  // <-- Uses CLI ID, not resolved UUID!

  const payload: TerminalOutputPayload = {
    commandId: effectiveCommandId,  // <-- Wrong ID!
    agentId: this.agentId,           // <-- Wrong ID!
    // ...
  };
}
```

**Backend normalization fails** (backend/src/websocket/agent-handler.ts:679-681):
```typescript
const normalizedCommandId = payload.commandId === resolvedAgentId
  ? `agent-session-${resolvedAgentId}`  // <-- Never happens because IDs don't match!
  : payload.commandId;
```

### Backend Debug Log Confirms ID Transformation

```
[05:29:44 UTC] INFO: 🔍 [AGENT-ROUTING-DEBUG] Agent registered in connection with UUID
    connectionId: "agent-1762061383764-rjtqksr02"
    cliOriginalId: "mock-mhfjh3z0-vkvw618fo"          <-- What agent sent
    resolvedDatabaseUUID: "5b63a9f3-bf4f-49dd-b39f-4b0646f9da31"  <-- What backend resolved
    agentName: "test-command-agent"
    connectionAgentId: "5b63a9f3-bf4f-49dd-b39f-4b0646f9da31"     <-- What got stored
    match: true
```

## The Solution

Update the agent's ACK handler to:
1. Extract the `agentId` from the ACK payload
2. If present, update `this.agentId` to use the resolved UUID
3. Use this UUID for all subsequent messages

### Implementation

**File**: `agent-wrapper/src/websocket-client.ts`

**Change** (lines 434-436):
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

### Why This Fix Works

1. Agent sends AGENT_CONNECT with CLI ID
2. Backend resolves to UUID and sends it back in ACK
3. **Agent now updates its ID** to match the backend's UUID
4. Agent sends TERMINAL_OUTPUT with the UUID
5. Backend comparison succeeds: UUID === UUID
6. Normalization happens: `agent-session-{UUID}`
7. Frontend receives output on correct channel
8. Terminal displays output correctly!

### Verification Steps

After implementing the fix:

1. Start backend and frontend
2. Start a new agent
3. Check backend logs for:
   - `[AGENT-ROUTING-DEBUG]` showing CLI ID → UUID resolution
   - `[CMD-FWD] Received terminal output` with `isMonitoringOutput: true`
   - `normalizedCommandId: "agent-session-{UUID}"`
4. Check agent logs for:
   - `[Connection] Server resolved agent ID - updating to use database UUID`
5. Check frontend terminal - should now display agent CLI output
6. Verify all ASCII banners, dotenv messages, and prompts appear

### Additional Benefits

This fix also ensures:
- Command execution output is properly routed
- Status updates use consistent IDs
- Heartbeat messages reference correct agent
- All WebSocket communication uses the canonical database UUID
