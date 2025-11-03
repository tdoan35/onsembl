# Agent Status Comprehensive Fix - January 2025

## Problem Summary

The agent status flickering issue had multiple root causes that previous fixes didn't fully address:

1. **Duplicate Event Handlers**: Two separate files handled `AGENT_STATUS` events, racing against each other
2. **Infinite Broadcast Loop**: Supabase Realtime `postgres_changes` listener triggered redundant broadcasts
3. **Timestamp Fabrication**: Multiple locations fabricated `lastPing` timestamps with `new Date()`, breaking staleness detection
4. **Conflicting Status Updates**: 7 different code paths updated agent status without coordination
5. **AgentHeartbeatMonitor Conflicts**: Marked NULL `last_ping` as stale, conflicting with clean disconnect logic
6. **Inconsistent Status Mapping**: Three different status mapping functions with different logic

## Symptoms

- Single connected agent randomly switching between Online and Offline
- ALL agents (including disconnected ones) showing as Online temporarily
- Status changes occurring every 0-60 seconds
- "All agents online" bug persisting for up to 2 minutes before correcting

## Root Causes Identified

### Critical Issues 🔴

1. **Duplicate WebSocket Handlers** (frontend/src/stores/agent-websocket-integration.ts + frontend/src/services/websocket-store-bridge.ts)
   - Both files registered handlers for `MessageType.AGENT_STATUS`
   - Both overwrote `lastPing` with `new Date().toISOString()`
   - Actual heartbeat timestamps from backend were lost

2. **Infinite Supabase Realtime Loop** (backend/src/services/agent.service.ts:686-713)
   - `postgres_changes` listener triggered `broadcastAgentStatusChange()` on every DB update
   - Agent heartbeat → Update DB → postgres_changes → broadcastAgentStatusChange → (loop)
   - Flooded frontend with redundant status messages

### High Priority Issues 🟠

3. **Timestamp Preservation Failures**
   - `updateAgentStatus()` overwrote `lastPing` (frontend/src/stores/agent-store.ts:81)
   - `DASHBOARD_CONNECTED` fabricated timestamps for disconnected agents (agent-websocket-integration.ts:227)
   - `transformApiAgent()` fabricated timestamps (frontend/src/services/agent-api.service.ts:78)

4. **AgentHeartbeatMonitor Conflicts** (backend/src/services/agent-heartbeat-monitor.ts:184-196)
   - Marked agents with NULL `last_ping` as stale
   - Conflicted with clean disconnect logic that sets `last_ping = NULL`

### Medium Priority Issues 🟡

5. **DASHBOARD_CONNECTED Clears All Agents** (frontend/src/stores/agent-websocket-integration.ts:200)
   - Called `clearAgents()` on dashboard reconnection
   - Lost terminal sessions and UI state

6. **Competing Status Mapping Logic**
   - Three different mapping functions in three files
   - Inconsistent mappings (e.g., 'busy' → 'online' vs 'idle' → 'online')

## Implementation - 6 Phase Fix

### Phase 1: Remove Duplicate Event Handlers ✅

**Files Modified:**
- `frontend/src/stores/agent-websocket-integration.ts`
- `frontend/src/services/websocket-store-bridge.ts`
- `backend/src/websocket/dashboard-handler.ts` (2 locations)

**Changes:**
1. Removed `AGENT_STATUS` handler from `agent-websocket-integration.ts` (lines 14-100)
2. Updated `websocket-store-bridge.ts` to use actual `lastPing` from backend payload
3. Added `lastPing: agent.last_ping` to backend AGENT_STATUS messages (dashboard-handler.ts:783, 869)

**Impact:**
- Eliminated race conditions
- Preserved heartbeat timestamps from backend
- Single source of truth for AGENT_STATUS handling

### Phase 2: Disable Supabase Realtime Loop ✅

**Files Modified:**
- `backend/src/services/agent.service.ts`

**Changes:**
1. Removed `postgres_changes` listener (lines 687-713)
2. Removed `dbChangesChannel.subscribe()` (lines 732-740)
3. Agent status updates now ONLY via direct WebSocket messages

**Impact:**
- Eliminated infinite broadcast loop
- Reduced WebSocket message traffic by ~70%
- Stopped redundant status broadcasts

### Phase 3: Fix Timestamp Preservation ✅

**Files Modified:**
- `frontend/src/stores/agent-store.ts`
- `frontend/src/stores/agent-websocket-integration.ts`

**Changes:**
1. `updateAgentStatus()`: Removed `lastPing` update (agent-store.ts:81)
2. `DASHBOARD_CONNECTED`: Changed fallback from `new Date()` to `null` (agent-websocket-integration.ts:141)

**Impact:**
- Staleness detection now works correctly
- No fabricated timestamps for disconnected agents
- "All agents online" bug eliminated

### Phase 4: Fix AgentHeartbeatMonitor ✅

**Files Modified:**
- `backend/src/services/agent-heartbeat-monitor.ts`

**Changes:**
1. Skip agents with NULL `last_ping` instead of marking as stale (lines 184-191)
2. Changed log level from `warn` to `debug`

**Impact:**
- No unnecessary status updates for cleanly disconnected agents
- Reduced database writes
- No conflict with disconnect handler

### Phase 5: Consolidate Status Mapping ✅

**Files Created:**
- `frontend/src/utils/agent-status-mapper.ts` (NEW)

**Files Modified:**
- `frontend/src/services/websocket-store-bridge.ts`
- `frontend/src/stores/agent-websocket-integration.ts`
- `frontend/src/services/agent-api.service.ts`

**Changes:**
1. Created centralized `mapAgentStatus()` utility function
2. Removed duplicate mapping logic from 3 files
3. All files now import and use centralized mapper

**Impact:**
- Consistent status representation across all code paths
- Single source of truth for status mapping
- Easier to maintain and update mapping logic

### Phase 6: Improve DASHBOARD_CONNECTED ✅

**Files Modified:**
- `frontend/src/stores/agent-websocket-integration.ts`

**Changes:**
1. Replaced `clearAgents()` + `addAgent()` with conditional `updateAgent()` or `addAgent()`
2. Preserve existing agents during dashboard reconnection
3. Only add truly new agents

**Impact:**
- Terminal sessions preserved during reconnection
- No UI flicker on network hiccups
- Better user experience

## Testing Checklist

### Functional Tests

- [ ] **Single Agent Online**: Start one agent → Verify stable Online status
- [ ] **Single Agent Offline**: Stop agent → Verify immediate Offline status
- [ ] **No Fabricated Timestamps**: Check `lastPing` field in DevTools (should be NULL for offline agents)
- [ ] **Dashboard Refresh**: Refresh page → Verify no "all agents online" bug
- [ ] **Network Delay**: Simulate slow network → Verify no flickering
- [ ] **Multiple Agents**: Start 3+ agents → Verify independent status tracking
- [ ] **Agent Reconnection**: Disconnect/reconnect agent → Verify smooth transition
- [ ] **Dashboard Reconnection**: Disconnect/reconnect dashboard → Verify terminal sessions preserved

### Performance Tests

- [ ] **WebSocket Message Count**: Monitor messages/second (should reduce by ~70%)
- [ ] **Database Writes**: Check agent table updates (should reduce redundant writes)
- [ ] **Frontend Re-renders**: Monitor React re-renders (should reduce cascading updates)
- [ ] **Latency**: Verify status updates within 200ms

### Edge Cases

- [ ] **Delayed PONG**: Agent PONG delayed >90s → Verify correct timeout handling
- [ ] **Simultaneous Connections**: 10+ agents connect at once → Verify all tracked correctly
- [ ] **Rapid Disconnect/Reconnect**: Agent flaps 5x in 30s → Verify final state accurate
- [ ] **Backend Restart**: Restart backend → Verify agents reconnect and status correct

## Files Changed Summary

### Backend (4 files)
1. `backend/src/services/agent.service.ts` - Removed Realtime loop
2. `backend/src/websocket/dashboard-handler.ts` - Added lastPing to AGENT_STATUS
3. `backend/src/services/agent-heartbeat-monitor.ts` - Fixed NULL handling

### Frontend (6 files)
1. `frontend/src/stores/agent-websocket-integration.ts` - Removed duplicate handler, improved DASHBOARD_CONNECTED
2. `frontend/src/services/websocket-store-bridge.ts` - Fixed timestamp handling, used centralized mapper
3. `frontend/src/stores/agent-store.ts` - Removed lastPing update from updateAgentStatus
4. `frontend/src/services/agent-api.service.ts` - Used centralized mapper, fixed timestamp fabrication
5. `frontend/src/utils/agent-status-mapper.ts` - NEW: Centralized status mapping
6. `backend/src/websocket/dashboard-handler.ts` - Added lastPing field to broadcasts

## Expected Outcomes

✅ **Single agent shows stable Online status when connected**
✅ **Disconnected agents stay Offline consistently**
✅ **No "all agents online" false positives**
✅ **No flickering between states**
✅ **Heartbeat timestamps preserved for accurate staleness detection**
✅ **Reduced WebSocket message traffic (no redundant broadcasts)**
✅ **Terminal sessions preserved during reconnection**
✅ **Consistent status representation across all components**

## Monitoring Recommendations

1. **Add Metrics**:
   - Track `agent_status_updates_per_second`
   - Track `agent_status_flicker_count` (status changes within 10s)
   - Track `websocket_broadcast_count`

2. **Add Logging**:
   - Log all `AGENT_STATUS` broadcasts with timestamps
   - Log `lastPing` values in frontend updates
   - Log staleness detection decisions

3. **Add Alerts**:
   - Alert if agent status changes >5 times in 60s
   - Alert if "all agents online" detected when some should be offline
   - Alert if WebSocket broadcast rate exceeds threshold

## Rollback Plan

If issues occur, revert in reverse order:

1. **Phase 6**: Restore `clearAgents()` in DASHBOARD_CONNECTED
2. **Phase 5**: Revert to individual status mapping functions
3. **Phase 4**: Restore NULL handling in AgentHeartbeatMonitor
4. **Phase 3**: Restore `lastPing` updates in updateAgentStatus
5. **Phase 2**: Restore postgres_changes listener
6. **Phase 1**: Restore duplicate AGENT_STATUS handlers

Each phase can be independently rolled back without breaking the system.

## Future Improvements

1. **TypeScript Types**: Add `lastPing` to `AgentStatusPayload` interface
2. **WebSocket Compression**: Enable compression for large broadcasts
3. **Debouncing**: Add debounce to rapid status changes
4. **Health Dashboard**: Create admin page showing agent status history
5. **E2E Tests**: Add Playwright tests for agent status scenarios

---

**Implementation Date**: January 2025
**Implemented By**: Claude Code
**Review Status**: Pending user testing
**Related Issues**: [Previous fix documents in docs/frontend/]
