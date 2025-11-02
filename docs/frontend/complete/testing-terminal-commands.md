# Testing Terminal Commands Flow

## Setup Complete

We've successfully fixed the command execution flow from the frontend to the agent-wrapper:

1. **Frontend sends commands** with proper structure (agentId at top level)
2. **Backend routes** COMMAND_REQUEST messages to the correct agent
3. **Agent-wrapper handles** COMMAND_REQUEST messages and executes them in the PTY
4. **Terminal output** is sent back as TERMINAL_OUTPUT messages

## Testing Instructions

### 1. Ensure All Services Are Running

- Backend server: `cd backend && npm run dev`
- Frontend: `cd frontend && npm run dev`
- Agent-wrapper: `cd agent-wrapper && npm run start -- start -a mock --agent-id "your-agent-id" --interactive`

### 2. Test in Frontend

1. Navigate to http://localhost:3000/agents
2. Select an online agent from the left panel
3. In the terminal on the right, type a command (e.g., `echo hello`)
4. Press Enter

### 3. Expected Behavior

- The command should appear in your local agent-wrapper terminal
- The command should execute in the agent-wrapper
- The output should appear in the frontend terminal
- Both terminals should stay in sync

## What We Fixed

### 1. WebSocket Message Structure (frontend/src/stores/websocket.store.ts)
```typescript
// Fixed: agentId at top level for proper routing
webSocketService.send('dashboard', MessageType.COMMAND_REQUEST, {
  agentId,  // Add agentId at top level for backend routing
  commandId,
  command,  // Use 'command' not 'content'
  args: args || [],
  env: env || {},
  workingDirectory,
  // ...
})
```

### 2. COMMAND_REQUEST Handler (agent-wrapper/src/websocket-client.ts)
```typescript
case MessageType.COMMAND_REQUEST:
  // Handle command requests from dashboard
  const commandMessage: CommandMessage = {
    type: 'command',
    commandId: commandPayload.commandId || `cmd-${Date.now()}`,
    agentId: this.agentId,
    command: commandPayload.command,
    args: commandPayload.args || [],
    options: {
      timeout: commandPayload.executionConstraints?.timeLimitMs,
      workingDirectory: commandPayload.workingDirectory,
      environment: commandPayload.env || {}
    },
    timestamp: new Date().toISOString()
  };
  await this.onCommand(commandMessage);
  break;
```

### 3. Session ID Alignment
- Frontend creates: `agent-session-${agentId}`
- Agent-wrapper uses: `agent-session-${this.agentId}`
- These now match, ensuring terminal output is routed correctly

## Architecture Flow

```
Frontend Terminal Input
        ↓
WebSocket: COMMAND_REQUEST
        ↓
Backend MessageRouter
        ↓
Agent WebSocket Connection
        ↓
COMMAND_REQUEST Handler
        ↓
PTY Execution
        ↓
Terminal Output Capture
        ↓
WebSocket: TERMINAL_OUTPUT
        ↓
Backend MessageRouter
        ↓
Frontend Terminal Display
```

## Troubleshooting

If commands aren't working:

1. **Check agent ID**: Ensure the agent ID in the frontend matches the agent-wrapper
2. **Check WebSocket connection**: Look for "WebSocket connection established" in agent-wrapper logs
3. **Check message routing**: Backend logs should show COMMAND_REQUEST being routed
4. **Check handler**: Agent-wrapper should log "[WebSocket] Received COMMAND_REQUEST"
5. **Check terminal output**: Agent-wrapper should send TERMINAL_OUTPUT messages back

## Next Steps

- Add error handling for failed commands
- Implement command history persistence
- Add support for interactive commands (like vim)
- Implement command cancellation
- Add terminal resize support