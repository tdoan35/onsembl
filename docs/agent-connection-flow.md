# Agent Connection Flow - Onsembl.ai

## Overview

Onsembl.ai uses a distributed architecture where AI coding agents (Claude, Gemini, Codex) run on users' local machines or infrastructure and connect to a centralized control dashboard via WebSocket. This document explains how users connect agents to the dashboard and the complete flow from setup to command execution.

## Architecture Diagram

```
┌─────────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  User's Machine     │         │  Backend Server  │         │  Web Browser    │
│                     │         │                  │         │                 │
│  ┌───────────────┐  │  WS     │  ┌────────────┐  │  WS     │  ┌───────────┐  │
│  │ Agent Wrapper │──┼─────────┼─▶│  Fastify   │◀─┼─────────┼──│ Dashboard │  │
│  │     (CLI)     │  │/ws/agent│  │   Server   │  │/ws/dash │  │  (Next.js)│  │
│  └───────┬───────┘  │         │  └─────┬──────┘  │         │  └───────────┘  │
│          │          │         │        │         │         │                 │
│  ┌───────▼───────┐  │         │  ┌─────▼──────┐  │         │                 │
│  │  AI Agent     │  │         │  │  Database  │  │         │                 │
│  │(Claude/Gemini)│  │         │  │ (Supabase) │  │         │                 │
│  └───────────────┘  │         │  └────────────┘  │         │                 │
└─────────────────────┘         └──────────────────┘         └─────────────────┘
```

## Step-by-Step Connection Flow

### Step 1: Start Agent Wrapper on Local Machine

Users run the agent wrapper CLI on their local machine or server where they want commands to be executed:

```bash
# Basic usage
onsembl-agent start \
  --agent claude \
  --server ws://backend-server:8080 \
  --api-key YOUR_AUTH_TOKEN

# Full options
onsembl-agent start \
  --agent claude|gemini|codex|mock \
  --server ws://your-backend-url:8080 \
  --api-key YOUR_AUTH_TOKEN \
  --working-dir /path/to/working/directory \
  --auth-type api-key|subscription
```

#### CLI Commands Available:
- `onsembl-agent start` - Start the agent wrapper
- `onsembl-agent stop` - Stop the agent wrapper
- `onsembl-agent restart` - Restart the agent wrapper
- `onsembl-agent status` - Check agent status
- `onsembl-agent logs` - View agent logs

### Step 2: Agent Initialization Process

When the agent wrapper starts:

1. **Generate Unique Agent ID**: Format: `{agentType}-{timestamp}-{randomId}`
   - Example: `claude-1701234567890-abc123xyz`

2. **Initialize Components**:
   - Start the AI agent process (Claude/Gemini/Codex)
   - Create command executor for running shell commands
   - Initialize WebSocket client
   - Set up reconnection manager

3. **Write Process Files**:
   - `.onsembl-agent.pid` - Process ID for management
   - `.onsembl-agent.status` - Current status information

### Step 3: WebSocket Connection Establishment

The agent wrapper connects to the backend:

1. **Connect to WebSocket Endpoint**: `/ws/agent`

2. **Send Authentication Message**:
   ```json
   {
     "type": "AGENT_CONNECT",
     "id": "msg-123...",
     "timestamp": 1701234567890,
     "payload": {
       "agentId": "claude-1701234567890-abc123xyz",
       "agentType": "claude",
       "version": "3.5",
       "hostMachine": "user-laptop",
       "capabilities": {
         "commands": true,
         "fileAccess": true,
         "streaming": true
       }
     }
   }
   ```

3. **Authentication Validation**:
   - Backend validates JWT token (30-second timeout)
   - Agent registered in database
   - Status set to "ONLINE"

4. **Start Heartbeat**:
   - Agent sends heartbeat every 30 seconds
   - Automatic disconnection after 3 missed heartbeats

### Step 4: Dashboard Discovery

When users log into the web dashboard:

1. **Dashboard WebSocket Connection**: Connects to `/ws/dashboard`

2. **Automatic Agent Discovery**:
   - Dashboard receives real-time agent status updates
   - Connected agents appear immediately in:
     - Command center agent dropdown
     - Agents management tab
     - System overview metrics

3. **Agent Display Information**:
   - Status indicator (🟢 Online, 🟡 Busy, 🔴 Offline)
   - Agent name and type
   - Current activity/command
   - Health metrics

### Step 5: Command Execution Flow

When a user executes a command from the dashboard:

1. **User Actions**:
   - Select agent from dropdown (only online agents shown)
   - Enter command in input field
   - Set priority (Low/Normal/High/Urgent)
   - Click Send or press Enter

2. **Message Routing**:
   ```
   Dashboard → Backend → Agent Wrapper → Local Execution
   ```

3. **Command Message Format**:
   ```json
   {
     "type": "COMMAND_REQUEST",
     "payload": {
       "commandId": "cmd-xyz789",
       "agentId": "claude-1701234567890-abc123xyz",
       "command": "npm test",
       "priority": "normal",
       "arguments": []
     }
   }
   ```

4. **Local Execution**:
   - Agent wrapper receives command via WebSocket
   - Executes in specified working directory
   - Streams output back in real-time

5. **Terminal Output Streaming**:
   - Output chunks sent with <200ms latency
   - ANSI color codes preserved
   - Isolated to originating dashboard

## Message Flow Isolation

The system ensures command isolation between dashboards:

- **Command Tracking**: Backend maintains `commandId → dashboardId` mapping
- **Response Routing**: Agent responses only sent to originating dashboard
- **Cleanup**: Mappings cleared on disconnect or after 1-hour TTL

## Reconnection Handling

If connection is lost:

1. **Automatic Reconnection**:
   - Exponential backoff retry strategy
   - Maximum 10 attempts by default

2. **State Preservation**:
   - Active commands continue executing
   - Output buffered during disconnect
   - Flushed on reconnection

3. **Status Updates**:
   - Agent shown as "Disconnected" in dashboard
   - Automatic status restoration on reconnect

## Security Considerations

1. **Authentication**:
   - Each agent requires valid JWT token
   - Tokens validated on connection
   - Automatic refresh before expiry

2. **Command Isolation**:
   - Commands execute in agent's environment only
   - No cross-agent command execution
   - Working directory restrictions

3. **Network Security**:
   - WebSocket connections can use WSS (TLS)
   - Token transmitted in headers or query params
   - Connection metadata logged for audit

## Common Deployment Scenarios

### Development Environment
```bash
# Start mock agent for testing
onsembl-agent start --agent mock --server ws://localhost:8080
```

### Production - Single User
```bash
# Run on personal workstation
onsembl-agent start \
  --agent claude \
  --server wss://onsembl.example.com \
  --api-key $PRODUCTION_TOKEN \
  --working-dir ~/projects
```

### Production - Team Setup
```bash
# Each team member runs their own agent
# Agent 1 (Alice's machine)
onsembl-agent start --agent claude --api-key $ALICE_TOKEN

# Agent 2 (Bob's server)
onsembl-agent start --agent gemini --api-key $BOB_TOKEN

# All agents appear in shared dashboard
```

### CI/CD Integration
```yaml
# Example: GitHub Actions
- name: Start Onsembl Agent
  run: |
    onsembl-agent start \
      --agent codex \
      --server ${{ secrets.ONSEMBL_SERVER }} \
      --api-key ${{ secrets.ONSEMBL_TOKEN }} \
      --working-dir ${{ github.workspace }}
```

## Troubleshooting

### Agent Not Appearing in Dashboard

1. **Check agent status**:
   ```bash
   onsembl-agent status
   ```

2. **Verify connection**:
   - Check WebSocket URL is correct
   - Ensure authentication token is valid
   - Verify network connectivity

3. **Review logs**:
   ```bash
   onsembl-agent logs --follow
   ```

### Connection Drops Frequently

1. **Check heartbeat logs** in agent output
2. **Verify network stability**
3. **Increase timeout values** if needed

### Commands Not Executing

1. **Verify agent is online** in dashboard
2. **Check working directory** permissions
3. **Review agent capabilities** configuration

## Key Files and Locations

### Agent Wrapper Files
- **PID File**: `.onsembl-agent.pid` - Process ID for management
- **Status File**: `.onsembl-agent.status` - Current status JSON
- **Config File**: `config.json` - Agent configuration (optional)

### Backend Endpoints
- **Agent WebSocket**: `/ws/agent` - Agent connections
- **Dashboard WebSocket**: `/ws/dashboard` - Dashboard connections
- **REST API**: `/api/agents` - Agent management

### Frontend Routes
- **Dashboard**: `/dashboard` - Main control interface
- **Agents**: `/agents` - Agent management page
- **Terminal**: `/dashboard` (Terminal tab) - Live output view

## Summary

The Onsembl.ai agent connection flow follows a **"agents announce themselves"** pattern where:

1. Users run agent wrappers on their local machines/infrastructure
2. Agents automatically connect and authenticate with the backend
3. Connected agents immediately appear in all authorized dashboards
4. Users control agents through the unified web interface
5. Commands execute in the agent's local environment
6. Output streams back to the dashboard in real-time

This architecture enables distributed command execution while maintaining centralized control and monitoring through the web dashboard.