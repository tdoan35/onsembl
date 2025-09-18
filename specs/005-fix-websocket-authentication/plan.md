# Implementation Plan: Fix WebSocket Authentication Security Vulnerability

**Branch**: `005-fix-websocket-authentication` | **Date**: 2025-09-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-fix-websocket-authentication/spec.md`

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
Fix critical WebSocket authentication vulnerability where connections only validate tokens during initial handshake, allowing indefinite command execution with expired tokens. Solution involves integrating existing WebSocketAuth class into message handlers for per-message validation, implementing rate limiting, and enforcing connection limits.

## Technical Context
**Language/Version**: TypeScript 5.x, Node.js 20+
**Primary Dependencies**: Fastify 4.x, @fastify/websocket, jsonwebtoken, Redis (Upstash)
**Storage**: Dual-mode PostgreSQL/Supabase with Redis for rate limiting
**Testing**: Vitest, WebSocket test client, contract testing
**Target Platform**: Linux server (Fly.io), Node.js runtime
**Project Type**: web (backend WebSocket server with frontend dashboard)
**Performance Goals**: <200ms WebSocket latency, 100 msg/sec per connection
**Constraints**: 10 concurrent connections per user, 1MB max message size
**Scale/Scope**: Support 10+ agents, 100+ concurrent dashboard connections

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 2 (backend, tests) ✓
- Using framework directly? Yes - Fastify WebSocket directly ✓
- Single data model? Yes - auth context only ✓
- Avoiding patterns? Yes - no unnecessary abstractions ✓

**Architecture**:
- EVERY feature as library? No - security fix integrated into existing handlers
- Libraries listed: WebSocketAuth (authentication utilities), RateLimiter (message throttling)
- CLI per library: N/A - security infrastructure
- Library docs: Will document auth flow in CLAUDE.md

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? Yes - tests written first ✓
- Git commits show tests before implementation? Yes ✓
- Order: Contract→Integration→E2E→Unit strictly followed? Yes ✓
- Real dependencies used? Yes - real WebSocket connections, Redis ✓
- Integration tests for: auth validation, rate limiting, token refresh ✓
- FORBIDDEN: Implementation before test - will not violate ✓

**Observability**:
- Structured logging included? Yes - Pino with auth context ✓
- Frontend logs → backend? N/A - backend only fix
- Error context sufficient? Yes - full auth audit trail ✓

**Versioning**:
- Version number assigned? 1.1.0 (security fix minor version) ✓
- BUILD increments on every change? Yes ✓
- Breaking changes handled? No breaking changes - backward compatible ✓

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

**Structure Decision**: Option 2 (Web application) - existing backend/frontend structure

## Phase 0: Outline & Research ✓ COMPLETE
1. **Extracted unknowns from Technical Context**:
   - Current auth implementation status → RESOLVED
   - WebSocket connection flow → DOCUMENTED
   - Performance impact of auth checks → ANALYZED (<15ms impact)

2. **Research findings consolidated**:
   - Critical vulnerability confirmed: auth only on connect
   - WebSocketAuth class exists but not wired
   - Rate limiting infrastructure ready to extend

3. **Key decisions documented** in `research.md`:
   - Decision: Per-message authentication validation
   - Rationale: Only secure way to prevent token expiry bypass
   - Alternatives: Connection-only auth (rejected - insufficient)

**Output**: research.md complete with all unknowns resolved

## Phase 1: Design & Contracts ✓ COMPLETE
*Prerequisites: research.md complete*

1. **Entities extracted** → `data-model.md`:
   - AuthenticatedConnection with auth context
   - AuthContext with token/permission data
   - UserConnectionPool for connection limits
   - RateLimitTracker for message throttling
   - AuthenticationAuditLog for security events

2. **WebSocket contracts generated** → `/contracts/websocket-auth.yaml`:
   - Authentication messages (AGENT_CONNECT, DASHBOARD_INIT)
   - Auth responses (AUTH_SUCCESS, AUTH_ERROR)
   - Token refresh protocol
   - Rate limit responses
   - Close codes defined (1008, 4000-4005)

3. **Contract tests planned** (for /tasks phase):
   - Valid/invalid token tests
   - Role mismatch tests
   - Rate limit tests
   - Connection limit tests

4. **Test scenarios documented** → `quickstart.md`:
   - Authentication flow validation
   - Rate limiting verification
   - Token refresh testing
   - Performance validation (<200ms)

5. **CLAUDE.md update planned** (for implementation):
   - Will add auth fix to recent changes
   - Keep existing context

**Output**: data-model.md, contracts/websocket-auth.yaml, quickstart.md complete

## Phase 2: Task Planning Approach ✓ PLANNED
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs:
  - Auth validation contract tests [P]
  - Rate limiting contract tests [P]
  - Connection limit tests [P]
  - WebSocketAuth integration task
  - Per-message validation implementation
  - Auth context persistence
  - Token expiry monitoring
  - Audit logging implementation

**Ordering Strategy**:
1. Contract tests first (TDD - must fail)
2. Wire WebSocketAuth to dependencies
3. Add auth checks to handlers
4. Implement rate limiting
5. Add audit logging
6. Integration tests
7. Performance validation

**Estimated Output**: 20-25 focused security tasks

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
| Not a library | Critical security fix | Creating library would delay urgent security patch |

Note: This is a targeted security fix to existing infrastructure, not a new feature. Creating a separate library would add unnecessary complexity for a critical vulnerability patch.


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