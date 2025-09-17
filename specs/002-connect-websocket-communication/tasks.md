# Tasks: Connect WebSocket Communication for Real-time Agent Monitoring

**Input**: Design documents from `/specs/002-connect-websocket-communication/`
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
- **Web app structure**: `backend/src/`, `frontend/src/`, `packages/`
- All paths shown are relative to repository root

## Phase 3.1: Setup
- [x] T001 Update packages/agent-protocol with WebSocket message types from contracts
- [x] T002 Install WebSocket dependencies (@fastify/websocket for backend)
- [x] T003 [P] Configure TypeScript paths for shared types import

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Contract Tests
- [x] T004 [P] Contract test for WebSocket handshake in backend/tests/contract/websocket-handshake.test.ts
- [x] T005 [P] Contract test for message serialization in packages/agent-protocol/tests/serialization.test.ts
- [x] T006 [P] Contract test for dashboard:connect message in backend/tests/contract/dashboard-connect.test.ts
- [x] T007 [P] Contract test for command:request message in backend/tests/contract/command-request.test.ts
- [x] T008 [P] Contract test for agent:status broadcast in backend/tests/contract/agent-status.test.ts
- [x] T009 [P] Contract test for terminal:output streaming in backend/tests/contract/terminal-output.test.ts

### Integration Tests
- [ ] T010 [P] Integration test: Dashboard connects and receives agent list in backend/tests/integration/dashboard-connection.test.ts
- [ ] T011 [P] Integration test: Command execution flow in backend/tests/integration/command-execution.test.ts
- [ ] T012 [P] Integration test: Multi-dashboard synchronization in backend/tests/integration/multi-dashboard.test.ts
- [ ] T013 [P] Integration test: Reconnection with exponential backoff in frontend/tests/integration/reconnection.test.ts
- [ ] T014 [P] Integration test: Terminal output buffering in frontend/tests/integration/terminal-buffer.test.ts

### E2E Tests
- [ ] T015 [P] E2E test: Full command execution flow in tests/e2e/command-flow.spec.ts
- [ ] T016 [P] E2E test: Agent connection/disconnection updates in tests/e2e/agent-status.spec.ts

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Shared Types & Protocol
- [x] T017 [P] WebSocket message types in packages/agent-protocol/src/websocket-messages.ts
- [x] T018 [P] Connection state types in packages/agent-protocol/src/connection-types.ts
- [x] T019 [P] Message validation utilities in packages/agent-protocol/src/websocket-validation.ts

### Backend WebSocket Infrastructure
- [x] T020 WebSocket plugin setup in backend/src/plugins/websocket.ts
- [x] T021 Connection manager service in backend/src/services/connection-manager.ts
- [x] T022 [P] Dashboard connection handler in backend/src/websocket/dashboard-handler.ts (existing)
- [x] T023 [P] Agent connection handler in backend/src/websocket/agent-handler.ts (stub for existing agents)
- [x] T024 Message broadcaster service in backend/src/services/broadcaster.ts
- [x] T025 [P] Command queue integration in backend/src/services/command-queue-adapter.ts

### Backend Message Handlers
- [x] T026 [P] Dashboard connect handler in backend/src/websocket/handlers/dashboard-connect.ts
- [x] T027 [P] Command request handler in backend/src/websocket/handlers/command-request.ts
- [x] T028 [P] Command interrupt handler in backend/src/websocket/handlers/command-interrupt.ts
- [x] T029 [P] Heartbeat handler in backend/src/websocket/handlers/heartbeat.ts
- [x] T030 [P] Error handler in backend/src/websocket/handlers/error.ts

### Frontend WebSocket Service
- [x] T031 WebSocket service class in frontend/src/services/websocket.service.ts
- [x] T032 [P] Reconnection logic with exponential backoff in frontend/src/services/reconnection.ts
- [x] T033 [P] Message handler registry in frontend/src/services/message-handlers.ts
- [x] T034 [P] Terminal buffer implementation in frontend/src/services/terminal-buffer.ts

### Frontend Store Integration
- [ ] T035 WebSocket store updates in frontend/src/stores/websocket.store.ts
- [ ] T036 Agent store WebSocket integration in frontend/src/stores/agent.store.ts
- [ ] T037 Terminal store updates in frontend/src/stores/terminal.store.ts
- [ ] T038 Command store updates in frontend/src/stores/command.store.ts

### Frontend UI Integration
- [ ] T039 WebSocket hook in frontend/src/hooks/useWebSocket.ts
- [ ] T040 Dashboard page WebSocket initialization in frontend/src/app/dashboard/page.tsx
- [ ] T041 [P] Connection status indicator component in frontend/src/components/connection-status.tsx
- [ ] T042 [P] Agent list real-time updates in frontend/src/components/agent-list.tsx
- [ ] T043 Terminal output streaming in frontend/src/components/terminal.tsx

## Phase 3.4: Integration

### Authentication & Security
- [ ] T044 JWT validation for WebSocket connections in backend/src/websocket/auth.ts
- [ ] T045 [P] Token refresh mechanism in backend/src/websocket/token-refresh.ts
- [ ] T046 [P] Rate limiting for WebSocket messages in backend/src/websocket/rate-limiter.ts

### Logging & Monitoring
- [ ] T047 [P] WebSocket connection logging in backend/src/websocket/logging.ts
- [ ] T048 [P] Frontend console forwarding to backend in frontend/src/services/log-forwarder.ts
- [ ] T049 [P] Metrics collection for WebSocket performance in backend/src/websocket/metrics.ts

### Error Recovery
- [ ] T050 Connection error recovery in frontend/src/services/error-recovery.ts
- [ ] T051 [P] Message retry logic in frontend/src/services/message-retry.ts
- [ ] T052 [P] Fallback to polling (if needed) in frontend/src/services/polling-fallback.ts

## Phase 3.5: Polish

### Performance Optimization
- [ ] T053 [P] Message batching for terminal output in backend/src/websocket/batching.ts
- [ ] T054 [P] Compression for large payloads in backend/src/websocket/compression.ts
- [ ] T055 [P] Terminal output debouncing in frontend/src/services/terminal-debounce.ts

### Unit Tests
- [ ] T056 [P] Unit tests for connection manager in backend/tests/unit/connection-manager.test.ts
- [ ] T057 [P] Unit tests for message validation in packages/agent-protocol/tests/validation.test.ts
- [ ] T058 [P] Unit tests for reconnection logic in frontend/tests/unit/reconnection.test.ts
- [ ] T059 [P] Unit tests for terminal buffer in frontend/tests/unit/terminal-buffer.test.ts

### Documentation & Cleanup
- [ ] T060 [P] Update API documentation with WebSocket endpoints
- [ ] T061 [P] Add WebSocket section to frontend README
- [ ] T062 Remove debug logging and clean up code
- [ ] T063 Run quickstart.md validation tests

## Dependencies
- Setup (T001-T003) must complete first
- All tests (T004-T016) before any implementation (T017+)
- Shared types (T017-T019) before backend/frontend implementation
- Backend infrastructure (T020-T025) before message handlers (T026-T030)
- Frontend service (T031-T034) before store integration (T035-T038)
- Store integration before UI components (T039-T043)
- Core implementation before integration tasks (T044-T052)
- Everything before polish phase (T053-T063)

## Parallel Execution Examples

### Parallel Group 1: Contract Tests (after setup)
```bash
# Launch T004-T009 together:
Task: "Contract test for WebSocket handshake in backend/tests/contract/websocket-handshake.test.ts"
Task: "Contract test for message serialization in packages/agent-protocol/tests/serialization.test.ts"
Task: "Contract test for dashboard:connect message in backend/tests/contract/dashboard-connect.test.ts"
Task: "Contract test for command:request message in backend/tests/contract/command-request.test.ts"
Task: "Contract test for agent:status broadcast in backend/tests/contract/agent-status.test.ts"
Task: "Contract test for terminal:output streaming in backend/tests/contract/terminal-output.test.ts"
```

### Parallel Group 2: Integration Tests (after contract tests)
```bash
# Launch T010-T014 together:
Task: "Integration test: Dashboard connects and receives agent list"
Task: "Integration test: Command execution flow"
Task: "Integration test: Multi-dashboard synchronization"
Task: "Integration test: Reconnection with exponential backoff"
Task: "Integration test: Terminal output buffering"
```

### Parallel Group 3: Shared Types (after all tests fail)
```bash
# Launch T017-T019 together:
Task: "WebSocket message types in packages/agent-protocol/src/websocket-messages.ts"
Task: "Connection state types in packages/agent-protocol/src/connection-types.ts"
Task: "Message validation utilities in packages/agent-protocol/src/validation.ts"
```

### Parallel Group 4: Message Handlers (after backend infrastructure)
```bash
# Launch T026-T030 together:
Task: "Dashboard connect handler"
Task: "Command request handler"
Task: "Command interrupt handler"
Task: "Heartbeat handler"
Task: "Error handler"
```

## Notes
- [P] tasks operate on different files and have no interdependencies
- Verify all tests fail before starting implementation (RED phase of TDD)
- Commit after each task completion with descriptive message
- Run tests after each implementation task to verify GREEN phase
- Avoid modifying the same file in parallel tasks

## Validation Checklist
*GATE: Checked before execution*

- [x] All contracts have corresponding tests (T004-T009)
- [x] All entities have implementation tasks (DashboardConnection, AgentConnection, CommandExecution, TerminalBuffer)
- [x] All tests come before implementation (T004-T016 before T017+)
- [x] Parallel tasks are truly independent (different files)
- [x] Each task specifies exact file path
- [x] No [P] task modifies same file as another [P] task
- [x] WebSocket protocol messages covered (all types from contracts)
- [x] Integration scenarios from quickstart.md included