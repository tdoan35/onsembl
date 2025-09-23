# Implementation Plan: Integrate Supabase Authentication


**Branch**: `006-integrate-supabase-authentication` | **Date**: 2025-09-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-integrate-supabase-authentication/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
4. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
5. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, or `GEMINI.md` for Gemini CLI).
6. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
7. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
8. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Integrate Supabase authentication into Onsembl.ai Agent Control Center to provide secure user authentication via OAuth (Google/GitHub) and email/password, with session management, password reset, and data isolation. The implementation will leverage Supabase's built-in auth SDK for frontend authentication and JWT validation for backend API/WebSocket protection.

## Technical Context
**Language/Version**: TypeScript 5.x (backend/frontend), Node.js 20+ (backend)
**Primary Dependencies**:
  - Frontend: @supabase/supabase-js, @supabase/auth-helpers-nextjs, Next.js 14, Zustand
  - Backend: @supabase/supabase-js, Fastify 4.x, jsonwebtoken
**Storage**: Supabase PostgreSQL (auth.users table + RLS policies)
**Testing**: Jest (frontend), Tap/Fastify test framework (backend), Playwright (E2E)
**Target Platform**: Web browser (frontend), Node.js server (backend)
**Project Type**: web - Frontend (Next.js) + Backend (Fastify)
**Performance Goals**: <200ms auth response time, instant session validation
**Constraints**: JWT token validation on every WebSocket connection, RLS enforcement on all queries
**Scale/Scope**: Support 100+ concurrent users, multi-tenant data isolation

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 2 (frontend, backend) ✅
- Using framework directly? Yes - Supabase SDK, no wrappers ✅
- Single data model? Yes - using Supabase auth.users directly ✅
- Avoiding patterns? Yes - direct Supabase calls, no repository pattern ✅

**Architecture**:
- EVERY feature as library? Pending - auth module will be library
- Libraries listed:
  - `@onsembl/auth-client`: Frontend auth state management
  - `@onsembl/auth-guard`: Backend JWT validation middleware
- CLI per library: Will add CLI commands for testing auth
- Library docs: llms.txt format will be included

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? Yes - tests first ✅
- Git commits show tests before implementation? Will enforce ✅
- Order: Contract→Integration→E2E→Unit strictly followed? Yes ✅
- Real dependencies used? Real Supabase instance ✅
- Integration tests for: auth flow, JWT validation, RLS policies ✅
- FORBIDDEN: Implementation before test - understood ✅

**Observability**:
- Structured logging included? Yes - Pino logger ✅
- Frontend logs → backend? Auth events will be logged ✅
- Error context sufficient? Full auth error context planned ✅

**Versioning**:
- Version number assigned? 0.1.0 initial release
- BUILD increments on every change? Will follow
- Breaking changes handled? N/A for initial implementation

## Project Structure

### Documentation (this feature)
```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure]
```

**Structure Decision**: Option 2 - Web application (frontend + backend)

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `/scripts/bash/update-agent-context.sh claude` for your AI assistant
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- Each auth endpoint → contract test task [P]
- Each RLS policy → database migration task
- Each auth flow → integration test task
- Implementation tasks to make tests pass

**Ordering Strategy**:
- TDD order: Tests before implementation
- Dependency order:
  1. Database migrations (user_id columns, RLS policies)
  2. Backend JWT middleware
  3. Frontend Supabase client setup
  4. Auth store implementation
  5. UI component integration
  6. WebSocket authentication
  7. E2E tests
- Mark [P] for parallel execution (independent files)

**Estimated Output**: 30-35 numbered, ordered tasks in tasks.md

Key task categories:
- Database setup (5 tasks)
- Backend auth middleware (5 tasks)
- Frontend auth integration (8 tasks)
- WebSocket auth (4 tasks)
- Integration tests (8 tasks)
- E2E tests (5 tasks)

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |


## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none required)

---
*Based on Constitution v2.1.1 - See `/memory/constitution.md`*