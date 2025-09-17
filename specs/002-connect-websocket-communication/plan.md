# Implementation Plan: Connect WebSocket Communication for Real-time Agent Monitoring

**Branch**: `002-connect-websocket-communication` | **Date**: 2025-09-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-connect-websocket-communication/spec.md`

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
Enable real-time bidirectional communication between the Next.js dashboard and Fastify backend server to monitor AI agents and execute commands. The dashboard will establish WebSocket connections to receive agent status updates, send commands to selected agents, and stream terminal output in real-time. All connected dashboards will receive synchronized updates when agent states change.

## Technical Context
**Language/Version**: TypeScript 5.x / Node.js 20+
**Primary Dependencies**: Fastify 4.x with @fastify/websocket, Next.js 14, Zustand, xterm.js
**Storage**: Supabase (PostgreSQL) for persistence, Zustand for client state
**Testing**: Vitest, Playwright for E2E
**Target Platform**: Web browsers (Chrome, Firefox, Safari, Edge)
**Project Type**: web - frontend + backend architecture
**Performance Goals**: <200ms terminal streaming latency, 100 messages/second per agent
**Constraints**: 1MB max WebSocket payload, support 10 concurrent agents, 50 concurrent dashboards
**Scale/Scope**: MVP single-tenant, 10 agents max, multiple dashboard clients

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 2 (frontend, backend - existing structure)
- Using framework directly? Yes (Fastify WebSocket, Next.js built-in)
- Single data model? Yes (shared types in agent-protocol package)
- Avoiding patterns? Yes (direct WebSocket usage, no abstraction layers)

**Architecture**:
- EVERY feature as library? Yes (agent-protocol for shared types)
- Libraries listed:
  - agent-protocol: WebSocket message types and protocol definitions
  - command-queue: BullMQ command queueing (existing)
- CLI per library: Not applicable for WebSocket feature
- Library docs: Will update existing protocol documentation

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? Yes
- Git commits show tests before implementation? Will enforce
- Order: Contract→Integration→E2E→Unit strictly followed? Yes
- Real dependencies used? Yes (actual WebSocket connections, real Supabase)
- Integration tests for: WebSocket handshake, message flow, broadcast behavior
- FORBIDDEN: Implementation before test, skipping RED phase

**Observability**:
- Structured logging included? Yes (Pino on backend)
- Frontend logs → backend? Will implement console forwarding
- Error context sufficient? Yes (connection state, message types, agent IDs)

**Versioning**:
- Version number assigned? Using existing package versions
- BUILD increments on every change? Yes
- Breaking changes handled? WebSocket protocol versioning in messages

## Project Structure

### Documentation (this feature)
```
specs/002-connect-websocket-communication/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 2: Web application (frontend + backend detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── app/           # Next.js App Router
│   └── services/
└── tests/

packages/
├── agent-protocol/    # Shared WebSocket types
└── command-queue/     # Existing queue management
```

**Structure Decision**: Option 2 - Web application (existing structure maintained)

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - WebSocket reconnection patterns for Next.js
   - Fastify WebSocket broadcasting best practices
   - Zustand integration with WebSocket events
   - xterm.js terminal output buffering strategies

2. **Generate and dispatch research agents**:
   ```
   Task: "Research WebSocket reconnection patterns for Next.js App Router"
   Task: "Find best practices for Fastify WebSocket room broadcasting"
   Task: "Research Zustand store updates from WebSocket events"
   Task: "Find xterm.js buffering strategies for high-throughput output"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all technical decisions documented

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - DashboardConnection: WebSocket connection from dashboard
   - AgentConnection: WebSocket connection from agent
   - CommandExecution: Active command with status
   - TerminalBuffer: Output buffer for streaming

2. **Generate API contracts** from functional requirements:
   - WebSocket endpoint: /ws/dashboard
   - Message types: AgentStatus, CommandRequest, TerminalOutput
   - Events: agent:connected, agent:disconnected, command:execute
   - Output to `/contracts/websocket-messages.ts`

3. **Generate contract tests** from contracts:
   - Test WebSocket handshake
   - Test message serialization/deserialization
   - Test broadcast to multiple connections
   - Tests must fail initially

4. **Extract test scenarios** from user stories:
   - Dashboard connects and receives agent list
   - Command execution with terminal streaming
   - Multi-dashboard synchronization
   - Reconnection with state recovery

5. **Update agent file incrementally**:
   - Add WebSocket implementation context
   - Update recent changes section
   - Keep existing tech stack references

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, updated CLAUDE.md

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Generate WebSocket contract tests first
- Create message type definitions in agent-protocol
- Backend WebSocket handler tasks
- Frontend WebSocket service integration tasks
- Zustand store update tasks
- Terminal output streaming tasks
- Integration test tasks for full flow

**Ordering Strategy**:
- Contract tests first (TDD requirement)
- Shared types before implementation
- Backend before frontend (server must be ready)
- Integration tests after unit implementation

**Estimated Output**: 20-25 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following constitutional principles)
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*No violations - using existing architecture patterns*

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
- [x] Complexity deviations documented (none)

---
*Based on Constitution v2.1.1 - See `/memory/constitution.md`*