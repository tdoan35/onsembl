# Frontend-Backend Alignment Implementation Plan

**Document Version:** 1.0
**Date:** 2025-10-30
**Status:** Implementation Required
**Priority:** High - Blocks Frontend Go-Live

## Executive Summary

The Onsembl.ai frontend Active Agents page is currently using mock data. While all infrastructure components (WebSocket, REST API, authentication) are in place, **critical data model mismatches** prevent the frontend from consuming live backend data.

**Impact:** Frontend will fail to display agent data correctly with undefined field errors.

**Estimated Effort:** 2-3 days (1 backend developer)

---

## Current State Analysis

### What Works ✅

1. **Database Schema** - All necessary fields exist in `agents` table
2. **WebSocket Infrastructure** - Connection, authentication, routing working
3. **REST API Skeleton** - Endpoints exist with authentication
4. **Agent Registration** - Agents can connect and be stored in database
5. **Heartbeat System** - AGENT_HEARTBEAT events work correctly
6. **Error Handling** - AGENT_ERROR events match expectations

### What Doesn't Work ❌

| Component | Issue | Impact |
|-----------|-------|--------|
| GET /agents API | Returns wrong field names (`id` instead of `agent_id`) | **CRITICAL** - Frontend gets undefined |
| AGENT_STATUS Event | Missing agent details (name, type, version, capabilities) | **CRITICAL** - Incomplete updates |
| AGENT_DISCONNECT Event | Event doesn't exist, only internal cleanup | **HIGH** - Agents stuck "online" |
| dashboard:connected Event | No initial agent list sent on connection | **HIGH** - Empty page on load |
| Metrics Structure | Unstructured in metadata blob | **MEDIUM** - No monitoring data |
| Status/Type Casing | Database uses lowercase, protocol uppercase | **MEDIUM** - Inconsistency |
| Capabilities Storage | Stored in metadata, database field empty | **LOW** - Confusing data model |

---

## Data Model Gaps

### REST API Response Gap

**Frontend Expects:**
```typescript
{
  agent_id: string;           // ❌ Backend returns: id
  name: string;               // ✅ Matches
  agent_type: string;         // ❌ Backend returns: type
  status: string;             // ⚠️  Backend lowercase, should be uppercase
  version: string;            // ✅ Matches
  capabilities: string[];     // ⚠️  Often empty, real data in metadata
  last_heartbeat: string;     // ❌ Backend returns: last_ping
  last_metrics: {             // ❌ Backend returns raw metadata
    commandsExecuted: number;
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  created_at: string;         // ✅ Matches
  updated_at: string;         // ✅ Matches
}
```

**Backend Currently Returns:**
```typescript
{
  id: string;                 // Should be agent_id
  user_id: string;
  name: string;
  type: string;               // Should be agent_type, uppercase
  status: string;             // Lowercase, should be uppercase
  version: string;
  capabilities: string[];     // Often empty
  last_ping: string;          // Should be last_heartbeat
  metadata: Json;             // Should be structured last_metrics
  created_at: string;
  updated_at: string;
}
```

### WebSocket Event Gaps

#### AGENT_STATUS Event

**Frontend Expects:**
```typescript
{
  agentId: string;
  status: string;
  timestamp: number;          // ❌ MISSING
  metrics: {                  // ⚠️  Exists as healthMetrics
    commandsExecuted: number;
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  name: string;               // ❌ MISSING
  type: string;               // ❌ MISSING
  version: string;            // ❌ MISSING
  capabilities: string[];     // ❌ MISSING
}
```

**Protocol Currently Has:**
```typescript
{
  agentId: string;
  status: 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'ERROR';
  activityState: 'IDLE' | 'PROCESSING' | 'QUEUED';
  healthMetrics?: {
    cpuUsage: number;
    memoryUsage: number;
    uptime: number;
    commandsProcessed: number;    // Should be commandsExecuted
    averageResponseTime: number;
  };
  currentCommand?: {...};
  queuedCommands?: number;
}
```

#### AGENT_DISCONNECT Event

**Frontend Expects:**
```typescript
{ agentId: string }
```

**Backend Status:** ❌ Event doesn't exist - only internal cleanup in agent-handler.ts

#### dashboard:connected Event

**Frontend Expects:**
```typescript
{
  agents: Array<{
    agentId: string;
    name: string;
    type: string;
    status: string;
    version: string;
    capabilities: string[];
    lastHeartbeat: string;
  }>
}
```

**Backend Status:** ❌ Event doesn't exist - dashboard handler doesn't send initial state

---

## Implementation Plan

### Phase 1: REST API Transformation Layer (Priority: CRITICAL)

**File:** `backend/src/api/agents.ts`

#### Step 1.1: Create Response Transformer

```typescript
// Add to agents.ts

interface AgentApiResponse {
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

function transformAgentForApi(dbAgent: AgentRow): AgentApiResponse {
  // Extract metrics from metadata
  const metadata = dbAgent.metadata as AgentMetadata | null;
  let lastMetrics = null;

  if (metadata) {
    const perfMetrics = metadata.performance_metrics;
    const directMetrics = {
      memoryUsage: metadata.memory_usage,
      uptime: metadata.uptime,
    };

    lastMetrics = {
      commandsExecuted: perfMetrics?.commands_executed || 0,
      uptime: directMetrics.uptime || perfMetrics?.uptime || 0,
      memoryUsage: directMetrics.memoryUsage || 0,
      cpuUsage: 0, // Not currently tracked, default to 0
    };
  }

  return {
    agent_id: dbAgent.id,
    name: dbAgent.name,
    agent_type: dbAgent.type.toUpperCase(),
    status: dbAgent.status.toUpperCase(),
    version: dbAgent.version,
    capabilities: dbAgent.capabilities || [],
    last_heartbeat: dbAgent.last_ping,
    last_metrics: lastMetrics,
    created_at: dbAgent.created_at,
    updated_at: dbAgent.updated_at,
  };
}
```

#### Step 1.2: Update GET /agents Endpoint

```typescript
// Update existing handler (around line 100)

fastify.get('/', {
  preHandler: authenticate,
  schema: {
    // Update response schema to match AgentApiResponse
    response: {
      200: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                agent_id: { type: 'string' },
                name: { type: 'string' },
                agent_type: { type: 'string' },
                status: { type: 'string' },
                version: { type: 'string' },
                capabilities: {
                  type: 'array',
                  items: { type: 'string' }
                },
                last_heartbeat: { type: ['string', 'null'] },
                last_metrics: {
                  type: ['object', 'null'],
                  properties: {
                    commandsExecuted: { type: 'number' },
                    uptime: { type: 'number' },
                    memoryUsage: { type: 'number' },
                    cpuUsage: { type: 'number' },
                  }
                },
                created_at: { type: 'string' },
                updated_at: { type: 'string' },
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  const userId = (request as any).userId;
  const agents = await agentModel.findAll(userId);

  // Transform each agent
  const transformedAgents = agents.map(transformAgentForApi);

  return {
    data: transformedAgents,
    success: true,
  };
});
```

#### Step 1.3: Update GET /agents/:id Endpoint

```typescript
// Apply same transformation to single agent endpoint

fastify.get('/:id', {
  preHandler: authenticate,
  // ... schema update
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const userId = (request as any).userId;

  const agent = await agentModel.findById(id, userId);

  if (!agent) {
    return reply.status(404).send({
      success: false,
      error: 'Agent not found'
    });
  }

  return {
    data: transformAgentForApi(agent),
    success: true,
  };
});
```

**Testing:**
```bash
# Test transformed response
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/v1/agents

# Verify fields: agent_id, agent_type, last_heartbeat, last_metrics
```

---

### Phase 2: WebSocket Event Enhancements (Priority: CRITICAL)

**Files:**
- `backend/src/websocket/agent-handler.ts`
- `backend/src/websocket/message-router.ts`
- `backend/src/services/agent.service.ts`

#### Step 2.1: Enhance AGENT_STATUS Event

**File:** `backend/src/services/agent.service.ts`

```typescript
// Add new method to broadcast enriched status

async broadcastAgentStatus(
  agentId: string,
  status: AgentStatus,
  activityState: AgentActivityState,
  healthMetrics?: any,
  currentCommand?: any,
  queuedCommands?: number
): Promise<void> {
  // Fetch full agent details from database
  const agent = await this.agentModel.findByAgentId(agentId);

  if (!agent) {
    logger.warn({ agentId }, 'Cannot broadcast status for unknown agent');
    return;
  }

  // Create enriched status payload for frontend
  const enrichedPayload = {
    agentId,
    status,
    timestamp: Date.now(),
    metrics: healthMetrics ? {
      commandsExecuted: healthMetrics.commandsProcessed || 0,
      uptime: healthMetrics.uptime || 0,
      memoryUsage: healthMetrics.memoryUsage || 0,
      cpuUsage: healthMetrics.cpuUsage || 0,
    } : null,
    // Add agent details for frontend
    name: agent.name,
    type: agent.type.toUpperCase(),
    version: agent.version,
    capabilities: agent.capabilities || [],
    // Include protocol fields for compatibility
    activityState,
    currentCommand,
    queuedCommands,
  };

  // Broadcast to all connected dashboards
  await this.messageRouter.broadcastToDashboards({
    type: MessageType.AGENT_STATUS,
    payload: enrichedPayload,
  });
}
```

#### Step 2.2: Update Status Broadcasts

**File:** `backend/src/websocket/agent-handler.ts`

Find all places that broadcast AGENT_STATUS and use the new method:

```typescript
// Replace direct broadcasts with enriched method
// Example locations:
// - Line ~350: handleAgentHeartbeat
// - Line ~400: handleCommandStart
// - Line ~450: handleCommandComplete

// Before:
this.messageRouter.broadcastToDashboards({
  type: MessageType.AGENT_STATUS,
  payload: { agentId, status, activityState, healthMetrics }
});

// After:
await this.agentService.broadcastAgentStatus(
  agentId,
  status,
  activityState,
  healthMetrics,
  currentCommand,
  queuedCommands
);
```

#### Step 2.3: Implement AGENT_DISCONNECT Event

**File:** `backend/src/websocket/agent-handler.ts`

Update the disconnect handler:

```typescript
// Around line 588-622: handleAgentDisconnect

async handleAgentDisconnect(agentId: string, reason?: string): Promise<void> {
  const agentConnection = this.agentConnections.get(agentId);

  if (!agentConnection) {
    return;
  }

  logger.info({ agentId, reason }, 'Agent disconnecting');

  try {
    // Update database status
    await this.agentService.updateStatus(
      agentId,
      'OFFLINE',
      { disconnectReason: reason }
    );

    // *** NEW: Broadcast AGENT_DISCONNECT event ***
    await this.messageRouter.broadcastToDashboards({
      type: 'AGENT_DISCONNECT', // Add to MessageType enum if needed
      payload: {
        agentId,
        reason,
        timestamp: Date.now(),
      },
    });

    // Cleanup connection
    agentConnection.socket.close();
    this.agentConnections.delete(agentId);
    this.connectionsBySocketId.delete(agentConnection.socketId);

    logger.info({ agentId }, 'Agent disconnected and cleaned up');
  } catch (error) {
    logger.error({ agentId, error }, 'Error handling agent disconnect');
    throw error;
  }
}
```

**Note:** Add to protocol types if needed:

**File:** `packages/agent-protocol/src/types.ts`

```typescript
// Add to MessageType enum
export enum MessageType {
  // ... existing types
  AGENT_DISCONNECT = 'AGENT_DISCONNECT',
}

// Add payload interface
export interface AgentDisconnectPayload {
  agentId: string;
  reason?: string;
  timestamp: number;
}
```

#### Step 2.4: Implement dashboard:connected Event

**File:** `backend/src/websocket/dashboard-handler.ts`

Update DASHBOARD_INIT handler:

```typescript
// Around line 100-150: handleDashboardInit

async handleDashboardInit(
  socket: WebSocket,
  payload: DashboardInitPayload,
  auth: AuthContext
): Promise<void> {
  logger.info({ userId: auth.userId }, 'Dashboard initializing');

  const dashboardId = payload.dashboardId || this.generateDashboardId();

  // Register dashboard
  this.dashboardConnections.set(dashboardId, {
    socket,
    userId: auth.userId,
    connectedAt: Date.now(),
  });

  // Send acknowledgment
  await this.send(socket, MessageType.DASHBOARD_READY, {
    dashboardId,
    timestamp: Date.now(),
  });

  // *** NEW: Send initial agent list ***
  try {
    // Fetch all agents for this user
    const agents = await this.agentModel.findAll(auth.userId);

    // Get live connection status from agent handler
    const agentsWithStatus = agents.map(agent => {
      const isConnected = this.agentHandler.isAgentConnected(agent.id);
      const liveMetrics = this.agentHandler.getAgentMetrics(agent.id);

      return {
        agentId: agent.id,
        name: agent.name,
        type: agent.type.toUpperCase(),
        status: isConnected ? 'ONLINE' : agent.status.toUpperCase(),
        version: agent.version,
        capabilities: agent.capabilities || [],
        lastHeartbeat: agent.last_ping,
        metrics: liveMetrics,
      };
    });

    // Send initial agent list
    await this.send(socket, 'dashboard:connected', {
      agents: agentsWithStatus,
      timestamp: Date.now(),
    });

    logger.info(
      { dashboardId, userId: auth.userId, agentCount: agents.length },
      'Sent initial agent list to dashboard'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to send initial agent list');
  }
}
```

**Add helper methods to agent-handler.ts:**

```typescript
// backend/src/websocket/agent-handler.ts

public isAgentConnected(agentId: string): boolean {
  return this.agentConnections.has(agentId);
}

public getAgentMetrics(agentId: string): any {
  const connection = this.agentConnections.get(agentId);
  return connection?.lastHealthMetrics || null;
}
```

**Testing:**
```bash
# Connect dashboard WebSocket and verify initial message
wscat -c "ws://localhost:3001/ws?token=$TOKEN"

# Send DASHBOARD_INIT and check for dashboard:connected event
```

---

### Phase 3: Data Consistency Improvements (Priority: MEDIUM)

#### Step 3.1: Standardize Status/Type Casing

**File:** `backend/src/models/agent.ts`

Update model to store uppercase:

```typescript
// Option A: Update database schema (migration required)
// Create migration: backend/migrations/XXX_uppercase_agent_status_type.sql

-- Update existing data
UPDATE agents SET status = UPPER(status);
UPDATE agents SET type = UPPER(type);

-- Update enum constraints if using enums
```

OR

```typescript
// Option B: Transform on write/read (no migration)
// Update agentModel.create and agentModel.update to:

async create(agent: AgentInsert): Promise<AgentRow> {
  const normalized = {
    ...agent,
    status: agent.status?.toUpperCase(),
    type: agent.type?.toUpperCase(),
  };

  const result = await this.supabase
    .from('agents')
    .insert(normalized)
    .select()
    .single();

  return result.data;
}

// Add transformer on read as backup
async findById(id: string, userId: string): Promise<AgentRow | null> {
  const result = await this.supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!result.data) return null;

  return {
    ...result.data,
    status: result.data.status?.toUpperCase(),
    type: result.data.type?.toUpperCase(),
  };
}
```

**Recommendation:** Option B (transform on read/write) is safer - no migration risk.

#### Step 3.2: Structure Metrics in Metadata

**File:** `backend/src/models/agent.ts`

Update AgentMetadata interface:

```typescript
export interface AgentMetadata {
  // Connection info
  connection_id?: string;
  host_machine?: string;

  // Capabilities (protocol format)
  capabilities?: {
    maxTokens: number;
    supportsInterrupt: boolean;
    supportsTrace: boolean;
  };

  // Structured metrics (required for frontend)
  metrics: {
    commandsExecuted: number;
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
    lastUpdated: string;
  };

  // Error tracking
  last_error?: string;
  error_count?: number;
}
```

**File:** `backend/src/websocket/agent-handler.ts`

Update heartbeat handler to structure metrics:

```typescript
// Around line 350: handleAgentHeartbeat

async handleAgentHeartbeat(
  agentId: string,
  payload: AgentHeartbeatPayload
): Promise<void> {
  const { healthMetrics } = payload;

  // Structure metrics according to new schema
  const structuredMetrics = {
    commandsExecuted: healthMetrics.commandsProcessed || 0,
    uptime: healthMetrics.uptime || 0,
    memoryUsage: healthMetrics.memoryUsage || 0,
    cpuUsage: healthMetrics.cpuUsage || 0,
    lastUpdated: new Date().toISOString(),
  };

  // Update agent metadata with structured metrics
  await this.agentService.updateMetadata(agentId, {
    metrics: structuredMetrics,
  });

  // Store in connection for quick access
  const connection = this.agentConnections.get(agentId);
  if (connection) {
    connection.lastHealthMetrics = structuredMetrics;
  }

  // Broadcast enriched status
  await this.agentService.broadcastAgentStatus(
    agentId,
    'ONLINE',
    'IDLE',
    structuredMetrics
  );
}
```

**Testing:**
```sql
-- Verify metrics structure in database
SELECT
  name,
  metadata->>'metrics' as metrics
FROM agents
WHERE user_id = 'your-user-id';
```

#### Step 3.3: Fix Capabilities Storage

**File:** `backend/src/websocket/agent-handler.ts`

Update agent registration to store capabilities correctly:

```typescript
// Around line 230: handleAgentConnect

// Extract capabilities as string array
let capabilitiesArray: string[] = [];
if (capabilities) {
  capabilitiesArray = [
    'basic', // Always include basic
    capabilities.supportsInterrupt ? 'interrupt' : null,
    capabilities.supportsTrace ? 'trace' : null,
  ].filter(Boolean) as string[];
}

// Create new agent with proper capabilities
const newAgent = await this.agentModel.create({
  name: agentId, // Or derive from payload
  type: agentType.toLowerCase() as any,
  status: 'online',
  version,
  capabilities: capabilitiesArray, // Store in database field
  user_id: userId,
  metadata: {
    host_machine: hostMachine,
    connection_id: connectionId,
    capabilities: capabilities, // Also store protocol format in metadata
  },
});
```

---

### Phase 4: Testing & Validation

#### Step 4.1: REST API Testing

Create test file: `backend/src/api/agents.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { apiClient } from './test-helpers';

describe('GET /agents', () => {
  it('should return agents with correct field names', async () => {
    const response = await apiClient.getAgents();

    expect(response.data).toBeDefined();
    expect(response.data[0]).toHaveProperty('agent_id');
    expect(response.data[0]).toHaveProperty('agent_type');
    expect(response.data[0]).toHaveProperty('last_heartbeat');
    expect(response.data[0]).toHaveProperty('last_metrics');

    // Should NOT have database field names
    expect(response.data[0]).not.toHaveProperty('id');
    expect(response.data[0]).not.toHaveProperty('type');
    expect(response.data[0]).not.toHaveProperty('last_ping');
  });

  it('should return uppercase status and type', async () => {
    const response = await apiClient.getAgents();
    const agent = response.data[0];

    expect(agent.status).toMatch(/^[A-Z_]+$/);
    expect(agent.agent_type).toMatch(/^[A-Z_]+$/);
  });

  it('should return structured metrics', async () => {
    const response = await apiClient.getAgents();
    const agent = response.data[0];

    if (agent.last_metrics) {
      expect(agent.last_metrics).toHaveProperty('commandsExecuted');
      expect(agent.last_metrics).toHaveProperty('uptime');
      expect(agent.last_metrics).toHaveProperty('memoryUsage');
      expect(agent.last_metrics).toHaveProperty('cpuUsage');
    }
  });
});
```

#### Step 4.2: WebSocket Event Testing

Create test file: `backend/src/websocket/agent-events.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import WebSocket from 'ws';
import { MessageType } from '@onsembl/agent-protocol';

describe('Agent WebSocket Events', () => {
  let dashboardWs: WebSocket;
  let agentWs: WebSocket;

  beforeAll(async () => {
    // Connect dashboard
    dashboardWs = await connectDashboard();
    agentWs = await connectAgent();
  });

  it('should receive dashboard:connected with initial agents', (done) => {
    dashboardWs.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === 'dashboard:connected') {
        expect(message.payload.agents).toBeDefined();
        expect(Array.isArray(message.payload.agents)).toBe(true);
        done();
      }
    });

    // Send DASHBOARD_INIT
    dashboardWs.send(JSON.stringify({
      type: MessageType.DASHBOARD_INIT,
      payload: { dashboardId: 'test-dashboard' }
    }));
  });

  it('should receive enriched AGENT_STATUS with agent details', (done) => {
    dashboardWs.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === MessageType.AGENT_STATUS) {
        const { payload } = message;
        expect(payload).toHaveProperty('agentId');
        expect(payload).toHaveProperty('status');
        expect(payload).toHaveProperty('name');
        expect(payload).toHaveProperty('type');
        expect(payload).toHaveProperty('version');
        expect(payload).toHaveProperty('capabilities');
        expect(payload).toHaveProperty('timestamp');
        done();
      }
    });

    // Trigger heartbeat from agent
    agentWs.send(JSON.stringify({
      type: MessageType.AGENT_HEARTBEAT,
      payload: {
        agentId: 'test-agent',
        healthMetrics: {
          cpuUsage: 25,
          memoryUsage: 1024,
          uptime: 3600,
          commandsProcessed: 10,
        }
      }
    }));
  });

  it('should receive AGENT_DISCONNECT when agent disconnects', (done) => {
    dashboardWs.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === 'AGENT_DISCONNECT') {
        expect(message.payload).toHaveProperty('agentId');
        expect(message.payload).toHaveProperty('timestamp');
        done();
      }
    });

    // Disconnect agent
    agentWs.close();
  });
});
```

#### Step 4.3: Integration Testing

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend
cd frontend
npm run dev

# Terminal 3: Start mock agent
cd agent-wrapper
npm run dev

# Terminal 4: Run tests
cd backend
npm run test:integration
```

**Manual Testing Checklist:**
- [ ] Dashboard loads and shows empty state (no mock agents)
- [ ] Start mock agent → Appears in dashboard immediately
- [ ] Agent details show correct name, type, version, capabilities
- [ ] Metrics update in real-time (CPU, memory, uptime)
- [ ] Click refresh → Data updates from REST API
- [ ] Stop agent → Status changes to offline immediately
- [ ] Restart agent → Reconnects and shows online
- [ ] Verify no console errors about undefined fields

---

## Success Criteria

### ✅ Definition of Done

**REST API:**
- [ ] GET /agents returns `agent_id`, `agent_type`, `last_heartbeat`, `last_metrics`
- [ ] Status and type are uppercase
- [ ] Metrics are structured object (not raw JSON blob)
- [ ] Response schema validated and documented

**WebSocket Events:**
- [ ] AGENT_STATUS includes name, type, version, capabilities, timestamp
- [ ] AGENT_DISCONNECT event emitted on agent disconnection
- [ ] dashboard:connected event sends initial agent list
- [ ] All events pass integration tests

**Data Quality:**
- [ ] Capabilities stored in database field (not just metadata)
- [ ] Metrics follow consistent structure in metadata
- [ ] Status/type casing is consistent throughout system

**Frontend Integration:**
- [ ] Frontend loads without errors
- [ ] Real-time agent updates work
- [ ] Refresh button works
- [ ] Agent connection/disconnection reflects immediately
- [ ] Metrics display correctly

---

## Rollout Plan

### Stage 1: Development (Day 1)
1. Implement Phase 1 (REST API transformation)
2. Run unit tests
3. Test with Postman/curl

### Stage 2: WebSocket Events (Day 2 AM)
1. Implement Phase 2 (WebSocket enhancements)
2. Run WebSocket integration tests
3. Test with wscat

### Stage 3: Data Consistency (Day 2 PM)
1. Implement Phase 3 (metrics and capabilities)
2. Update existing agents in database
3. Test end-to-end flow

### Stage 4: Integration Testing (Day 3 AM)
1. Run full test suite
2. Manual testing with real agents
3. Performance testing (10+ agents)

### Stage 5: Go-Live (Day 3 PM)
1. Deploy backend changes
2. Remove frontend mock data
3. Monitor production logs
4. Smoke test in production

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Breaking changes to existing agents | HIGH | Add version header, support both old/new formats temporarily |
| Performance degradation from database lookups | MEDIUM | Cache agent details in memory, update on changes |
| Existing agents have inconsistent metadata | MEDIUM | Add migration script to normalize existing data |
| Frontend still uses mock data after deploy | HIGH | Feature flag to control mock vs live data |
| WebSocket events flood dashboards | LOW | Rate limiting, event batching |

---

## Appendix

### A. Database Migration Script

If choosing Option A for status/type casing:

```sql
-- migrations/XXX_normalize_agent_data.sql

BEGIN;

-- Normalize status to uppercase
UPDATE agents
SET status = UPPER(status)
WHERE status != UPPER(status);

-- Normalize type to uppercase
UPDATE agents
SET type = UPPER(type)
WHERE type != UPPER(type);

-- Ensure capabilities is not null
UPDATE agents
SET capabilities = '[]'::jsonb
WHERE capabilities IS NULL OR capabilities = 'null'::jsonb;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_agents_user_status
ON agents(user_id, status);

COMMIT;
```

### B. Configuration Changes

Add to `backend/src/config/index.ts`:

```typescript
export const config = {
  // ... existing config

  websocket: {
    // Send initial agent list on dashboard connect
    sendInitialAgentList: true,

    // Include full agent details in status events
    enrichStatusEvents: true,

    // Broadcast disconnect events
    broadcastDisconnects: true,
  },

  agents: {
    // Use uppercase for status/type in responses
    uppercaseStatusType: true,

    // Cache agent details in memory
    enableCaching: true,
    cacheTtlSeconds: 60,
  }
};
```

### C. Logging & Monitoring

Add structured logging for debugging:

```typescript
// In agent-handler.ts

logger.info({
  event: 'agent_status_broadcast',
  agentId,
  status,
  enriched: {
    name: agent.name,
    type: agent.type,
    hasMetrics: !!metrics,
  },
  dashboardCount: this.messageRouter.getDashboardCount(),
}, 'Broadcasting enriched agent status');
```

Add metrics:

```typescript
// Track event emissions
metrics.increment('websocket.events.agent_status');
metrics.increment('websocket.events.agent_disconnect');
metrics.increment('websocket.events.dashboard_connected');
```

---

## References

- WebSocket Protocol: `/specs/001-build-onsembl-ai/contracts/websocket-protocol.md`
- REST API Contract: `/specs/001-build-onsembl-ai/contracts/rest-api.yaml`
- Frontend Agent Store: `/frontend/src/stores/agent-store.ts`
- Frontend WebSocket Integration: `/frontend/src/stores/agent-websocket-integration.ts`
- Backend Agent Handler: `/backend/src/websocket/agent-handler.ts`
- Backend Agent Service: `/backend/src/services/agent.service.ts`

---

**Document Owner:** Backend Team
**Review Required:** Frontend Team, QA Team
**Next Review Date:** After implementation completion
