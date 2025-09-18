# Data Model: Supabase Connection Management

**Feature**: Fix Silent Database Connection Failures
**Date**: 2025-09-17
**Status**: Simplified for Supabase CLI approach

## Core Entities

### 1. SupabaseConfig
Represents the configuration for Supabase connection.

**Fields**:
- `url`: string - Supabase project URL (defaults to http://localhost:54321 for local)
- `anonKey`: string - Supabase anonymous key
- `environment`: enum('local' | 'cloud') - Detected environment
- `healthCheckInterval`: number - Health check interval in ms (default: 30000)
- `maxRetries`: number - Maximum connection retries (default: 3)
- `retryDelay`: number - Delay between retries in ms (default: 1000)

**Validation Rules**:
- url must be a valid URL
- anonKey must be present
- healthCheckInterval must be >= 5000ms
- maxRetries must be between 0 and 10
- retryDelay must be between 100 and 10000ms

**Environment Detection**:
- If SUPABASE_URL is not set or is localhost:54321 → 'local'
- Otherwise → 'cloud'

### 2. ConnectionStatus
Represents the current Supabase connection status.

**Fields**:
- `id`: string - Unique status identifier
- `environment`: enum('local' | 'cloud') - Current environment
- `status`: enum('connecting' | 'connected' | 'disconnected' | 'error') - Current status
- `url`: string - Connected Supabase URL
- `connectedAt`: timestamp - Connection establishment time
- `lastHealthCheck`: timestamp - Last successful health check
- `errorCount`: number - Consecutive error count
- `lastError?`: string - Last error message

**State Transitions**:
- `connecting` → `connected` (on successful connection)
- `connecting` → `error` (on connection failure)
- `connected` → `disconnected` (on graceful disconnect)
- `connected` → `error` (on unexpected failure)
- `error` → `connecting` (on retry attempt)
- `disconnected` → `connecting` (on reconnect attempt)

### 3. HealthCheckResult
Represents the result of a Supabase health check.

**Fields**:
- `timestamp`: timestamp - Check execution time
- `success`: boolean - Whether check succeeded
- `latency`: number - Response time in ms
- `error?`: string - Error message if failed
- `environment`: enum('local' | 'cloud') - Environment checked

**Validation Rules**:
- latency must be >= 0
- If success is false, error must be present
- timestamp must not be in the future

## Service Integration

### Supabase Client Initialization
```typescript
// Single client for all environments
const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_ANON_KEY || '<local-anon-key>'
)
```

### Connection Validation
- On startup: Validate Supabase is reachable
- If local not running: Show "Run `supabase start` for local development"
- If cloud not configured: Show "Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables"
- Log environment clearly: "Connected to local Supabase at localhost:54321" or "Connected to Supabase Cloud"

### Health Monitoring
- Simple query to validate connection: `SELECT 1`
- WebSocket channel subscription to test realtime
- Check response time for performance monitoring
- Emit status events for dashboard display

## Error Messages

### Startup Errors
- **Local not running**: "Local Supabase not found. Run `supabase start` to start local development environment."
- **Missing config**: "Supabase not configured. Either run `supabase start` for local development or set SUPABASE_URL and SUPABASE_ANON_KEY."
- **Invalid credentials**: "Invalid Supabase credentials. Please check your SUPABASE_ANON_KEY."
- **Network error**: "Cannot connect to Supabase at {url}. Please check your network connection."

### Runtime Errors
- **Connection lost**: "Lost connection to Supabase. Attempting to reconnect..."
- **Operation failed**: "Database operation failed: {details}"
- **Timeout**: "Supabase operation timed out after {timeout}ms"

## WebSocket Events

### Status Events (emitted to dashboard)
- `database:status` - Current connection status
- `database:connected` - Successfully connected
- `database:disconnected` - Connection lost
- `database:error` - Connection error occurred
- `database:health` - Health check result

### Event Payloads
```typescript
interface DatabaseStatusEvent {
  environment: 'local' | 'cloud'
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  url: string
  message?: string
  timestamp: string
}
```

## Existing Supabase Schema

The following tables already exist in Supabase (no changes needed):
- agents
- commands
- terminal_outputs
- command_presets
- trace_entries
- investigation_reports
- audit_logs
- execution_constraints
- command_queues

## Supabase CLI Setup

### Installation
```bash
npm install -g supabase
```

### Commands
```bash
# Start local Supabase
supabase start

# Check status and get local credentials
supabase status

# Stop local Supabase
supabase stop

# Reset local database
supabase db reset
```

### Local Credentials (from `supabase status`)
- API URL: http://localhost:54321
- anon key: (shown in status output)
- service_role key: (for admin operations)

---

*Data model simplified for Supabase CLI approach. No adapter pattern needed.*