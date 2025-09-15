# Task Reference Guide

**Purpose**: This document maps each implementation task to its relevant documentation sections, providing developers with direct references to specifications, schemas, and patterns needed for implementation.

## Quick Navigation
- [Setup Tasks](#setup-tasks-t001-t014)
- [Database Migrations](#database-migrations-t015-t026)
- [Contract Tests](#contract-tests-t027-t043)
- [WebSocket Tests](#websocket-tests-t044-t050)
- [Integration Tests](#integration-tests-t051-t059)
- [Shared Packages](#shared-packages-t060-t068)
- [Backend Models](#backend-models-t069-t077)
- [Backend Services](#backend-services-t078-t081)
- [Backend API](#backend-api-t082-t089)
- [WebSocket Implementation](#websocket-implementation-t090-t097)
- [Frontend Components](#frontend-components-t098-t106)
- [Frontend Services](#frontend-services-t107-t112)
- [Frontend Pages](#frontend-pages-t113-t118)
- [Agent Wrapper](#agent-wrapper-t119-t127)

## Setup Tasks (T001-T014)

### T001: Create monorepo structure
- Reference: `plan.md` → Project Structure section
- Create: `backend/`, `frontend/`, `agent-wrapper/`, `packages/`

### T002: Initialize root package.json
```json
{
  "workspaces": ["backend", "frontend", "agent-wrapper", "packages/*"]
}
```

### T003-T005: Initialize projects
- Reference: `plan.md` → Technical Context
- Backend: Fastify 4.x, TypeScript 5.x, Pino
- Frontend: Next.js 14, TypeScript, Tailwind, shadcn/ui
- Agent: Node.js 20+, TypeScript

### T006-T008: Create packages
- Reference: `plan.md` → Architecture section
- Each package needs: `src/`, `tests/`, `package.json`, `tsconfig.json`

### T010: ESLint and Prettier setup
- Reference: `implementation-patterns.md` → Configuration section

## Database Migrations (T015-T026)

### T015: Create Supabase project
- Reference: `quickstart.md` → Prerequisites
- Enable: Authentication, Realtime, Database

### T016-T024: Migration files
Each migration references the corresponding entity in `data-model.md`:

| Task | Entity | Data Model Section | Key Fields |
|------|--------|-------------------|------------|
| T016 | agents | Section 1 | id, name, type, status, health_metrics |
| T017 | commands | Section 2 | id, content, type, target_agents, status |
| T018 | terminal_outputs | Section 3 | id, command_id, agent_id, content, sequence |
| T019 | command_presets | Section 4 | id, name, content, variables |
| T020 | trace_entries | Section 5 | id, parent_id, type, content |
| T021 | investigation_reports | Section 6 | id, title, summary, content (JSONB) |
| T022 | audit_logs | Section 7 | id, event_type, details, created_at |
| T023 | execution_constraints | Section 8 | id, time_limit_ms, token_budget |
| T024 | command_queue | Section 9 | id, command_id, position, priority |

### T025: Redis/Upstash setup
- Reference: `research.md` → Section 2 (Bull queue patterns)
- Configuration: `research.md` → BullMQ setup code

### T026: RLS policies
- Reference: `plan.md` → "Single-tenant MVP"
- All authenticated users can access all data

## Contract Tests (T027-T043)

### REST API Contract Tests
Each test references endpoints in `rest-api.yaml`:

| Task | Endpoint | OpenAPI Path | Request/Response Schema |
|------|----------|--------------|------------------------|
| T027 | POST /auth/magic-link | Lines 15-33 | MessageResponse |
| T028 | POST /auth/verify | Lines 35-51 | AuthResponse |
| T029 | GET /agents | Lines 54-72 | Agent[] |
| T030 | GET /agents/{id} | Lines 74-87 | Agent |
| T031 | POST /agents/{id}/restart | Lines 89-102 | MessageResponse |
| T032 | POST /agents/{id}/stop | Lines 104-117 | MessageResponse |
| T033 | GET /commands | Lines 120-143 | Command[] |
| T034 | POST /commands | Lines 145-161 | CreateCommand → Command |
| T035 | GET /commands/{id} | Lines 163-176 | Command |
| T036 | POST /commands/{id}/cancel | Lines 178-195 | MessageResponse |
| T037 | GET /commands/{id}/output | Lines 197-217 | TerminalOutput[] |
| T038 | GET /commands/{id}/traces | Lines 219-236 | TraceEntry[] |
| T039 | POST /emergency-stop | Lines 239-256 | Emergency response |
| T040 | GET /presets | Lines 259-274 | CommandPreset[] |
| T041 | POST /presets | Lines 276-293 | CreateCommandPreset |
| T042 | GET /reports | Lines 361-379 | InvestigationReport[] |
| T043 | GET /audit-logs | Lines 434-460 | AuditLog[] |

## WebSocket Tests (T044-T050)

All tests reference `websocket-protocol.md`:

| Task | Test Focus | Protocol Section | Message Types |
|------|------------|-----------------|---------------|
| T044 | Agent connection | Connection Lifecycle | AGENT_CONNECT |
| T045 | Heartbeat | Agent → Server Messages | AGENT_HEARTBEAT |
| T046 | Command flow | Full message flow | COMMAND_REQUEST, COMMAND_ACK |
| T047 | Terminal streaming | Agent → Server Messages | TERMINAL_OUTPUT |
| T048 | Trace events | Agent → Server Messages | TRACE_EVENT |
| T049 | Token refresh | Server → Agent Messages | TOKEN_REFRESH |
| T050 | Reconnection | Reconnection Strategy | Connection lifecycle |

## Integration Tests (T051-T059)

All tests reference scenarios in `quickstart.md`:

| Task | Scenario | Quickstart Section | Expected Behavior |
|------|----------|-------------------|-------------------|
| T051 | Agent connection | Test 1 | Agent shows online status |
| T052 | Command execution | Test 2 | Output streams in real-time |
| T053 | Emergency stop | Test 4 | All agents halt immediately |
| T054 | Preset usage | Test 5 | Preset saves and executes |
| T055 | Trace tree | Test 6 | Hierarchical view displays |
| T056 | Queue management | Test 7 | Commands queue properly |
| T057 | Agent restart | Test 8 | Reconnects within 10 seconds |
| T058 | Investigation report | Test 9 | Report generates correctly |
| T059 | Audit logs | Test 10 | All events captured |

## Shared Packages (T060-T068)

### T060-T062: agent-protocol package
- Reference: `websocket-protocol.md` → Message Format
- Types: All message interfaces from protocol doc
- Validation: Message structure validation

### T063-T065: command-queue package
- Reference: `research.md` → Section 2 (BullMQ patterns)
- Priority logic: Higher priority = lower number
- Cancellation: Job removal patterns

### T066-T068: trace-collector package
- Reference: `data-model.md` → Section 5 (TraceEntry)
- Tree building: parent_id relationships
- Aggregation: Timeline and hierarchy

## Backend Models (T069-T077)

Each model implements the entity from `data-model.md`:

| Task | Model | Data Model Section | Key Methods |
|------|-------|-------------------|-------------|
| T069 | Agent | Section 1 | findById, updateStatus, updateMetrics |
| T070 | Command | Section 2 | create, updateStatus, getQueue |
| T071 | TerminalOutput | Section 3 | create, findByCommand, stream |
| T072 | CommandPreset | Section 4 | create, update, incrementUsage |
| T073 | TraceEntry | Section 5 | create, buildTree, findByCommand |
| T074 | InvestigationReport | Section 6 | create, update, complete |
| T075 | AuditLog | Section 7 | create, query, cleanup |
| T076 | ExecutionConstraint | Section 8 | findDefault, apply |
| T077 | CommandQueue | Section 9 | enqueue, dequeue, reorder |

## Backend Services (T078-T081)

### T078: AgentService
- Models: Agent (T069)
- Reference: `websocket-protocol.md` → Agent messages
- Supabase Realtime: `research.md` → Section 3

### T079: CommandService
- Models: Command (T070), CommandQueue (T077)
- Reference: `research.md` → Section 2 (BullMQ)
- Queue management: Priority and cancellation

### T080: AuthService
- Reference: `rest-api.yaml` → /auth endpoints
- Supabase Auth: Magic link implementation

### T081: AuditService
- Model: AuditLog (T075)
- Events: `websocket-protocol.md` → All message types
- Retention: 30-day policy from requirements

## Backend API (T082-T089)

### T082: Fastify server setup
- Reference: `research.md` → Section 1 (Fastify config)
- Plugins: @fastify/websocket, @fastify/cors, @fastify/helmet

### T083-T089: Route implementations
Each route implements endpoints from `rest-api.yaml`:

| Task | Routes | OpenAPI Paths | Authentication |
|------|--------|---------------|----------------|
| T083 | /auth/* | Lines 15-51 | None (public) |
| T084 | /agents/* | Lines 54-117 | Bearer token |
| T085 | /commands/* | Lines 120-236 | Bearer token |
| T086 | /presets/* | Lines 259-356 | Bearer token |
| T087 | /reports/* | Lines 361-417 | Bearer token |
| T088 | /system/* | Lines 239-256, 434-460 | Bearer token |
| T089 | /constraints/* | Lines 463-481 | Bearer token |

## WebSocket Implementation (T090-T097)

### T090: WebSocket setup
- Reference: `research.md` → Section 1 (Fastify WebSocket)
- Config: maxPayload: 1MB, heartbeat: 30s

### T091-T092: WebSocket handlers
- Reference: `websocket-protocol.md` → Message Types
- Agent handler: AGENT_CONNECT, AGENT_HEARTBEAT, etc.
- Dashboard handler: Real-time state updates

### T093-T094: Connection management
- Reference: `research.md` → Section 1 (Connection pooling)
- Heartbeat: 30s ping, 10s timeout, 3 missed = disconnect

### T095-T096: Message handling
- Reference: `websocket-protocol.md` → Message Format
- Routing: Type-based message dispatch
- Streaming: <200ms latency requirement

### T097: Token rotation
- Reference: `research.md` → Section 4 (JWT rotation)
- Strategy: 15-min access, 7-day refresh
- In-band refresh without disconnection

## Frontend Components (T098-T106)

All components use shadcn/ui. References:

| Task | Component | shadcn/ui Components | Data Source |
|------|-----------|---------------------|-------------|
| T098 | Layout | Sidebar, Navigation | - |
| T099 | AgentCard | Card, Badge, Progress | Agent model |
| T100 | Terminal | (xterm.js custom) | TerminalOutput |
| T101 | CommandInput | Input, Button, Select | Command model |
| T102 | TraceTree | Tree, Collapsible | TraceEntry |
| T103 | PresetManager | Dialog, Form, Input | CommandPreset |
| T104 | EmergencyStop | AlertDialog, Button | System endpoint |
| T105 | ReportViewer | ScrollArea, Tabs | InvestigationReport |
| T106 | AuditViewer | Table, DataTable | AuditLog |

## Frontend Services (T107-T112)

### T107-T109: Zustand stores
- Reference: `data-model.md` → Entity structures
- Agent store: Agent[], connection status
- Command store: Command[], queue status
- UI store: Modals, filters, selections

### T110: WebSocket client
- Reference: `websocket-protocol.md` → Dashboard messages
- Reconnection: `research.md` → Section 1

### T111: API client
- Reference: `rest-api.yaml` → All endpoints
- Base URL: Environment-based configuration

### T112: Auth service
- Reference: Supabase Auth documentation
- Magic link flow: `rest-api.yaml` → /auth endpoints

## Frontend Pages (T113-T118)

| Task | Page | Components Used | API Endpoints |
|------|------|-----------------|---------------|
| T113 | Dashboard | All components | Real-time WebSocket |
| T114 | Login | Form, Card | POST /auth/magic-link |
| T115 | Presets | DataTable | GET/POST /presets |
| T116 | Reports | Tabs, ScrollArea | GET /reports |
| T117 | Audit | DataTable | GET /audit-logs |
| T118 | Settings | Form, Switch | GET/PUT /constraints |

## Agent Wrapper (T119-T127)

### T119: CLI entry point
- Reference: `quickstart.md` → Agent connection
- Config: `agent-wrapper/config.json`

### T120-T122: Process spawning
- Reference: Each agent's CLI documentation
- Claude: claude-code command
- Gemini: gemini command
- Codex: codex command

### T123: WebSocket client
- Reference: `websocket-protocol.md` → Agent messages
- Messages: AGENT_CONNECT, AGENT_HEARTBEAT, etc.

### T124-T125: Stream handling
- Capture: stdout/stderr from spawned process
- Execute: Commands from server

### T126-T127: Configuration & Reconnection
- Config: Server URL, agent ID, type
- Reconnection: `research.md` → Section 4
- Strategy: Infinite retry for network, limited for config

## Implementation Order

Follow this sequence for optimal dependency management:

1. **Setup & Infrastructure** (T001-T026)
2. **Tests First** (T027-T059) - Must fail before implementation
3. **Shared Packages** (T060-T068) - Used by backend/frontend
4. **Backend Core** (T069-T089) - Models, services, API
5. **WebSocket Layer** (T090-T097) - Real-time communication
6. **Frontend** (T098-T118) - UI components and pages
7. **Agent Wrapper** (T119-T127) - Client-side agent
8. **Integration & Polish** (T128-T145) - Final touches

## Quick Reference Commands

```bash
# Run specific test group
npm test -- --testPathPattern="contract/auth"

# Check if test fails (RED phase)
npm test -- --testNamePattern="POST /auth/magic-link"

# Run migration
npx supabase migration up

# Start development
npm run dev:backend  # Terminal 1
npm run dev:frontend # Terminal 2
npm run agent:claude # Terminal 3
```