# Tasks: Fix Silent Database Connection Failures

**Feature**: Implement proper Supabase connection handling with clear error messages
**Approach**: Use Supabase CLI for local development, single code path for all environments
**Date**: 2025-09-17

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Phase 1: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE PHASE 2

### Contract Tests
- [ ] T001 [P] Contract test GET /api/health endpoint with database status in backend/tests/contract/health.test.ts
- [ ] T002 [P] Contract test WebSocket database:status event in backend/tests/contract/websocket-database.test.ts

### Integration Tests
- [ ] T003 [P] Integration test: Supabase connection validation on startup in backend/tests/integration/supabase-connection.test.ts
- [ ] T004 [P] Integration test: Error messages when Supabase not configured in backend/tests/integration/supabase-errors.test.ts
- [ ] T005 [P] Integration test: Agent persistence with Supabase in backend/tests/integration/agent-persistence.test.ts
- [ ] T006 [P] Integration test: Health check monitoring in backend/tests/integration/health-monitoring.test.ts

## Phase 2: Core Implementation (ONLY after tests are failing)

### Configuration & Validation
- [ ] T007 Create Supabase connection validator in backend/src/database/supabase-validator.ts
- [ ] T008 Add environment detection (local vs cloud) in backend/src/database/environment-detector.ts
- [ ] T009 Update server.ts to validate Supabase on startup in backend/src/server.ts

### Error Handling
- [ ] T010 Create clear error messages with setup instructions in backend/src/database/error-messages.ts
- [ ] T011 Update mock service creation to show errors in backend/src/services/index.ts
- [ ] T012 Add connection validation before database operations in backend/src/services/base.service.ts

### Health Monitoring
- [ ] T013 Implement Supabase health check service in backend/src/database/health-check.service.ts
- [ ] T014 Update /api/health endpoint with database status in backend/src/routes/health.ts
- [ ] T015 Add WebSocket database:status events in backend/src/websocket/database-handler.ts

## Phase 3: Documentation & Setup

### Documentation
- [ ] T016 [P] Create Supabase CLI setup guide in backend/docs/supabase-setup.md
- [ ] T017 [P] Update backend/README.md with Supabase instructions
- [ ] T018 [P] Add troubleshooting guide for common Supabase issues in backend/docs/troubleshooting.md

### Developer Experience
- [ ] T019 Add .env.example with Supabase configuration template in backend/.env.example
- [ ] T020 Create Supabase initialization script in backend/scripts/setup-supabase.sh

## Dependencies
- All tests (T001-T006) MUST be written and MUST FAIL before implementation
- Configuration (T007-T009) before error handling
- Error handling (T010-T012) before health monitoring
- Core implementation before documentation

## Parallel Execution Examples

**Batch 1 - All Tests (can run together):**
```bash
# Terminal 1-2: Contract tests
npm run test backend/tests/contract/health.test.ts
npm run test backend/tests/contract/websocket-database.test.ts

# Terminal 3-6: Integration tests
npm run test backend/tests/integration/supabase-connection.test.ts
npm run test backend/tests/integration/supabase-errors.test.ts
npm run test backend/tests/integration/agent-persistence.test.ts
npm run test backend/tests/integration/health-monitoring.test.ts
```

**Batch 2 - Documentation (can run together after implementation):**
```bash
# Terminal 1-3
Task agent T016  # Supabase setup guide
Task agent T017  # Update README
Task agent T018  # Troubleshooting guide
```

## Validation Checklist
- [x] Tests cover all error scenarios
- [x] Clear error messages with actionable guidance
- [x] Health monitoring implemented
- [x] Documentation includes Supabase CLI setup
- [x] Single code path for all environments
- [x] No unnecessary abstraction layers

## Task Count Summary
- **Total Tasks**: 20 (reduced from 51)
- **Parallel Tasks**: 8 marked with [P]
- **Tests**: 6 tasks (MUST complete first)
- **Core Implementation**: 9 tasks
- **Documentation**: 5 tasks

---
*Simplified approach using Supabase CLI. No database adapter pattern needed.*