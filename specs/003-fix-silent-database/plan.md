# Implementation Plan: Fix Silent Database Connection Failures


**Branch**: `003-fix-silent-database` | **Date**: 2025-09-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-fix-silent-database/spec.md`

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
Fix the backend's silent database connection failures by implementing proper error handling and clear developer guidance. The system currently creates empty mock services when Supabase is not configured, causing all operations to fail silently with no data persistence. We'll improve error messages, add connection validation, and provide clear instructions for using Supabase CLI for local development, maintaining full parity between local and production environments.

## Technical Context
**Language/Version**: Node.js 20+, TypeScript 5.x
**Primary Dependencies**: Fastify 4.x, @supabase/supabase-js
**Storage**: Supabase (cloud or local via CLI)
**Testing**: Vitest, Playwright for E2E
**Target Platform**: Linux server (Fly.io), Local development (macOS/Linux/Windows)
**Project Type**: web - backend service with frontend dashboard
**Performance Goals**: Support 10+ concurrent agent connections, 100 messages/second per agent
**Constraints**: <200ms database operation latency, maintain existing service interfaces
**Scale/Scope**: MVP with single-tenant architecture, all authenticated users control all agents
**Local Dev**: Supabase CLI for full stack parity

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 2 (backend, tests) ✓
- Using framework directly? Yes - Fastify, Supabase client, pg directly ✓
- Single data model? Yes - same entities for both database modes ✓
- Avoiding patterns? Yes - no unnecessary abstraction layers ✓

**Architecture**:
- EVERY feature as library? Connection management as library ✓
- Libraries listed:
  - `supabase-connection`: Connection validation and health monitoring
  - `config-validator`: Environment validation with helpful error messages
  - `error-handler`: Clear, actionable error messages for developers
- CLI per library: Simplified CLI for connection testing ✓
- Library docs: llms.txt format planned ✓

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? Yes ✓
- Git commits show tests before implementation? Yes ✓
- Order: Contract→Integration→E2E→Unit strictly followed? Yes ✓
- Real dependencies used? Yes - actual Supabase instances ✓
- Integration tests for: connection validation, error handling ✓
- FORBIDDEN: Implementation before test - understood ✓

**Observability**:
- Structured logging included? Yes - Pino logger ✓
- Frontend logs → backend? N/A for this feature
- Error context sufficient? Yes - detailed connection errors ✓

**Versioning**:
- Version number assigned? 0.3.0 (feature version)
- BUILD increments on every change? Yes ✓
- Breaking changes handled? No breaking changes - maintaining interfaces ✓

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

**Structure Decision**: Option 2 (Web application - backend focus with existing frontend dashboard)

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
- Focus on error handling and developer experience
- Connection validation and health monitoring
- Clear error messages with actionable guidance
- Supabase CLI setup documentation

**Specific Task Categories**:
1. **Configuration & Validation** (2-3 tasks)
   - Environment variable validation with helpful errors
   - Detect local vs cloud Supabase
   - Startup validation and connection testing

2. **Error Handling** (3-4 tasks)
   - Replace silent failures with clear error messages
   - Add "Run `supabase start`" guidance when not configured
   - Connection failure recovery suggestions
   - Health check implementation

3. **Service Updates** (2-3 tasks)
   - Update mock service creation to show errors
   - Add connection validation before operations
   - Add proper error propagation

4. **Testing** (4-5 tasks)
   - Contract tests for health API [P]
   - Integration tests for error scenarios
   - E2E test for local Supabase setup
   - Connection validation tests

5. **Documentation & Setup** (2-3 tasks)
   - Supabase CLI setup guide
   - Local development quickstart
   - Migration instructions for local Supabase

**Ordering Strategy**:
- TDD order: Tests before implementation
- Error handling → Connection validation → Documentation
- Mark [P] for parallel execution (independent files)

**Estimated Output**: 15-20 numbered, ordered tasks in tasks.md

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