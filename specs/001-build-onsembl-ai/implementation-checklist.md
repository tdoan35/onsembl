# Implementation Checklist

**Purpose**: This document provides validation criteria for each task group to ensure complete and correct implementation.

## How to Use This Checklist
1. Before starting a task, review its checklist section
2. During implementation, verify each requirement
3. After completion, confirm all items are checked
4. Use as PR review criteria

## Setup Tasks (T001-T014)

### T001-T002: Monorepo Structure
- [ ] Root `package.json` contains workspaces configuration
- [ ] All directories created: `backend/`, `frontend/`, `agent-wrapper/`, `packages/`
- [ ] `.gitignore` includes `node_modules/`, `.env`, `dist/`, `build/`
- [ ] README.md created with project overview

### T003-T005: Project Initialization
- [ ] Backend has Fastify, TypeScript, @fastify/websocket dependencies
- [ ] Frontend has Next.js 14, TypeScript, Tailwind CSS, shadcn/ui
- [ ] Agent wrapper has TypeScript and ws dependencies
- [ ] Each project has its own `tsconfig.json`

### T006-T008: Package Creation
- [ ] Each package has `src/`, `tests/`, `package.json`
- [ ] Package names follow @onsembl/* convention
- [ ] TypeScript configured with composite projects
- [ ] Main and types fields properly set in package.json

### T009-T014: Development Tools
- [ ] ESLint configured with TypeScript rules
- [ ] Prettier configured with consistent formatting
- [ ] Jest configured for backend and packages
- [ ] React Testing Library configured for frontend
- [ ] Playwright installed with example test
- [ ] `.env.example` contains all required variables

## Database Tasks (T015-T026)

### T015: Supabase Setup
- [ ] Project created on Supabase
- [ ] Authentication enabled
- [ ] Realtime enabled
- [ ] Connection string obtained
- [ ] Service key stored securely

### T016-T024: Migrations
Each migration must include:
- [ ] CREATE TABLE statement with all fields from data-model.md
- [ ] Primary key constraint
- [ ] Foreign key constraints where applicable
- [ ] Indexes as specified in data-model.md
- [ ] Check constraints for enums
- [ ] Default values where appropriate
- [ ] created_at and updated_at triggers

### T025: Redis Setup
- [ ] Upstash Redis instance created or local Redis installed
- [ ] Connection URL tested
- [ ] BullMQ can connect successfully

### T026: RLS Policies
- [ ] Policy allows all authenticated users to read all data
- [ ] Policy allows all authenticated users to write all data
- [ ] Service role bypasses RLS
- [ ] Policies tested with different user contexts

## Test Tasks (T027-T059)

### Contract Tests (T027-T043)
Each contract test must:
- [ ] Import test server setup correctly
- [ ] Test the exact endpoint path from rest-api.yaml
- [ ] Validate request schema matches OpenAPI spec
- [ ] Validate response schema matches OpenAPI spec
- [ ] Include happy path test case
- [ ] Include error case (400, 401, 404)
- [ ] Test MUST FAIL initially (RED phase)
- [ ] Use actual Supabase test database

### WebSocket Tests (T044-T050)
Each WebSocket test must:
- [ ] Create WebSocket connection with authentication
- [ ] Send messages matching protocol specification
- [ ] Validate message format and types
- [ ] Test connection lifecycle events
- [ ] Handle disconnection gracefully
- [ ] Test MUST FAIL initially (RED phase)

### Integration Tests (T051-T059)
Each integration test must:
- [ ] Test complete user flow from quickstart.md
- [ ] Use real database and Redis
- [ ] Verify all expected side effects
- [ ] Clean up test data after completion
- [ ] Test MUST FAIL initially (RED phase)

## Package Implementation (T060-T068)

### agent-protocol Package
- [ ] All message types from websocket-protocol.md defined
- [ ] TypeScript interfaces exported
- [ ] Validation functions for each message type
- [ ] Constants for message types exported
- [ ] CLI tool can validate message files

### command-queue Package
- [ ] BullMQ queue wrapper implemented
- [ ] Priority logic (lower number = higher priority)
- [ ] Job cancellation by ID
- [ ] Bulk cancellation by agent ID
- [ ] CLI tool can inspect queue

### trace-collector Package
- [ ] Tree building from parent_id relationships
- [ ] Timeline view generation
- [ ] Aggregation of metrics (tokens, duration)
- [ ] Circular reference protection
- [ ] CLI tool can visualize traces

## Backend Models (T069-T077)

Each model must:
- [ ] Extend BaseModel from implementation-patterns.md
- [ ] Implement all fields from data-model.md
- [ ] Include TypeScript interface matching database schema
- [ ] Implement CRUD operations
- [ ] Include domain-specific methods
- [ ] Handle errors with ModelError
- [ ] Support real-time subscriptions where needed

## Backend Services (T078-T081)

### AgentService
- [ ] Uses AgentModel for data access
- [ ] Implements status updates
- [ ] Handles health metrics updates
- [ ] Manages agent lifecycle (restart, stop)
- [ ] Integrates with connection pool

### CommandService
- [ ] Uses CommandModel for data access
- [ ] Integrates with BullMQ queue
- [ ] Implements priority queueing
- [ ] Handles command cancellation
- [ ] Updates command status

### AuthService
- [ ] Integrates with Supabase Auth
- [ ] Implements magic link flow
- [ ] Validates JWT tokens
- [ ] Handles token refresh

### AuditService
- [ ] Logs all system events
- [ ] Implements 30-day retention
- [ ] Provides query interface
- [ ] Handles high volume efficiently

## Backend API (T082-T089)

### T082: Server Setup
- [ ] Fastify server initialized with config
- [ ] All plugins registered (@fastify/websocket, cors, helmet)
- [ ] Request ID middleware active
- [ ] Pino logger configured
- [ ] Health check endpoint working

### T083-T089: Route Implementation
Each route must:
- [ ] Match exact path from rest-api.yaml
- [ ] Validate request with Fastify schema
- [ ] Implement authentication where required
- [ ] Return correct status codes
- [ ] Return response matching OpenAPI schema
- [ ] Handle errors consistently
- [ ] Log with request ID

## WebSocket Implementation (T090-T097)

### T090: WebSocket Setup
- [ ] @fastify/websocket configured
- [ ] Max payload set to 1MB
- [ ] Heartbeat interval 30 seconds
- [ ] Authentication verification on connect

### T091-T092: Handlers
- [ ] Message router handles all message types
- [ ] Connection pool tracks all connections
- [ ] Agent handler processes agent messages
- [ ] Dashboard handler broadcasts updates

### T093-T097: Features
- [ ] Heartbeat monitors connection health
- [ ] Message routing by type
- [ ] Terminal streaming <200ms latency
- [ ] JWT rotation without disconnection
- [ ] Graceful error handling

## Frontend Components (T098-T106)

Each component must:
- [ ] Use shadcn/ui components where applicable
- [ ] Include TypeScript props interface
- [ ] Handle loading and error states
- [ ] Be responsive (mobile-friendly)
- [ ] Follow accessibility guidelines
- [ ] Include proper ARIA labels

### Specific Requirements:
- [ ] T098: Sidebar navigation with collapsible sections
- [ ] T099: Agent cards show all health metrics
- [ ] T100: Terminal supports ANSI colors
- [ ] T101: Command input has autocomplete
- [ ] T102: Trace tree is collapsible
- [ ] T103: Preset form validates inputs
- [ ] T104: Emergency stop shows confirmation
- [ ] T105: Report viewer supports export
- [ ] T106: Audit log has pagination

## Frontend Services (T107-T112)

### Zustand Stores
- [ ] State shape matches data model
- [ ] Actions update state immutably
- [ ] Computed properties use selectors
- [ ] DevTools integration enabled

### WebSocket Service
- [ ] Automatic reconnection with backoff
- [ ] Message queue during disconnection
- [ ] Event handler registration
- [ ] Connection state tracking

### API Service
- [ ] Base URL from environment
- [ ] Authentication header injection
- [ ] Error handling and retry logic
- [ ] Request/response logging

## Frontend Pages (T113-T118)

Each page must:
- [ ] Use app router (app directory)
- [ ] Include proper metadata
- [ ] Handle loading states
- [ ] Show error boundaries
- [ ] Be fully typed with TypeScript
- [ ] Include page-level authorization

## Agent Wrapper (T119-T127)

### T119: CLI Entry
- [ ] Parse command line arguments
- [ ] Load configuration file
- [ ] Validate configuration
- [ ] Handle --help and --version

### T120-T122: Process Spawning
- [ ] Spawn correct CLI command
- [ ] Capture stdout and stderr
- [ ] Handle process exit
- [ ] Support process restart

### T123-T127: Features
- [ ] WebSocket connection to server
- [ ] Stream capture and forwarding
- [ ] Command execution via stdin
- [ ] Configuration management
- [ ] Reconnection with exponential backoff

## Integration & Polish (T128-T145)

### Middleware (T128-T135)
- [ ] JWT authentication on protected routes
- [ ] Request ID propagation
- [ ] Structured logging with Pino
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] Error handler returns consistent format

### Performance (T136-T140)
- [ ] Unit test coverage >80%
- [ ] WebSocket latency <200ms verified
- [ ] 10+ concurrent agents tested
- [ ] Memory leaks checked
- [ ] Database queries optimized

### Documentation (T141-T143)
- [ ] API documentation generated from OpenAPI
- [ ] Fly.io deployment guide complete
- [ ] Vercel deployment guide complete
- [ ] Environment variables documented

### Final Validation (T144-T145)
- [ ] All quickstart scenarios pass
- [ ] E2E test covers full user journey
- [ ] Performance requirements met
- [ ] Security audit passed
- [ ] Code review completed

## Definition of Done

A task is considered complete when:
1. ✅ All checklist items are verified
2. ✅ Tests are written and passing
3. ✅ Code is committed with descriptive message
4. ✅ Documentation is updated if needed
5. ✅ No linting or type errors
6. ✅ Follows patterns from implementation-patterns.md

## Red Flags - Stop if you see these:

- 🚨 Test passes on first run (should fail in RED phase)
- 🚨 Hardcoded values that should be configurable
- 🚨 Missing error handling
- 🚨 Console.log instead of proper logging
- 🚨 Any TypeScript `any` without justification
- 🚨 Direct database queries instead of using models
- 🚨 Synchronous operations that should be async
- 🚨 Missing authentication on protected endpoints
- 🚨 Secrets in code or configs

## Quick Validation Commands

```bash
# Check if tests fail (RED phase)
npm test -- --testNamePattern="should return 200"

# Run linting
npm run lint

# Type checking
npm run type-check

# Check test coverage
npm test -- --coverage

# Validate database migrations
npx supabase migration validate

# Check for security issues
npm audit
```