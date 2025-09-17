# Tasks: Onsembl.ai Agent Control Center

**Input**: Design documents from `/specs/001-build-onsembl-ai/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → If not found: ERROR "No implementation plan found"
   → Extract: tech stack, libraries, structure
2. Load optional design documents:
   → data-model.md: Extract entities → model tasks
   → contracts/: Each file → contract test task
   → research.md: Extract decisions → setup tasks
3. Generate tasks by category:
   → Setup: project init, dependencies, linting
   → Tests: contract tests, integration tests
   → Core: models, services, CLI commands
   → Integration: DB, middleware, logging
   → Polish: unit tests, performance, docs
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → All contracts have tests?
   → All entities have models?
   → All endpoints implemented?
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Backend**: `backend/src/`, `backend/tests/`
- **Frontend**: `frontend/src/`, `frontend/tests/`
- **Agent**: `agent-wrapper/src/`, `agent-wrapper/tests/`
- **Packages**: `packages/{name}/src/`, `packages/{name}/tests/`

## Phase 3.1: Setup
- [x] T001 Create monorepo structure with backend/, frontend/, agent-wrapper/, packages/ directories
- [x] T002 Initialize root package.json with npm workspaces configuration
- [x] T003 [P] Initialize backend with Fastify, TypeScript, and dependencies in backend/
- [x] T004 [P] Initialize frontend with Next.js 14, TypeScript, Tailwind, shadcn/ui in frontend/
- [x] T005 [P] Initialize agent-wrapper with Node.js and TypeScript in agent-wrapper/
- [x] T006 [P] Create @onsembl/agent-protocol package in packages/agent-protocol/
- [x] T007 [P] Create @onsembl/command-queue package in packages/command-queue/
- [x] T008 [P] Create @onsembl/trace-collector package in packages/trace-collector/
- [x] T009 Configure TypeScript with shared tsconfig in root and project-specific configs
- [x] T010 [P] Setup ESLint and Prettier with consistent rules across all projects
- [x] T011 [P] Create .env.example with all required environment variables
- [x] T012 Setup Jest testing framework for backend and packages
- [x] T013 [P] Setup React Testing Library for frontend
- [x] T014 [P] Setup Playwright for E2E tests

## Phase 3.2: Database & Infrastructure Setup
- [x] T015 Create Supabase project and configure authentication
- [x] T016 Write database migration for agents table in supabase/migrations/001_agents.sql
- [x] T017 [P] Write database migration for commands table in supabase/migrations/002_commands.sql
- [x] T018 [P] Write database migration for terminal_outputs table in supabase/migrations/003_terminal_outputs.sql
- [x] T019 [P] Write database migration for command_presets table in supabase/migrations/004_command_presets.sql
- [x] T020 [P] Write database migration for trace_entries table in supabase/migrations/005_trace_entries.sql
- [x] T021 [P] Write database migration for investigation_reports table in supabase/migrations/006_investigation_reports.sql
- [x] T022 [P] Write database migration for audit_logs table in supabase/migrations/007_audit_logs.sql
- [x] T023 [P] Write database migration for execution_constraints table in supabase/migrations/008_execution_constraints.sql
- [x] T024 [P] Write database migration for command_queue table in supabase/migrations/009_command_queue.sql
- [x] T025 Setup Redis/Upstash connection for BullMQ queues
- [x] T026 Configure RLS policies for single-tenant access in Supabase

## Phase 3.3: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.4
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Contract Tests - REST API
- [x] T027 [P] Contract test POST /auth/magic-link in backend/tests/contract/auth/magic-link.test.ts
      → Ref: rest-api.yaml lines 15-33, implementation-patterns.md "Contract Test Pattern"
- [x] T028 [P] Contract test POST /auth/verify in backend/tests/contract/auth/verify.test.ts
      → Ref: rest-api.yaml lines 35-51, schema: AuthResponse
- [x] T029 [P] Contract test GET /agents in backend/tests/contract/agents/list.test.ts
      → Ref: rest-api.yaml lines 54-72, response: Agent[]
- [x] T030 [P] Contract test GET /agents/{id} in backend/tests/contract/agents/get.test.ts
      → Ref: rest-api.yaml lines 74-87, response: Agent
- [x] T031 [P] Contract test POST /agents/{id}/restart in backend/tests/contract/agents/restart.test.ts
      → Ref: rest-api.yaml lines 89-102, response: MessageResponse
- [x] T032 [P] Contract test POST /agents/{id}/stop in backend/tests/contract/agents/stop.test.ts
      → Ref: rest-api.yaml lines 104-117, response: MessageResponse
- [x] T033 [P] Contract test GET /commands in backend/tests/contract/commands/list.test.ts
      → Ref: rest-api.yaml lines 120-143, query params: status, agentId, limit, offset
- [x] T034 [P] Contract test POST /commands in backend/tests/contract/commands/create.test.ts
      → Ref: rest-api.yaml lines 145-161, request: CreateCommand, response: Command
- [x] T035 [P] Contract test GET /commands/{id} in backend/tests/contract/commands/get.test.ts
      → Ref: rest-api.yaml lines 163-176, response: Command
- [x] T036 [P] Contract test POST /commands/{id}/cancel in backend/tests/contract/commands/cancel.test.ts
      → Ref: rest-api.yaml lines 178-195, optional body: reason
- [x] T037 [P] Contract test GET /commands/{id}/output in backend/tests/contract/commands/output.test.ts
      → Ref: rest-api.yaml lines 197-217, response: TerminalOutput[]
- [x] T038 [P] Contract test GET /commands/{id}/traces in backend/tests/contract/commands/traces.test.ts
      → Ref: rest-api.yaml lines 219-236, response: TraceEntry[]
- [x] T039 [P] Contract test POST /emergency-stop in backend/tests/contract/system/emergency-stop.test.ts
      → Ref: rest-api.yaml lines 239-256, response: agentsStopped count
- [x] T040 [P] Contract test GET /presets in backend/tests/contract/presets/list.test.ts
      → Ref: rest-api.yaml lines 259-274, response: CommandPreset[]
- [x] T041 [P] Contract test POST /presets in backend/tests/contract/presets/create.test.ts
      → Ref: rest-api.yaml lines 276-293, request: CreateCommandPreset
- [x] T042 [P] Contract test GET /reports in backend/tests/contract/reports/list.test.ts
      → Ref: rest-api.yaml lines 361-379, query: agentId, status
- [x] T043 [P] Contract test GET /audit-logs in backend/tests/contract/system/audit-logs.test.ts
      → Ref: rest-api.yaml lines 434-460, query: eventType, userId, from, to

### WebSocket Protocol Tests
- [x] T044 [P] WebSocket test agent connection flow in backend/tests/websocket/agent-connect.test.ts
      → Ref: websocket-protocol.md "Connection Lifecycle", message: AGENT_CONNECT
      → Pattern: implementation-patterns.md "WebSocket Test Pattern"
- [x] T045 [P] WebSocket test agent heartbeat in backend/tests/websocket/agent-heartbeat.test.ts
      → Ref: websocket-protocol.md lines 56-73, message: AGENT_HEARTBEAT
      → Timing: 30-second intervals, 3 missed = disconnect
- [x] T046 [P] WebSocket test command execution flow in backend/tests/websocket/command-flow.test.ts
      → Ref: websocket-protocol.md COMMAND_REQUEST → COMMAND_ACK → COMMAND_COMPLETE
- [x] T047 [P] WebSocket test terminal streaming in backend/tests/websocket/terminal-stream.test.ts
      → Ref: websocket-protocol.md lines 89-104, message: TERMINAL_OUTPUT
      → Requirement: <200ms latency
- [x] T048 [P] WebSocket test trace events in backend/tests/websocket/trace-events.test.ts
      → Ref: websocket-protocol.md lines 106-131, message: TRACE_EVENT
- [x] T049 [P] WebSocket test token refresh in backend/tests/websocket/token-refresh.test.ts
      → Ref: websocket-protocol.md "Token Refresh", research.md Section 4
- [x] T050 [P] WebSocket test reconnection logic in backend/tests/websocket/reconnection.test.ts
      → Ref: websocket-protocol.md "Reconnection Strategy", exponential backoff

### Integration Tests (from Quickstart scenarios)
- [x] T051 [P] Integration test agent connection and status display in backend/tests/integration/agent-connection.test.ts
      → Ref: quickstart.md Test 1, Expected: Agent shows "ONLINE" status
- [x] T052 [P] Integration test command execution with output in backend/tests/integration/command-execution.test.ts
      → Ref: quickstart.md Test 2, Expected: Terminal shows real-time output
- [x] T053 [P] Integration test emergency stop functionality in backend/tests/integration/emergency-stop.test.ts
      → Ref: quickstart.md Test 4, Expected: All agents stop immediately
- [x] T054 [P] Integration test command preset creation and usage in backend/tests/integration/presets.test.ts
      → Ref: quickstart.md Test 5, Expected: Preset saves and executes
- [x] T055 [P] Integration test trace tree generation in backend/tests/integration/trace-tree.test.ts
      → Ref: quickstart.md Test 6, Expected: Hierarchical view of LLM calls
- [x] T056 [P] Integration test queue management and cancellation in backend/tests/integration/queue.test.ts
      → Ref: quickstart.md Test 7, Expected: Queue position shown, cancellation works
- [x] T057 [P] Integration test agent restart flow in backend/tests/integration/agent-restart.test.ts
      → Ref: quickstart.md Test 8, Expected: Reconnects within 10 seconds
- [x] T058 [P] Integration test investigation report generation in backend/tests/integration/reports.test.ts
      → Ref: quickstart.md Test 9, Expected: Structured report with findings
- [x] T059 [P] Integration test audit log capture in backend/tests/integration/audit-logs.test.ts
      → Ref: quickstart.md Test 10, Expected: Complete audit trail

## Phase 3.4: Core Implementation (ONLY after tests are failing)

### Shared Packages Implementation
- [x] T060 [P] Implement WebSocket message types in packages/agent-protocol/src/types.ts
- [x] T061 [P] Implement message validation in packages/agent-protocol/src/validation.ts
- [x] T062 [P] Implement agent-protocol CLI in packages/agent-protocol/src/cli.ts
- [x] T063 [P] Implement BullMQ queue wrapper in packages/command-queue/src/queue.ts
- [x] T064 [P] Implement command priority logic in packages/command-queue/src/priority.ts
- [x] T065 [P] Implement command-queue CLI in packages/command-queue/src/cli.ts
- [x] T066 [P] Implement trace tree builder in packages/trace-collector/src/builder.ts
- [x] T067 [P] Implement trace aggregation in packages/trace-collector/src/aggregator.ts
- [x] T068 [P] Implement trace-collector CLI in packages/trace-collector/src/cli.ts

### Backend Models & Services
- [x] T069 [P] Agent model with Supabase client in backend/src/models/agent.ts
- [x] T070 [P] Command model in backend/src/models/command.ts
- [x] T071 [P] TerminalOutput model in backend/src/models/terminal-output.ts
- [x] T072 [P] CommandPreset model in backend/src/models/command-preset.ts
- [x] T073 [P] TraceEntry model in backend/src/models/trace-entry.ts
- [x] T074 [P] InvestigationReport model in backend/src/models/investigation-report.ts
- [x] T075 [P] AuditLog model in backend/src/models/audit-log.ts
- [x] T076 [P] ExecutionConstraint model in backend/src/models/execution-constraint.ts
- [x] T077 [P] CommandQueue model in backend/src/models/command-queue.ts
- [x] T078 [P] AgentService with CRUD operations in backend/src/services/agent.service.ts
- [x] T079 [P] CommandService with queue management in backend/src/services/command.service.ts
- [x] T080 [P] AuthService with Supabase magic links in backend/src/services/auth.service.ts
- [x] T081 [P] AuditService for logging events in backend/src/services/audit.service.ts

### Backend API Implementation
- [x] T082 Setup Fastify server with plugins in backend/src/server.ts
- [x] T083 Implement auth routes in backend/src/api/auth.ts
- [x] T084 Implement agent routes in backend/src/api/agents.ts
- [x] T085 Implement command routes in backend/src/api/commands.ts
- [x] T086 Implement preset routes in backend/src/api/presets.ts
- [x] T087 Implement report routes in backend/src/api/reports.ts
- [x] T088 Implement system routes (emergency-stop, audit) in backend/src/api/system.ts
- [x] T089 Implement constraint routes in backend/src/api/constraints.ts

### WebSocket Implementation
- [x] T090 Setup @fastify/websocket plugin in backend/src/websocket/setup.ts
- [x] T091 Implement agent WebSocket handler in backend/src/websocket/agent-handler.ts
- [x] T092 Implement dashboard WebSocket handler in backend/src/websocket/dashboard-handler.ts
- [x] T093 Implement connection pooling in backend/src/websocket/connection-pool.ts
- [x] T094 Implement heartbeat management in backend/src/websocket/heartbeat.ts
- [x] T095 Implement message routing in backend/src/websocket/message-router.ts
- [x] T096 Implement terminal streaming in backend/src/websocket/terminal-stream.ts
- [x] T097 Implement JWT token rotation in backend/src/websocket/token-manager.ts

### Frontend Components
- [x] T098 [P] Create app layout with shadcn/ui Sidebar in frontend/src/app/layout.tsx
- [x] T099 [P] Implement agent status cards with shadcn/ui Card in frontend/src/components/agents/agent-card.tsx
- [x] T100 [P] Implement terminal viewer with xterm.js in frontend/src/components/terminal/terminal-viewer.tsx
- [x] T101 [P] Implement command input with shadcn/ui Input and Button in frontend/src/components/command/command-input.tsx
- [x] T102 [P] Implement trace tree viewer with shadcn/ui Tree in frontend/src/components/trace/trace-tree.tsx
- [x] T103 [P] Implement preset manager with shadcn/ui Dialog and Form in frontend/src/components/presets/preset-manager.tsx
- [x] T104 [P] Implement emergency stop with shadcn/ui AlertDialog in frontend/src/components/system/emergency-stop.tsx
- [x] T105 [P] Implement report viewer with shadcn/ui ScrollArea in frontend/src/components/reports/report-viewer.tsx
- [x] T106 [P] Implement audit log viewer with shadcn/ui Table in frontend/src/components/audit/audit-viewer.tsx

### Frontend Services & State
- [x] T107 [P] Create Zustand store for agent state in frontend/src/stores/agent.store.ts
- [x] T108 [P] Create Zustand store for command state in frontend/src/stores/command.store.ts
- [x] T109 [P] Create Zustand store for UI state in frontend/src/stores/ui.store.ts
- [x] T110 [P] Implement WebSocket client service in frontend/src/services/websocket.service.ts
- [x] T111 [P] Implement API client service in frontend/src/services/api.service.ts
- [x] T112 [P] Implement auth service with Supabase in frontend/src/services/auth.service.ts

### Frontend Pages
- [x] T113 Create dashboard page with shadcn/ui layout components in frontend/src/app/dashboard/page.tsx
- [x] T114 [P] Create login page with shadcn/ui Form and Card in frontend/src/app/login/page.tsx
- [x] T115 [P] Create presets page with shadcn/ui DataTable in frontend/src/app/presets/page.tsx
- [x] T116 [P] Create reports page with shadcn/ui Tabs in frontend/src/app/reports/page.tsx
- [x] T117 [P] Create audit logs page with shadcn/ui DataTable in frontend/src/app/audit/page.tsx
- [x] T118 [P] Create settings page with shadcn/ui Form components in frontend/src/app/settings/page.tsx

### Agent Wrapper Implementation
- [x] T119 [P] Create agent wrapper CLI in agent-wrapper/src/cli.ts
- [x] T120 [P] Implement process spawning for Claude in agent-wrapper/src/agents/claude.ts
- [x] T121 [P] Implement process spawning for Gemini in agent-wrapper/src/agents/gemini.ts
- [x] T122 [P] Implement process spawning for Codex in agent-wrapper/src/agents/codex.ts
- [x] T123 [P] Implement WebSocket client in agent-wrapper/src/websocket-client.ts
- [x] T124 [P] Implement stdout/stderr capture in agent-wrapper/src/stream-capture.ts
- [x] T125 [P] Implement command execution in agent-wrapper/src/command-executor.ts
- [x] T126 [P] Implement config loader in agent-wrapper/src/config.ts
- [x] T127 [P] Implement reconnection logic in agent-wrapper/src/reconnection.ts

## Phase 3.5: Integration & Middleware
- [x] T128 Setup JWT authentication middleware in backend/src/middleware/auth.ts
- [x] T129 Implement request ID middleware in backend/src/middleware/request-id.ts
- [x] T130 Implement Pino logging middleware in backend/src/middleware/logging.ts
- [x] T131 Implement rate limiting middleware in backend/src/middleware/rate-limit.ts
- [x] T132 Implement CORS configuration in backend/src/middleware/cors.ts
- [x] T133 Connect AgentService to Supabase realtime in backend/src/services/agent.service.ts
- [x] T134 Connect CommandService to BullMQ in backend/src/services/command.service.ts
- [x] T135 Implement error handling middleware in backend/src/middleware/error-handler.ts

## Phase 3.6: Polish & Performance
- [x] T136 [P] Unit tests for agent-protocol validation in packages/agent-protocol/tests/
- [x] T137 [P] Unit tests for command-queue priority in packages/command-queue/tests/
- [x] T138 [P] Unit tests for trace-collector aggregation in packages/trace-collector/tests/
- [x] T139 [P] Performance test WebSocket latency (<200ms) in backend/tests/performance/latency.test.ts
- [x] T140 [P] Load test 10+ concurrent agents in backend/tests/performance/concurrency.test.ts
- [x] T141 [P] Create API documentation from OpenAPI spec
- [x] T142 [P] Create deployment guide for Fly.io
- [x] T143 [P] Create deployment guide for Vercel
- [x] T144 Run quickstart validation checklist
- [x] T145 E2E test full user journey with Playwright

## Dependencies
- Setup (T001-T014) blocks everything
- Database setup (T015-T026) blocks model tasks
- Tests (T027-T059) before implementation (T060-T127)
- Shared packages (T060-T068) before backend/frontend usage
- Models (T069-T077) before services (T078-T081)
- Services before API routes (T082-T089)
- WebSocket setup (T090) before handlers (T091-T097)
- Frontend services (T107-T112) before components using them
- All implementation before polish (T136-T145)

## Parallel Execution Examples

### Launch all contract tests together (T027-T043):
```
Task: "Contract test POST /auth/magic-link in backend/tests/contract/auth/magic-link.test.ts"
Task: "Contract test POST /auth/verify in backend/tests/contract/auth/verify.test.ts"
Task: "Contract test GET /agents in backend/tests/contract/agents/list.test.ts"
Task: "Contract test GET /agents/{id} in backend/tests/contract/agents/get.test.ts"
# ... continue for all contract tests
```

### Launch all database migrations together (T016-T024):
```
Task: "Write database migration for agents table in supabase/migrations/001_agents.sql"
Task: "Write database migration for commands table in supabase/migrations/002_commands.sql"
Task: "Write database migration for terminal_outputs table in supabase/migrations/003_terminal_outputs.sql"
# ... continue for all migrations
```

### Launch all model implementations together (T069-T077):
```
Task: "Agent model with Supabase client in backend/src/models/agent.ts"
Task: "Command model in backend/src/models/command.ts"
Task: "TerminalOutput model in backend/src/models/terminal-output.ts"
# ... continue for all models
```

## Notes
- [P] tasks = different files, no dependencies
- Verify tests fail before implementing
- Commit after each task
- Use real Supabase and Redis instances for testing
- Maintain <200ms WebSocket latency requirement
- Follow TDD strictly - no implementation before tests

## Task Generation Rules
*Applied during main() execution*

1. **From Contracts**:
   - REST API contract → 17 endpoint test tasks [P]
   - WebSocket protocol → 7 protocol test tasks [P]

2. **From Data Model**:
   - 9 entities → 9 model tasks [P]
   - 9 entities → 9 migration tasks [P]

3. **From User Stories**:
   - 10 quickstart scenarios → 9 integration tests [P]

4. **Ordering**:
   - Setup → Database → Tests → Packages → Models → Services → API → WebSocket → Frontend → Agent → Integration → Polish

## Validation Checklist
*GATE: Checked by main() before returning*

- [x] All contracts have corresponding tests (REST + WebSocket)
- [x] All entities have model tasks and migrations
- [x] All tests come before implementation
- [x] Parallel tasks truly independent
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Total tasks: 145 (comprehensive MVP coverage)