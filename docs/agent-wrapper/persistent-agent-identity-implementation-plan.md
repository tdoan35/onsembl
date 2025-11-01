# Persistent Agent Identity Implementation Plan

**Status**: Planning
**Priority**: High
**Feature**: Agent Identity Management
**Created**: 2025-10-31
**Last Updated**: 2025-10-31

---

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Current Behavior Analysis](#current-behavior-analysis)
4. [Root Cause](#root-cause)
5. [Proposed Solution](#proposed-solution)
6. [User Requirements](#user-requirements)
7. [Technical Implementation](#technical-implementation)
8. [Migration Strategy](#migration-strategy)
9. [Testing Approach](#testing-approach)
10. [Future Enhancements](#future-enhancements)
11. [References](#references)

---

## Overview

This document outlines the implementation plan for introducing **persistent agent identities** in the Onsembl.ai agent wrapper system. Currently, each agent restart generates a new ephemeral ID, causing database clutter and preventing agent reconnection. This plan addresses these issues by implementing stable agent identities that survive restarts.

### Goals

- ✅ Provide persistent agent identity across restarts
- ✅ Enable user-friendly agent naming
- ✅ Clean up dashboard clutter from ephemeral agents
- ✅ Maintain command history and context per agent
- ✅ Support agent deletion via dashboard
- ✅ Prepare foundation for multi-agent support

---

## Problem Statement

### Current Issues

When running `onsembl-agent start` command:

1. **New Agent ID on Every Start**: Each restart generates a new unique ID (e.g., `mock-1761949267106-ibpw1wb7v`, `mock-1761949402829-vk9fr95sz`)

2. **Database Clutter**: Every restart creates a new database record, leaving previous agents as "offline"

3. **Lost Context**: Command history, traces, and agent-specific data are not preserved across restarts

4. **Poor UX**: Dashboard fills with duplicate offline agents from previous sessions

### User Experience Impact

**Current Flow (Problematic):**
```bash
$ onsembl-agent start
# Creates: mock-1761949267106-ibpw1wb7v
# Dashboard shows: [mock-1761949267106-ibpw1wb7v: Online]

$ # User exits agent

$ onsembl-agent start
# Creates: mock-1761949402829-vk9fr95sz
# Dashboard shows:
#   [mock-1761949267106-ibpw1wb7v: Offline]  ← Clutter
#   [mock-1761949402829-vk9fr95sz: Online]
```

**Expected Flow:**
```bash
$ onsembl-agent start --name "my-laptop"
# Creates or reconnects: my-laptop (stable ID)
# Dashboard shows: [my-laptop: Online]

$ # User exits agent

$ onsembl-agent start
# Reconnects to same agent
# Dashboard shows: [my-laptop: Online]  ← Same agent, updated status
```

---

## Current Behavior Analysis

### Observed Behavior

**First Agent Start:**
```
agentId=mock-1761949267106-ibpw1wb7v
status=online
WebSocket connection established
```

**Agent Shutdown:**
```
WebSocket closed with code 1005
status=offline (persists in database)
```

**Second Agent Start:**
```
agentId=mock-1761949402829-vk9fr95sz  ← NEW ID
status=online
```

**Dashboard State:**
```
Agents List:
  - mock-1761949267106-ibpw1wb7v (Offline)  ← Previous session
  - mock-1761949402829-vk9fr95sz (Online)   ← Current session
```

### Key Logs Analysis

From user's session logs:

```json
{"msg":"Agent wrapper started successfully"}
[Connection] WebSocket connection established successfully
Mock agent ready. Type commands or press Ctrl+C to exit.

// After restart:
[Connection] WebSocket closed with code 1005:
[Reconnection] Unexpected disconnection detected
Scheduling reconnection attempt 1/10 in 1000ms

// New agent with different ID appears
```

**Conclusion**: The system treats each session as a completely new agent rather than a reconnection.

---

## Root Cause

### Code Location

**File**: `agent-wrapper/src/terminal/interactive-wrapper.ts:47`

```typescript
constructor(config: Config, options: InteractiveOptions = {}) {
  super();
  this.config = config;
  this.options = options;

  // 🔴 ROOT CAUSE: Generates new ID on every instantiation
  this.agentId = `${config.agentType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // ... rest of constructor
}
```

### Why This Happens

1. **ID Generation**: Each wrapper instantiation generates a timestamp + random string
2. **No Persistence**: ID is never saved or loaded from storage
3. **Backend Behavior**: `backend/src/websocket/agent-handler.ts:218-248` tries to find existing agent by ID, fails, creates new record
4. **No Cleanup**: Old agents remain in database with status "offline"

### Backend Agent Resolution Flow

From `backend/src/websocket/agent-handler.ts`:

```typescript
// 1. Try to fetch by UUID id first
const existing = await this.services.agentService.getAgent(agentId);

// 2. If not found, try by unique name
const byName = await this.services.agentService.getAgentByName(authContext.userId, agentId);

// 3. If still not found, create new agent
const created = await this.services.agentService.registerAgent({
  name: agentId,
  type: mappedType,
  // ...
});
```

**Current Flow**: Always hits case #3 (create new) because agentId changes every restart.

---

## Proposed Solution

### Architecture: Persistent Agent Identity (Option 1)

Implement **stable agent identities** that survive restarts using local configuration storage.

### High-Level Approach

1. **Config Storage**: Store agent identity in `~/.onsembl/agent-config.json`
2. **ID Lifecycle**:
   - First run: Generate stable ID and persist to config
   - Subsequent runs: Load existing ID from config
   - Reconnection: Backend updates status `offline` → `online` instead of creating new record
3. **User Control**: Allow users to name their agents via CLI flags
4. **Dashboard Cleanup**: Add "Delete Agent" button for removing unwanted agents

### Key Components

```
┌─────────────────────────────────────────────────────────┐
│                 Agent Wrapper (CLI)                      │
├─────────────────────────────────────────────────────────┤
│  1. AgentConfigManager                                   │
│     - Load/save ~/.onsembl/agent-config.json            │
│     - Generate stable ID on first run                    │
│     - Manage agent name and metadata                     │
│                                                          │
│  2. InteractiveAgentWrapper (Modified)                   │
│     - getOrCreateAgentId() instead of inline generation  │
│     - Use persistent ID from config                      │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              Backend (Fastify WebSocket)                 │
├─────────────────────────────────────────────────────────┤
│  1. AgentHandler (Modified)                             │
│     - On AGENT_CONNECT with existing ID:                │
│       → Update status offline → online                   │
│       → Update last_seen timestamp                       │
│       → Preserve command history/traces                  │
│                                                          │
│  2. AgentService (Enhanced)                             │
│     - reconnectAgent(agentId, userId)                   │
│     - deleteAgent(agentId, userId)                      │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│               Frontend (Dashboard)                       │
├─────────────────────────────────────────────────────────┤
│  1. Agent List (Enhanced)                               │
│     - Show friendly names instead of UUIDs              │
│     - "Delete Agent" button for offline agents          │
│     - Confirmation dialog before deletion               │
│                                                          │
│  2. Real-time Updates                                   │
│     - Status changes: offline → online on reconnect     │
│     - Agent list updates on delete                      │
└─────────────────────────────────────────────────────────┘
```

---

## User Requirements

Based on conversation and user decisions:

### 1. Persistent Agent Identity (Option 1)
**Decision**: Implement persistent identities across restarts
- Agent IDs should be stable and survive CLI restarts
- Same agent reconnects and updates status (offline → online)
- Command history and context preserved

### 2. User-Friendly Agent Naming
**Decision**: Users should be able to name their agents
- Support friendly names like "my-laptop" instead of "mock-1761949267106-ibpw1wb7v"
- Names should be optional (fallback to auto-generated ID)
- Names should be changeable post-creation

### 3. Agent Deletion
**Decision**: Implement "Delete Agent" button in dashboard
- Users should be able to remove unwanted/abandoned agents
- Deletion should remove agent record and all associated data
- Confirmation dialog required (destructive action)

### 4. Multi-Agent Support (Future)
**Decision**: Allow multiple agent instances per machine
- User should be able to run multiple agents simultaneously
- Each agent should have its own config/identity
- Implementation deferred to future enhancement phase

---

## Technical Implementation

### Phase 1: Agent Config Storage

#### 1.1 Config File Structure

**Location**: `~/.onsembl/agent-config.json`

```json
{
  "version": "1.0.0",
  "defaultAgent": "agent-abc123def",
  "agents": {
    "agent-abc123def": {
      "id": "agent-abc123def",
      "name": "my-laptop",
      "type": "mock",
      "createdAt": "2025-10-31T12:00:00Z",
      "lastUsed": "2025-10-31T15:30:00Z",
      "metadata": {
        "hostMachine": "TY-DESKTOP",
        "platform": "win32"
      }
    }
  }
}
```

#### 1.2 New File: `agent-wrapper/src/config/agent-config-manager.ts`

```typescript
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface AgentConfig {
  id: string;
  name?: string;
  type: string;
  createdAt: string;
  lastUsed: string;
  metadata: {
    hostMachine: string;
    platform: string;
  };
}

export interface AgentConfigFile {
  version: string;
  defaultAgent: string | null;
  agents: Record<string, AgentConfig>;
}

export class AgentConfigManager {
  private configDir: string;
  private configPath: string;

  constructor() {
    this.configDir = path.join(os.homedir(), '.onsembl');
    this.configPath = path.join(this.configDir, 'agent-config.json');
  }

  /**
   * Get or create a stable agent ID
   */
  async getOrCreateAgentId(
    agentType: string,
    options?: { name?: string; agentId?: string }
  ): Promise<{ id: string; name?: string; isNew: boolean }> {
    await this.ensureConfigDir();
    const config = await this.loadConfig();

    // If specific agentId provided, use it
    if (options?.agentId && config.agents[options.agentId]) {
      return {
        id: options.agentId,
        name: config.agents[options.agentId].name,
        isNew: false
      };
    }

    // Use default agent if exists
    if (config.defaultAgent && config.agents[config.defaultAgent]) {
      const agent = config.agents[config.defaultAgent];
      agent.lastUsed = new Date().toISOString();
      await this.saveConfig(config);

      return {
        id: agent.id,
        name: agent.name,
        isNew: false
      };
    }

    // Create new agent
    const newAgentId = this.generateStableId(agentType);
    const newAgent: AgentConfig = {
      id: newAgentId,
      name: options?.name,
      type: agentType,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      metadata: {
        hostMachine: os.hostname(),
        platform: os.platform()
      }
    };

    config.agents[newAgentId] = newAgent;
    config.defaultAgent = newAgentId;
    await this.saveConfig(config);

    return {
      id: newAgentId,
      name: options?.name,
      isNew: true
    };
  }

  /**
   * Update agent name
   */
  async updateAgentName(agentId: string, name: string): Promise<void> {
    const config = await this.loadConfig();

    if (!config.agents[agentId]) {
      throw new Error(`Agent ${agentId} not found in config`);
    }

    config.agents[agentId].name = name;
    await this.saveConfig(config);
  }

  /**
   * List all configured agents
   */
  async listAgents(): Promise<AgentConfig[]> {
    const config = await this.loadConfig();
    return Object.values(config.agents);
  }

  /**
   * Delete agent from config
   */
  async deleteAgent(agentId: string): Promise<void> {
    const config = await this.loadConfig();

    delete config.agents[agentId];

    if (config.defaultAgent === agentId) {
      const remainingAgents = Object.keys(config.agents);
      config.defaultAgent = remainingAgents.length > 0 ? remainingAgents[0] : null;
    }

    await this.saveConfig(config);
  }

  /**
   * Generate a stable agent ID
   */
  private generateStableId(agentType: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 11);
    return `${agentType}-${timestamp}-${random}`;
  }

  private async ensureConfigDir(): Promise<void> {
    try {
      await fs.access(this.configDir);
    } catch {
      await fs.mkdir(this.configDir, { recursive: true });
    }
  }

  private async loadConfig(): Promise<AgentConfigFile> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {
        version: '1.0.0',
        defaultAgent: null,
        agents: {}
      };
    }
  }

  private async saveConfig(config: AgentConfigFile): Promise<void> {
    await fs.writeFile(
      this.configPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );
  }
}
```

#### 1.3 Modified: `agent-wrapper/src/terminal/interactive-wrapper.ts`

**Before:**
```typescript
constructor(config: Config, options: InteractiveOptions = {}) {
  super();
  this.config = config;
  this.options = options;
  this.agentId = `${config.agentType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  // ...
}
```

**After:**
```typescript
import { AgentConfigManager } from '../config/agent-config-manager.js';

export class InteractiveAgentWrapper extends EventEmitter {
  private agentConfigManager: AgentConfigManager;

  constructor(config: Config, options: InteractiveOptions = {}) {
    super();
    this.config = config;
    this.options = options;
    this.agentConfigManager = new AgentConfigManager();
    // agentId will be set in start() after async config load
    this.agentId = '';
    // ...
  }

  async start(): Promise<void> {
    // Load or create agent identity
    const { id, name, isNew } = await this.agentConfigManager.getOrCreateAgentId(
      this.config.agentType,
      {
        name: this.options.agentName,
        agentId: this.options.agentId
      }
    );

    this.agentId = id;

    if (isNew) {
      this.logger.info(`Created new agent identity: ${id}${name ? ` (${name})` : ''}`);
    } else {
      this.logger.info(`Reconnecting as agent: ${id}${name ? ` (${name})` : ''}`);
    }

    // ... rest of start() implementation
  }
}
```

#### 1.4 CLI Options Enhancement

**File**: `agent-wrapper/src/cli.ts`

```typescript
program
  .command('start')
  .description('Start the agent wrapper')
  .option('--name <name>', 'Set a friendly name for this agent')
  .option('--agent-id <id>', 'Use a specific agent ID (for multi-agent setups)')
  .option('--interactive', 'Force interactive mode')
  .option('--headless', 'Force headless mode')
  .action(async (options) => {
    // ... existing code ...

    const wrapper = new InteractiveAgentWrapper(config, {
      interactive: options.interactive,
      headless: options.headless,
      agentName: options.name,
      agentId: options.agentId
    });

    await wrapper.start();
  });

program
  .command('whoami')
  .description('Show current agent identity')
  .action(async () => {
    const configManager = new AgentConfigManager();
    const agents = await configManager.listAgents();

    console.log('\nConfigured Agents:');
    agents.forEach((agent) => {
      const isDefault = ''; // TODO: check if default
      console.log(`  ${isDefault}${agent.name || agent.id}`);
      console.log(`    ID: ${agent.id}`);
      console.log(`    Type: ${agent.type}`);
      console.log(`    Created: ${agent.createdAt}`);
      console.log(`    Last Used: ${agent.lastUsed}`);
      console.log('');
    });
  });

program
  .command('rename')
  .description('Rename the current agent')
  .argument('<name>', 'New name for the agent')
  .action(async (name) => {
    const configManager = new AgentConfigManager();
    const { id } = await configManager.getOrCreateAgentId('mock');
    await configManager.updateAgentName(id, name);
    console.log(`✓ Renamed agent to: ${name}`);
  });
```

### Phase 2: Backend Reconnection Logic

#### 2.1 Modified: `backend/src/websocket/agent-handler.ts`

```typescript
private async handleAgentConnect(
  connection: AgentConnection,
  message: TypedWebSocketMessage<MessageType.AGENT_CONNECT>
): Promise<void> {
  const { agentId, agentType, version, hostMachine, capabilities } = message.payload;

  try {
    // ... existing auth code ...

    // Resolve or create agent in database
    let resolvedAgentId: string | null = null;
    let isReconnection = false;

    try {
      // Try to fetch by UUID id first
      const existing = await this.services.agentService.getAgent(agentId);
      resolvedAgentId = existing.id;
      isReconnection = true;

      this.server.log.info({
        agentId: resolvedAgentId,
        previousStatus: existing.status
      }, 'Agent reconnection detected');

    } catch {
      // Not found by UUID, try by unique name
      try {
        const byName = await this.services.agentService.getAgentByName(
          authContext.userId,
          agentId
        );
        resolvedAgentId = byName.id;
        isReconnection = true;

      } catch {
        // Create new agent
        isReconnection = false;
        // ... existing creation code ...
      }
    }

    // Update agent status based on reconnection
    if (isReconnection) {
      await this.services.agentService.updateAgent(resolvedAgentId, {
        status: 'online',
        last_seen: new Date(),
        version,
        host_machine: hostMachine
      });
    }

    // ... rest of handler ...
  }
}
```

#### 2.2 Enhanced: `backend/src/services/agent.service.ts`

```typescript
/**
 * Update agent properties
 */
async updateAgent(
  agentId: string,
  updates: {
    name?: string;
    status?: AgentStatus;
    last_seen?: Date;
    version?: string;
    host_machine?: string;
  }
): Promise<Agent> {
  const { data, error } = await this.db
    .from('agents')
    .update({
      name: updates.name,
      status: updates.status,
      last_seen: updates.last_seen?.toISOString(),
      version: updates.version,
      host_machine: updates.host_machine,
      updated_at: new Date().toISOString()
    })
    .eq('id', agentId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete agent and associated data
 */
async deleteAgent(agentId: string, userId: string): Promise<void> {
  // Verify ownership
  const agent = await this.getAgent(agentId);
  if (agent.user_id !== userId) {
    throw new Error('Unauthorized: Cannot delete agent owned by another user');
  }

  // Delete agent (cascades to associated records via DB constraints)
  const { error } = await this.db
    .from('agents')
    .delete()
    .eq('id', agentId)
    .eq('user_id', userId);

  if (error) throw error;

  this.server.log.info({ agentId, userId }, 'Agent deleted successfully');
}
```

#### 2.3 New API Endpoint: `DELETE /api/agents/:id`

**File**: `backend/src/api/agents.ts`

```typescript
// DELETE /api/agents/:id - Delete an agent
server.delete<{ Params: { id: string } }>(
  '/agents/:id',
  {
    preHandler: [server.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' }
        }
      },
      response: {
        204: { type: 'null' },
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  },
  async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.userId;

    try {
      await services.agentService.deleteAgent(id, userId);
      return reply.code(204).send();
    } catch (error) {
      if (error.message.includes('not found')) {
        return reply.code(404).send({ error: 'Agent not found' });
      }
      if (error.message.includes('Unauthorized')) {
        return reply.code(403).send({ error: error.message });
      }
      throw error;
    }
  }
);
```

### Phase 3: Frontend Dashboard Enhancements

#### 3.1 Modified: `frontend/src/components/agents/agent-card.tsx`

```typescript
import { Trash2 } from 'lucide-react';

export function AgentCard({ agent }: { agent: Agent }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await agentApiService.deleteAgent(agent.id);
      toast.success(`Agent "${agent.name}" deleted successfully`);
    } catch (error) {
      toast.error('Failed to delete agent');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{agent.name || agent.id}</CardTitle>
            {agent.name && (
              <p className="text-sm text-muted-foreground">{agent.id}</p>
            )}
          </div>

          {agent.status === 'offline' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      {/* ... rest of card ... */}

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{agent.name || agent.id}" and all
              associated command history, traces, and logs. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive"
            >
              {isDeleting ? 'Deleting...' : 'Delete Agent'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
```

#### 3.2 New Service Method: `frontend/src/services/agent-api.service.ts`

```typescript
class AgentApiService {
  // ... existing methods ...

  /**
   * Delete an agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/agents/${agentId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${await this.getToken()}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete agent');
    }
  }
}
```

---

## Migration Strategy

### Phase 1: Backward Compatibility (v1.0.0)

1. **Default Behavior**: On first run after upgrade, create persistent ID and save to config
2. **No Breaking Changes**: Existing CLI workflows continue to work
3. **Opt-in Naming**: Users can optionally use `--name` flag

### Phase 2: Database Migration (Backend)

**Migration Script**: `backend/migrations/007_add_agent_name_index.sql`

```sql
-- Add index on agent name for faster lookups
CREATE INDEX IF NOT EXISTS idx_agents_user_name
ON agents(user_id, name)
WHERE name IS NOT NULL;

-- Add unique constraint on (user_id, name) to prevent duplicates
ALTER TABLE agents
ADD CONSTRAINT unique_user_agent_name
UNIQUE (user_id, name);
```

### Phase 3: Cleanup Old Agents

**Strategy**: Provide tools for users to clean up old ephemeral agents

1. **CLI Command**: `onsembl-agent cleanup --before "2025-10-31"`
2. **Dashboard**: Bulk delete button for offline agents
3. **Automated**: Optional flag to auto-delete offline agents > 30 days old

---

## Testing Approach

### Unit Tests

#### Test: `agent-wrapper/tests/config/agent-config-manager.test.ts`

```typescript
describe('AgentConfigManager', () => {
  it('should generate stable ID on first run', async () => {
    const manager = new AgentConfigManager();
    const { id, isNew } = await manager.getOrCreateAgentId('mock');

    expect(isNew).toBe(true);
    expect(id).toMatch(/^mock-[a-z0-9]+-[a-z0-9]+$/);
  });

  it('should reuse existing ID on subsequent runs', async () => {
    const manager = new AgentConfigManager();

    const first = await manager.getOrCreateAgentId('mock');
    const second = await manager.getOrCreateAgentId('mock');

    expect(first.id).toBe(second.id);
    expect(second.isNew).toBe(false);
  });

  it('should support custom agent names', async () => {
    const manager = new AgentConfigManager();
    const { id, name } = await manager.getOrCreateAgentId('mock', {
      name: 'my-laptop'
    });

    expect(name).toBe('my-laptop');
  });

  it('should update agent name', async () => {
    const manager = new AgentConfigManager();
    const { id } = await manager.getOrCreateAgentId('mock');

    await manager.updateAgentName(id, 'new-name');

    const agents = await manager.listAgents();
    expect(agents[0].name).toBe('new-name');
  });
});
```

### Integration Tests

#### Test: `backend/tests/integration/agent-reconnection.test.ts`

```typescript
describe('Agent Reconnection', () => {
  it('should update status on reconnection', async () => {
    // 1. Agent connects first time
    const agent1 = await connectAgent('stable-agent-id');
    expect(agent1.status).toBe('online');

    // 2. Agent disconnects
    await disconnectAgent('stable-agent-id');
    const offline = await getAgent('stable-agent-id');
    expect(offline.status).toBe('offline');

    // 3. Agent reconnects with same ID
    const agent2 = await connectAgent('stable-agent-id');
    expect(agent2.id).toBe(agent1.id); // Same agent
    expect(agent2.status).toBe('online');
  });

  it('should preserve command history on reconnection', async () => {
    const agentId = 'stable-agent-id';

    // Execute commands in first session
    await executeCommand(agentId, 'npm test');
    await disconnectAgent(agentId);

    // Reconnect
    await connectAgent(agentId);

    // Verify history preserved
    const commands = await getAgentCommands(agentId);
    expect(commands).toHaveLength(1);
    expect(commands[0].command).toBe('npm test');
  });
});
```

### E2E Tests

#### Test: `tests/e2e/persistent-agent-identity.spec.ts`

```typescript
test('agent reconnection flow', async ({ page }) => {
  // Start agent via CLI
  const agentProcess = spawn('onsembl-agent', ['start', '--name', 'test-agent']);

  // Wait for agent to appear in dashboard
  await page.goto('/agents');
  await expect(page.locator('text=test-agent')).toBeVisible();
  await expect(page.locator('[data-status="online"]')).toBeVisible();

  // Stop agent
  agentProcess.kill();

  // Verify agent shows offline
  await expect(page.locator('[data-status="offline"]')).toBeVisible();

  // Restart agent (same command)
  const agentProcess2 = spawn('onsembl-agent', ['start']);

  // Verify same agent, now online
  await expect(page.locator('text=test-agent')).toBeVisible();
  await expect(page.locator('[data-status="online"]')).toBeVisible();

  // Verify only ONE agent in list
  const agentCards = page.locator('[data-testid="agent-card"]');
  await expect(agentCards).toHaveCount(1);
});

test('delete agent', async ({ page }) => {
  await page.goto('/agents');

  // Find offline agent
  const deleteButton = page.locator('[data-testid="delete-agent-btn"]').first();
  await deleteButton.click();

  // Confirm deletion
  await page.locator('text=Delete Agent').click();

  // Verify agent removed
  await expect(page.locator('text=Agent deleted successfully')).toBeVisible();
});
```

---

## Future Enhancements

### Multi-Agent Support (v2.0.0)

Enable users to run multiple agents on the same machine:

```bash
# Start multiple agents with different names
onsembl-agent start --name "project-a-agent"
onsembl-agent start --name "project-b-agent"

# List all configured agents
onsembl-agent list

# Switch default agent
onsembl-agent use "project-a-agent"
```

**Implementation Considerations:**
- Config file already supports multiple agents (agents map)
- Need to track which agent is "active" per terminal session
- Backend already supports multiple agent connections
- Dashboard needs filtering/grouping by agent

### Agent Profiles

Allow users to save different configurations per agent:

```json
{
  "agents": {
    "agent-abc": {
      "id": "agent-abc",
      "name": "work-laptop",
      "profile": {
        "autoStart": true,
        "defaultCommands": ["npm test", "npm run build"],
        "environment": {
          "NODE_ENV": "development"
        }
      }
    }
  }
}
```

### Agent Groups/Tags

Organize agents by projects or environments:

```bash
onsembl-agent start --name "backend-dev" --tags "project-x,development"
onsembl-agent start --name "frontend-dev" --tags "project-x,development"

# Dashboard: Filter by tag
```

### Agent Import/Export

Share agent configurations across machines:

```bash
onsembl-agent export my-laptop > agent-config.json
onsembl-agent import < agent-config.json
```

---

## References

### Related Files

**Agent Wrapper:**
- `agent-wrapper/src/terminal/interactive-wrapper.ts` - Main wrapper implementation
- `agent-wrapper/src/cli.ts` - CLI command definitions
- `agent-wrapper/src/config.ts` - Configuration management

**Backend:**
- `backend/src/websocket/agent-handler.ts` - WebSocket agent connection handling
- `backend/src/services/agent.service.ts` - Agent business logic
- `backend/src/api/agents.ts` - REST API endpoints

**Frontend:**
- `frontend/src/components/agents/agent-card.tsx` - Agent display component
- `frontend/src/services/agent-api.service.ts` - API client
- `frontend/src/stores/agent-websocket-integration.ts` - Real-time state

### Documentation

- [Agent Connection Flow](../agent-connection-flow.md)
- [WebSocket API](../websocket-api.md)
- [Authentication Architecture](../AUTHENTICATION_ARCHITECTURE_ANALYSIS.md)

### Design Decisions

**Why Config File vs Database?**
- Config file is local-first, works offline
- Faster startup (no network round-trip)
- User owns their data
- Simpler implementation for MVP

**Why ~/.onsembl vs ~/.config/onsembl?**
- Cross-platform consistency (Windows doesn't have ~/.config)
- Matches industry conventions (e.g., ~/.aws, ~/.ssh)

**Why Not Environment Variables?**
- Need to persist multiple agents
- More complex data structure (nested JSON)
- User-friendly editing (can manually edit JSON file)

---

## Implementation Checklist

- [ ] **Phase 1: Config Storage**
  - [ ] Create `AgentConfigManager` class
  - [ ] Add config directory creation logic
  - [ ] Implement ID generation and persistence
  - [ ] Add CLI commands: `whoami`, `rename`
  - [ ] Modify `InteractiveAgentWrapper` to use persistent IDs
  - [ ] Add `--name` flag to `start` command
  - [ ] Write unit tests for config manager

- [ ] **Phase 2: Backend Reconnection**
  - [ ] Modify `handleAgentConnect` to detect reconnections
  - [ ] Add `updateAgent` method to `AgentService`
  - [ ] Add `deleteAgent` method to `AgentService`
  - [ ] Create `DELETE /api/agents/:id` endpoint
  - [ ] Add database migration for name index
  - [ ] Write integration tests for reconnection flow

- [ ] **Phase 3: Frontend Dashboard**
  - [ ] Add delete button to `AgentCard` component
  - [ ] Implement delete confirmation dialog
  - [ ] Add `deleteAgent` method to API service
  - [ ] Update agent list to show friendly names
  - [ ] Add real-time updates on reconnection
  - [ ] Write E2E tests for agent deletion

- [ ] **Phase 4: Testing & Documentation**
  - [ ] Run full test suite
  - [ ] Manual testing on Windows/Mac/Linux
  - [ ] Update CLI help text
  - [ ] Write migration guide for existing users
  - [ ] Update API documentation

- [ ] **Phase 5: Deployment**
  - [ ] Version bump to v1.0.0
  - [ ] Create release notes
  - [ ] Deploy backend changes
  - [ ] Publish new CLI version to npm
  - [ ] Announce feature to users

---

## Conclusion

This implementation plan provides a comprehensive roadmap for adding persistent agent identities to the Onsembl.ai agent wrapper system. The solution addresses current pain points (database clutter, lost context) while laying the groundwork for future enhancements (multi-agent support, agent profiles).

The phased approach ensures backward compatibility while providing immediate value to users through cleaner dashboards and preserved agent context across restarts.

**Key Success Metrics:**
- ✅ Zero new ephemeral agents created on restart
- ✅ Agent status updates (offline → online) on reconnection
- ✅ Users can delete unwanted agents from dashboard
- ✅ Command history preserved across sessions
- ✅ Friendly agent names in UI instead of UUIDs

**Next Steps:**
1. Review and approve this implementation plan
2. Break down into sprint tasks
3. Begin Phase 1 development
4. Iterate based on user feedback
