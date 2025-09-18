# Quickstart: Supabase Setup for Onsembl Backend

This guide helps you set up Supabase (local or cloud) for the Onsembl backend.

## Prerequisites

- Node.js 20+ installed
- npm or npx available

## Option 1: Local Development with Supabase CLI (Recommended)

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Initialize Supabase in your project

```bash
cd backend
supabase init
```

### 3. Start local Supabase

```bash
supabase start
```

This will start:
- PostgreSQL database (port 54322)
- Supabase API (port 54321)
- Auth service
- Realtime service
- Storage service
- Studio UI (port 54323)

### 4. Get local credentials

```bash
supabase status
```

You'll see output like:
```
API URL: http://localhost:54321
anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DB URL: postgresql://postgres:postgres@localhost:54322/postgres
```

### 5. Configure backend

Create a `.env` file in the backend directory:
```bash
# For local Supabase (optional - defaults work)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<anon-key-from-status>
```

Or just use defaults (backend auto-detects local Supabase):
```bash
# No .env needed - backend will use localhost:54321 by default
```

### 6. Run database migrations

```bash
supabase migration up
```

### 7. Start the backend

```bash
npm run dev
```

### 8. Verify connection

Look for this message in console:
```
[DATABASE] Connected to local Supabase at localhost:54321
[DATABASE] Environment: local
[DATABASE] Health check passed (latency: 2ms)
```

## Option 2: Cloud Supabase (Production)

### 1. Create Supabase project

Visit [supabase.com](https://supabase.com) and create a new project.

### 2. Get credentials

From your project dashboard:
- Settings → API → URL (e.g., `https://xxx.supabase.co`)
- Settings → API → anon public key

### 3. Configure backend

Set environment variables:
```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
```

### 4. Start the backend

```bash
npm run dev
```

### 5. Verify connection

Look for this message in console:
```
[DATABASE] Connected to Supabase Cloud
[DATABASE] Environment: cloud
[DATABASE] URL: https://your-project.supabase.co
[DATABASE] Health check passed (latency: 45ms)
```

## Testing Database Connection

### 1. Check Health Endpoint

```bash
curl http://localhost:3000/api/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "database": {
    "connected": true,
    "environment": "local",
    "url": "http://localhost:54321",
    "latency": 2,
    "lastCheck": "2025-09-17T10:30:00Z"
  },
  "uptime": 3600
}
```

### 2. Test Data Persistence

```bash
# Register an agent
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-agent",
    "type": "claude"
  }'

# Returns: {"id": "agent-123", "name": "test-agent", ...}

# Restart the backend
# Ctrl+C then npm run dev

# Verify agent persisted
curl http://localhost:3000/api/agents

# Should return the same agent
```

### 3. Monitor WebSocket Events

```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log(event.type, event.payload);
});

// Should receive:
// database:connected { environment: 'local', url: 'http://localhost:54321' }
```

## Common Issues and Solutions

### Error: "Local Supabase not found"

**Solution:** Start local Supabase
```bash
supabase start
```

### Error: "Supabase not configured"

**Solution:** Either:
- Start local Supabase: `supabase start`
- Or set cloud credentials: `SUPABASE_URL` and `SUPABASE_ANON_KEY`

### Error: "Invalid Supabase credentials"

**Solution:** Check your anon key
```bash
# For local:
supabase status  # Copy the anon key

# For cloud:
# Check Supabase dashboard → Settings → API
```

### Error: "Cannot connect to Supabase"

**Solution:** Check if Supabase is running
```bash
# For local:
supabase status

# Should show "Started" for all services
# If not: supabase start
```

### Warning in logs but backend starts

If you see:
```
[DATABASE] ⚠️  Supabase not configured - operations will fail
[DATABASE] ⚠️  Run 'supabase start' for local development
```

This is expected if you haven't set up Supabase yet. The backend will start but database operations will fail with clear error messages.

## Supabase CLI Commands Reference

```bash
# Installation
npm install -g supabase

# Project initialization
supabase init              # Initialize Supabase in project

# Local development
supabase start             # Start all services
supabase stop              # Stop all services
supabase status            # Show status and credentials
supabase db reset          # Reset database to initial state

# Migrations
supabase migration new <name>  # Create new migration
supabase migration up          # Apply pending migrations
supabase migration list         # List migrations

# Access local services
open http://localhost:54323    # Supabase Studio (UI)
```

## Validation Checklist

- [ ] Supabase CLI installed
- [ ] Local Supabase running (or cloud configured)
- [ ] Backend starts without database errors
- [ ] Health endpoint shows connected
- [ ] Data persists across backend restarts
- [ ] Clear error messages when Supabase not configured

## Next Steps

Once Supabase connection is working:

1. Access Supabase Studio: http://localhost:54323
2. View your data in the browser
3. Register AI agents via API
4. Test command execution
5. Monitor real-time events

---

*For production deployment, always use Supabase Cloud with proper credentials.*