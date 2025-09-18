# Claude Code Context - Onsembl.ai Agent Control Center

## Project Overview
Building Onsembl.ai - a web-based Agent Control Center for orchestrating multiple AI coding agents (Claude, Gemini, Codex) through a unified dashboard with real-time WebSocket streaming.

## Current Tech Stack
- **Backend**: Node.js 20+, TypeScript 5.x, Fastify 4.x with @fastify/websocket
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Zustand
- **Database**: Dual-mode - Supabase (production) or local PostgreSQL (development)
  - Database adapter with automatic fallback
  - pg client for local PostgreSQL connections
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
- **Message Routing**: Centralized MessageRouter for Dashboard↔Agent communication

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

## API Contracts
- REST API: OpenAPI 3.0 spec in `/specs/001-build-onsembl-ai/contracts/rest-api.yaml`
- WebSocket: Protocol defined in `/specs/001-build-onsembl-ai/contracts/websocket-protocol.md`
- Message Routing: Contract in `/specs/004-fix-ons-5/contracts/websocket-routing.yaml`

## Database Schema
9 core entities: Agent, Command, TerminalOutput, CommandPreset, TraceEntry, InvestigationReport, AuditLog, ExecutionConstraint, CommandQueue

## Testing Strategy
- Contract tests first (TDD)
- Integration tests for WebSocket flows
- E2E tests with Playwright
- Real Supabase/Redis instances for testing
- Real WebSocket connections for message routing tests

## TypeScript Conventions
- Use `.js` extensions for all local imports (ES modules)
- Access `process.env` properties with bracket notation: `process.env['npm_package_version']` not `process.env.npm_package_version`

## Performance Requirements
- <200ms terminal streaming latency
- Support 10+ concurrent agent connections
- Handle 100 messages/second per agent
- 1MB max WebSocket payload

## Recent Changes
- **004-fix-ons-5**: Implementing WebSocket message routing
  - Wire MessageRouter into dashboard and agent handlers
  - Add command tracking for response routing
  - Queue messages for offline agents
  - Support emergency stop broadcasts
- **003-fix-silent-database**: Database connection improvements
  - Dual-mode database support (Supabase/local PostgreSQL)
  - Automatic fallback with clear error messages
  - Health monitoring and connection status events
- **002-connect-websocket-communication**: WebSocket communication setup
- **001-build-onsembl-ai**: Initial project setup complete

## Next Phase
Implementing WebSocket command routing to enable Dashboard→Agent command execution with proper response routing back to originating dashboards.