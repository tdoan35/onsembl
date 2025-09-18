# Quickstart: Testing WebSocket Command Routing

## Prerequisites
- Backend server running on port 3000
- PostgreSQL or Supabase configured
- Node.js 20+ installed

## Test Scenario 1: Basic Command Routing

### 1. Start the Backend Server
```bash
cd backend
npm run dev
```

### 2. Connect a Test Agent
```bash
# In a new terminal
npm run test:agent -- --agent-id test-agent-1
```

Expected output:
```
✓ Connected to WebSocket at ws://localhost:3000/ws/agent
✓ Authenticated as agent: test-agent-1
✓ Waiting for commands...
```

### 3. Connect a Test Dashboard
```bash
# In another terminal
npm run test:dashboard -- --user-id test-user-1
```

Expected output:
```
✓ Connected to WebSocket at ws://localhost:3000/ws/dashboard
✓ Authenticated as user: test-user-1
✓ Ready to send commands
```

### 4. Send a Test Command
In the dashboard terminal, type:
```
> execute test-agent-1 "echo 'Hello from routing test'"
```

Expected flow:
1. Dashboard shows: `→ Sending command to test-agent-1`
2. Agent shows: `← Received command: echo 'Hello from routing test'`
3. Agent shows: `→ Executing command...`
4. Dashboard shows: `← Terminal output: Hello from routing test`
5. Dashboard shows: `← Command completed successfully`

## Test Scenario 2: Multiple Dashboard Isolation

### 1. Connect Second Dashboard
```bash
# In a new terminal
npm run test:dashboard -- --user-id test-user-2
```

### 2. Send Commands from Different Dashboards
Dashboard 1:
```
> execute test-agent-1 "echo 'From Dashboard 1'"
```

Dashboard 2:
```
> execute test-agent-1 "echo 'From Dashboard 2'"
```

Expected behavior:
- Each dashboard only sees output from its own commands
- Agent processes both commands (may be sequential or queued)
- No cross-contamination of outputs

## Test Scenario 3: Offline Agent Queuing

### 1. Send Command to Offline Agent
Dashboard:
```
> execute offline-agent "echo 'Queued command'"
```

Expected response:
```
← Agent offline-agent is offline, command queued
← Command will be delivered when agent connects
```

### 2. Start the Offline Agent
```bash
npm run test:agent -- --agent-id offline-agent
```

Expected behavior:
- Agent immediately receives queued command upon connection
- Dashboard receives delayed execution notification

## Test Scenario 4: Emergency Stop

### 1. Start Multiple Agents
```bash
npm run test:agent -- --agent-id agent-1 &
npm run test:agent -- --agent-id agent-2 &
npm run test:agent -- --agent-id agent-3 &
```

### 2. Send Long-Running Commands
Dashboard:
```
> execute agent-1 "sleep 30 && echo 'Done'"
> execute agent-2 "sleep 30 && echo 'Done'"
> execute agent-3 "sleep 30 && echo 'Done'"
```

### 3. Issue Emergency Stop
Dashboard:
```
> emergency-stop "Testing emergency broadcast"
```

Expected behavior:
- All agents receive stop signal immediately
- All running commands are terminated
- Dashboard receives confirmation from each agent

## Test Scenario 5: Connection Recovery

### 1. Send Command and Kill Dashboard
Dashboard:
```
> execute test-agent-1 "sleep 5 && echo 'Completed'"
> # Press Ctrl+C to kill dashboard
```

### 2. Reconnect Dashboard
```bash
npm run test:dashboard -- --user-id test-user-1 --resume
```

Expected behavior:
- Dashboard reconnects with same user ID
- Receives any pending responses for its commands
- Can continue sending new commands

## Automated Test Suite

Run the full integration test suite:
```bash
cd backend
npm run test:integration -- --grep "WebSocket routing"
```

Expected output:
```
  WebSocket Message Routing
    ✓ routes COMMAND_REQUEST from dashboard to agent
    ✓ routes responses back to originating dashboard
    ✓ queues commands for offline agents
    ✓ broadcasts EMERGENCY_STOP to all agents
    ✓ maintains dashboard isolation
    ✓ handles connection recovery
    ✓ cleans up on disconnect
    ✓ enforces message priority
    ✓ respects queue limits
    ✓ tracks command lifecycle

  10 passing (2.5s)
```

## Debugging WebSocket Traffic

### Enable Debug Logging
```bash
DEBUG=websocket:* npm run dev
```

### Monitor Message Flow
```bash
# Watch all WebSocket messages
npm run monitor:websocket

# Filter by message type
npm run monitor:websocket -- --type COMMAND_REQUEST

# Filter by connection
npm run monitor:websocket -- --connection dashboard-*
```

## Common Issues and Solutions

### Issue: Commands not reaching agent
Check:
1. Agent is connected: `npm run status:agents`
2. Agent ID matches exactly
3. No typos in command

### Issue: No response to dashboard
Check:
1. Dashboard still connected
2. Command ID tracking active
3. Check backend logs for routing errors

### Issue: Queue full errors
Solution:
- Increase queue size in config
- Reduce command rate
- Add priority to important commands

## Performance Validation

### Load Test
```bash
npm run test:load -- \
  --dashboards 10 \
  --agents 5 \
  --commands-per-second 10 \
  --duration 60s
```

Expected results:
- All commands routed successfully
- Average latency < 200ms
- No message loss
- Queue performs under load