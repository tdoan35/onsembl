# Command Forwarding Feature Investigation & Implementation Plan

## Feature Request
Enable command input from the frontend SimpleTerminal component to be mirrored/forwarded to the associated agent-wrapper CLI instance. When a user types a command in the frontend terminal and presses Enter, the same command should be executed in the corresponding agent-wrapper instance, and the response should be displayed in both the frontend terminal and the agent-wrapper CLI.

## Current Architecture Analysis

### 1. Frontend Components

#### SimpleTerminal Component (`frontend/src/components/terminal/terminal-viewer.tsx`)
- **Location**: Lines 112-354 in terminal-viewer.tsx
- **Current Features**:
  - Input field for typing commands (line 312-329)
  - Command history navigation with arrow keys (lines 171-190)
  - `onCommand` callback prop that gets triggered when Enter is pressed (line 158)
  - Visual feedback by immediately displaying the command in the output (line 152)
  - Color coding for different output types (commands, errors, stdout)

#### Active Agents Page (`frontend/src/app/(auth)/agents/page.tsx`)
- **Location**: Lines 119-174
- **Current Implementation**:
  - `handleCommandExecution` callback (lines 119-174) that:
    - Currently sends commands via WebSocket using `sendCommand` (lines 149-156)
    - Uses the agent ID for proper routing
    - Creates a unique command ID for tracking
    - Shows notifications on success/failure

### 2. WebSocket Communication Layer

#### Frontend WebSocket Store (`frontend/src/stores/websocket.store.ts`)
- **sendCommand Method** (lines 85-152):
  - Generates unique command ID
  - Sends `COMMAND_REQUEST` message type
  - Payload includes: `agentId`, `commandId`, `command`, `args`, `env`, `workingDirectory`, `priority`
  - Routes through dashboard WebSocket connection

### 3. Backend Routing

#### Message Router (`backend/src/websocket/message-router.ts`)
- **Command Routing**:
  - `routeToAgent` method (lines 82-110) routes messages to specific agents
  - Tracks command-to-dashboard mapping for response routing
  - Uses connection pool to find target agent connections

#### Dashboard Handler (`backend/src/websocket/dashboard-handler.ts`)
- **handleCommandRequest** (lines 706-736):
  - Validates authentication
  - Registers command for dashboard tracking
  - Routes command to agent via `sendCommandToAgent`
  - **Current Issue**: The method `sendCommandToAgent` appears to be designed for command execution, not for forwarding raw terminal input

### 4. Agent Wrapper Implementation

#### Interactive Wrapper (`agent-wrapper/src/terminal/interactive-wrapper.ts`)
- **Command Handling**:
  - `handleRemoteCommand` (lines 362-393): Receives commands from WebSocket
  - `processRemoteCommand` (lines 395-407):
    - **Interactive Mode**: Forwards to PTY manager (line 398)
    - **Headless Mode**: Writes to child process stdin (line 404)
  - **Current Implementation**: Already supports command forwarding to the actual CLI!

#### PTY Manager Integration
- **PTY Data Flow** (lines 202-228):
  - PTY output is captured and sent to both:
    - Local terminal (`process.stdout.write`)
    - WebSocket (if connected) with ANSI stripping
  - Uses session ID or command ID for output association

## Key Findings

### ✅ Infrastructure Already Exists
The investigation reveals that **the infrastructure for command forwarding already exists** but may not be working correctly due to:

1. **Command vs Terminal Input Distinction**: The current implementation treats commands as structured command objects rather than raw terminal input
2. **Message Type Mismatch**: The system uses `COMMAND_REQUEST` for structured commands, but terminal input might need a different handling approach
3. **Agent Wrapper Support**: The agent-wrapper already has the code to forward commands to the PTY (line 398 in interactive-wrapper.ts)

### Current Flow
```
Frontend SimpleTerminal
    ↓ (onCommand callback)
Frontend handleCommandExecution
    ↓ (WebSocket COMMAND_REQUEST)
Backend Dashboard Handler
    ↓ (Route to agent)
Backend Message Router
    ↓ (Forward to agent connection)
Agent Wrapper WebSocket Client
    ↓ (handleRemoteCommand)
Agent Wrapper Interactive Wrapper
    ↓ (processRemoteCommand)
PTY Manager (writes to actual CLI)
```

## Implementation Plan

### Option 1: Fix Existing Implementation (Recommended)
Since the infrastructure already exists, we should focus on fixing the current implementation:

#### Step 1: Verify WebSocket Connection
- Ensure agent-wrapper is connecting to WebSocket with correct agent ID
- Verify authentication is working properly
- Check connection pool has the agent registered

#### Step 2: Debug Command Routing
- Add debug logging to track command flow:
  - Frontend: Log when `onCommand` is triggered with command content
  - Backend: Log when `COMMAND_REQUEST` is received and routed
  - Agent-wrapper: Log when command is received and forwarded to PTY

#### Step 3: Ensure Proper Command Format
- The current implementation expects a structured command object
- For terminal input, we might need to adjust the command format:
  ```javascript
  // Current format
  {
    command: "echo hi",
    args: [],
    env: {}
  }

  // Might need to be
  {
    command: "echo",
    args: ["hi"],
    env: {}
  }
  ```

#### Step 4: Fix PTY Command Execution
- Verify the PTY manager is correctly writing commands
- Ensure line endings are proper (`\n` vs `\r\n`)
- Check if the mock agent command setup is correct for the platform

### Option 2: Create Dedicated Terminal Input Channel
If the existing command infrastructure is meant for structured commands only:

#### Create New Message Types
```typescript
// Add to agent-protocol types
MessageType.TERMINAL_INPUT = 'TERMINAL_INPUT'
MessageType.TERMINAL_OUTPUT = 'TERMINAL_OUTPUT'
```

#### Implement Direct Terminal Forwarding
- Create a dedicated handler for raw terminal input
- Bypass command parsing and send raw input directly to PTY
- Stream terminal output back without processing

## Testing Strategy

### 1. Unit Tests
- Test command parsing and formatting
- Verify WebSocket message creation
- Test PTY manager command writing

### 2. Integration Tests
- End-to-end command flow from frontend to agent-wrapper
- WebSocket connection and authentication
- Command routing through backend

### 3. Manual Testing Checklist
1. Start agent-wrapper with specific agent ID (e.g., `mock-test-123`)
2. Navigate to frontend active agents page
3. Click on the same agent
4. Type `echo hello` in the terminal
5. Verify:
   - Command appears in frontend terminal
   - Command executes in agent-wrapper CLI
   - Response appears in both terminals

## Potential Issues & Solutions

### Issue 1: Command Not Reaching Agent
**Debug Steps**:
1. Check WebSocket connection status in both frontend and agent-wrapper
2. Verify agent ID matches between frontend and agent-wrapper
3. Check backend logs for routing errors

### Issue 2: Command Executes but No Output
**Debug Steps**:
1. Check if PTY manager is capturing output
2. Verify WebSocket output messages are being sent
3. Check if frontend is subscribed to terminal output

### Issue 3: Authentication Failures
**Debug Steps**:
1. Verify JWT tokens are valid
2. Check if agent-wrapper is authenticating properly
3. Ensure dashboard has proper permissions

## Immediate Next Steps

1. **Enable Debug Logging**:
   - Set `LOG_LEVEL=debug` in environment
   - Add console.log statements at key points in the flow

2. **Test with Mock Agent**:
   - Use mock agent type for simpler debugging
   - Mock agent should echo commands back

3. **Verify WebSocket Connectivity**:
   - Check WebSocket panel in browser DevTools
   - Monitor WebSocket messages being sent/received

4. **Fix Command Format**:
   - Ensure commands are properly formatted for the agent CLI
   - Handle both simple commands (`ls`) and complex ones (`echo "hello world"`)

## Code Changes Required

### Frontend Changes
```typescript
// terminal-viewer.tsx - SimpleTerminal component
// Line 158 - Ensure command is sent correctly
if (onCommand) {
  try {
    // Log for debugging
    console.log('[SimpleTerminal] Sending command:', currentInput);
    await onCommand(currentInput);
  } catch (error) {
    // ... existing error handling
  }
}
```

### Backend Changes
```typescript
// dashboard-handler.ts - handleCommandRequest
// Add better logging
this.server.log.info({
  connectionId: connection.connectionId,
  agentId,
  commandId,
  command: command, // Log the actual command
  commandType: typeof command
}, 'Processing command request');
```

### Agent-Wrapper Changes
```typescript
// interactive-wrapper.ts - processRemoteCommand
// Line 398 - Add logging
if (this.ptyManager?.isInteractive) {
  this.logger.info('Forwarding to PTY:', { command, length: command.length });
  // Ensure proper line ending
  const commandWithNewline = command.endsWith('\n') ? command : command + '\n';
  this.ptyManager.write(commandWithNewline);
}
```

## Conclusion

The investigation reveals that the infrastructure for command forwarding is already implemented but may have issues with:
1. Message routing/formatting
2. WebSocket connectivity
3. PTY command execution

The recommended approach is to debug and fix the existing implementation rather than building new infrastructure. The key is ensuring proper command format, WebSocket connectivity, and PTY integration.