# Onsembl.ai Agent Control Center

## Project Overview

Building Onsembl.ai - a web-based Agent Control Center for orchestrating multiple AI coding agents (Claude, Gemini, Codex) through a unified dashboard with real-time WebSocket streaming.

## Current Tech Stack

- **Backend**: Node.js 20+, TypeScript 5.x, Fastify 4.x with @fastify/websocket
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Zustand
- **Database**: Supabase (PostgreSQL, Auth, Realtime)
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

## Current Feature Implementation

Working on MVP with core features:

- Real-time agent status monitoring
- Command execution with queueing
- Terminal output streaming with color coding
- Emergency stop functionality
- Command presets
- LLM trace tree visualization
- 30-day audit log retention

## API Contracts

- REST API: OpenAPI 3.0 spec in `/specs/001-build-onsembl-ai/contracts/rest-api.yaml`
- WebSocket: Protocol defined in `/specs/001-build-onsembl-ai/contracts/websocket-protocol.md`

## Database Schema

9 core entities: Agent, Command, TerminalOutput, CommandPreset, TraceEntry, InvestigationReport, AuditLog, ExecutionConstraint, CommandQueue

## Testing Strategy

- Contract tests first (TDD)
- Integration tests for WebSocket flows
- E2E tests with Playwright
- Real Supabase/Redis instances for testing

## Performance Requirements

- <200ms terminal streaming latency
- Support 10+ concurrent agent connections
- Handle 100 messages/second per agent
- 1MB max WebSocket payload

## Recent Changes

- Initial project setup complete
- Technical research documented
- Data model and API contracts defined
- Quickstart guide created

## Next Phase

Ready for task generation (/tasks command) to create implementation tasks following TDD principles.
