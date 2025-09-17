# Quickstart: Database Connection Setup

This guide helps you set up and verify the database connection for Onsembl backend.

## Prerequisites

- Node.js 20+ installed
- Docker and Docker Compose (for local PostgreSQL)
- Supabase project (optional, for cloud mode)

## Setup Options

### Option 1: Local PostgreSQL (Development)

1. **Start PostgreSQL with Docker Compose**
   ```bash
   cd backend
   docker-compose up -d postgres
   ```

2. **Run database migrations**
   ```bash
   npm run db:migrate
   ```

3. **Start the backend**
   ```bash
   npm run dev
   ```

4. **Verify connection**
   Look for this message in console:
   ```
   [DATABASE] Mode: local
   [DATABASE] Connected to PostgreSQL at localhost:5432
   [DATABASE] Health check passed (latency: 2ms)
   ```

### Option 2: Supabase (Production)

1. **Set environment variables**
   ```bash
   export SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_ANON_KEY="your-anon-key"
   ```

2. **Start the backend**
   ```bash
   npm run dev
   ```

3. **Verify connection**
   Look for this message in console:
   ```
   [DATABASE] Mode: supabase
   [DATABASE] Connected to Supabase
   [DATABASE] Health check passed (latency: 45ms)
   ```

### Option 3: Mock Mode (Testing without database)

1. **Start without any database config**
   ```bash
   npm run dev
   ```

2. **See warning message**
   ```
   [DATABASE] ⚠️  Mode: mock - No database configured
   [DATABASE] ⚠️  Data will NOT persist across restarts
   [DATABASE] ⚠️  Set SUPABASE_URL or DATABASE_URL to use real database
   ```

## Testing Database Connection

### 1. Check Health Endpoint

```bash
curl http://localhost:3000/api/health/database
```

**Expected Response:**
```json
{
  "status": "healthy",
  "mode": "local",
  "connected": true,
  "lastHealthCheck": "2025-09-17T10:30:00Z",
  "latency": 2,
  "uptime": 3600
}
```

### 2. Test Agent Registration (Persistence Check)

```bash
# Register an agent
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-agent",
    "type": "claude"
  }'

# Should return agent with ID
# {"id": "agent-123", "name": "test-agent", ...}
```

```bash
# Restart the backend
npm run dev

# Verify agent persisted
curl http://localhost:3000/api/agents/agent-123

# Should return the same agent
```

### 3. Test WebSocket Connection Events

```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  if (event.type === 'database:status') {
    console.log('Database status:', event.payload);
  }
});

// Should immediately receive:
// Database status: { mode: 'local', status: 'connected', ... }
```

## Troubleshooting

### Error: "Cannot connect to database"

**Local PostgreSQL not running:**
```bash
docker-compose up -d postgres
docker-compose ps  # Check if running
```

**Wrong DATABASE_URL:**
```bash
# Should be:
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/onsembl"
```

### Error: "Database schema not initialized"

**Run migrations:**
```bash
npm run db:migrate
```

**Check migration status:**
```bash
npm run db:status
```

### Error: "Database authentication failed"

**Check Supabase credentials:**
```bash
# Verify these are correct:
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY
```

**Check local PostgreSQL password:**
```bash
# Default in docker-compose.yml:
# username: postgres
# password: postgres
```

### Warning: "Running in mock mode"

This means no database configuration was found. To fix:

1. **For local development:** Set `DATABASE_URL`
2. **For production:** Set `SUPABASE_URL` and `SUPABASE_ANON_KEY`

## Environment Variables Reference

```bash
# Supabase Mode (takes precedence)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx...

# Local PostgreSQL Mode
DATABASE_URL=postgresql://user:pass@host:port/dbname

# Optional Configuration
DB_POOL_SIZE=10                    # Connection pool size
DB_HEALTH_CHECK_INTERVAL=30000     # Health check interval (ms)
DB_MAX_RETRIES=3                   # Max reconnection attempts
DB_RETRY_DELAY=1000                # Delay between retries (ms)
```

## Validation Checklist

- [ ] Backend starts without errors
- [ ] Correct database mode shown in logs
- [ ] Health endpoint returns 200 OK
- [ ] Data persists across restarts
- [ ] WebSocket receives database status events
- [ ] Error messages are clear and actionable

## Next Steps

Once database connection is verified:

1. Register your AI agents
2. Configure command presets
3. Test command execution
4. Monitor terminal output streaming
5. Check audit logs for persistence

---

*For detailed API documentation, see `/contracts/database-health-api.yaml`*