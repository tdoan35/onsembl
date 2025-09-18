# Tasks: Fix Command Routing - Commands Never Reach Agents

**Input**: Design documents from `/specs/004-fix-ons-5/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/, quickstart.md

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → Extract: TypeScript/Node.js, Fastify WebSocket, Jest testing
   → Structure: Web app (backend/frontend)
2. Load optional design documents:
   → data-model.md: CommandRouting, connection metadata entities
   → contracts/websocket-routing.yaml: Message contracts
   → research.md: MessageRouter singleton pattern
   → quickstart.md: 5 test scenarios
3. Generate tasks by category:
   → Setup: Test infrastructure
   → Tests: Integration tests for each routing scenario
   → Core: Wire MessageRouter into handlers
   → Integration: Command tracking, cleanup
   → Polish: Performance validation
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001-T020)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Web app structure**: `backend/src/`, `backend/tests/`
- All paths relative to repository root

## Phase 3.1: Setup
- [x] T001 Create test utilities for WebSocket connections in backend/tests/utils/websocket-client.ts
- [x] T002 [P] Create mock dashboard client helper in backend/tests/utils/mock-dashboard.ts
- [x] T003 [P] Create mock agent client helper in backend/tests/utils/mock-agent.ts

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**
- [x] T004 [P] Integration test: COMMAND_REQUEST routing dashboard→agent in backend/tests/integration/routing/test-command-request.spec.ts
- [x] T005 [P] Integration test: COMMAND_STATUS routing agent→dashboard in backend/tests/integration/routing/test-command-status.spec.ts
- [x] T006 [P] Integration test: TERMINAL_STREAM to correct dashboard in backend/tests/integration/routing/test-terminal-stream.spec.ts
- [x] T007 [P] Integration test: EMERGENCY_STOP broadcast to all agents in backend/tests/integration/routing/test-emergency-stop.spec.ts
- [x] T008 [P] Integration test: Offline agent message queuing in backend/tests/integration/routing/test-offline-queuing.spec.ts
- [x] T009 [P] Integration test: Connection cleanup on disconnect in backend/tests/integration/routing/test-connection-cleanup.spec.ts
- [x] T010 [P] Integration test: Multiple dashboard isolation in backend/tests/integration/routing/test-dashboard-isolation.spec.ts

## Phase 3.3: Core Implementation (ONLY after tests are failing)
- [x] T011 Add command-to-dashboard tracking Map in backend/src/websocket/message-router.ts
- [x] T012 Add COMMAND_REQUEST handler in backend/src/websocket/dashboard-handler.ts (handleMessage switch case)
- [x] T013 Add COMMAND_CANCEL handler in backend/src/websocket/dashboard-handler.ts (handleMessage switch case)
- [x] T014 Add AGENT_CONTROL handler in backend/src/websocket/dashboard-handler.ts (handleMessage switch case)
- [x] T015 Add EMERGENCY_STOP handler in backend/src/websocket/dashboard-handler.ts (handleMessage switch case)
- [x] T016 Update dashboard connection metadata to track initiated commands in backend/src/websocket/dashboard-handler.ts
- [x] T017 Update agent handler to include routing metadata in responses in backend/src/websocket/agent-handler.ts
- [x] T018 Wire shared MessageRouter instance between handlers in backend/src/websocket/setup.ts

## Phase 3.4: Integration
- [x] T019 Implement command cleanup on dashboard disconnect in backend/src/websocket/dashboard-handler.ts (handleDisconnection)
- [x] T020 Implement command cleanup on agent disconnect in backend/src/websocket/agent-handler.ts (handleDisconnection)
- [x] T021 Add command TTL expiration logic in backend/src/websocket/message-router.ts
- [x] T022 Verify MessageRouter queue processing for offline agents in backend/src/websocket/message-router.ts

## Phase 3.5: Polish
- [ ] T023 [P] Run quickstart test scenario 1: Basic command routing
- [ ] T024 [P] Run quickstart test scenario 2: Multiple dashboard isolation
- [ ] T025 [P] Run quickstart test scenario 3: Offline agent queuing
- [ ] T026 [P] Run quickstart test scenario 4: Emergency stop broadcast
- [ ] T027 [P] Run quickstart test scenario 5: Connection recovery
- [ ] T028 Performance test: Verify <200ms latency with load test in backend/tests/performance/websocket-latency.spec.ts
- [ ] T029 [P] Add debug logging for message routing flow
- [ ] T030 [P] Update CLAUDE.md with completed routing implementation

## Dependencies
- Setup (T001-T003) before tests
- Tests (T004-T010) MUST complete and FAIL before implementation (T011-T018)
- T011 blocks T012-T015 (need tracking map first)
- T018 blocks T019-T022 (need shared router first)
- Implementation (T011-T022) before validation (T023-T030)

## Parallel Execution Examples

### Test Creation (After Setup)
```bash
# Launch T004-T010 together (all different files):
Task: "Integration test: COMMAND_REQUEST routing dashboard→agent"
Task: "Integration test: COMMAND_STATUS routing agent→dashboard"
Task: "Integration test: TERMINAL_STREAM to correct dashboard"
Task: "Integration test: EMERGENCY_STOP broadcast to all agents"
Task: "Integration test: Offline agent message queuing"
Task: "Integration test: Connection cleanup on disconnect"
Task: "Integration test: Multiple dashboard isolation"
```

### Handler Updates (Sequential - Same Files)
```bash
# T012-T015 must run sequentially (all modify dashboard-handler.ts):
Task: "Add COMMAND_REQUEST handler in dashboard-handler.ts"
# Then:
Task: "Add COMMAND_CANCEL handler in dashboard-handler.ts"
# Then:
Task: "Add AGENT_CONTROL handler in dashboard-handler.ts"
# Then:
Task: "Add EMERGENCY_STOP handler in dashboard-handler.ts"
```

### Validation Phase
```bash
# Launch T023-T027, T029-T030 together:
Task: "Run quickstart test scenario 1: Basic command routing"
Task: "Run quickstart test scenario 2: Multiple dashboard isolation"
Task: "Run quickstart test scenario 3: Offline agent queuing"
Task: "Run quickstart test scenario 4: Emergency stop broadcast"
Task: "Run quickstart test scenario 5: Connection recovery"
Task: "Add debug logging for message routing flow"
Task: "Update CLAUDE.md with completed routing implementation"
```

## Notes
- MessageRouter class already exists with all routing methods - just needs wiring
- Focus on connecting existing components, not creating new ones
- All integration tests must use real WebSocket connections (no mocks)
- Verify each test fails before implementing the fix
- Commit after each task with descriptive message
- T012-T015 modify same file (dashboard-handler.ts) so cannot be parallel

## Task Generation Rules
*Applied during main() execution*

1. **From Contracts**:
   - websocket-routing.yaml → 7 integration test tasks (T004-T010)
   - Each message type → handler implementation task

2. **From Data Model**:
   - CommandRouting entity → tracking map task (T011)
   - Connection metadata → cleanup tasks (T019-T020)

3. **From Quickstart Scenarios**:
   - 5 test scenarios → 5 validation tasks (T023-T027)
   - Performance requirement → latency test (T028)

4. **Ordering**:
   - Setup → Tests → Core → Integration → Polish
   - Same-file edits must be sequential

## Validation Checklist
*GATE: Checked by main() before returning*

- [x] All message types from contract have tests
- [x] All entities have implementation tasks
- [x] All tests come before implementation (T004-T010 before T011-T022)
- [x] Parallel tasks truly independent (different files)
- [x] Each task specifies exact file path
- [x] No [P] task modifies same file as another [P] task
- [x] All quickstart scenarios have validation tasks