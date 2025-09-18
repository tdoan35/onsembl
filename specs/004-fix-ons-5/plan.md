# Implementation Plan: Fix Command Routing - Commands Never Reach Agents


**Branch**: `004-fix-ons-5` | **Date**: 2025-09-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-fix-ons-5/spec.md`

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
Fix WebSocket message routing between dashboard and agent connections to enable command execution. The MessageRouter class exists with comprehensive routing methods but isn't wired into the WebSocket handlers, causing commands from dashboards to never reach agents.

## Technical Context
**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: Fastify 4.x, @fastify/websocket, Zod validation
**Storage**: Dual-mode - Supabase (production) or PostgreSQL (development)
**Testing**: Jest with real WebSocket connections
**Target Platform**: Linux server (Fly.io) for backend, Vercel for frontend
**Project Type**: web - frontend + backend architecture
**Performance Goals**: <200ms terminal streaming latency, 100 messages/second per agent
**Constraints**: Real-time message routing, message queuing for offline agents, 1MB max WebSocket payload
**Scale/Scope**: 10+ concurrent agents, multiple dashboard connections

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 2 (backend WebSocket handlers, tests) ✓
- Using framework directly? YES - using Fastify WebSocket directly ✓
- Single data model? YES - using existing types from agent-protocol ✓
- Avoiding patterns? YES - direct message routing, no abstractions ✓

**Architecture**:
- EVERY feature as library? MessageRouter is already a library ✓
- Libraries listed: message-router (routing), connection-pool (tracking), heartbeat (monitoring) ✓
- CLI per library: N/A - WebSocket handlers not CLI-exposed
- Library docs: Will document WebSocket protocol in contracts/ ✓

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? YES - tests first ✓
- Git commits show tests before implementation? WILL ENFORCE ✓
- Order: Contract→Integration→E2E→Unit strictly followed? YES ✓
- Real dependencies used? YES - real WebSocket connections ✓
- Integration tests for: YES - testing message routing between handlers ✓
- FORBIDDEN: Implementation before test, skipping RED phase ACKNOWLEDGED ✓

**Observability**:
- Structured logging included? YES - using Pino logger ✓
- Frontend logs → backend? N/A - fixing backend routing only ✓
- Error context sufficient? YES - message IDs, connection IDs tracked ✓

**Versioning**:
- Version number assigned? Using existing versioning ✓
- BUILD increments on every change? Following project standards ✓
- Breaking changes handled? No breaking changes - fixing existing contract ✓

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

**Structure Decision**: Option 2 - Web application (backend + frontend structure)

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
- Focus on wiring existing MessageRouter into handlers
- Each message type → integration test task [P]
- Each handler modification → implementation task
- Command tracking → state management task

**Specific Task Categories**:
1. **Integration Tests** (RED phase - must fail first):
   - Test COMMAND_REQUEST routing dashboard→agent
   - Test COMMAND_STATUS routing agent→dashboard
   - Test TERMINAL_STREAM routing to correct dashboard
   - Test EMERGENCY_STOP broadcast to all agents
   - Test offline agent message queuing
   - Test connection cleanup on disconnect

2. **Implementation Tasks** (GREEN phase - make tests pass):
   - Add COMMAND_REQUEST handler to dashboard-handler.ts
   - Add COMMAND_CANCEL handler to dashboard-handler.ts
   - Add AGENT_CONTROL handler to dashboard-handler.ts
   - Add EMERGENCY_STOP handler to dashboard-handler.ts
   - Implement command-to-dashboard tracking map
   - Wire MessageRouter dependency into handlers
   - Verify agent response routing works

3. **Validation Tasks**:
   - Run quickstart test scenarios
   - Performance validation (<200ms latency)
   - Load testing with multiple connections

**Ordering Strategy**:
- TDD order: All integration tests first (must fail)
- Then implementation to make tests pass
- Finally validation and performance tests
- Mark [P] for parallel test execution

**Estimated Output**: 15-20 focused tasks (fewer because MessageRouter already exists)

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