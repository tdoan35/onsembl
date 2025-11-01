# Agent Status Staleness - Problem Analysis & Implementation Plan

**Document Version:** 1.0
**Created:** 2025-10-31
**Status:** Implementation Ready

## Problem Statement

The Agents page (`/agents`) sometimes displays stale "active" agents even when the agent wrapper has been manually shut down. This creates a misleading user experience and can lead to:
- Attempting to send commands to offline agents
- Inaccurate system health monitoring
- Confusion about actual system state

## Root Cause Analysis

### 1. Missing WebSocket Disconnect Handling (Backend)
**Severity:** HIGH - Primary Issue

When an agent wrapper shuts down (especially manual termination), the WebSocket connection closes, but the backend is not properly handling the disconnect event to:
- Update agent status in database to `OFFLINE`
- Broadcast `AGENT_DISCONNECT` message to subscribed dashboards
- Clean up in-flight commands marked as `EXECUTING`

**Evidence:**
- `AGENT_DISCONNECT` message type exists in protocol (`MessageType.AGENT_DISCONNECT`)
- Payload schema is defined (`AgentDisconnectPayload`)
- However, WebSocket close event handler may be missing or incomplete

### 2. Heartbeat Monitoring Not Implemented (Backend)
**Severity:** HIGH - Edge Case Coverage

The protocol defines `AGENT_HEARTBEAT` messages, but heartbeat timeout monitoring may not be implemented:
- Agents that crash without graceful shutdown never send final disconnect
- Network failures don't trigger connection close immediately
- No periodic health check to detect silent failures

**Impact:**
- Crashed agents remain as "active" indefinitely
- Network-partitioned agents appear online
- No automated cleanup of dead connections

### 3. Real-time Subscription Gaps (Frontend)
**Severity:** MEDIUM - UI Synchronization

The frontend may not be properly subscribed to agent status changes:
- Not receiving/handling `AGENT_DISCONNECT` WebSocket messages
- Not subscribed to Supabase Realtime changes on `agents` table
- No automatic refresh when dashboard reconnects after network issues

### 4. Missing Graceful Shutdown (Agent Wrapper)
**Severity:** LOW - User Experience

Agent wrappers don't send proper disconnect messages on SIGINT/SIGTERM:
- Manual Ctrl+C shutdowns don't notify backend
- Process kills leave orphaned database records

### 5. No Stale State Cleanup on Server Restart (Backend)
**Severity:** LOW - Operational Hygiene

When backend server restarts, all WebSocket connections are lost but:
- Database still shows agents as `ONLINE`
- No startup routine to reset agent states

## Solution Architecture

### Defense-in-Depth Strategy

Implement multiple overlapping layers to ensure agent status accuracy:

```
┌─────────────────────────────────────────────────────────┐
│ Layer 5: Server Startup Cleanup                        │
│ • Mark all agents OFFLINE on backend start             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 4: Graceful Shutdown Handler (Agent Wrapper)     │
│ • Send AGENT_DISCONNECT on SIGINT/SIGTERM              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: WebSocket Disconnect Handler (Backend)        │
│ • Update DB on connection close                        │
│ • Broadcast AGENT_DISCONNECT                           │
│ • Cancel executing commands                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Heartbeat Monitoring (Backend)                │
│ • Track last heartbeat timestamp                       │
│ • Periodic check for stale agents (every 30-60s)      │
│ • Auto-mark OFFLINE if timeout exceeded                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Real-time UI Subscription (Frontend)          │
│ • Subscribe to WebSocket AGENT_STATUS/DISCONNECT       │
│ • Subscribe to Supabase Realtime on agents table       │
│ • Update local state immediately                       │
└─────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Critical Path (Fixes 80% of issues)

#### Task 1.1: WebSocket Disconnect Handler (Backend)
**Priority:** P0 - Immediate
**Estimated Effort:** 2-3 hours
**Files:**
- `backend/src/websocket/handlers.ts` (or agent-specific handler)
- `backend/src/services/agent-service.ts`

**Implementation:**
```typescript
// In WebSocket handler
connection.on('close', async (code, reason) => {
  logger.info({ agentId, code, reason }, 'Agent connection closed');

  try {
    // Update database
    await db.query(
      `UPDATE agents
       SET status = 'OFFLINE',
           updated_at = NOW()
       WHERE id = $1`,
      [agentId]
    );

    // Cancel executing commands
    await db.query(
      `UPDATE commands
       SET status = 'CANCELLED',
           completed_at = NOW(),
           error = 'Agent disconnected'
       WHERE agent_id = $1
       AND status = 'EXECUTING'`,
      [agentId]
    );

    // Broadcast to dashboards
    const disconnectMessage = {
      type: MessageType.AGENT_DISCONNECT,
      id: generateUUID(),
      timestamp: Date.now(),
      payload: {
        agentId,
        reason: reason?.toString(),
        timestamp: Date.now()
      }
    };

    messageRouter.broadcastToDashboards(disconnectMessage);

  } catch (error) {
    logger.error({ error, agentId }, 'Failed to handle agent disconnect');
  }
});
```

**Testing:**
- Manual: Start agent wrapper, verify shows as online, stop wrapper, verify shows as offline within 1 second
- Automated: Mock WebSocket close event, verify DB update and broadcast

---

#### Task 1.2: Frontend WebSocket Subscription (Frontend)
**Priority:** P0 - Immediate
**Estimated Effort:** 2-3 hours
**Files:**
- `frontend/src/hooks/useWebSocket.ts` (or similar)
- `frontend/src/stores/agentStore.ts` (Zustand store)
- `frontend/src/components/agents/agent-list.tsx`

**Implementation:**
```typescript
// In WebSocket message handler
const handleWebSocketMessage = (message: WebSocketMessage) => {
  switch (message.type) {
    case MessageType.AGENT_STATUS:
      agentStore.updateAgentStatus(message.payload);
      break;

    case MessageType.AGENT_DISCONNECT:
      agentStore.setAgentOffline(message.payload.agentId);
      break;

    // ... other handlers
  }
};

// In agent store
setAgentOffline: (agentId: string) => {
  set(state => ({
    agents: state.agents.map(agent =>
      agent.id === agentId
        ? { ...agent, status: 'OFFLINE', activityState: 'IDLE' }
        : agent
    )
  }));
}
```

**Testing:**
- Manual: Open dashboard, disconnect agent, verify UI updates immediately
- Automated: Mock WebSocket messages, verify store updates

---

### Phase 2: Resilience (Handles edge cases)

#### Task 2.1: Heartbeat Monitoring System (Backend)
**Priority:** P1 - Important
**Estimated Effort:** 4-6 hours
**Files:**
- `backend/src/services/heartbeat-monitor.ts` (new)
- `backend/src/server.ts` (initialize monitor)

**Implementation:**
```typescript
// Heartbeat Monitor Service
export class HeartbeatMonitor {
  private heartbeats = new Map<string, number>(); // agentId -> lastHeartbeatTimestamp
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_TIMEOUT_MS = 90000; // 90 seconds
  private readonly CHECK_INTERVAL_MS = 30000; // 30 seconds

  start() {
    this.checkInterval = setInterval(() => {
      this.checkStaleAgents();
    }, this.CHECK_INTERVAL_MS);
  }

  recordHeartbeat(agentId: string) {
    this.heartbeats.set(agentId, Date.now());
  }

  removeAgent(agentId: string) {
    this.heartbeats.delete(agentId);
  }

  private async checkStaleAgents() {
    const now = Date.now();
    const staleAgents: string[] = [];

    for (const [agentId, lastHeartbeat] of this.heartbeats.entries()) {
      if (now - lastHeartbeat > this.HEARTBEAT_TIMEOUT_MS) {
        staleAgents.push(agentId);
      }
    }

    if (staleAgents.length > 0) {
      logger.warn({ staleAgents }, 'Detected stale agents');

      for (const agentId of staleAgents) {
        await this.markAgentOffline(agentId, 'Heartbeat timeout');
        this.heartbeats.delete(agentId);
      }
    }
  }

  private async markAgentOffline(agentId: string, reason: string) {
    // Same logic as WebSocket disconnect handler
    // Consider extracting to shared service method
  }
}
```

**Configuration:**
- `HEARTBEAT_INTERVAL_MS`: How often agents send heartbeats (default: 30s)
- `HEARTBEAT_TIMEOUT_MS`: When to consider agent dead (default: 90s = 3x interval)
- `CHECK_INTERVAL_MS`: How often to check for stale agents (default: 30s)

**Testing:**
- Mock agent sending heartbeats, verify stays online
- Stop heartbeats, verify marked offline after timeout
- Load test: 100+ agents with varying heartbeat patterns

---

#### Task 2.2: Supabase Realtime Subscription (Frontend)
**Priority:** P1 - Important
**Estimated Effort:** 2-3 hours
**Files:**
- `frontend/src/hooks/useAgentRealtime.ts` (new)
- `frontend/src/app/agents/page.tsx`

**Implementation:**
```typescript
export function useAgentRealtime() {
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel('agents-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agents'
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            agentStore.updateAgent(payload.new);
          } else if (payload.eventType === 'DELETE') {
            agentStore.removeAgent(payload.old.id);
          } else if (payload.eventType === 'INSERT') {
            agentStore.addAgent(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
```

**Testing:**
- Update agent in database directly, verify UI updates
- Test with multiple dashboard tabs open
- Verify subscription cleanup on unmount

---

### Phase 3: Polish (User experience improvements)

#### Task 3.1: Graceful Shutdown Handler (Agent Wrapper)
**Priority:** P2 - Nice to have
**Estimated Effort:** 1-2 hours
**Files:**
- `agent-wrapper/src/index.ts` (or main entry)

**Implementation:**
```typescript
// Signal handlers
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received');

  try {
    // Send disconnect message
    await wsClient.send({
      type: MessageType.AGENT_DISCONNECT,
      id: generateUUID(),
      timestamp: Date.now(),
      payload: {
        agentId: config.agentId,
        reason: `Graceful shutdown (${signal})`,
        timestamp: Date.now()
      }
    });

    // Wait briefly for message to send
    await new Promise(resolve => setTimeout(resolve, 500));

  } catch (error) {
    logger.error({ error }, 'Error during graceful shutdown');
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
```

**Testing:**
- Start agent, press Ctrl+C, verify disconnect message sent
- Kill agent with `kill -TERM`, verify same behavior

---

#### Task 3.2: Server Startup Cleanup (Backend)
**Priority:** P2 - Nice to have
**Estimated Effort:** 1 hour
**Files:**
- `backend/src/server.ts`

**Implementation:**
```typescript
async function cleanupStaleAgents() {
  logger.info('Cleaning up stale agent states from previous server instance');

  const result = await db.query(
    `UPDATE agents
     SET status = 'OFFLINE',
         updated_at = NOW()
     WHERE status != 'OFFLINE'`
  );

  logger.info({ count: result.rowCount }, 'Marked agents as offline');

  // Also cancel any executing commands
  await db.query(
    `UPDATE commands
     SET status = 'CANCELLED',
         completed_at = NOW(),
         error = 'Server restarted'
     WHERE status = 'EXECUTING'`
  );
}

// In server startup
await cleanupStaleAgents();
app.listen(PORT);
```

**Testing:**
- Start server with agents marked as online in DB
- Verify all marked offline on startup

---

#### Task 3.3: Last Seen Timestamp UI (Frontend)
**Priority:** P3 - Optional
**Estimated Effort:** 2 hours
**Files:**
- `backend/src/websocket/handlers.ts` (update last_seen on heartbeat)
- `frontend/src/components/agents/agent-card.tsx`

**Implementation:**
```typescript
// Show relative time since last heartbeat
<div className="text-sm text-muted-foreground">
  {agent.status === 'ONLINE'
    ? `Active now`
    : `Last seen ${formatDistanceToNow(agent.lastSeen)} ago`
  }
</div>
```

---

## Database Schema Updates

### Add `last_seen` column to agents table

```sql
ALTER TABLE agents
ADD COLUMN last_seen TIMESTAMP WITH TIME ZONE;

-- Create index for heartbeat monitoring queries
CREATE INDEX idx_agents_last_seen
ON agents(last_seen)
WHERE status = 'ONLINE';

-- Update RLS policies if needed
```

## Testing Strategy

### Unit Tests
- WebSocket disconnect handler
- Heartbeat monitor timeout logic
- Message routing and broadcasting
- Store update functions

### Integration Tests
- Agent connects → shows online
- Agent disconnects → shows offline
- Heartbeat timeout → shows offline
- Server restart → all agents offline

### E2E Tests (Playwright)
```typescript
test('agent status updates in real-time', async ({ page }) => {
  // Start agent wrapper
  const agent = await startAgentWrapper();

  // Navigate to agents page
  await page.goto('/agents');

  // Verify shows as online
  await expect(page.locator(`[data-agent-id="${agent.id}"]`))
    .toHaveAttribute('data-status', 'ONLINE');

  // Stop agent wrapper
  await agent.stop();

  // Verify shows as offline within 2 seconds
  await expect(page.locator(`[data-agent-id="${agent.id}"]`))
    .toHaveAttribute('data-status', 'OFFLINE', { timeout: 2000 });
});
```

## Rollout Plan

### Week 1: Critical Path
- Implement Phase 1 (Tasks 1.1, 1.2)
- Deploy to staging
- Manual testing with various shutdown scenarios
- Deploy to production

### Week 2: Resilience
- Implement Phase 2 (Tasks 2.1, 2.2)
- Load testing with heartbeat monitor
- Deploy to staging, monitor for 2-3 days
- Deploy to production

### Week 3: Polish
- Implement Phase 3 (Tasks 3.1, 3.2, 3.3)
- User acceptance testing
- Deploy to production

## Monitoring & Metrics

Track the following metrics to validate the fix:

- **Agent Lifecycle Events:**
  - `agent.connected` (count, agentId, timestamp)
  - `agent.disconnected` (count, agentId, reason, timestamp)
  - `agent.heartbeat_timeout` (count, agentId, last_heartbeat)

- **Stale State Detection:**
  - `agent.stale_count` (gauge, number of agents marked offline by heartbeat monitor)
  - `agent.disconnect_latency` (histogram, time from disconnect to UI update)

- **Data Quality:**
  - `agent.status_accuracy` (ratio of correct vs incorrect status)
  - `agent.ghost_detection` (count of agents showing active when offline)

## Success Criteria

- ✅ Manual agent shutdown reflects in UI within 1 second
- ✅ Crashed agents marked offline within 90 seconds
- ✅ Server restart doesn't leave ghost agents
- ✅ Zero user reports of stale agent status
- ✅ <100ms latency for status updates via WebSocket

## Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Heartbeat timeout too aggressive | Agents incorrectly marked offline | Medium | Make timeout configurable, start with conservative 90s |
| Database load from heartbeat updates | Performance degradation | Low | Use in-memory tracking, only persist on disconnect |
| Race condition in status updates | Inconsistent UI state | Medium | Use optimistic locking, version timestamps |
| WebSocket broadcast storms | Backend CPU spike | Low | Rate limit broadcasts, batch updates |

## Future Enhancements

- **Automatic Reconnection:** Agent wrappers auto-reconnect on network failures
- **Status History:** Track agent online/offline transitions for analytics
- **Alerting:** Notify when agents go offline unexpectedly
- **Health Dashboard:** Real-time view of agent fleet health metrics
- **Circuit Breaker:** Pause command routing to flaky agents

## References

- WebSocket Protocol Spec: `/specs/001-build-onsembl-ai/contracts/websocket-protocol.md`
- Message Types: `/packages/agent-protocol/src/types.ts`
- Database Schema: `/backend/db/schema.sql`
- Architecture Overview: `/CLAUDE.md`
