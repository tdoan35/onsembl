# Tasks: Fix WebSocket Authentication Security Vulnerability

**Input**: Design documents from `/specs/005-fix-websocket-authentication/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → Tech stack: TypeScript 5.x, Fastify 4.x, Redis (Upstash)
   → Structure: Web application (backend/frontend)
2. Load design documents:
   → data-model.md: 5 entities for auth management
   → contracts/websocket-auth.yaml: Auth protocol spec
   → research.md: Critical vulnerability analysis
3. Generate tasks by category:
   → Setup: Dependencies and type definitions
   → Tests: Contract, integration, rate limit tests
   → Core: Auth integration, per-message validation
   → Integration: Rate limiting, audit logging
   → Polish: Performance validation, documentation
4. Apply TDD rules:
   → Tests must be written first and MUST FAIL
   → Implementation only after tests are red
5. Number tasks sequentially (T001-T025)
6. Mark parallel tasks [P] for different files
7. Validate completeness: All vulnerabilities addressed
8. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Backend**: `backend/src/`, `backend/tests/`
- **Types**: `packages/agent-protocol/src/`
- All paths relative to repository root

## Phase 3.1: Setup & Dependencies
- [ ] T001 Add WebSocketAuth to WebSocketDependencies interface in `backend/src/websocket/types.ts`
- [ ] T002 Import and initialize WebSocketAuth in `backend/src/websocket/setup.ts`
- [ ] T003 [P] Add auth context types to `packages/agent-protocol/src/websocket-types.ts`

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Contract Tests
- [ ] T004 [P] Contract test: Valid token authentication in `backend/tests/contract/test_auth_valid_token.ts`
- [ ] T005 [P] Contract test: Invalid token rejection in `backend/tests/contract/test_auth_invalid_token.ts`
- [ ] T006 [P] Contract test: Expired token handling in `backend/tests/contract/test_auth_expired_token.ts`
- [ ] T007 [P] Contract test: Role mismatch rejection in `backend/tests/contract/test_auth_role_mismatch.ts`
- [ ] T008 [P] Contract test: Rate limit enforcement in `backend/tests/contract/test_rate_limit.ts`
- [ ] T009 [P] Contract test: Connection limit enforcement in `backend/tests/contract/test_connection_limit.ts`
- [ ] T010 [P] Contract test: Token refresh flow in `backend/tests/contract/test_token_refresh.ts`

### Integration Tests
- [ ] T011 [P] Integration test: Per-message auth validation in `backend/tests/integration/test_message_auth.ts`
- [ ] T012 [P] Integration test: Auth context persistence in `backend/tests/integration/test_auth_context.ts`
- [ ] T013 [P] Integration test: Audit logging in `backend/tests/integration/test_audit_logs.ts`

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Auth Integration
- [ ] T014 Wire WebSocketAuth to dependencies in `backend/src/websocket/setup.ts`
- [ ] T015 Add auth validation to AGENT_CONNECT in `backend/src/websocket/agent-handler.ts`
- [ ] T016 Add auth validation to DASHBOARD_INIT in `backend/src/websocket/dashboard-handler.ts`

### Per-Message Validation
- [ ] T017 Add auth check before COMMAND_REQUEST processing in `backend/src/websocket/dashboard-handler.ts`
- [ ] T018 Add auth check before COMMAND_STATUS processing in `backend/src/websocket/agent-handler.ts`
- [ ] T019 Add token expiry check in message handlers in `backend/src/websocket/message-validator.ts`

### Auth Context Management
- [ ] T020 [P] Implement AuthContext storage on connections in `backend/src/websocket/auth-context.ts`
- [ ] T021 [P] Implement UserConnectionPool for connection limits in `backend/src/services/connection-pool.ts`

## Phase 3.4: Integration & Security

### Rate Limiting
- [ ] T022 Implement WebSocket rate limiter in `backend/src/services/websocket-rate-limiter.ts`
- [ ] T023 Add rate limit checks to message handlers in `backend/src/websocket/middleware/rate-limit.ts`

### Audit Logging
- [ ] T024 [P] Implement auth audit logger in `backend/src/services/auth-audit.ts`
- [ ] T025 Add audit log calls to auth events in handlers

### Token Refresh
- [ ] T026 Implement TOKEN_REFRESH handler in `backend/src/websocket/token-refresh-handler.ts`
- [ ] T027 Add refresh token validation and rotation logic

## Phase 3.5: Polish & Validation

### Performance & Testing
- [ ] T028 Performance test: Verify <200ms latency with auth in `backend/tests/performance/test_auth_latency.ts`
- [ ] T029 Load test: 10 agents, 100 msg/sec with auth in `backend/tests/load/test_auth_load.ts`
- [ ] T030 Security test: Attempt auth bypass scenarios in `backend/tests/security/test_auth_bypass.ts`

### Documentation & Cleanup
- [ ] T031 [P] Update CLAUDE.md with auth fix details
- [ ] T032 [P] Update API documentation with new close codes
- [ ] T033 Run quickstart.md validation steps manually
- [ ] T034 Remove any debug logging and commented code

## Dependencies
- Setup (T001-T003) must complete first
- All tests (T004-T013) MUST be written and FAILING before implementation
- T014 blocks T015-T019 (auth must be wired first)
- T020-T021 can run parallel (different services)
- T022-T023 must be sequential (rate limiter before middleware)
- Polish tasks (T028-T034) only after all implementation

## Parallel Execution Examples

### Launch all contract tests together (T004-T010):
```typescript
Task: "Contract test: Valid token authentication"
Task: "Contract test: Invalid token rejection"
Task: "Contract test: Expired token handling"
Task: "Contract test: Role mismatch rejection"
Task: "Contract test: Rate limit enforcement"
Task: "Contract test: Connection limit enforcement"
Task: "Contract test: Token refresh flow"
```

### Launch service implementations together (T020-T021):
```typescript
Task: "Implement AuthContext storage on connections"
Task: "Implement UserConnectionPool for connection limits"
```

### Launch documentation updates together (T031-T032):
```typescript
Task: "Update CLAUDE.md with auth fix details"
Task: "Update API documentation with new close codes"
```

## Critical Security Tasks
These tasks directly address the vulnerability:
- **T014**: Wire WebSocketAuth (enables all auth)
- **T017-T019**: Per-message validation (prevents token expiry bypass)
- **T020**: Auth context persistence (maintains security state)
- **T022-T023**: Rate limiting (prevents flooding)

## Notes
- Tests MUST fail before implementation (TDD requirement)
- Each test creates a new file, so all tests can run in parallel
- Implementation tasks modify existing files, so must be sequential
- Commit after each task with descriptive message
- Run tests continuously during implementation
- Performance validation is critical - must stay under 200ms

## Validation Checklist
*Verified during task generation*

- [x] All contract messages have tests (T004-T010)
- [x] All entities have implementation tasks (T020-T021)
- [x] All tests come before implementation
- [x] Parallel tasks use different files
- [x] Each task specifies exact file path
- [x] No parallel tasks modify same file
- [x] Critical vulnerability addressed (T014-T019)
- [x] Rate limiting implemented (T022-T023)
- [x] Audit logging included (T024-T025)
- [x] Performance validation included (T028-T029)