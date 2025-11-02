# Terminal Output Mirroring - Root Cause Analysis

## Problem Statement
Agent CLI output (dotenv messages, ASCII banner, prompts) is not appearing in the frontend terminal viewer. Instead, the frontend shows only placeholder text.

## Root Cause Discovered

### Agent ID Mismatch
The backend logs reveal a critical ID mismatch:

**Connection URL Query Parameter:**
```
/ws/agent?agentId=mock-mhfjh3z0-vkvw618fo
```

**Agent Connection Message Payload:**
```javascript
{
  connectionAgentId: "5b63a9f3-bf4f-49dd-b39f-4b0646f9da31",
  agentId: "mock-mhfjh3z0-vkvw618fo"
}
```

**Terminal Output Message:**
```javascript
{
  originalCommandId: "mock-mhfjh3z0-vkvw618fo",
  agentId: "5b63a9f3-bf4f-49dd-b39f-4b0646f9da31"
}
```

### Why This Causes the Problem

The backend normalization logic expects:
```typescript
const normalizedCommandId = payload.commandId === resolvedAgentId
  ? `agent-session-${resolvedAgentId}`
  : payload.commandId;
```

But since:
- `payload.commandId` = `"mock-mhfjh3z0-vkvw618fo"`
- `resolvedAgentId` = `"5b63a9f3-bf4f-49dd-b39f-4b0646f9da31"`

The condition `payload.commandId === resolvedAgentId` evaluates to FALSE, so the normalization doesn't happen!

As a result:
- Output is routed to session `"mock-mhfjh3z0-vkvw618fo"` (doesn't exist)
- Frontend listens for `"agent-session-5b63a9f3-bf4f-49dd-b39f-4b0646f9da31"`
- No match = no output displayed

## Code Analysis

### Where the Random ID is Generated

**agent-wrapper/src/cli.ts:47**
```typescript
this.agentId = config.agentId || `${config.agentType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
```

This generates IDs like `mock-1762060602-mhfjh3z0` when `config.agentId` is undefined.

### Where the UUID is Loaded

**agent-wrapper/src/terminal/interactive-wrapper.ts:86-91**
```typescript
const { id, name, isNew } = await this.agentConfigManager.getOrCreateAgentId(
  this.config.agentType,
  Object.keys(options).length > 0 ? options : undefined
);

this.agentId = id;  // UUID like "5b63a9f3-bf4f-49dd-b39f-4b0646f9da31"
```

### Where Terminal Output is Sent

**agent-wrapper/src/websocket-client.ts:289-310**
```typescript
async sendOutput(commandId: string | undefined, stream: 'stdout' | 'stderr', data: string, ansiCodes?: string): Promise<void> {
  // Use commandId if provided, otherwise use agentId for monitoring output routing
  const effectiveCommandId = commandId || this.agentId;

  const payload: TerminalOutputPayload = {
    commandId: effectiveCommandId,  // This should use the UUID
    agentId: this.agentId,            // This IS the UUID
    // ...
  };
}
```

### The Configuration Flow

**agent-wrapper/src/cli.ts:416-424**
```typescript
const config = loadConfig({
  agentType: options.agent,
  serverUrl: options.server,
  apiKey: options.apiKey,
  authType: options.authType,
  workingDirectory: options.workingDir,
  disableWebsocket: !options.websocket,
  showStatusBar: options.statusBar,
  // NOTE: agentId is NOT passed here!
});
```

At this point, `config.agentId` is `undefined`.

**agent-wrapper/src/cli.ts:449-456**
```typescript
const interactiveOptions: InteractiveOptions = {
  interactive: options.interactive || (!options.headless && process.stdin.isTTY),
  headless: options.headless || !process.stdin.isTTY,
  noWebsocket: !options.websocket,
  statusBar: options.statusBar,
  agentName: options.name,
  agentId: options.agentId,  // This is undefined unless --agent-id is passed
};
```

## ROOT CAUSE CONFIRMED

### The Actual Problem

The `agent-config.json` file at `C:\Users\Ty\.onsembl\agent-config.json` contained an OLD random-generated ID:

```json
{
  "defaultAgent": "mock-mhfjh3z0-vkvw618fo",
  "agents": {
    "mock-mhfjh3z0-vkvw618fo": {
      "id": "mock-mhfjh3z0-vkvw618fo",
      "type": "mock",
      "createdAt": "2025-11-01T00:23:33.468Z",
      ...
    }
  }
}
```

This ID was created using the OLD format `mock-${timestamp}-${random}` instead of a proper UUID. This happened because:

1. The agent-config.json file was created when an older version of the agent code was running
2. That older code used the random ID generation pattern from `cli.ts:47`
3. The ID got persisted to the config file and has been reused ever since

### Why This Causes Terminal Output to Fail

1. Agent connects with ID: `mock-mhfjh3z0-vkvw618fo`
2. Agent sends TERMINAL_OUTPUT with `commandId: "mock-mhfjh3z0-vkvw618fo"`
3. Backend tries to normalize: `payload.commandId === resolvedAgentId`
4. If the backend is expecting a different ID format or there's a mismatch, normalization fails
5. Frontend listens for `"agent-session-mock-mhfjh3z0-vkvw618fo"` but never receives data

### Analysis of Agent Startup Logs

From the test script output, we can see:
```json
{"agentId":"mock-mhfjh3z0-vkvw618fo","name":"test-command-agent","msg":"Using existing default agent"}
{"msg":"[Connection] Attempting connection to ws://localhost:8080/ws/agent?agentId=mock-mhfjh3z0-vkvw618fo&token=..."}
```

The agent is consistently using the old ID from the config file.

## The Solution

**COMPLETED**: Deleted the old agent-config.json file using:
```bash
rm "C:\Users\Ty\.onsembl\agent-config.json"
```

Next time the agent starts, it will:
1. Generate a new proper UUID (if that's what AgentConfigManager does now)
2. Save it to a fresh agent-config.json file
3. Use that UUID consistently for all WebSocket communication

## Verification Steps

1. Restart the agent wrapper
2. Check the new agent-config.json file to verify it has a proper UUID
3. Verify terminal output appears in the frontend
4. Monitor backend logs to ensure IDs match throughout the message flow

## Long-term Fix

The `AgentConfigManager` should be updated to:
1. Always generate proper UUIDs (using `crypto.randomUUID()` or similar)
2. Never use the old `mock-${timestamp}-${random}` format
3. Potentially migrate old agent IDs to UUID format when loading the config
