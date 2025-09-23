# Claude Code Context - Onsembl.ai Agent Control Center

## Project Overview
Building Onsembl.ai - a web-based Agent Control Center for orchestrating multiple AI coding agents (Claude, Gemini, Codex) through a unified dashboard with real-time WebSocket streaming.

## Current Tech Stack
- **Backend**: Node.js 20+, TypeScript 5.x, Fastify 4.x with @fastify/websocket
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Zustand
- **Database**: Dual-mode - Supabase (production) or local PostgreSQL (development)
  - Database adapter with automatic fallback
  - pg client for local PostgreSQL connections
- **Auth**: Supabase Authentication with JWT validation
  - OAuth providers: Google, GitHub
  - Email/password authentication with reset flow
  - Row Level Security (RLS) for data isolation
- **Queue**: BullMQ with Redis (Upstash)
- **Logging**: Pino with structured logging
- **Terminal**: xterm.js for terminal rendering
- **Deployment**: Fly.io (backend), Vercel (frontend)

## Project Structure
```
backend/           # Fastify control server
frontend/          # Next.js dashboard
agent-wrapper/     # Node.js CLI wrappers
packages/          # Shared libraries
  agent-protocol/  # WebSocket protocol types
  command-queue/   # BullMQ queue management
  trace-collector/ # LLM trace aggregation
specs/             # Feature specifications
```

## Key Architecture Decisions
- **Hybrid WebSocket/Realtime**: Direct WebSocket for <200ms terminal streaming, Supabase Realtime for state sync
- **JWT Token Rotation**: In-band refresh without connection interruption
- **Single-tenant MVP**: All authenticated users control all agents
- **Command Queueing**: Priority-based with interruption support
- **Message Routing**: Centralized MessageRouter for Dashboard”Agent communication
- **Authentication**: Supabase client-side SDK with backend JWT validation

## Current Feature Implementation
Working on MVP with core features:
- Real-time agent status monitoring
- Command execution with queueing
- Terminal output streaming with color coding
- Emergency stop functionality
- Command presets
- LLM trace tree visualization
- 30-day audit log retention
- WebSocket message routing between dashboards and agents
- **NEW**: Supabase authentication with OAuth and email/password

## API Contracts
- REST API: OpenAPI 3.0 spec in `/specs/001-build-onsembl-ai/contracts/rest-api.yaml`
- Auth API: OpenAPI 3.0 spec in `/specs/006-integrate-supabase-authentication/contracts/auth-api.yaml`
- WebSocket: Protocol defined in `/specs/001-build-onsembl-ai/contracts/websocket-protocol.md`
- WebSocket Auth: Protocol in `/specs/006-integrate-supabase-authentication/contracts/websocket-auth.md`
- Message Routing: Contract in `/specs/004-fix-ons-5/contracts/websocket-routing.yaml`

## Database Schema
9 core entities + user profiles:
- Agent (now with user_id)
- Command (now with user_id)
- TerminalOutput
- CommandPreset
- TraceEntry
- InvestigationReport
- AuditLog (now with user_id)
- ExecutionConstraint
- CommandQueue
- UserProfile (new)

All tables have RLS policies for user data isolation.

## Testing Strategy
- Contract tests first (TDD)
- Integration tests for WebSocket flows
- E2E tests with Playwright
- Real Supabase/Redis instances for testing
- Real WebSocket connections for message routing tests
- Auth flow testing with real Supabase instance

## TypeScript Conventions
- Use `.js` extensions for all local imports (ES modules)
- Access `process.env` properties with bracket notation: `process.env['npm_package_version']` not `process.env.npm_package_version`

## Performance Requirements
- <200ms terminal streaming latency
- <200ms auth response time
- Support 10+ concurrent agent connections
- Handle 100 messages/second per agent
- 1MB max WebSocket payload

## Recent Changes
- **006-integrate-supabase-authentication**: IN PROGRESS
  - Added Supabase auth with OAuth (Google/GitHub) and email/password
  - Implemented JWT validation middleware for backend
  - Added RLS policies for multi-tenant data isolation
  - Updated WebSocket to require authentication
  - Created user profile system
- **004-fix-ons-5**:  COMPLETED - WebSocket message routing implementation
- **003-fix-silent-database**: Database connection improvements
- **002-connect-websocket-communication**: WebSocket communication setup
- **001-build-onsembl-ai**: Initial project setup complete

## Authentication Architecture
- **Frontend**: Supabase client SDK for auth operations
- **Backend**: JWT validation middleware on all protected routes
- **WebSocket**: Token validation on connection establishment
- **Database**: RLS policies using auth.uid() for data filtering
- **Session**: Automatic refresh with 1-hour expiry default

## Important Commands
```bash
# Generate TypeScript types from Supabase
npx supabase gen types typescript --project-id your-project-id > types/supabase.ts

# Run auth integration tests
npm run test:auth

# Start with auth enabled
npm run dev:auth
```