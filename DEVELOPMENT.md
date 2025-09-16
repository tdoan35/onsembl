# Onsembl.ai Development Guide

## Project Structure

This is a monorepo for the Onsembl.ai Agent Control Center, organized using npm workspaces:

```
onsembl/
├── backend/              # Fastify control server
├── frontend/             # Next.js dashboard
├── agent-wrapper/        # Node.js CLI wrappers
├── packages/             # Shared libraries
│   ├── agent-protocol/   # WebSocket protocol & types
│   ├── command-queue/    # BullMQ queue management
│   └── trace-collector/  # LLM trace aggregation
└── specs/               # Feature specifications
```

## Prerequisites

- Node.js 20+
- npm 10+
- Redis (for development, or use Upstash)
- Supabase account

## Quick Start

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd onsembl
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase and Redis credentials
   ```

3. **Start development servers:**
   ```bash
   # Start all services
   npm run dev

   # Or start individually:
   npm run dev -w backend
   npm run dev -w frontend
   npm run dev -w agent-wrapper
   ```

## Available Scripts

### Root Level
- `npm run dev` - Start all development servers
- `npm run build` - Build all packages
- `npm run test` - Run all tests
- `npm run lint` - Lint all packages
- `npm run type-check` - Type check all packages
- `npm run clean` - Clean all build artifacts

### Package Level
Each package supports the same scripts:
- `npm run dev -w <package>` - Start development mode
- `npm run build -w <package>` - Build package
- `npm run test -w <package>` - Run package tests

## Technology Stack

- **Backend**: Fastify 4.x, TypeScript, WebSocket, JWT
- **Frontend**: Next.js 14, React 18, Tailwind CSS, shadcn/ui
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **Queue**: BullMQ with Redis (Upstash)
- **Logging**: Pino structured logging
- **Terminal**: xterm.js for terminal rendering

## Architecture Overview

- **Hybrid Streaming**: WebSocket for <200ms terminal streaming, Supabase Realtime for state sync
- **Monorepo**: Shared TypeScript types and utilities across packages
- **TDD Approach**: Contract tests → Integration tests → E2E tests → Unit tests
- **Single-tenant MVP**: All authenticated users control all agents

## Development Workflow

1. Start with failing tests (TDD)
2. Implement to make tests pass
3. Refactor while keeping tests green
4. Update documentation as needed

## Testing Strategy

- **Contract Tests**: API endpoint contracts
- **Integration Tests**: WebSocket flows, database operations
- **E2E Tests**: Full user workflows with Playwright
- **Unit Tests**: Individual function testing

Run tests with real dependencies (Supabase, Redis) for integration accuracy.

## Contributing

1. Create feature branch from `main`
2. Follow TDD principles
3. Ensure all tests pass
4. Update documentation
5. Submit pull request

For detailed implementation guidance, see the feature specifications in `/specs/`.