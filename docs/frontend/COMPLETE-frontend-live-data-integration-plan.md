# Frontend Live Data Integration Plan

**Document Version:** 1.0
**Date:** 2025-10-30
**Status:** Ready for Implementation
**Priority:** Critical - Blocks Frontend Go-Live
**Estimated Effort:** 4-6 hours (1 frontend developer)

---

## Executive Summary

The Onsembl.ai frontend Active Agents page currently displays mock data that is hardcoded on component mount. While WebSocket infrastructure and API services exist, they are not properly integrated. This document outlines the specific changes required to:

1. Remove mock data and load real agents from the backend API
2. Fix data model mismatches between frontend and backend
3. Properly initialize WebSocket integration for live updates
4. Handle enriched agent data from the backend

**Impact:** Without these changes, the dashboard will continue showing fake data and miss all real-time agent updates.

---

## Current State Analysis

### What's Working ✅

1. **WebSocket Service** - Service exists and can connect
2. **API Client** - RESTful client with authentication ready
3. **Agent Store** - Zustand store with proper state management
4. **WebSocket Integration Module** - Event handlers defined
5. **Backend Alignment** - Backend implementing field transformations per alignment plan

### What's Not Working ❌

| Issue | Location | Impact |
|-------|----------|--------|
| Mock data initialization | `agents/page.tsx:22-61` | **CRITICAL** - Real agents never shown |
| API calls simulated | `agent-store.ts:103-117` | **CRITICAL** - No real data fetched |
| WebSocket never initialized | `(auth)/layout.tsx` | **CRITICAL** - No live updates |
| Type mismatch in API responses | `api.service.ts:412` | **HIGH** - Will cause undefined errors |
| Incorrect status mapping | `agent-websocket-integration.ts:138` | **HIGH** - Wrong status displayed |
| Missing enriched fields | `agent-websocket-integration.ts:13-68` | **MEDIUM** - Incomplete agent data |

---

## Data Model Alignment

### Backend API Response (After Alignment)

According to `docs/backend/frontend-backend-alignment-plan.md`, the backend will return:

```typescript
{
  agent_id: string;           // Not 'id'
  name: string;
  agent_type: string;         // Not 'type', uppercase (CLAUDE, GEMINI)
  status: string;             // Uppercase (ONLINE, OFFLINE, ERROR, CONNECTING)
  version: string;
  capabilities: string[];
  last_heartbeat: string;     // Not 'last_ping'
  last_metrics: {             // Not raw 'metadata'
    commandsExecuted: number;
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
  } | null;
  created_at: string;
  updated_at: string;
}
```

### Frontend Store Type (Current)

```typescript
{
  id: string;
  name: string;
  type: 'claude' | 'gemini' | 'codex';  // Lowercase enum
  status: 'online' | 'offline' | 'error' | 'connecting';  // Lowercase enum
  version: string;
  capabilities: string[];
  lastPing: string;           // camelCase
  metrics?: {
    commandsExecuted: number;
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}
```

### Required Transformation

We need a transformer layer to convert API responses to store types:
- `agent_id` → `id`
- `agent_type` → `type` (with lowercase conversion)
- `status` (uppercase) → `status` (lowercase)
- `last_heartbeat` → `lastPing`
- `last_metrics` → `metrics`

---

## Implementation Plan

### Phase 1: Create API Transformation Layer (Priority: CRITICAL)

**Goal:** Enable frontend to consume backend API responses without errors

#### Step 1.1: Create Agent API Service

**New File:** `frontend/src/services/agent-api.service.ts`

```typescript
import { apiClient } from './api.service';
import { Agent, AgentType, AgentStatus } from '@/stores/agent-store';

/**
 * Backend API response type (matches alignment plan)
 */
export interface AgentApiResponse {
  agent_id: string;
  name: string;
  agent_type: string;
  status: string;
  version: string;
  capabilities: string[];
  last_heartbeat: string | null;
  last_metrics: {
    commandsExecuted: number;
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
  } | null;
  created_at: string;
  updated_at: string;
}

/**
 * Transform backend API response to frontend Agent type
 */
export function transformApiAgent(apiAgent: AgentApiResponse): Agent {
  // Map uppercase type to lowercase
  const type: AgentType = apiAgent.agent_type.toLowerCase() as AgentType;

  // Map uppercase status to lowercase
  const status: AgentStatus = apiAgent.status.toLowerCase() as AgentStatus;

  return {
    id: apiAgent.agent_id,
    name: apiAgent.name,
    type,
    status,
    version: apiAgent.version,
    capabilities: apiAgent.capabilities,
    lastPing: apiAgent.last_heartbeat || new Date().toISOString(),
    metrics: apiAgent.last_metrics || undefined,
  };
}

/**
 * Fetch all agents from backend API
 */
export async function fetchAgents(): Promise<Agent[]> {
  try {
    const response = await apiClient.request<AgentApiResponse[]>('/api/v1/agents');

    if (!response.success || !response.data) {
      throw new Error('Failed to fetch agents');
    }

    return response.data.map(transformApiAgent);
  } catch (error) {
    console.error('Error fetching agents:', error);
    throw error;
  }
}

/**
 * Fetch single agent by ID
 */
export async function fetchAgent(agentId: string): Promise<Agent> {
  try {
    const response = await apiClient.request<AgentApiResponse>(`/api/v1/agents/${agentId}`);

    if (!response.success || !response.data) {
      throw new Error(`Failed to fetch agent ${agentId}`);
    }

    return transformApiAgent(response.data);
  } catch (error) {
    console.error(`Error fetching agent ${agentId}:`, error);
    throw error;
  }
}
```

**Testing:**
```typescript
// Test transformation
const mockApiResponse: AgentApiResponse = {
  agent_id: 'test-123',
  name: 'Test Agent',
  agent_type: 'CLAUDE',
  status: 'ONLINE',
  version: '3.5',
  capabilities: ['code-analysis'],
  last_heartbeat: '2025-10-30T12:00:00Z',
  last_metrics: {
    commandsExecuted: 10,
    uptime: 3600,
    memoryUsage: 1024,
    cpuUsage: 25
  },
  created_at: '2025-10-30T10:00:00Z',
  updated_at: '2025-10-30T12:00:00Z'
};

const agent = transformApiAgent(mockApiResponse);
console.assert(agent.id === 'test-123');
console.assert(agent.type === 'claude');
console.assert(agent.status === 'online');
```

---

### Phase 2: Update Agent Store (Priority: CRITICAL)

**Goal:** Replace simulated API calls with real backend requests

#### Step 2.1: Update Agent Store

**File:** `frontend/src/stores/agent-store.ts`

**Add import at top:**
```typescript
import { fetchAgents } from '@/services/agent-api.service';
```

**Replace refreshAgents method (lines 103-124):**
```typescript
refreshAgents: async () => {
  try {
    set({ isLoading: true, error: null });

    // Fetch agents from real backend API
    const agents = await fetchAgents();

    set({
      agents,
      isLoading: false,
    });
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : 'Failed to refresh agents';

    set({
      error: errorMessage,
      isLoading: false,
    });

    // Re-throw for component-level error handling
    throw error;
  }
},
```

**Testing:**
```bash
# In browser console after implementation
const store = useAgentStore.getState();
await store.refreshAgents();
console.log(store.agents); // Should show real agents from backend
```

---

### Phase 3: Fix WebSocket Integration (Priority: CRITICAL)

**Goal:** Properly handle enriched WebSocket events from backend

#### Step 3.1: Update WebSocket Integration Handlers

**File:** `frontend/src/stores/agent-websocket-integration.ts`

**Replace AGENT_STATUS handler (lines 13-69):**
```typescript
webSocketService.on(MessageType.AGENT_STATUS, (payload: any) => {
  const {
    agentId,
    status,
    timestamp,
    metrics,
    // Enriched fields from backend (new)
    name,
    type,
    version,
    capabilities
  } = payload;

  // Map WebSocket status (uppercase) to store status (lowercase)
  let agentStatus: 'online' | 'offline' | 'error' | 'connecting';
  switch (status) {
    case 'ONLINE':
    case 'IDLE':
      agentStatus = 'online';
      break;
    case 'OFFLINE':
    case 'DISCONNECTED':
      agentStatus = 'offline';
      break;
    case 'ERROR':
    case 'CRASHED':
      agentStatus = 'error';
      break;
    case 'CONNECTING':
      agentStatus = 'connecting';
      break;
    default:
      agentStatus = 'offline';
  }

  const store = useAgentStore.getState();
  const existingAgent = store.getAgentById(agentId);

  if (existingAgent) {
    // Update existing agent with enriched data
    store.updateAgent(agentId, {
      status: agentStatus,
      lastPing: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
      // Update enriched fields if provided by backend
      ...(name && { name }),
      ...(type && { type: type.toLowerCase() as AgentType }),
      ...(version && { version }),
      ...(capabilities && { capabilities }),
    });

    if (metrics) {
      store.updateAgentMetrics(agentId, {
        commandsExecuted: metrics.commandsExecuted || 0,
        uptime: metrics.uptime || 0,
        memoryUsage: metrics.memoryUsage || 0,
        cpuUsage: metrics.cpuUsage || 0,
      });
    }
  } else {
    // New agent connected - use enriched data from backend
    store.addAgent({
      id: agentId,
      name: name || `Agent ${agentId.substring(0, 8)}`,
      type: (type?.toLowerCase() || 'claude') as AgentType,
      status: agentStatus,
      version: version || 'unknown',
      capabilities: capabilities || [],
      lastPing: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
      metrics: metrics ? {
        commandsExecuted: metrics.commandsExecuted || 0,
        uptime: metrics.uptime || 0,
        memoryUsage: metrics.memoryUsage || 0,
        cpuUsage: metrics.cpuUsage || 0,
      } : undefined,
    });
  }
});
```

**Replace dashboard:connected handler (lines 125-145):**
```typescript
webSocketService.on('dashboard:connected' as any, (payload: any) => {
  const { agents } = payload;
  const store = useAgentStore.getState();

  console.log('Dashboard connected, received agents:', agents);

  // Clear existing agents
  store.clearAgents();

  if (agents && Array.isArray(agents)) {
    agents.forEach((agent: any) => {
      // Map uppercase status from backend to lowercase
      let status: 'online' | 'offline' | 'error' | 'connecting' = 'offline';

      const backendStatus = agent.status?.toUpperCase();
      if (backendStatus === 'ONLINE') status = 'online';
      else if (backendStatus === 'OFFLINE') status = 'offline';
      else if (backendStatus === 'ERROR') status = 'error';
      else if (backendStatus === 'CONNECTING') status = 'connecting';

      store.addAgent({
        id: agent.agentId,
        name: agent.name || `Agent ${agent.agentId.substring(0, 8)}`,
        type: (agent.type?.toLowerCase() || 'claude') as AgentType,
        status,
        version: agent.version || 'unknown',
        capabilities: agent.capabilities || [],
        lastPing: agent.lastHeartbeat || new Date().toISOString(),
        metrics: agent.metrics, // Backend now sends structured metrics
      });
    });
  }
});
```

**Add AgentType import at top:**
```typescript
import { useAgentStore, AgentType } from './agent-store';
```

---

### Phase 4: Initialize WebSocket Connection (Priority: CRITICAL)

**Goal:** Establish WebSocket connection when user logs in

#### Step 4.1: Update Auth Layout

**File:** `frontend/src/app/(auth)/layout.tsx`

**Replace entire file:**
```typescript
'use client';

import { useEffect } from 'react';
import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { initializeAgentWebSocket, cleanupAgentWebSocket } from '@/stores/agent-websocket-integration';
import { webSocketService } from '@/services/websocket.service';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    console.log('Initializing WebSocket connection...');

    // Connect WebSocket
    webSocketService.connect();

    // Setup agent store integration
    initializeAgentWebSocket();

    // Cleanup on unmount
    return () => {
      console.log('Cleaning up WebSocket connection...');
      cleanupAgentWebSocket();
      webSocketService.disconnect();
    };
  }, []);

  return (
    <ProtectedRoute>
      <AuthenticatedLayout>{children}</AuthenticatedLayout>
    </ProtectedRoute>
  );
}
```

**Testing:**
- Open browser DevTools → Network → WS
- Should see WebSocket connection to `ws://localhost:3001/ws`
- Should see `DASHBOARD_INIT` and `dashboard:connected` messages

---

### Phase 5: Remove Mock Data (Priority: CRITICAL)

**Goal:** Stop injecting fake agents, load real data instead

#### Step 5.1: Update Agents Page

**File:** `frontend/src/app/(auth)/agents/page.tsx`

**Delete lines 21-61 (entire useEffect with mock data)**

**Add this useEffect instead (after line 19):**
```typescript
// Load real agents on mount
useEffect(() => {
  refreshAgents().catch(error => {
    addNotification({
      title: 'Failed to Load Agents',
      description: error.message || 'Could not fetch agents from backend',
      type: 'error',
    });
  });
}, [refreshAgents, addNotification]);
```

**Testing:**
- Dashboard should load empty initially
- After API call completes, real agents appear
- No mock agents should be shown

---

### Phase 6: Update API Service Types (Priority: MEDIUM)

**Goal:** Fix TypeScript type mismatches in API client

#### Step 6.1: Add Generic Request Method

**File:** `frontend/src/services/api.service.ts`

The current `getAgents()` method (line 412) expects database types. We need to expose the generic `request` method:

**Make request method public (change line 204):**
```typescript
// Change from private to public
public async request<T>(endpoint: string, config: RequestConfig = {}): Promise<ApiResponse<T>> {
  // ... existing implementation
}
```

This allows `agent-api.service.ts` to use it with proper typing.

---

## Testing Strategy

### Unit Tests

**Create:** `frontend/src/services/__tests__/agent-api.service.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { transformApiAgent, fetchAgents } from '../agent-api.service';
import { AgentApiResponse } from '../agent-api.service';

describe('Agent API Service', () => {
  describe('transformApiAgent', () => {
    it('should transform API response to Agent type', () => {
      const apiResponse: AgentApiResponse = {
        agent_id: 'test-123',
        name: 'Test Agent',
        agent_type: 'CLAUDE',
        status: 'ONLINE',
        version: '3.5',
        capabilities: ['code-analysis'],
        last_heartbeat: '2025-10-30T12:00:00Z',
        last_metrics: {
          commandsExecuted: 10,
          uptime: 3600,
          memoryUsage: 1024,
          cpuUsage: 25,
        },
        created_at: '2025-10-30T10:00:00Z',
        updated_at: '2025-10-30T12:00:00Z',
      };

      const agent = transformApiAgent(apiResponse);

      expect(agent.id).toBe('test-123');
      expect(agent.type).toBe('claude');
      expect(agent.status).toBe('online');
      expect(agent.lastPing).toBe('2025-10-30T12:00:00Z');
      expect(agent.metrics?.commandsExecuted).toBe(10);
    });

    it('should handle null last_heartbeat', () => {
      const apiResponse: AgentApiResponse = {
        agent_id: 'test-123',
        name: 'Test Agent',
        agent_type: 'GEMINI',
        status: 'OFFLINE',
        version: '2.0',
        capabilities: [],
        last_heartbeat: null,
        last_metrics: null,
        created_at: '2025-10-30T10:00:00Z',
        updated_at: '2025-10-30T12:00:00Z',
      };

      const agent = transformApiAgent(apiResponse);

      expect(agent.lastPing).toBeTruthy();
      expect(agent.metrics).toBeUndefined();
    });
  });
});
```

### Integration Tests

**Manual Testing Checklist:**

- [ ] **Initial Load**
  - [ ] Dashboard shows empty state (no mock agents)
  - [ ] Loading indicator appears during fetch
  - [ ] Real agents from database appear after load

- [ ] **API Integration**
  - [ ] Clicking refresh button calls `/api/v1/agents`
  - [ ] Response includes `agent_id`, `agent_type`, `last_heartbeat`, `last_metrics`
  - [ ] No console errors about undefined fields

- [ ] **WebSocket Connection**
  - [ ] WebSocket establishes on login
  - [ ] `dashboard:connected` event received with initial agent list
  - [ ] Initial agent list populates the dashboard

- [ ] **Real-time Updates**
  - [ ] Start mock agent → appears in dashboard immediately
  - [ ] Agent shows correct name, type, version, capabilities
  - [ ] Metrics update in real-time (CPU, memory, uptime)
  - [ ] Stop agent → status changes to offline
  - [ ] `AGENT_DISCONNECT` event updates UI

- [ ] **Error Handling**
  - [ ] Network error shows error notification
  - [ ] WebSocket disconnect shows connection lost state
  - [ ] Retry mechanism works on failure

---

## Implementation Order

### Day 1: Core Integration (4 hours)

1. **Hour 1:** Create `agent-api.service.ts` with transformers
2. **Hour 2:** Update agent store `refreshAgents()` to use real API
3. **Hour 3:** Fix WebSocket integration handlers
4. **Hour 4:** Remove mock data from agents page

### Day 2: Polish & Testing (2 hours)

1. **Hour 1:** Initialize WebSocket in auth layout, test connection
2. **Hour 2:** End-to-end testing with real backend + mock agents

---

## Success Criteria

### ✅ Definition of Done

**API Integration:**
- [ ] `fetchAgents()` returns real agents from backend
- [ ] Field transformations work: `agent_id` → `id`, etc.
- [ ] Uppercase/lowercase mapping correct for status and type
- [ ] No TypeScript errors in API layer

**WebSocket Integration:**
- [ ] Connection established on login
- [ ] `dashboard:connected` populates initial agents
- [ ] `AGENT_STATUS` updates agents with enriched data
- [ ] `AGENT_DISCONNECT` marks agents offline
- [ ] No console errors about undefined fields

**User Experience:**
- [ ] Dashboard loads real data, no mock agents
- [ ] Refresh button works
- [ ] Real-time updates appear instantly
- [ ] Agent metrics display correctly
- [ ] Connection/disconnection reflected immediately

---

## Rollback Plan

If issues arise during implementation:

1. **Revert to mock data:** Restore `agents/page.tsx` lines 21-61
2. **Disable WebSocket:** Comment out initialization in auth layout
3. **Keep API transformation layer:** Safe to keep even if unused

**Git Branch Strategy:**
- Work in feature branch: `feature/frontend-live-data-integration`
- Test thoroughly before merging to `main`
- Create rollback tag before deploy: `git tag pre-live-data-v1.0`

---

## Dependencies

### Backend Dependencies (MUST be completed first)

Per `docs/backend/frontend-backend-alignment-plan.md`:

- [ ] Backend Phase 1: REST API transformation layer implemented
- [ ] Backend Phase 2: WebSocket event enhancements (enriched AGENT_STATUS)
- [ ] Backend Phase 2: AGENT_DISCONNECT event implemented
- [ ] Backend Phase 2: dashboard:connected event sends initial agent list

### Frontend Prerequisites

- [ ] WebSocket service working (`services/websocket.service.ts`)
- [ ] API client working (`services/api.service.ts`)
- [ ] Agent store functional (`stores/agent-store.ts`)
- [ ] Authentication working (tokens available for API calls)

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Backend not ready | Medium | High | Coordinate with backend team, confirm completion |
| WebSocket connection fails | Low | High | Add connection retry logic, fallback to polling |
| Type mismatches | Low | Medium | Comprehensive unit tests for transformers |
| Performance degradation | Low | Low | Monitor with React DevTools, optimize if needed |
| Breaking existing features | Low | High | Feature flag for live data, gradual rollout |

---

## Monitoring & Validation

### Console Logging (Development)

Add temporary logging to validate data flow:

```typescript
// In agent-api.service.ts
console.log('Fetched agents from API:', agents);

// In agent-websocket-integration.ts
console.log('Received AGENT_STATUS:', payload);
console.log('Received dashboard:connected:', payload);

// In agent-store.ts
console.log('Agent store updated:', get().agents);
```

### Production Monitoring

- Track API call success rate
- Monitor WebSocket connection uptime
- Log transformation errors to error tracking service
- Dashboard: show connection status indicator

---

## Future Improvements

1. **Optimistic Updates:** Update UI immediately, sync with backend after
2. **Caching:** Cache agent data in localStorage, show stale data while fetching
3. **Polling Fallback:** If WebSocket fails, poll API every 5 seconds
4. **Real-time Metrics Graph:** Show CPU/memory trends over time
5. **Agent Health Alerts:** Notify when agent goes offline or errors

---

## References

- **Backend Alignment Plan:** `/docs/backend/frontend-backend-alignment-plan.md`
- **WebSocket Protocol:** `/specs/001-build-onsembl-ai/contracts/websocket-protocol.md`
- **REST API Contract:** `/specs/001-build-onsembl-ai/contracts/rest-api.yaml`
- **Agent Store:** `/frontend/src/stores/agent-store.ts`
- **WebSocket Integration:** `/frontend/src/stores/agent-websocket-integration.ts`
- **API Service:** `/frontend/src/services/api.service.ts`

---

**Document Owner:** Frontend Team
**Reviewers:** Backend Team, QA Team
**Next Review:** After implementation completion
**Status:** Ready for Implementation
