# Onsembl.ai Backend

Control server for orchestrating AI coding agents with real-time WebSocket communication.

## Features
- 🚀 Real-time agent status monitoring
- 📡 WebSocket streaming for terminal output
- 🗄️ Dual-mode database support (Supabase/PostgreSQL)
- 🔐 JWT-based authentication with token rotation
- 📊 Health monitoring and status endpoints
- 🎯 Command queueing with priority support
- 📝 Audit logging with 30-day retention

## Quick Start

### Prerequisites
- Node.js 20+
- Docker (for local Supabase)
- Redis (or Upstash for cloud)

### Installation
```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Setup database (see Database Setup below)
npm run setup:database

# Run development server
npm run dev
```

## Database Setup

### Option 1: Local Supabase (Recommended for Development)
```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Initialize and start Supabase
supabase init
supabase start

# Get connection details
supabase status
```

Add to `.env`:
```
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<from-supabase-status>
```

See [docs/supabase-setup.md](./docs/supabase-setup.md) for detailed instructions.

### Option 2: Cloud Supabase (Production)
1. Create project at [app.supabase.com](https://app.supabase.com)
2. Copy credentials from Settings → API
3. Add to production environment variables

### Option 3: Run Without Database
The server will run with in-memory storage (data not persisted):
```bash
# Just start without database config
npm run dev
```

## Environment Variables

Required for full functionality:
```bash
# Database (Supabase)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key  # Optional, for admin operations

# Alternative: PostgreSQL
DATABASE_URL=postgresql://user:pass@localhost:5432/onsembl

# Redis (for queues)
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-secret-key

# Server
PORT=3010
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=debug
```

## Development

### Commands
```bash
npm run dev          # Start with hot reload
npm run build        # Build for production
npm start           # Run production build
npm test            # Run tests
npm run test:watch  # Run tests in watch mode
npm run lint        # Lint code
npm run typecheck   # Type checking
```

### Project Structure
```
src/
├── api/           # REST API routes
├── config/        # Configuration
├── database/      # Database utilities
│   ├── supabase-validator.ts
│   ├── environment-detector.ts
│   ├── error-messages.ts
│   └── health-check.service.ts
├── middleware/    # Express/Fastify middleware
├── services/      # Business logic
├── websocket/     # WebSocket handlers
├── types/         # TypeScript types
└── server.ts      # Main server file
```

## API Documentation

### REST API
Swagger documentation available at:
```
http://localhost:3010/docs
```

### Health Endpoints
```bash
# Basic health check
GET /health

# Detailed system health
GET /api/system/health
```

### WebSocket Protocol
Connect to WebSocket endpoints:
- `/ws/agent/:agentId` - Agent connections
- `/ws/dashboard` - Dashboard connections

See [WebSocket Protocol Docs](../specs/001-build-onsembl-ai/contracts/websocket-protocol.md)

## Testing

### Run All Tests
```bash
npm test
```

### Test Categories
```bash
npm run test:unit        # Unit tests
npm run test:integration # Integration tests
npm run test:contract    # Contract tests
npm run test:e2e         # End-to-end tests
```

### Test Database
Tests use a separate Supabase instance or in-memory database.

## Deployment

### Using Fly.io
```bash
# Deploy to Fly.io
fly deploy

# Set secrets
fly secrets set SUPABASE_URL=...
fly secrets set SUPABASE_ANON_KEY=...
```

### Using Docker
```bash
# Build image
docker build -t onsembl-backend .

# Run container
docker run -p 3010:3010 \
  -e SUPABASE_URL=... \
  -e SUPABASE_ANON_KEY=... \
  onsembl-backend
```

## Monitoring

### Health Monitoring
The server includes comprehensive health monitoring:
- Database connection status
- Redis connection status
- WebSocket connections count
- System uptime and version

### Logs
Structured logging with Pino:
```bash
# Development (pretty printed)
npm run dev

# Production (JSON)
npm start | pino-pretty
```

### Database Status Events
WebSocket clients receive real-time database status updates via `database:status` events.

## Troubleshooting

### Database Connection Issues
1. Check health endpoint: `curl http://localhost:3010/health`
2. Verify environment variables are set
3. Check Supabase is running: `supabase status`
4. See [troubleshooting guide](./docs/troubleshooting.md)

### WebSocket Connection Issues
1. Check WebSocket upgrade headers
2. Verify JWT token is valid
3. Check max connections limit
4. Review server logs for errors

### Common Errors
- `DB_NOT_CONFIGURED`: Set SUPABASE_URL and SUPABASE_ANON_KEY
- `CONNECTION_FAILED`: Check Supabase is running
- `AUTH_FAILED`: Verify JWT token and keys

## Contributing

1. Fork the repository
2. Create feature branch
3. Write tests first (TDD)
4. Implement feature
5. Ensure all tests pass
6. Submit pull request

## License

MIT