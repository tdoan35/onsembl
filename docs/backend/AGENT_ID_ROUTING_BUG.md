# Agent ID Routing Bug Investigation

**Date**: 2025-11-02
**Status**: 🔴 CRITICAL - Commands cannot reach agents
**Affected Feature**: Command forwarding from dashboard to agents

## Problem Statement

Commands sent from the frontend dashboard are not reaching the connected agent. The backend returns a routing failure error stating the agent is not found in the connection pool.

## Symptoms

1. ✅ Frontend successfully sends `COMMAND_REQUEST` via WebSocket
2. ✅ Backend receives and validates the command
3. ❌ Backend routing fails: "Agent {uuid} not found in connection pool"
4. ❌ Agent never receives the command

## Root Cause

**Agent ID mismatch between database UUID and connection pool registration.**

### Evidence

**Agent Connection (03:03:46 UTC):**
```
[ERROR]: Failed to get agent (with CLI ID: mock-mhfjh3z0-vkvw618fo)
[INFO]: Agent reconnection detected - agent found by name
[INFO]: Agent authenticated and connected
```

**Command Routing Failure (03:04:20 UTC):**
```
[CMD-FWD] Agent 5b63a9f3-bf4f-49dd-b39f-4b0646f9da31 not found in connection pool
```

### The Flow

1. **Agent Connects**:
   - CLI agent sends `AGENT_CONNECT` with `agentId=mock-mhfjh3z0-vkvw618fo`
   - Backend calls `getAgent('mock-mhfjh3z0-vkvw618fo')` - FAILS (not a UUID)
   - Backend falls back to `getAgentByName(userId, 'test-command-agent')` - SUCCESS
   - Gets database UUID from the found record: `resolvedAgentId`
   - Sets `connection.agentId = resolvedAgentId` (line 393 in agent-handler.ts)

2. **Frontend Queries Agents**:
   - Fetches all agents for the user from database
   - Displays agent list with database UUIDs
   - User clicks agent with UUID `5b63a9f3-bf4f-49dd-b39f-4b0646f9da31`

3. **Frontend Sends Command**:
   - Sends `COMMAND_REQUEST` with `agentId=5b63a9f3-bf4f-49dd-b39f-4b0646f9da31`

4. **Backend Routes Command**:
   - dashboard-handler.ts calls `messageRouter.sendCommandToAgent(agentId, payload)`
   - message-router.ts line 103: `connectionPool.getConnectionsByAgentId(agentId)`
   - **FAILS**: No connection found with `agentId=5b63a9f3-bf4f-49dd-b39f-4b0646f9da31`

## Hypothesis

There are likely **two different agent records** in the database:
1. Old record with UUID `5b63a9f3-bf4f-49dd-b39f-4b0646f9da31` (status: offline)
2. New record that the agent just connected to (status: online)

When the agent connected and backend searched by name "test-command-agent", it might have:
- Found a DIFFERENT agent record than the one the frontend is displaying
- OR the frontend is caching an old agent list

## Files Involved

1. **backend/src/websocket/agent-handler.ts**:
   - Lines 292-339: Agent resolution logic (try by ID, then by name, then create)
   - Line 393: `connection.agentId = resolvedAgentId!`

2. **backend/src/websocket/message-router.ts**:
   - Lines 82-122: `routeToAgent()` - uses connection pool lookup
   - Lines 103-106: `getConnectionsByAgentId(agentId)` - **FAILS HERE**

3. **backend/src/websocket/dashboard-handler.ts**:
   - Lines 841-927: `handleCommandRequest()` - initiates routing

## Required Fix

**Option 1: Ensure Unique Agent Names** (Recommended)
- Add unique constraint on (user_id, name) in database
- When agent connects by name, ensure it's the only agent with that name for the user
- Update frontend to fetch latest agent list after connection events

**Option 2: Use CLI Agent ID as Database ID**
- Change agent registration to use CLI-generated ID as primary key
- Store UUID separately for compatibility
- Update all queries to use CLI ID

**Option 3: Add Mapping Table**
- Create cli_id to uuid mapping in database
- Connection pool uses CLI ID
- Routing layer translates frontend UUID to CLI ID

## Immediate Debugging Steps

1. Query database to see all agent records for user:
   ```sql
   SELECT id, name, status, created_at, updated_at
   FROM agents
   WHERE user_id = '7378612a-5c3c-4728-81fb-f573f45bd239'
   ORDER BY created_at DESC;
   ```

2. Add logging to agent-handler.ts line 294 to show resolved UUID:
   ```typescript
   this.server.log.info({
     cliAgentId: agentId,
     resolvedUUID: resolvedAgentId,
     agentName: existingAgent.name
   }, 'Agent resolved by name - UUID mapping');
   ```

3. Add logging to connection pool registration to confirm which UUID is used:
   ```typescript
   this.server.log.info({
     connectionId: connection.connectionId,
     registeredAgentId: connection.agentId
   }, 'Agent registered in connection pool');
   ```

## Impact

- 🔴 **Severity**: Critical
- 🚫 **Commands**: 100% failure rate
- 💔 **User Experience**: Feature completely broken
- 🐛 **Scope**: Affects all command forwarding operations

## Related Documentation

- command-forwarding-feature.md - Original investigation
- COMMAND_FORWARDING_FIX_SUMMARY.md - isDashboardMessage fix
- WebSocket Protocol: specs/001-build-onsembl-ai/contracts/websocket-protocol.md
