# Tasks: Fix Silent Database Connection Failures

**Input**: Design documents from `/specs/003-fix-silent-database/`
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
- **Web app**: `backend/src/`, `backend/tests/`, `frontend/src/`
- All paths relative to repository root

## Phase 3.1: Setup & Dependencies
- [ ] T001 Install database dependencies (pg@8.11.0, zod@3.22.0, @types/pg@8.10.0) in backend/package.json
- [ ] T002 Create Docker Compose configuration for local PostgreSQL in backend/docker-compose.yml
- [ ] T003 [P] Set up environment variable template in backend/.env.example with database config vars
- [ ] T004 [P] Create database directory structure: backend/src/database/ with adapter/, config/, migrations/

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Contract Tests
- [ ] T005 [P] Contract test GET /api/health/database in backend/tests/contract/health-database.test.ts
- [ ] T006 [P] Contract test POST /api/health/database/check in backend/tests/contract/health-database-check.test.ts
- [ ] T007 [P] Contract test GET /api/config/database in backend/tests/contract/config-database.test.ts

### Integration Tests
- [ ] T008 [P] Integration test: Database mode detection (Supabase → Local → Mock) in backend/tests/integration/database-mode.test.ts
- [ ] T009 [P] Integration test: Agent persistence across restart in backend/tests/integration/agent-persistence.test.ts
- [ ] T010 [P] Integration test: Connection loss and recovery in backend/tests/integration/connection-recovery.test.ts
- [ ] T011 [P] Integration test: Health check monitoring in backend/tests/integration/health-monitoring.test.ts
- [ ] T012 [P] Integration test: Database operation error handling in backend/tests/integration/database-errors.test.ts

### WebSocket Event Tests
- [ ] T013 [P] WebSocket test: database:status events in backend/tests/websocket/database-status.test.ts
- [ ] T014 [P] WebSocket test: database:error events in backend/tests/websocket/database-error.test.ts
- [ ] T015 [P] WebSocket test: database:health periodic updates in backend/tests/websocket/database-health.test.ts

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Configuration & Validation
- [ ] T016 [P] DatabaseConfig Zod schema in backend/src/database/config/database-config.schema.ts
- [ ] T017 [P] Environment variable validator in backend/src/database/config/env-validator.ts
- [ ] T018 Database mode detector (checks env vars, sets mode) in backend/src/database/config/mode-detector.ts

### Database Adapter Interface & Base
- [ ] T019 [P] IDatabaseAdapter interface definition in backend/src/database/adapter/database-adapter.interface.ts
- [ ] T020 [P] Base adapter with common functionality in backend/src/database/adapter/base-adapter.ts
- [ ] T021 [P] Connection pool manager in backend/src/database/adapter/connection-pool.ts

### Adapter Implementations
- [ ] T022 [P] Supabase adapter implementation in backend/src/database/adapter/supabase-adapter.ts
- [ ] T023 [P] Local PostgreSQL adapter in backend/src/database/adapter/postgres-adapter.ts
- [ ] T024 [P] Mock adapter for testing in backend/src/database/adapter/mock-adapter.ts

### Health Monitoring
- [ ] T025 Health check service with periodic checks in backend/src/database/health/health-check.service.ts
- [ ] T026 Connection status tracker in backend/src/database/health/connection-status.ts
- [ ] T027 Retry logic with exponential backoff in backend/src/database/health/retry-manager.ts

### API Endpoints
- [ ] T028 GET /api/health/database endpoint in backend/src/routes/health.ts
- [ ] T029 POST /api/health/database/check endpoint in backend/src/routes/health.ts
- [ ] T030 GET /api/config/database endpoint in backend/src/routes/config.ts

### WebSocket Event Handlers
- [ ] T031 Database status event emitter in backend/src/websocket/events/database-events.ts
- [ ] T032 Client event handlers (health:request, reconnect) in backend/src/websocket/handlers/database-handlers.ts

## Phase 3.4: Service Integration

### Service Error Handling Updates
- [ ] T033 Update AgentService with adapter error handling in backend/src/services/agent.service.ts
- [ ] T034 Update CommandService with persistence verification in backend/src/services/command.service.ts
- [ ] T035 Update TerminalService with output buffering in backend/src/services/terminal.service.ts
- [ ] T036 Update AuditService for critical operation logging in backend/src/services/audit.service.ts

### Server Initialization
- [ ] T037 Update server.ts to use database adapter instead of mock services in backend/src/server.ts
- [ ] T038 Add startup validation and mode logging in backend/src/server.ts
- [ ] T039 Initialize health monitoring on server start in backend/src/server.ts

## Phase 3.5: Database Setup & Migration

### Migration Scripts
- [ ] T040 [P] Create initial schema migration SQL in backend/src/database/migrations/001_initial_schema.sql
- [ ] T041 [P] Migration runner script in backend/src/database/migrations/runner.ts
- [ ] T042 [P] Database CLI commands (migrate, status, reset) in backend/src/cli/database.ts

### Docker & Local Setup
- [ ] T043 Docker Compose PostgreSQL service with init script in backend/docker-compose.yml
- [ ] T044 [P] Database initialization script in backend/scripts/init-db.sh

## Phase 3.6: Polish & Documentation

### E2E Tests
- [ ] T045 E2E test: Full quickstart flow validation in backend/tests/e2e/quickstart-flow.spec.ts
- [ ] T046 E2E test: Database mode switching in backend/tests/e2e/database-modes.spec.ts

### Performance & Monitoring
- [ ] T047 Performance test: <200ms database operations in backend/tests/performance/database-latency.test.ts
- [ ] T048 Load test: 100 operations/second in backend/tests/performance/database-load.test.ts

### Documentation
- [ ] T049 [P] Update backend/README.md with database setup instructions
- [ ] T050 [P] Create backend/docs/database-architecture.md with adapter pattern explanation
- [ ] T051 [P] Update troubleshooting guide in backend/docs/troubleshooting.md

## Dependencies
- Setup (T001-T004) must complete first
- All tests (T005-T015) MUST be written and MUST FAIL before implementation
- Config/validation (T016-T018) before adapters
- Adapters (T019-T024) before health monitoring
- Health monitoring (T025-T027) before endpoints
- All core implementation before service integration
- Service integration before database setup
- Everything before polish phase

## Parallel Execution Examples

**Batch 1 - Setup (can run together):**
```bash
# Terminal 1
Task agent T003  # Environment template

# Terminal 2
Task agent T004  # Directory structure
```

**Batch 2 - All Tests (can run together after setup):**
```bash
# Terminal 1-3: Contract tests
Task agent T005  # GET /api/health/database test
Task agent T006  # POST /api/health/database/check test
Task agent T007  # GET /api/config/database test

# Terminal 4-8: Integration tests
Task agent T008  # Database mode detection test
Task agent T009  # Agent persistence test
Task agent T010  # Connection recovery test
Task agent T011  # Health monitoring test
Task agent T012  # Error handling test

# Terminal 9-11: WebSocket tests
Task agent T013  # database:status event test
Task agent T014  # database:error event test
Task agent T015  # database:health event test
```

**Batch 3 - Core Components (can run together after tests fail):**
```bash
# Terminal 1-3: Configuration
Task agent T016  # DatabaseConfig schema
Task agent T017  # Environment validator
Task agent T019  # IDatabaseAdapter interface

# Terminal 4-6: Adapters
Task agent T022  # Supabase adapter
Task agent T023  # PostgreSQL adapter
Task agent T024  # Mock adapter
```

## Validation Checklist
- [x] All contracts have test tasks (T005-T007)
- [x] All entities have implementation tasks (DatabaseConfig, adapters)
- [x] All API endpoints have tasks (T028-T030)
- [x] WebSocket events covered (T031-T032)
- [x] All services updated (T033-T036)
- [x] Performance requirements tested (T047-T048)
- [x] Documentation tasks included (T049-T051)

## Task Count Summary
- **Total Tasks**: 51
- **Parallel Tasks**: 28 marked with [P]
- **Setup**: 4 tasks
- **Tests**: 11 tasks (MUST complete first)
- **Core Implementation**: 16 tasks
- **Service Integration**: 7 tasks
- **Database Setup**: 5 tasks
- **Polish**: 8 tasks

---
*Ready for execution. Remember: Tests first (TDD), use parallel execution where marked [P].*