# Data Model: Database Connection Management

**Feature**: Fix Silent Database Connection Failures
**Date**: 2025-09-17

## Core Entities

### 1. DatabaseConfig
Represents the configuration for database connection.

**Fields**:
- `mode`: enum('supabase' | 'local' | 'mock') - Active database mode
- `supabaseUrl?`: string - Supabase project URL
- `supabaseKey?`: string - Supabase anonymous key
- `databaseUrl?`: string - Local PostgreSQL connection string
- `poolSize`: number - Connection pool size (default: 10)
- `healthCheckInterval`: number - Health check interval in ms (default: 30000)
- `maxRetries`: number - Maximum connection retries (default: 3)
- `retryDelay`: number - Delay between retries in ms (default: 1000)

**Validation Rules**:
- If mode is 'supabase', supabaseUrl and supabaseKey are required
- If mode is 'local', databaseUrl is required
- poolSize must be between 1 and 100
- healthCheckInterval must be >= 5000ms
- maxRetries must be between 0 and 10
- retryDelay must be between 100 and 10000ms

### 2. DatabaseConnection
Represents an active database connection instance.

**Fields**:
- `id`: string - Unique connection identifier
- `mode`: enum('supabase' | 'local' | 'mock') - Connection mode
- `status`: enum('connecting' | 'connected' | 'disconnected' | 'error') - Current status
- `createdAt`: timestamp - Connection creation time
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
Represents the result of a database health check.

**Fields**:
- `connectionId`: string - Associated connection ID
- `timestamp`: timestamp - Check execution time
- `success`: boolean - Whether check succeeded
- `latency`: number - Response time in ms
- `error?`: string - Error message if failed
- `details?`: object - Additional diagnostic information

**Validation Rules**:
- latency must be >= 0
- If success is false, error must be present
- timestamp must not be in the future

### 4. DatabaseOperation
Represents a database operation for audit/debugging.

**Fields**:
- `id`: string - Operation identifier
- `connectionId`: string - Connection used
- `type`: enum('query' | 'insert' | 'update' | 'delete' | 'transaction') - Operation type
- `table?`: string - Target table name
- `startTime`: timestamp - Operation start time
- `endTime?`: timestamp - Operation end time
- `success`: boolean - Whether operation succeeded
- `error?`: string - Error message if failed
- `affectedRows?`: number - Number of rows affected

**Validation Rules**:
- endTime must be after startTime
- If success is false, error must be present
- affectedRows must be >= 0 if present

## Relationships

```
DatabaseConfig (1) ←→ (1) DatabaseConnection
  - One config creates one connection instance
  - Config changes require new connection

DatabaseConnection (1) ←→ (N) HealthCheckResult
  - One connection has multiple health check results
  - Results ordered by timestamp

DatabaseConnection (1) ←→ (N) DatabaseOperation
  - One connection handles multiple operations
  - Operations tracked for debugging

DatabaseOperation (N) ←→ (1) Service
  - Operations initiated by service methods
  - Service name tracked for context
```

## Database Adapter Interface

```typescript
interface IDatabaseAdapter {
  // Connection Management
  connect(config: DatabaseConfig): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  getMode(): 'supabase' | 'local' | 'mock'

  // Health Monitoring
  healthCheck(): Promise<HealthCheckResult>
  getConnectionStatus(): DatabaseConnection

  // Query Execution
  query<T>(sql: string, params?: any[]): Promise<T[]>
  insert<T>(table: string, data: Partial<T>): Promise<T>
  update<T>(table: string, id: string, data: Partial<T>): Promise<T>
  delete(table: string, id: string): Promise<void>

  // Transaction Support
  transaction<T>(callback: (client: any) => Promise<T>): Promise<T>
}
```

## Service Integration Points

### AgentService
- Uses adapter for agent CRUD operations
- Handles connection errors with user-friendly messages
- Retries on transient failures

### CommandService
- Uses adapter for command logging
- Queues commands if connection temporarily lost
- Ensures command history persistence

### TerminalService
- Uses adapter for output streaming
- Buffers output during connection issues
- Flushes buffer on reconnect

### AuditService
- Uses adapter for audit logging
- Critical operations logged even in mock mode
- Never silently fails

## Error Handling

### Connection Errors
- **ECONNREFUSED**: "Cannot connect to database. Please check if PostgreSQL is running."
- **ENOTFOUND**: "Database host not found. Please check your connection settings."
- **ECONNRESET**: "Database connection lost. Attempting to reconnect..."
- **Invalid credentials**: "Database authentication failed. Please check your credentials."

### Operation Errors
- **Table not found**: "Database schema not initialized. Please run migrations."
- **Constraint violation**: "Operation violates database constraints: {details}"
- **Timeout**: "Database operation timed out after {timeout}ms"
- **Transaction rollback**: "Transaction failed and was rolled back: {reason}"

## Migration Schema

### Required Tables (matching existing Supabase schema)
- agents
- commands
- terminal_outputs
- command_presets
- trace_entries
- investigation_reports
- audit_logs
- execution_constraints
- command_queues

### Version Tracking
- schema_migrations table tracks applied migrations
- Each migration has version, name, applied_at timestamp
- Migrations applied in order, never skipped

---

*Data model complete. Ready for contract generation and testing.*