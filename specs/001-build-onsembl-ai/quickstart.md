# Quickstart Guide: Onsembl.ai Agent Control Center

**Version**: 0.1.0
**Date**: 2025-01-15

## Overview
This guide will help you set up and run the Onsembl.ai Agent Control Center for the first time. You'll learn how to start the control server, connect agents, and execute your first commands.

## Prerequisites

- Node.js 20+ installed
- npm or yarn package manager
- Supabase account (free tier works)
- At least one AI CLI tool installed (claude-code, gemini, or similar)

## Quick Setup (5 minutes)

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/onsembl/onsembl-ai.git
cd onsembl-ai

# Install dependencies
npm install

# Build all packages
npm run build
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your Supabase credentials
# Required variables:
# - SUPABASE_URL=https://your-project.supabase.co
# - SUPABASE_ANON_KEY=your-anon-key
# - SUPABASE_SERVICE_KEY=your-service-key
# - JWT_SECRET=your-jwt-secret
# - REDIS_URL=redis://localhost:6379 (or Upstash URL)
```

### 3. Initialize Database

```bash
# Run Supabase migrations
npm run db:migrate

# Seed initial data (optional)
npm run db:seed
```

### 4. Start the Control Server

```bash
# Development mode
npm run dev:backend

# Production mode
npm run start:backend
```

Server will start on `http://localhost:3000`

### 5. Start the Dashboard

In a new terminal:

```bash
# Development mode
npm run dev:frontend

# Production mode
npm run build:frontend
npm run start:frontend
```

Dashboard will be available at `http://localhost:3001`

### 6. Connect Your First Agent

```bash
# Navigate to agent wrapper directory
cd agent-wrapper

# Configure agent
cp config.example.json config.json
# Edit config.json with your server URL and agent details

# Start Claude agent wrapper
npm run agent:claude

# Or Gemini agent wrapper
npm run agent:gemini

# Or Codex agent wrapper
npm run agent:codex
```

## First Run Validation

### Test 1: Agent Connection
1. Open dashboard at `http://localhost:3001`
2. Sign in with magic link (check email)
3. Verify agent appears as "ONLINE" in left sidebar
4. Check agent health metrics are updating

✅ **Expected**: Agent card shows green status with health metrics

### Test 2: Send First Command
1. Click on command input at bottom of dashboard
2. Type: "What is your current status?"
3. Select target agent(s) or broadcast to all
4. Press Enter or click Send

✅ **Expected**: Command executes, terminal shows output in real-time

### Test 3: View Terminal Output
1. Observe central terminal area
2. Verify output is color-coded by agent
3. Check timestamps are displayed
4. Try filtering by specific agent

✅ **Expected**: Terminal displays colored, timestamped output

### Test 4: Emergency Stop
1. Start a long-running command: "Count to 100 slowly"
2. Click Emergency Stop button (red button in toolbar)
3. Confirm the action

✅ **Expected**: All agents stop immediately, commands cancelled

### Test 5: Command Preset
1. Click "Presets" in sidebar
2. Create new preset:
   - Name: "System Check"
   - Command: "Check system resources and list running processes"
   - Type: INVESTIGATE
3. Save preset
4. Use preset from command dropdown

✅ **Expected**: Preset saves and executes successfully

### Test 6: Trace View
1. Execute command: "Analyze the current directory structure"
2. Click on command in history
3. View "Trace Tree" tab
4. Expand trace nodes

✅ **Expected**: Hierarchical view of LLM calls and tool usage

### Test 7: Queue Management
1. Send multiple commands to same agent rapidly
2. Observe queue indicator on agent card
3. Try cancelling a queued command

✅ **Expected**: Commands queue, position shown, cancellation works

### Test 8: Agent Restart
1. Click on agent card menu (three dots)
2. Select "Restart Agent"
3. Confirm action

✅ **Expected**: Agent disconnects and reconnects within 10 seconds

### Test 9: Investigation Report
1. Send investigation command: "Investigate: Performance bottlenecks in the system"
2. Wait for completion
3. Click "Reports" in sidebar
4. View generated report

✅ **Expected**: Structured report with findings and recommendations

### Test 10: Audit Log
1. Click "System" → "Audit Logs"
2. Filter by last hour
3. Verify all actions are logged

✅ **Expected**: Complete audit trail of all system events

## Common Issues & Solutions

### Agent Won't Connect
```bash
# Check server is running
curl http://localhost:3000/health

# Verify WebSocket endpoint
wscat -c ws://localhost:3000/v1/ws/agent/test -H "Authorization: Bearer YOUR_TOKEN"

# Check agent config
cat agent-wrapper/config.json
```

### No Terminal Output
```bash
# Check agent stdout/stderr
tail -f agent-wrapper/logs/agent.log

# Verify WebSocket connection
npm run test:websocket
```

### Authentication Fails
```bash
# Verify Supabase configuration
npm run test:auth

# Check JWT secret matches
echo $JWT_SECRET
```

### Performance Issues
```bash
# Check Redis connection
redis-cli ping

# Monitor WebSocket connections
npm run monitor:connections

# View server metrics
curl http://localhost:3000/metrics
```

## Production Deployment

### Deploy Control Server to Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login to Fly
fly auth login

# Create app
fly launch --name onsembl-control

# Set secrets
fly secrets set SUPABASE_URL=... SUPABASE_ANON_KEY=... JWT_SECRET=...

# Deploy
fly deploy
```

### Deploy Dashboard to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy frontend
cd frontend
vercel --prod
```

### Configure Agent for Production

```json
{
  "serverUrl": "wss://onsembl-control.fly.dev/v1/ws/agent",
  "agentId": "auto-generate",
  "agentType": "CLAUDE",
  "authToken": "your-jwt-token",
  "autoReconnect": true,
  "maxRetries": -1
}
```

## Validation Checklist

- [ ] Control server starts without errors
- [ ] Dashboard loads and accepts magic link
- [ ] At least one agent connects successfully
- [ ] Commands execute and show output
- [ ] Terminal streaming has <200ms latency
- [ ] Emergency stop works
- [ ] Presets can be saved and used
- [ ] Trace tree displays correctly
- [ ] Queue management functions
- [ ] Audit logs capture all events

## Next Steps

1. **Add More Agents**: Connect additional AI agents for parallel processing
2. **Create Presets**: Build a library of common commands
3. **Customize Constraints**: Set up execution limits for different scenarios
4. **Monitor Performance**: Use dashboard metrics to optimize
5. **Explore Reports**: Generate and export investigation reports

## Support

- Documentation: https://docs.onsembl.ai
- Issues: https://github.com/onsembl/onsembl-ai/issues
- Discord: https://discord.gg/onsembl