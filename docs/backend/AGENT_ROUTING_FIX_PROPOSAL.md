# Agent Routing Bug - Root Cause & Fix Proposal

**Date**: 2025-11-02
**Status**: 🔴 CRITICAL BUG CONFIRMED
**Issue**: Commands cannot reach agents due to UUID mismatch

## Confirmed Root Cause

**Multiple agent records with same name causing UUID mismatch in connection pool routing.**

### Evidence Timeline

**Agent Connection (03:03:46 UTC):**
- Agent CLI ID: `mock-mhfjh3z0-vkvw618fo`
- Agent name: `test-command-agent`
- Backend tries `getAgent('mock-mhfjh3z0-vkvw618fo')` → **FAILS** (not a UUID)
- Backend falls back to `getAgentByName(userId, 'test-command-agent')` → **SUCCESS**
- Backend resolves to database UUID and registers in connection pool

**Frontend Query (03:03:55 UTC):**
- Frontend fetches all agents for user from database
- Finds agent `test-command-agent` with UUID: `5b63a9f3-bf4f-49dd-b39f-4b0646f9da31`
- Displays in UI

**Command Attempt (03:04:20 UTC):**
- Frontend sends `COMMAND_REQUEST` to `5b63a9f3-bf4f-49dd-b39f-4b0646f9da31`
- Backend looks for this UUID in connection pool → **NOT FOUND**
- Error: "Agent 5b63a9f3-bf4f-49dd-b39f-4b0646f9da31 not found in connection pool"

### The Problem

When backend calls `getAgentByName(userId, 'test-command-agent')`, it returns **a database record**, but:
- There are likely **2+ agent records** with name "test-command-agent"
- The query might return a **different** record than what the frontend displays
- OR the frontend is caching an old agent list

**Status Issue**: Both agents show as "offline" in UI even though one is connected, confirming status sync is broken.

## Proposed Fix

### Option 1: Add Enhanced Logging (Immediate - Debug)

Add logging to see which UUID the agent actually registers with:

**File**: `backend/src/websocket/agent-handler.ts`

```typescript
// After line 338 (in getAgentByName success block)
this.server.log.info({
  cliAgentId: agentId,
  resolvedDatabaseUUID: resolvedAgentId,
  agentName: existingAgent.name,
  databaseRecordCreatedAt: existingAgent.created_at
}, '🔍 [AGENT-ROUTING-DEBUG] Agent UUID resolved by name lookup');

// After line 393 (when setting connection.agentId)
this.server.log.info({
  connectionId: connection.connectionId,
  registeredAgentId: connection.agentId,
  cliOriginalId: agentId,
  agentName: name || agentId
}, '🔍 [AGENT-ROUTING-DEBUG] Agent registered in connection pool with UUID');
```

**File**: `backend/src/websocket/message-router.ts`

```typescript
// After line 103 (in routeToAgent)
this.server.log.info({
  lookingForUUID: agentId,
  foundInPool: !!agentConnection,
  allAgentsInPool: Array.from(allAgentConnections.entries()).map(([id, conn]) => ({
    connectionId: id,
    agentId: conn.agentId,
    agentIdType: typeof conn.agentId,
    isAuthenticated: conn.isAuthenticated
  }))
}, '🔍 [AGENT-ROUTING-DEBUG] Connection pool lookup details');
```

### Option 2: Enforce Unique Agent Names (Recommended Fix)

**Database Migration**:
```sql
-- Add unique constraint on (user_id, name)
ALTER TABLE agents ADD CONSTRAINT agents_user_id_name_unique UNIQUE (user_id, name);

-- Find and merge duplicate agents before adding constraint
WITH duplicates AS (
  SELECT user_id, name, array_agg(id ORDER BY created_at) as ids
  FROM agents
  GROUP BY user_id, name
  HAVING COUNT(*) > 1
)
SELECT * FROM duplicates;

-- For each duplicate, keep the newest and delete older ones
```

**Backend Changes**:
```typescript
// backend/src/services/agent-service.ts
async getAgentByName(userId: string, name: string): Promise<Agent> {
  const { data, error } = await this.db
    .from('agents')
    .select('*')
    .eq('user_id', userId)
    .eq('name', name)
    .order('created_at', { ascending: false }) // Get newest first
    .limit(1) // Ensure single result
    .single();

  if (error) throw error;
  return data;
}
```

### Option 3: Use CLI ID as Primary Identifier (Architectural Change)

Store the CLI-generated ID and use it for routing:

**Database Migration**:
```sql
ALTER TABLE agents ADD COLUMN cli_id TEXT;
ALTER TABLE agents ADD CONSTRAINT agents_user_id_cli_id_unique UNIQUE (user_id, cli_id);
CREATE INDEX idx_agents_cli_id ON agents(cli_id);
```

**Connection Logic**:
```typescript
// Store CLI ID when agent connects
connection.cliAgentId = agentId; // mock-mhfjh3z0-vkvw618fo
connection.agentId = resolvedAgentId; // database UUID

// Connection pool uses CLI ID as key
connectionPool.register(connection.cliAgentId, connection);

// Frontend includes both IDs
frontendAgentData = {
  id: agent.id, // UUID for display
  cliId: agent.cli_id, // CLI ID for routing
  ...
};

// Dashboard sends commands with CLI ID
dashboardMessage = {
  agentId: agent.cli_id, // Use CLI ID for routing
  ...
};
```

## Immediate Action Plan

1. **Add Debug Logging** (Option 1) - 10 minutes
   - Deploy and restart services
   - Reconnect agent
   - Attempt command
   - Analyze logs to confirm exact UUID mismatch

2. **Fix Duplicate Agents** (Option 2 prep) - 30 minutes
   - Query database to find duplicates
   - Manually merge/delete old records
   - Test with single agent record

3. **Implement Unique Constraint** (Option 2) - 1 hour
   - Add database migration
   - Update getAgentByName to use ORDER BY + LIMIT 1
   - Deploy and test

4. **Consider CLI ID Architecture** (Option 3) - Future
   - Design full spec
   - Implement in separate feature branch
   - Migration path for existing agents

## Testing Checklist

After fix:
- [ ] Agent connects and appears as "online" in dashboard
- [ ] Frontend displays correct agent count
- [ ] Click agent card opens terminal
- [ ] Type command in terminal
- [ ] Backend logs show command routed successfully
- [ ] Agent receives COMMAND_REQUEST
- [ ] Command executes in agent PTY
- [ ] Output streams back to dashboard
- [ ] Terminal displays command output

## Success Criteria

1. ✅ Commands reach the agent 100% of the time
2. ✅ Agent status shows "online" when connected
3. ✅ No UUID mismatch errors in backend logs
4. ✅ Connection pool lookup succeeds
5. ✅ Terminal output displays correctly

## Files to Modify

1. `backend/src/websocket/agent-handler.ts` - Add logging
2. `backend/src/websocket/message-router.ts` - Add logging
3. `backend/src/services/agent-service.ts` - Fix getAgentByName query
4. `backend/migrations/` - Add unique constraint migration

## Related Issues

- Agent status not syncing (both show offline when one is connected)
- Multiple agent records with same name
- Frontend caching stale agent data
- No real-time status updates from backend to frontend
