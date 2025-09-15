# Implementation Plan: Onsembl.ai Agent Control Center

**Branch**: `001-build-onsembl-ai` | **Date**: 2025-01-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-build-onsembl-ai/spec.md`

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
Build a web-based Agent Control Center for orchestrating multiple AI coding agents (Claude, Gemini, Codex) through a unified dashboard. The system enables real-time monitoring, command distribution, and resource management of locally-running agents via WebSocket connections, with Fastify backend on Fly.io and Next.js 14 frontend.

## Technical Context
**Language/Version**: Node.js 20+ with TypeScript 5.x
**Primary Dependencies**: Fastify 4.x, Next.js 14, Supabase Client, Bull/Redis, Pino, shadcn/ui
**Storage**: Supabase PostgreSQL (auth, agents, commands, audit logs), Redis (via Upstash for queues)
**Testing**: Jest for backend, React Testing Library for frontend, Playwright for E2E
**Target Platform**: Fly.io (backend), Vercel (frontend), cross-platform agents (Node.js)
**Project Type**: web - requires frontend+backend structure
**Performance Goals**: <200ms terminal streaming latency, handle 10+ concurrent agents
**Constraints**: Single-tenant MVP, 30-day audit retention, JWT-based agent auth
**Scale/Scope**: MVP supporting 3 agent types, 10 concurrent connections, real-time streaming

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 3 (backend, frontend, agent-wrapper)
- Using framework directly? Yes - Fastify, Next.js, no wrapper classes
- Single data model? Yes - shared TypeScript types between projects
- Avoiding patterns? Yes - direct Supabase/Redis usage, no Repository pattern

**Architecture**:
- EVERY feature as library? Planning modular libraries for:
  - @onsembl/agent-protocol (WebSocket protocol & types)
  - @onsembl/command-queue (Bull queue management)
  - @onsembl/trace-collector (LLM trace aggregation)
- Libraries listed:
  - agent-protocol: WebSocket message types and validation
  - command-queue: Command queueing and execution logic
  - trace-collector: Trace tree construction from agent events
- CLI per library: Each library will expose CLI for testing/debugging
- Library docs: llms.txt format will be included

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? Yes
- Git commits show tests before implementation? Will be enforced
- Order: Contract→Integration→E2E→Unit strictly followed? Yes
- Real dependencies used? Yes - real Supabase, Redis instances for testing
- Integration tests for: WebSocket connections, command flow, agent lifecycle
- FORBIDDEN: Implementation before test - understood

**Observability**:
- Structured logging included? Yes - Pino with request IDs
- Frontend logs → backend? Yes - unified log streaming
- Error context sufficient? Yes - full stack traces, agent state

**Versioning**:
- Version number assigned? 0.1.0 for MVP
- BUILD increments on every change? Yes - CI/CD will handle
- Breaking changes handled? N/A for MVP

## Project Structure

### Documentation (this feature)
```
specs/001-build-onsembl-ai/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
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

agent-wrapper/
├── src/
│   ├── cli.ts
│   └── lib/
└── tests/

packages/
├── agent-protocol/
├── command-queue/
└── trace-collector/
```

**Structure Decision**: Option 2 - Web application with shared packages

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - Fastify WebSocket plugin best practices for high-concurrency
   - Bull queue patterns for command interruption/cancellation
   - Supabase real-time for dashboard updates vs pure WebSocket
   - JWT token rotation strategy for long-lived agent connections
   - Fly.io deployment with persistent WebSocket connections
   - Monaco Editor integration for terminal rendering

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
   - Agent, Command, TerminalOutput, CommandPreset
   - TraceEntry, InvestigationReport, AuditLog
   - ExecutionConstraint, CommandQueue

2. **Generate API contracts** from functional requirements:
   - REST API for CRUD operations
   - WebSocket protocol for real-time streaming
   - Output OpenAPI schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - WebSocket connection tests
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Agent connection/disconnection flow
   - Command execution with queue management
   - Emergency stop functionality

5. **Update agent file incrementally** (O(1) operation):
   - Run `/scripts/bash/update-agent-context.sh claude`
   - Add Fastify, Next.js, Supabase, shadcn/ui context
   - Update recent changes section
   - Output to repository root

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, CLAUDE.md

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- Each contract → contract test task [P]
- Each entity → model creation task [P]
- Each user story → integration test task
- Implementation tasks to make tests pass

**Ordering Strategy**:
- TDD order: Tests before implementation
- Dependency order: Models before services before UI
- Backend API before frontend components
- Agent wrapper after backend is functional
- Mark [P] for parallel execution (independent files)

**Estimated Output**: 35-40 numbered, ordered tasks in tasks.md covering:
- Supabase schema setup
- Backend API implementation
- WebSocket handlers
- Frontend dashboard components
- Agent wrapper implementation
- Integration and E2E tests

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
| None | - | - |

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
- [x] Complexity deviations documented

---
*Based on Constitution v2.1.1 - See `/memory/constitution.md`*